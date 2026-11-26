import { Injectable, inject } from '@angular/core';
import { EntradaCategoria, VehiculoInversion } from '../models/objetivos-inversion';
import {
  AccionRebalanceo,
  FilaRebalanceo,
  OpcionesRebalanceo,
  ResultadoRebalanceo,
  ResumenFiscal,
  TratamientoSalida
} from '../models/rebalanceo';
import { SimuladorAportacionesService } from './simulador-aportaciones.service';

/** Contexto común de un cálculo (todo en céntimos enteros). */
interface Contexto {
  entradas: EntradaCategoria[];
  modo: OpcionesRebalanceo['modo'];
  /** Valores actuales */
  V: number[];
  /** Patrimonio actual */
  T: number;
  /** Aportación solicitada (0 en el modo `venta`) */
  A: number;
}

interface SolucionObjetivo {
  /** Valor final de cada categoría (céntimos) */
  x: number[];
  factible: boolean;
}

/**
 * Calculadora de rebalanceo de «Objetivos de inversión». Servicio puro, sin estado: recibe las
 * entradas ya cruzadas (valor actual + objetivo + restricciones) y devuelve el plan de operaciones.
 *
 * Todo el cálculo trabaja en céntimos enteros, de modo que las compras siempre cuadran con las
 * ventas/traspasos más la aportación, sin descuadres por redondeo.
 *
 * Modos:
 *  - `aportaciones`: delega en `SimuladorAportacionesService` (sin ventas, con importe/incremento mínimo).
 *  - `venta` y `mixto`: se busca el valor final x_i = clamp(λ·w_i, L_i, U_i) con Σx_i = P
 *    (P = patrimonio actual + aportación), donde
 *      · L_i = 0 si la categoría admite ventas, o su valor actual si no;
 *      · U_i = ∞ si puede recibir compras, o su valor actual si no.
 *    Es el reparto más cercano al objetivo que respeta las restricciones. Como el objetivo se calcula
 *    sobre P, en el modo mixto la aportación absorbe primero las infraponderaciones y solo se vende lo
 *    imprescindible; si la aportación basta, no hay ventas.
 *  - El umbral mínimo descarta los movimientos pequeños y vuelve a calcular el resto (la menor
 *    operación por iteración), de modo que el plan sigue cuadrando.
 */
@Injectable({ providedIn: 'root' })
export class RebalanceoService {

  private readonly simulador = inject(SimuladorAportacionesService);

  /** Tolerancia (pp) para considerar alcanzado el objetivo. */
  static readonly TOLERANCIA_PP = SimuladorAportacionesService.TOLERANCIA_PP;

  /** En los modos con ventas, los movimientos inferiores a este importe (€) se ignoran siempre (ruido de redondeo). */
  static readonly UMBRAL_RUIDO = 1;

  calcular(entradas: EntradaCategoria[], opciones: OpcionesRebalanceo): ResultadoRebalanceo {
    const modo = opciones.modo;
    const A = modo === 'venta' ? 0 : this.aCentimos(opciones.aportacion);
    const umbral = this.aCentimos(opciones.umbralMinimo);
    const V = entradas.map(e => this.aCentimosFirmado(e.valorActual));
    const T = V.reduce((s, v) => s + v, 0);
    const ctx: Contexto = { entradas, modo, V, T, A };

    if (!entradas.length) {
      return this.sinMovimientos(ctx, 'No hay categorías en el patrimonio sobre las que calcular un rebalanceo.');
    }
    if (entradas.reduce((s, e) => s + Math.round(e.porcentajeObjetivo * 100), 0) !== 10000) {
      return this.sinMovimientos(ctx, 'Los porcentajes objetivo guardados no suman el 100 %. Revisa y guarda la configuración antes de calcular.');
    }

    if (modo === 'aportaciones') return this.soloAportaciones(ctx, opciones.aportacion, umbral);

    if (T <= 0) {
      return this.sinMovimientos(ctx, 'El patrimonio actual no es positivo, así que no hay nada que rebalancear.');
    }
    return this.ajusteConVentas(ctx, umbral);
  }

  // ======================================================
  // Modo 1 · Solo nuevas aportaciones
  // ======================================================
  private soloAportaciones(ctx: Contexto, aportacion: number, umbral: number): ResultadoRebalanceo {
    const { entradas } = ctx;
    const trabajo = entradas.map(e => ({ ...e }));
    const descartadas: string[] = [];

    let sim = this.simulador.simularAportacion(trabajo, aportacion);

    // Umbral: se descarta la menor aportación inferior al umbral y se recalcula el reparto con el resto
    for (let it = 0; umbral > 0 && it < entradas.length; it++) {
      const pequenas = sim.filas
        .map((f, i) => ({ i, c: this.aCentimos(f.aportacion) }))
        .filter(o => o.c > 0 && o.c < umbral)
        .sort((a, b) => a.c - b.c);
      if (!pequenas.length) break;

      const { i } = pequenas[0];
      trabajo[i] = { ...trabajo[i], admiteAportaciones: false };
      descartadas.push(trabajo[i].nombre);
      sim = this.simulador.simularAportacion(trabajo, aportacion);
    }

    const delta = sim.filas.map(f => this.aCentimos(f.aportacion));
    const avisos = [...sim.avisos];
    let explicacion = sim.explicacion;

    if (descartadas.length) {
      avisos.push(
        `Se han descartado las aportaciones inferiores al umbral de ${this.euros(umbral)} ` +
        `(${descartadas.join(', ')}) y se ha repartido el resto entre las demás categorías.`
      );
      if (sim.noAsignado > 0) {
        explicacion = `Con el umbral mínimo de ${this.euros(umbral)} no se han podido asignar ` +
          `${this.euros(this.aCentimos(sim.noAsignado))}: todas las aportaciones posibles quedan por debajo del umbral.`;
      }
    }

    return this.construir(ctx, delta, delta.reduce((s, d) => s + d, 0), explicacion, avisos);
  }

  // ======================================================
  // Modos 2 y 3 · Venta / Traspaso y Mixto
  // ======================================================
  private ajusteConVentas(ctx: Contexto, umbral: number): ResultadoRebalanceo {
    const { entradas, V, T, A, modo } = ctx;
    const n = entradas.length;
    const P = T + A;
    const w = entradas.map(e => e.porcentajeObjetivo / 100);

    const puedeComprar = entradas.map((e, i) => e.admiteAportaciones && w[i] > 0);
    const puedeVender = entradas.map(e => this.admiteVentas(e));

    if (!puedeComprar.some(Boolean)) {
      return this.sinMovimientos(ctx,
        'Ninguna categoría puede recibir dinero (no admiten aportaciones o tienen un objetivo del 0 %), ' +
        'así que no hay dónde dirigir las compras.');
    }
    if (modo === 'venta' && !puedeVender.some(Boolean)) {
      return this.sinMovimientos(ctx, 'Ninguna categoría admite ventas o traspasos, así que no se puede rebalancear sin aportar dinero nuevo.');
    }

    const minimo = Math.max(umbral, this.aCentimos(RebalanceoService.UMBRAL_RUIDO));
    const fijas = new Set<number>();
    let solucion: SolucionObjetivo = this.resolver(V, w, puedeComprar, puedeVender, fijas, P);

    for (let it = 0; it <= n && solucion.factible; it++) {
      let menor = -1;
      solucion.x.forEach((x, i) => {
        const d = Math.abs(x - V[i]);
        if (d > 0 && d < minimo && !fijas.has(i) && (menor < 0 || d < Math.abs(solucion.x[menor] - V[menor]))) menor = i;
      });
      if (menor < 0) break;

      fijas.add(menor);
      solucion = this.resolver(V, w, puedeComprar, puedeVender, fijas, P);
    }

    if (!solucion.factible) {
      if (fijas.size > 0 && A === 0) {
        // Todos los movimientos quedan por debajo del umbral: la cartera ya está equilibrada «en la práctica»
        return this.construir(ctx, V.map(() => 0), 0,
          this.explicarResidual(ctx, V, P, puedeComprar, puedeVender, fijas, minimo), []);
      }
      return this.sinMovimientos(ctx, fijas.size > 0
        ? `Con el umbral mínimo de ${this.euros(minimo)} ninguna combinación de operaciones permite repartir el importe: ` +
          'prueba con un umbral menor.'
        : 'Con las restricciones actuales no es posible repartir el importe entre las categorías.');
    }

    const delta = solucion.x.map((x, i) => x - V[i]);
    const avisos: string[] = [];
    entradas.forEach((e, i) => {
      if (delta[i] < 0 && this.vehiculo(e) === 'iliquido') {
        avisos.push(`${e.nombre} es un activo ilíquido: reducirlo puede ser lento y costoso, valora si compensa.`);
      }
    });

    const explicacion = this.explicarResidual(ctx, solucion.x, P, puedeComprar, puedeVender, fijas, minimo);
    return this.construir(ctx, delta, A, explicacion, avisos);
  }

  /**
   * Valor final de cada categoría: x_i = clamp(λ·w_i, L_i, U_i) con Σx_i = P. λ se obtiene por búsqueda
   * binaria y el resultado se redondea a céntimos por mayor resto, de modo que la suma sea exactamente P.
   */
  private resolver(
    V: number[], w: number[], puedeComprar: boolean[], puedeVender: boolean[], fijas: Set<number>, P: number
  ): SolucionObjetivo {
    const n = V.length;
    // Categorías fijas: las elegidas por el umbral y las de valor negativo (no se pueden rebalancear)
    const fija = V.map((v, i) => fijas.has(i) || v < 0);
    const L = V.map((v, i) => (fija[i] || !puedeVender[i] ? v : 0));
    const U = V.map((v, i) => (fija[i] || !puedeComprar[i] ? v : Infinity));

    const receptoras = V.map((_, i) => i).filter(i => !fija[i] && puedeComprar[i]);
    const sumaL = L.reduce((s, v) => s + v, 0);
    if (!receptoras.length || sumaL > P) return { x: V.slice(), factible: false };

    const f = (lambda: number) =>
      V.reduce((s, _, i) => s + Math.min(U[i], Math.max(L[i], lambda * w[i])), 0);

    const wMin = Math.min(...receptoras.map(i => w[i]));
    let lo = 0;
    let hi = P / wMin + 1;
    for (let it = 0; it < 200 && hi - lo > 1e-9; it++) {
      const mid = (lo + hi) / 2;
      if (f(mid) <= P) lo = mid;
      else hi = mid;
    }

    const reales = V.map((_, i) => Math.min(U[i], Math.max(L[i], lo * w[i])));
    const x = reales.map(r => Math.floor(r + 1e-9));
    let resto = P - x.reduce((s, v) => s + v, 0);

    // Mayor resto fraccionario primero (a igualdad, mayor peso objetivo)
    const orden = V.map((_, i) => i)
      .filter(i => L[i] < U[i])
      .sort((a, b) => (reales[b] - x[b]) - (reales[a] - x[a]) || w[b] - w[a]);
    for (let k = 0; resto > 0 && orden.length && k < 10 * n; k++) {
      const i = orden[k % orden.length];
      if (x[i] < U[i]) { x[i]++; resto--; }
    }
    for (let k = 0; resto < 0 && orden.length && k < 10 * n; k++) {
      const i = orden[orden.length - 1 - (k % orden.length)];
      if (x[i] > L[i]) { x[i]--; resto++; }
    }

    return { x, factible: resto === 0 };
  }

  private explicarResidual(
    ctx: Contexto, x: number[], P: number, puedeComprar: boolean[], puedeVender: boolean[],
    fijas: Set<number>, minimo: number
  ): string | null {
    const { entradas } = ctx;
    const pp = (i: number) => (P > 0 ? (x[i] / P) * 100 : 0) - entradas[i].porcentajeObjetivo;
    const tol = RebalanceoService.TOLERANCIA_PP;
    if (entradas.every((_, i) => Math.abs(pp(i)) <= tol)) return null;

    const nombres = (filtro: (i: number) => boolean) =>
      entradas.filter((_, i) => filtro(i)).map(e => e.nombre).join(', ');

    const causas: string[] = [];
    const sinCompra = nombres(i => pp(i) < -tol && !puedeComprar[i]);
    if (sinCompra) causas.push(`${sinCompra} no puede recibir dinero y se queda por debajo de su objetivo`);
    const sinVenta = nombres(i => pp(i) > tol && !puedeVender[i]);
    if (sinVenta) causas.push(`${sinVenta} no admite ventas y se queda por encima de su objetivo`);
    const umbral = nombres(i => fijas.has(i) && Math.abs(pp(i)) > tol);
    if (umbral) causas.push(`los movimientos de ${umbral} están por debajo del umbral mínimo (${this.euros(minimo)})`);

    return 'El plan se acerca al objetivo, pero no lo alcanza exactamente: ' +
      (causas.length ? causas.join('; ') : 'las restricciones actuales no permiten ajustarlo más') + '.';
  }

  // ======================================================
  // Resultado
  // ======================================================
  private sinMovimientos(ctx: Contexto, explicacion: string | null): ResultadoRebalanceo {
    return this.construir(ctx, ctx.V.map(() => 0), 0, explicacion, []);
  }

  /** Construye el resultado completo a partir de los movimientos (céntimos; positivo = entra dinero). */
  private construir(
    ctx: Contexto, delta: number[], usada: number, explicacion: string | null, avisos: string[]
  ): ResultadoRebalanceo {
    const { entradas, V, T, A, modo } = ctx;
    const entradasTotal = delta.reduce((s, d) => s + Math.max(d, 0), 0);
    const salidasTotal = delta.reduce((s, d) => s + Math.max(-d, 0), 0);
    const P = T + usada;

    const fondosEntran = entradas.reduce((s, e, i) => s + (this.vehiculo(e) === 'fondos' ? Math.max(delta[i], 0) : 0), 0);
    const fondosSalen = entradas.reduce((s, e, i) => s + (this.vehiculo(e) === 'fondos' ? Math.max(-delta[i], 0) : 0), 0);
    const traspasable = Math.min(fondosEntran, fondosSalen);
    const sinEfecto = entradas.reduce((s, e, i) => s + (this.vehiculo(e) === 'liquidez' ? Math.max(-delta[i], 0) : 0), 0);
    const fiscal: ResumenFiscal = {
      traspasable: traspasable / 100,
      sinEfecto: sinEfecto / 100,
      tributable: (salidasTotal - traspasable - sinEfecto) / 100
    };

    const aportarTodo = salidasTotal === 0;
    const filas: FilaRebalanceo[] = entradas.map((e, i) => {
      const vehiculo = this.vehiculo(e);
      const mov = delta[i];
      const final = V[i] + mov;
      const pctActual = T > 0 ? (V[i] / T) * 100 : 0;
      const pctFinal = P > 0 ? (final / P) * 100 : 0;
      const ideal = (T * e.porcentajeObjetivo) / 100;

      let accion: AccionRebalanceo = 'mantener';
      let tratamiento: TratamientoSalida | null = null;
      if (mov > 0) {
        accion = modo === 'aportaciones' || (modo === 'mixto' && aportarTodo) ? 'aportar' : 'comprar';
      } else if (mov < 0) {
        const traspaso = vehiculo === 'fondos' && fondosEntran > 0;
        accion = traspaso ? 'traspasar' : 'vender';
        tratamiento = vehiculo === 'liquidez' ? 'sin-efecto' : traspaso ? 'traspaso' : 'tributable';
      }

      return {
        categoriaId: e.categoriaId,
        nombre: e.nombre,
        vehiculo,
        valorActual: V[i] / 100,
        porcentajeActual: pctActual,
        porcentajeObjetivo: e.porcentajeObjetivo,
        desviacionPuntos: pctActual - e.porcentajeObjetivo,
        desviacionImporte: Math.round(V[i] - ideal) / 100,
        movimiento: mov / 100,
        accion,
        tratamiento,
        valorObjetivo: final / 100,
        porcentajeFinal: pctFinal,
        desviacionFinalPuntos: pctFinal - e.porcentajeObjetivo,
        puedeComprar: e.admiteAportaciones && e.porcentajeObjetivo > 0,
        puedeVender: this.admiteVentas(e)
      };
    });

    return {
      modo,
      patrimonioActual: T / 100,
      patrimonioFinal: P / 100,
      aportacion: A / 100,
      aportacionUsada: usada / 100,
      aportacionNoAsignada: (A - usada) / 100,
      totalEntradas: entradasTotal / 100,
      totalSalidas: salidasTotal / 100,
      filas,
      fiscal,
      cuadra: entradasTotal === salidasTotal + usada && usada >= 0 && usada <= A,
      alcanzaObjetivos: P > 0 && filas.every(f => Math.abs(f.desviacionFinalPuntos) <= RebalanceoService.TOLERANCIA_PP),
      explicacion,
      avisos
    };
  }

  // ======================================================
  // Utilidades
  // ======================================================
  private vehiculo(e: EntradaCategoria): VehiculoInversion {
    return e.vehiculo ?? 'otro';
  }

  private admiteVentas(e: EntradaCategoria): boolean {
    return e.admiteVentas ?? this.vehiculo(e) !== 'iliquido';
  }

  /** Importes que no pueden ser negativos (aportación, umbral): lo no numérico o negativo vale 0. */
  private aCentimos(euros: number): number {
    return Number.isFinite(euros) && euros > 0 ? Math.round(euros * 100) : 0;
  }

  /** Valores de las categorías: el valor neto puede ser negativo (deuda superior al valor). */
  private aCentimosFirmado(euros: number): number {
    return Number.isFinite(euros) ? Math.round(euros * 100) : 0;
  }

  /** Céntimos → «1.234,50 €» */
  private euros(centimos: number): string {
    return (centimos / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
  }
}
