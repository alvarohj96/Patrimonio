import { Injectable } from '@angular/core';
import {
  CategoriaPatrimonio,
  ConfigCategoriaInversion,
  DistribucionActual,
  EntradaCategoria,
  EstadoPonderacion,
  FilaDistribucion,
  FilaSimulacion,
  ResultadoSimulacion
} from '../models/objetivos-inversion';

/** Categoría que puede recibir dinero, con sus restricciones expresadas en céntimos. */
interface Candidata {
  idx: number;
  /** fluida: sin restricciones · minimo: solo importe mínimo · escalonada: múltiplos de `paso` (con mínimo opcional) */
  tipo: 'fluida' | 'minimo' | 'escalonada';
  minimo: number;
  paso: number;
}

interface ItemLibre {
  idx: number;
  lb: number;
}

/**
 * Cálculo de la distribución actual frente a los objetivos y simulación de nuevas aportaciones.
 * Servicio sin estado ni dependencias: consume los valores reales ya calculados por
 * `PatrimonioService` y la configuración de `ObjetivosInversionService`.
 *
 * Todo el algoritmo trabaja en céntimos enteros para que el reparto sume exactamente el importe.
 */
@Injectable({ providedIn: 'root' })
export class SimuladorAportacionesService {

  /** Tolerancia (puntos porcentuales) para considerar una categoría «equilibrada». */
  static readonly TOLERANCIA_PP = 0.1;

  /** Límite de combinaciones evaluadas con categorías con mínimo/incremento (evita bloqueos). */
  private static readonly MAX_COMBINACIONES = 20000;
  /** Máximo de múltiplos distintos que se prueban por categoría con incremento. */
  private static readonly MAX_OPCIONES_ESCALON = 30;

  /** Cruza categorías, valores actuales (por nombre) y configuración (por id). */
  construirEntradas(
    categorias: CategoriaPatrimonio[],
    valoresPorNombre: { [categoria: string]: number },
    config: ConfigCategoriaInversion[]
  ): EntradaCategoria[] {
    const porId = new Map(config.map(c => [c.categoriaId, c]));
    return categorias.map(cat => {
      const c = porId.get(cat.id);
      return {
        categoriaId: cat.id,
        nombre: cat.nombre,
        valorActual: valoresPorNombre[cat.nombre] ?? 0,
        porcentajeObjetivo: c?.porcentajeObjetivo ?? 0,
        admiteAportaciones: c?.admiteAportaciones ?? true,
        importeMinimo: c?.importeMinimo ?? null,
        incrementoMinimo: c?.incrementoMinimo ?? null
      };
    });
  }

  // ======================================================
  // Distribución actual vs. objetivo
  // ======================================================
  calcularDistribucion(entradas: EntradaCategoria[]): DistribucionActual {
    const total = this.redondear2(entradas.reduce((s, e) => s + this.num(e.valorActual), 0));
    const base = Math.max(total, 0);

    const filas: FilaDistribucion[] = entradas.map(e => {
      const valor = this.redondear2(this.num(e.valorActual));
      const pctActual = total > 0 ? (valor / total) * 100 : 0;
      const ideal = this.redondear2((base * e.porcentajeObjetivo) / 100);
      const desviacion = pctActual - e.porcentajeObjetivo;

      return {
        categoriaId: e.categoriaId,
        nombre: e.nombre,
        valorActual: valor,
        porcentajeActual: pctActual,
        porcentajeObjetivo: e.porcentajeObjetivo,
        desviacionPuntos: desviacion,
        importeIdeal: ideal,
        diferencia: this.redondear2(valor - ideal),
        admiteAportaciones: e.admiteAportaciones,
        estado: this.estado(desviacion)
      };
    });

    return {
      patrimonioTotal: total,
      filas,
      sumaObjetivos: entradas.reduce((s, e) => s + e.porcentajeObjetivo, 0)
    };
  }

  // ======================================================
  // Simulador
  // ======================================================
  /**
   * Propone cómo repartir `importe` entre las categorías:
   *  - sin ventas, sin aportaciones negativas y 0 € a las categorías que no admiten aportaciones;
   *  - todas las categorías (también las que no admiten aportaciones) cuentan en el patrimonio proyectado;
   *  - aportacion_i = max(0, λ·peso_i − valor_i) con λ por búsqueda binaria (sin restricciones);
   *  - con importe mínimo / incremento se prueban las combinaciones válidas y se elige la que asigna más
   *    dinero y, a igualdad, la que deja la cartera más cerca del objetivo.
   */
  simularAportacion(entradas: EntradaCategoria[], importe: number): ResultadoSimulacion {
    const A = Number.isFinite(importe) && importe > 0 ? Math.round(importe * 100) : 0;
    const V = entradas.map(e => Math.round(this.num(e.valorActual) * 100));
    const T = V.reduce((s, v) => s + v, 0);
    const wCent = entradas.map(e => Math.round(e.porcentajeObjetivo * 100));
    const w = wCent.map(c => c / 10000);

    const vacio = (explicacion: string | null): ResultadoSimulacion =>
      this.construirResultado(entradas, V, Array(entradas.length).fill(0), A, T, explicacion, [], false);

    if (!entradas.length) {
      return vacio('No hay categorías en el patrimonio sobre las que simular una aportación.');
    }
    if (wCent.reduce((s, c) => s + c, 0) !== 10000 || wCent.some(c => c < 0)) {
      return vacio('Los porcentajes objetivo guardados no suman el 100 %. Revisa y guarda la configuración antes de simular.');
    }
    if (A === 0) return vacio(null);

    const cands = this.candidatas(entradas, wCent);
    if (!cands.length) {
      const admiten = entradas.filter(e => e.admiteAportaciones);
      return vacio(admiten.length === 0
        ? 'Ninguna categoría admite nuevas aportaciones, por lo que no se puede asignar nada.'
        : 'Las categorías que admiten aportaciones tienen un objetivo del 0 %, por lo que no les corresponde recibir dinero.');
    }

    const x = this.resolver(cands, A, V, w, T);
    return this.finalizar(entradas, cands, V, x, A, T);
  }

  // ------------------------------------------------------
  // Selección y reparto
  // ------------------------------------------------------
  private candidatas(entradas: EntradaCategoria[], wCent: number[]): Candidata[] {
    const resultado: Candidata[] = [];
    entradas.forEach((e, idx) => {
      if (!e.admiteAportaciones || wCent[idx] <= 0) return;
      const minimo = e.importeMinimo && e.importeMinimo > 0 ? Math.round(e.importeMinimo * 100) : 0;
      const paso = e.incrementoMinimo && e.incrementoMinimo > 0 ? Math.round(e.incrementoMinimo * 100) : 0;
      resultado.push({
        idx,
        minimo,
        paso,
        tipo: paso > 0 ? 'escalonada' : minimo > 0 ? 'minimo' : 'fluida'
      });
    });
    return resultado;
  }

  /** Devuelve las aportaciones (céntimos) de TODAS las categorías (0 para las no candidatas). */
  private resolver(cands: Candidata[], A: number, V: number[], w: number[], T: number): number[] {
    const n = V.length;
    const fluidas = cands.filter(c => c.tipo === 'fluida');
    const restringidas = cands.filter(c => c.tipo !== 'fluida');

    // Solución continua de referencia (sin restricciones): guía para ordenar las opciones
    const ideal = this.repartoContinuo(cands.map(c => ({ idx: c.idx, lb: 0 })), A, V, w);
    const idealPorIdx = new Map<number, number>();
    cands.forEach((c, k) => idealPorIdx.set(c.idx, ideal ? ideal[k] : 0));

    // Opciones por categoría restringida (la primera siempre es «no aportar»)
    const opciones: number[][] = restringidas.map(c => {
      if (c.tipo === 'minimo') return c.minimo <= A ? [0, c.minimo] : [0];
      const kMin = Math.max(1, Math.ceil(c.minimo / c.paso));
      const kMax = Math.floor(A / c.paso);
      if (kMax < kMin) return [0];
      const kIdeal = Math.round((idealPorIdx.get(c.idx) ?? 0) / c.paso);
      let ks: number[] = [];
      for (let k = kMin; k <= kMax && ks.length <= SimuladorAportacionesService.MAX_OPCIONES_ESCALON + 1; k++) ks.push(k);
      if (ks.length > SimuladorAportacionesService.MAX_OPCIONES_ESCALON) {
        // Demasiados múltiplos: se prueban los más cercanos a la solución ideal
        const centro = Math.min(Math.max(kIdeal, kMin), kMax);
        const desde = Math.max(kMin, centro - Math.floor(SimuladorAportacionesService.MAX_OPCIONES_ESCALON / 2));
        ks = [];
        for (let k = desde; k <= kMax && ks.length < SimuladorAportacionesService.MAX_OPCIONES_ESCALON; k++) ks.push(k);
      }
      ks.sort((a, b) => Math.abs(a - kIdeal) - Math.abs(b - kIdeal) || a - b);
      return [0, ...ks.map(k => k * c.paso)];
    });

    let mejor: { asignado: number; j: number; x: number[] } | null = null;
    let hojas = 0;
    const escalonadas = new Map<number, number>();
    const mininosActivos = new Set<number>();

    const evaluar = () => {
      hojas++;
      let fijo = 0;
      escalonadas.forEach(v => (fijo += v));
      const R = A - fijo;
      if (R < 0) return;

      const libres: ItemLibre[] = [
        ...fluidas.map(c => ({ idx: c.idx, lb: 0 })),
        ...restringidas
          .filter(c => c.tipo === 'minimo' && mininosActivos.has(c.idx))
          .map(c => ({ idx: c.idx, lb: c.minimo }))
      ];

      const x: number[] = Array(n).fill(0);
      escalonadas.forEach((v, idx) => (x[idx] = v));
      let asignado = fijo;

      if (libres.length) {
        const r = this.repartoContinuo(libres, R, V, w);
        if (!r) return; // los mínimos activos no caben en el importe restante
        libres.forEach((l, k) => (x[l.idx] = r[k]));
        asignado = A;
      }

      const j = this.desviacionTotal(x, V, w, T);
      if (!mejor || asignado > mejor.asignado || (asignado === mejor.asignado && j < mejor.j - 1e-12)) {
        mejor = { asignado, j, x };
      }
    };

    const recorrer = (k: number, usado: number) => {
      if (hojas >= SimuladorAportacionesService.MAX_COMBINACIONES) return;
      if (k === restringidas.length) {
        evaluar();
        return;
      }
      const c = restringidas[k];
      for (const opcion of opciones[k]) {
        if (c.tipo === 'escalonada') {
          if (usado + opcion > A) continue;
          if (opcion > 0) escalonadas.set(c.idx, opcion);
          recorrer(k + 1, usado + opcion);
          escalonadas.delete(c.idx);
        } else {
          if (opcion > 0) mininosActivos.add(c.idx);
          recorrer(k + 1, usado);
          mininosActivos.delete(c.idx);
        }
      }
    };
    recorrer(0, 0);

    return (mejor as { x: number[] } | null)?.x ?? Array(n).fill(0);
  }

  /**
   * Reparto continuo: x_i = max(lb_i, λ·w_i − V_i) con Σx_i = R. λ se obtiene por búsqueda binaria
   * y el resultado se redondea a céntimos por mayor resto, de modo que la suma sea exactamente R.
   * Devuelve `null` si los mínimos (lb) no caben en R.
   */
  private repartoContinuo(items: ItemLibre[], R: number, V: number[], w: number[]): number[] | null {
    const sumaLb = items.reduce((s, i) => s + i.lb, 0);
    if (sumaLb > R) return null;
    if (!items.length) return R === 0 ? [] : null;
    if (sumaLb === R) return items.map(i => i.lb);

    const f = (lambda: number) =>
      items.reduce((s, i) => s + Math.max(i.lb, lambda * w[i.idx] - V[i.idx]), 0);

    let lo = Math.min(...items.map(i => (i.lb + V[i.idx]) / w[i.idx])) - 1; // f(lo) = Σlb ≤ R
    let hi = Math.max(...items.map(i => (R + V[i.idx] + i.lb) / w[i.idx])) + 1; // f(hi) ≥ R
    for (let it = 0; it < 200 && hi - lo > 1e-9; it++) {
      const mid = (lo + hi) / 2;
      if (f(mid) <= R) lo = mid;
      else hi = mid;
    }

    const reales = items.map(i => Math.max(i.lb, lo * w[i.idx] - V[i.idx]));
    const x = reales.map(r => Math.floor(r));
    let resto = R - x.reduce((s, v) => s + v, 0);

    // Mayor resto fraccionario primero (a igualdad, mayor peso objetivo)
    const orden = items
      .map((_, k) => k)
      .sort((a, b) => (reales[b] - x[b]) - (reales[a] - x[a]) || w[items[b].idx] - w[items[a].idx]);
    for (let k = 0; resto > 0; k++, resto--) x[orden[k % orden.length]]++;
    for (let k = 0; resto < 0; k++) {
      const pos = orden[orden.length - 1 - (k % orden.length)];
      if (x[pos] > items[pos].lb) { x[pos]--; resto++; }
      else if (k > 10 * orden.length) break;
    }
    return x;
  }

  /** Σ |porcentaje proyectado − objetivo| sobre TODAS las categorías (también las que no admiten aportaciones). */
  private desviacionTotal(x: number[], V: number[], w: number[], T: number): number {
    const P = T + x.reduce((s, v) => s + v, 0);
    if (P <= 0) return 0;
    return V.reduce((s, v, i) => s + Math.abs((v + x[i]) / P - w[i]), 0);
  }

  // ------------------------------------------------------
  // Resultado y explicaciones
  // ------------------------------------------------------
  private finalizar(
    entradas: EntradaCategoria[], cands: Candidata[], V: number[], x: number[], A: number, T: number
  ): ResultadoSimulacion {
    const asignado = x.reduce((s, v) => s + v, 0);
    const P = T + asignado;
    const estados = entradas.map((e, i) =>
      this.estado(P > 0 ? ((V[i] + x[i]) / P) * 100 - e.porcentajeObjetivo : 0));
    const alcanza = estados.every(s => s === 'equilibrada');

    const avisos: string[] = [];
    if (P <= 0) {
      avisos.push('El patrimonio proyectado no es positivo, por lo que los porcentajes no son significativos.');
    }

    const hayFluida = cands.some(c => c.tipo === 'fluida');
    entradas.forEach((e, i) => {
      if (x[i] > 0 && estados[i] === 'sobreponderada') {
        avisos.push(
          `${e.nombre} recibe aportación y queda por encima de su objetivo` +
          (hayFluida ? '.' : ': los importes mínimos o incrementos obligan a repartir todo el importe.')
        );
      }
    });

    let explicacion: string | null = null;
    const noAsignado = A - asignado;

    if (noAsignado > 0) {
      explicacion = this.explicarNoAsignado(entradas, cands, A, noAsignado);
    } else if (!alcanza) {
      explicacion = this.explicarObjetivoInalcanzable(entradas, cands, estados, x);
    }

    return this.construirResultado(entradas, V, x, A, T, explicacion, avisos, alcanza);
  }

  private explicarNoAsignado(entradas: EntradaCategoria[], cands: Candidata[], A: number, noAsignado: number): string {
    const euros = (c: number) => this.formatearEuros(c / 100);
    const menorOpcion = cands
      .map(c => ({ idx: c.idx, importe: c.tipo === 'escalonada' ? Math.max(1, Math.ceil(c.minimo / c.paso)) * c.paso : c.minimo }))
      .sort((a, b) => a.importe - b.importe)[0];

    if (menorOpcion && A < menorOpcion.importe) {
      return `No se ha podido asignar nada: la menor aportación permitida (${euros(menorOpcion.importe)} en ` +
        `${entradas[menorOpcion.idx].nombre}) supera la cantidad introducida.`;
    }
    return `No se han podido asignar ${euros(noAsignado)} de ${euros(A)}: todas las categorías que pueden recibir ` +
      `dinero tienen importe mínimo o incremento mínimo y ninguna combinación válida suma exactamente la cantidad ` +
      `introducida. Prueba con otra cantidad o relaja esos límites.`;
  }

  private explicarObjetivoInalcanzable(
    entradas: EntradaCategoria[], cands: Candidata[], estados: EstadoPonderacion[], x: number[]
  ): string {
    const nombres = (filtro: (e: EntradaCategoria, i: number) => boolean) =>
      entradas.filter(filtro).map(e => e.nombre).join(', ');

    const causas: string[] = [];

    const noAdmiten = nombres((e, i) => !e.admiteAportaciones && estados[i] !== 'equilibrada');
    if (noAdmiten) {
      causas.push(`las categorías que no admiten aportaciones (${noAdmiten}) mantienen su valor y no pueden ajustarse`);
    }
    const sobre = nombres((e, i) => estados[i] === 'sobreponderada');
    if (sobre) {
      causas.push(`no se contemplan ventas, así que ${sobre} solo puede diluirse con la aportación`);
    }
    const infra = nombres((e, i) => estados[i] === 'infraponderada' && e.admiteAportaciones);
    if (infra) {
      causas.push(cands.some(c => c.tipo !== 'fluida')
        ? `los importes mínimos o incrementos configurados limitan el ajuste (${infra} sigue por debajo de su objetivo)`
        : `la aportación no es suficiente para cubrir el objetivo de ${infra}`);
    }
    if (!causas.length) causas.push('el reparto no puede ajustarse más con las restricciones actuales');

    return 'La distribución propuesta se acerca al objetivo, pero no lo alcanza exactamente: ' + causas.join('; ') + '.';
  }

  private construirResultado(
    entradas: EntradaCategoria[], V: number[], x: number[], A: number, T: number,
    explicacion: string | null, avisos: string[], alcanza: boolean
  ): ResultadoSimulacion {
    const asignado = x.reduce((s, v) => s + v, 0);
    const P = T + asignado;

    const filas: FilaSimulacion[] = entradas.map((e, i) => {
      const proyectado = V[i] + x[i];
      const pct = P > 0 ? (proyectado / P) * 100 : 0;
      const desviacion = pct - e.porcentajeObjetivo;
      return {
        categoriaId: e.categoriaId,
        nombre: e.nombre,
        admiteAportaciones: e.admiteAportaciones,
        valorActual: V[i] / 100,
        aportacion: x[i] / 100,
        valorProyectado: proyectado / 100,
        porcentajeProyectado: pct,
        porcentajeObjetivo: e.porcentajeObjetivo,
        desviacionProyectada: desviacion,
        estadoProyectado: this.estado(P > 0 ? desviacion : 0)
      };
    });

    return {
      importe: A / 100,
      asignado: asignado / 100,
      noAsignado: (A - asignado) / 100,
      patrimonioActual: T / 100,
      patrimonioProyectado: P / 100,
      filas,
      explicacion,
      avisos,
      alcanzaObjetivos: alcanza
    };
  }

  // ------------------------------------------------------
  // Utilidades
  // ------------------------------------------------------
  private estado(desviacionPuntos: number): EstadoPonderacion {
    if (desviacionPuntos > SimuladorAportacionesService.TOLERANCIA_PP) return 'sobreponderada';
    if (desviacionPuntos < -SimuladorAportacionesService.TOLERANCIA_PP) return 'infraponderada';
    return 'equilibrada';
  }

  private num(v: number): number {
    return Number.isFinite(v) ? v : 0;
  }

  private redondear2(v: number): number {
    return Math.round(v * 100) / 100;
  }

  private formatearEuros(v: number): string {
    return v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
  }
}
