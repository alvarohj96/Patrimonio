import { Injectable } from '@angular/core';
import { CategoriaPatrimonio } from '../models/objetivos-inversion';
import {
  AlertaPlan,
  CategoriaClasificada,
  DetalleVenta,
  EstadoPlanDesinversion,
  EstrategiaInmueble,
  FaseLiquidez,
  FilaPlan,
  NivelAlerta,
  ParametrosPlan,
  SituacionInicial,
  TrayectoriaPlan
} from '../models/plan-desinversion';
import { euros } from '../shared/formato';

/** Valor bruto y deuda de una categoría (último mes registrado). */
export interface DesgloseCategoria {
  valor: number;
  deuda: number;
}

/** Por debajo de este saldo (en €) se considera agotado. */
const EPS = 0.005;
/** Por debajo de este importe (en €) una retirada sin cubrir se considera ruido de redondeo. */
const TOLERANCIA_DEFICIT = 0.5;

const PREFIJOS_INDIVISIBLE = [
  'inmueble', 'vivienda', 'piso', 'terreno', 'parcela', 'garaje', 'local', 'propiedad', 'iliquid', 'negocio'
];
const PREFIJOS_COLCHON = ['liquidez', 'efectivo', 'cash', 'remunerad', 'monetari', 'deposit', 'corriente'];

const FASES: readonly FaseLiquidez[] = ['colchon', 'liquidos', 'indivisibles'];
const RANGO_NIVEL: Record<NivelAlerta, number> = { critica: 0, aviso: 1, info: 2, ok: 3 };

/**
 * Cálculo (puro) del plan de desinversión y persistencia (localStorage, como el resto de
 * servicios) de los parámetros elegidos.
 *
 * Modelo (paso mensual, año a año):
 *  - Cascada de retirada: cada mes la necesidad (retirada − renta neta del inmueble) se cubre
 *    primero con el colchón de liquidez y, cuando se agota, vendiendo cartera fraccionable.
 *    Lo que ninguno cubre se registra como déficit (riesgo de iliquidez).
 *  - Las retiradas se hacen al principio de cada mes y después el saldo restante rinde: es la
 *    hipótesis prudente. Rentabilidades anuales efectivas, capitalización mensual.
 *  - Los activos indivisibles NO se fraccionan: se mantienen enteros (revalorizándose y,
 *    opcionalmente, aportando renta neta) o se venden en bloque al final del año elegido. El
 *    importe neto realizable (valor − costes de salida − deuda) entra de golpe en el colchón.
 *  - Retiradas y renta neta se indexan con la inflación (el primer año va en euros de hoy).
 */
@Injectable({ providedIn: 'root' })
export class PlanDesinversionService {

  static readonly HORIZONTE_MIN = 5;
  static readonly HORIZONTE_MAX = 35;

  private readonly LS_KEY = 'plan_desinversion';

  // ------------------------------------------------------
  // Clasificación por liquidez
  // ------------------------------------------------------

  /** Fase sugerida según el nombre de la categoría («Inmuebles» → 3, «Liquidez» → 1, resto → 2). */
  faseSugerida(nombre: string): FaseLiquidez {
    const texto = this.normalizar(nombre);
    const palabras = texto.split(/[^a-z0-9]+/).filter(Boolean);
    const empieza = (prefijos: readonly string[]) => palabras.some(p => prefijos.some(x => p.startsWith(x)));

    if (empieza(PREFIJOS_INDIVISIBLE) || texto.includes('private equity') || texto.includes('capital riesgo')) {
      return 'indivisibles';
    }
    if (empieza(PREFIJOS_COLCHON)) return 'colchon';
    return 'liquidos';
  }

  esFase(valor: unknown): valor is FaseLiquidez {
    return typeof valor === 'string' && (FASES as readonly string[]).includes(valor);
  }

  /** Aplica la fase elegida por el usuario (por id de categoría) o, si no hay, la sugerida. */
  clasificar(
    categorias: readonly CategoriaPatrimonio[],
    desglose: Readonly<Record<string, DesgloseCategoria>>,
    asignaciones: Readonly<Record<string, FaseLiquidez>>
  ): CategoriaClasificada[] {
    return categorias.map(c => {
      const d = desglose[c.nombre] ?? { valor: 0, deuda: 0 };
      const valorBruto = this.finito(d.valor);
      const deuda = this.finito(d.deuda);
      const faseSugerida = this.faseSugerida(c.nombre);
      const elegida = asignaciones[c.id];
      const fase = this.esFase(elegida) ? elegida : faseSugerida;
      return {
        id: c.id,
        nombre: c.nombre,
        fase,
        faseSugerida,
        personalizada: fase !== faseSugerida,
        valorBruto,
        deuda,
        valorNeto: valorBruto - deuda
      };
    });
  }

  /** Patrimonio de partida por fases (fases 1 y 2 en neto; fase 3 en bruto y deuda por separado). */
  situacionInicial(categorias: readonly CategoriaClasificada[]): SituacionInicial {
    let colchon = 0;
    let liquidos = 0;
    let bruto = 0;
    let deuda = 0;

    for (const c of categorias) {
      switch (c.fase) {
        case 'colchon': colchon += c.valorNeto; break;
        case 'liquidos': liquidos += c.valorNeto; break;
        case 'indivisibles': bruto += c.valorBruto; deuda += c.deuda; break;
      }
    }

    colchon = Math.max(0, colchon);
    liquidos = Math.max(0, liquidos);
    const neto = bruto - deuda;
    return {
      colchon,
      liquidos,
      brutoIndivisible: bruto,
      deudaIndivisible: deuda,
      netoIndivisible: neto,
      total: colchon + liquidos + neto
    };
  }

  // ------------------------------------------------------
  // Proyección
  // ------------------------------------------------------

  /** Proyección año a año (fila 0 = hoy) de la estrategia elegida para el inmueble. */
  simular(p: ParametrosPlan, estrategia: EstrategiaInmueble): TrayectoriaPlan {
    const n = Math.max(0, Math.floor(p.horizonte));
    const iColchon = this.tasaMensual(p.rentabilidadColchon);
    const iCartera = this.tasaMensual(p.rentabilidadCartera);
    const anioVenta = estrategia === 'vender' ? this.anioVentaValido(p.anioVenta, n) : null;

    let colchon = p.colchonInicial;
    let cartera = p.carteraInicial;
    let vendido = false;
    let venta: DetalleVenta | null = null;
    let anioDeficit: number | null = null;
    let colchonAgotadoMes: number | null = null;
    let carteraInicioMes: number | null = null;
    let carteraAgotadaMes: number | null = null;

    const inmuebleInicial = p.brutoIndivisible - p.deudaIndivisible;
    const filas: FilaPlan[] = [{
      anio: 0,
      deflactor: 1,
      colchon,
      cartera,
      liquido: colchon + cartera,
      inmuebleNeto: inmuebleInicial,
      total: colchon + cartera + inmuebleInicial,
      deColchon: 0,
      deCartera: 0,
      rentaCobrada: 0,
      deficit: 0
    }];

    for (let anio = 1; anio <= n; anio++) {
      const indice = Math.pow(1 + p.inflacion / 100, anio - 1);
      const rentaMes = vendido ? 0 : p.rentaNetaMensual * indice;
      const necesidad = p.retiradaMensual * indice - rentaMes;

      let deColchon = 0;
      let deCartera = 0;
      let deficit = 0;

      for (let mes = 1; mes <= 12; mes++) {
        const mesGlobal = (anio - 1) * 12 + mes;

        if (necesidad >= 0) {
          // Cascada: 1) colchón, 2) venta fraccionada de cartera, 3) lo demás es déficit
          const delColchon = Math.min(colchon, necesidad);
          colchon -= delColchon;
          const delCartera = Math.min(cartera, necesidad - delColchon);
          cartera -= delCartera;

          deColchon += delColchon;
          deCartera += delCartera;
          deficit += necesidad - delColchon - delCartera;
          if (delCartera > EPS && carteraInicioMes === null) carteraInicioMes = mesGlobal;
        } else {
          // La renta del inmueble supera la retirada: el excedente engrosa el colchón
          colchon -= necesidad;
        }

        if (colchonAgotadoMes === null && p.colchonInicial > 0 && colchon <= EPS) colchonAgotadoMes = mesGlobal;
        if (carteraAgotadaMes === null && p.carteraInicial > 0 && cartera <= EPS) carteraAgotadaMes = mesGlobal;

        colchon *= 1 + iColchon;
        cartera *= 1 + iCartera;
      }

      // Valor y deuda del bien indivisible al final del año
      const valor = p.brutoIndivisible * Math.pow(1 + p.revalorizacion / 100, anio);
      const deuda = Math.max(0, p.deudaIndivisible - p.amortizacionAnualDeuda * anio);

      if (anioVenta === anio) {
        // Venta en bloque: todo o nada, con costes de salida y cancelación de la deuda
        const costes = valor * (p.costesSalida / 100);
        const neto = valor - costes - deuda;
        venta = { anio, bruto: valor, costes, deuda, neto };

        if (neto >= 0) {
          colchon += neto;
        } else {
          let falta = -neto;
          const delColchon = Math.min(colchon, falta);
          colchon -= delColchon;
          falta -= delColchon;
          const delCartera = Math.min(cartera, falta);
          cartera -= delCartera;
          falta -= delCartera;
          deficit += falta;
        }
        vendido = true;
      }

      if (anioDeficit === null && deficit > TOLERANCIA_DEFICIT) anioDeficit = anio;

      const inmuebleNeto = vendido ? 0 : valor - deuda;
      filas.push({
        anio,
        deflactor: Math.pow(1 + p.inflacion / 100, anio),
        colchon,
        cartera,
        liquido: colchon + cartera,
        inmuebleNeto,
        total: colchon + cartera + inmuebleNeto,
        deColchon,
        deCartera,
        rentaCobrada: rentaMes * 12,
        deficit
      });
    }

    const ultima = filas[filas.length - 1];
    return {
      estrategia,
      filas,
      venta,
      anioDeficit,
      colchonAgotadoMes,
      carteraInicioMes,
      carteraAgotadaMes,
      liquidoFinal: ultima.liquido,
      totalFinal: ultima.total
    };
  }

  /** Pasa un importe nominal de la fila a euros de hoy si `real` es `true`. */
  enModo(valor: number, fila: FilaPlan, real: boolean): number {
    return real ? valor / fila.deflactor : valor;
  }

  // ------------------------------------------------------
  // Alertas inteligentes
  // ------------------------------------------------------

  /**
   * Avisos sobre el plan elegido (`activa`) comparándolo con la otra estrategia (`alternativa`,
   * `null` si no hay activos indivisibles). Ordenados de más a menos grave.
   */
  alertas(
    p: ParametrosPlan,
    activa: TrayectoriaPlan,
    alternativa: TrayectoriaPlan | null,
    anioActual: number
  ): AlertaPlan[] {
    const out: AlertaPlan[] = [];
    const cal = (anio: number) => anioActual + anio;
    const H = p.horizonte;
    const real = (t: TrayectoriaPlan, valor: (f: FilaPlan) => number) => {
      const f = t.filas[t.filas.length - 1];
      return valor(f) / f.deflactor;
    };
    const faltaReal = (t: TrayectoriaPlan) => {
      const f = t.filas.find(x => x.anio === t.anioDeficit);
      return f ? f.deficit / f.deflactor : 0;
    };

    if (p.retiradaMensual <= 0) {
      return [{
        id: 'sin-retirada',
        nivel: 'info',
        titulo: 'Indica cuánto necesitas retirar',
        texto: 'Con una retirada de 0 € no hay nada que planificar: el patrimonio solo crece. Introduce la cantidad que necesitas cada mes o cada año.'
      }];
    }

    if (activa.venta && activa.venta.neto < 0) {
      out.push({
        id: 'venta-negativa',
        nivel: 'critica',
        titulo: 'La venta no cubriría la deuda',
        texto: `Con un ${this.num(p.costesSalida)} % de costes de salida y ${euros(activa.venta.deuda)} de deuda pendiente en ${cal(activa.venta.anio)}, `
          + `la venta deja un saldo de ${euros(activa.venta.neto)}: tendrías que aportar dinero para cancelar la deuda.`
      });
    }

    if (activa.anioDeficit !== null) {
      const d = activa.anioDeficit;
      const falta = euros(faltaReal(activa));

      if (activa.venta && d <= activa.venta.anio) {
        const limite = d - 1;
        out.push({
          id: 'iliquidez-antes-venta',
          nivel: 'critica',
          titulo: 'Riesgo de iliquidez antes de la venta',
          texto: `Tu patrimonio líquido se agota en ${cal(d)}, pero el inmueble no se vende hasta ${cal(activa.venta.anio)}: `
            + `entre medias no podrías cubrir las retiradas (en ${cal(d)} faltarían ≈ ${falta} en euros de hoy). `
            + (limite >= 1
              ? `La venta tendría que hacerse como tarde en ${cal(limite)}; también puedes reducir la retirada o revisar las rentabilidades.`
              : 'Ya en el primer año la retirada supera tu liquidez: reduce la retirada o revisa las rentabilidades.')
        });
      } else {
        const sinVentaPosible = activa.estrategia === 'mantener' && p.brutoIndivisible > 0;
        out.push({
          id: 'iliquidez',
          nivel: 'critica',
          titulo: `La liquidez se agota en ${cal(d)}`,
          texto: `El patrimonio líquido no alcanza para cubrir las retiradas a partir del año ${d} de ${H} (ese año faltarían ≈ ${falta} en euros de hoy). `
            + (sinVentaPosible
              ? 'Mantener el inmueble no lo resuelve: no se puede vender por partes para cubrir el déficit.'
              : 'Ni siquiera con la venta del inmueble llega para todo el horizonte.')
        });
      }

      if (alternativa) {
        const otra = alternativa.estrategia === 'vender' && alternativa.venta
          ? `Vendiendo el inmueble en ${cal(alternativa.venta.anio)}`
          : 'Manteniendo el inmueble';

        if (alternativa.anioDeficit === null) {
          out.push({
            id: 'alternativa-cubre',
            nivel: 'info',
            titulo: 'La otra estrategia sí cubre el horizonte',
            texto: `${otra} el plan sí cubriría los ${H} años, con ≈ ${euros(real(alternativa, f => f.liquido))} líquidos al final (euros de hoy).`
          });
        } else if (alternativa.anioDeficit > d) {
          out.push({
            id: 'alternativa-pospone',
            nivel: 'info',
            titulo: 'La otra estrategia retrasa el agotamiento',
            texto: `${otra} la liquidez duraría hasta ${cal(alternativa.anioDeficit)} en lugar de ${cal(d)}.`
          });
        }
      }
    } else {
      const ultima = activa.filas[activa.filas.length - 1];
      const retiradaAnualFinal = p.retiradaMensual * 12 * Math.pow(1 + p.inflacion / 100, Math.max(0, H - 1));
      const margen = retiradaAnualFinal > 0 ? ultima.liquido / retiradaAnualFinal : Infinity;
      const liquidoReal = euros(real(activa, f => f.liquido));

      if (margen < 2) {
        out.push({
          id: 'margen-estrecho',
          nivel: 'aviso',
          titulo: 'Margen de seguridad estrecho',
          texto: `El plan llega al final, pero te quedarían ${liquidoReal} líquidos (≈ ${this.num(margen)} años de retirada). `
            + 'Una mala racha de mercado en los primeros años podría dejarte sin liquidez.'
        });
      } else {
        out.push({
          id: 'plan-sostenible',
          nivel: 'ok',
          titulo: `El plan cubre los ${H} años`,
          texto: `Las retiradas se financian con la liquidez durante todo el horizonte y quedan ≈ ${liquidoReal} líquidos al final (euros de hoy).`
        });
      }

      if (activa.estrategia === 'vender' && activa.venta && alternativa && alternativa.anioDeficit === null) {
        out.push({
          id: 'venta-innecesaria',
          nivel: 'info',
          titulo: 'La venta no es imprescindible',
          texto: `Manteniendo el inmueble el plan también cubre el horizonte: acabarías con ≈ ${euros(real(alternativa, f => f.liquido))} líquidos `
            + `y ≈ ${euros(real(alternativa, f => f.inmuebleNeto))} en el inmueble, frente a ≈ ${liquidoReal} líquidos si vendes en ${cal(activa.venta.anio)}.`
        });
      }
    }

    return out.sort((a, b) => RANGO_NIVEL[a.nivel] - RANGO_NIVEL[b.nivel]);
  }

  // ------------------------------------------------------
  // Saneamiento y persistencia
  // ------------------------------------------------------

  estadoPorDefecto(anioActual: number = new Date().getFullYear()): EstadoPlanDesinversion {
    return {
      version: 1,
      asignaciones: {},
      retirada: 2000,
      periodicidad: 'mensual',
      horizonte: 30,
      rentabilidadCartera: 4,
      rentabilidadColchon: 2,
      inflacion: 2,
      estrategia: 'mantener',
      anioVenta: anioActual + 10,
      costesSalida: 7,
      rentaNeta: 0,
      revalorizacion: 2,
      amortizacionDeuda: 0,
      valoresReales: true
    };
  }

  /** Limita `n` al rango dado; los valores no numéricos o `null` valen `porDefecto`. */
  limitar(n: number | null | undefined, min: number, max: number, porDefecto = 0): number {
    if (n === null || n === undefined || !Number.isFinite(n)) return porDefecto;
    return Math.min(max, Math.max(min, n));
  }

  horizonteValido(n: number | null | undefined): number {
    return Math.round(this.limitar(n, PlanDesinversionService.HORIZONTE_MIN, PlanDesinversionService.HORIZONTE_MAX, 30));
  }

  /** Año de la venta (años desde hoy) dentro de 1…horizonte. */
  anioVentaValido(anio: number | null | undefined, horizonte: number): number {
    const max = Math.max(1, Math.floor(horizonte));
    return Math.round(this.limitar(anio, 1, max, Math.min(10, max)));
  }

  cargar(anioActual: number = new Date().getFullYear()): EstadoPlanDesinversion {
    const base = this.estadoPorDefecto(anioActual);
    try {
      const raw = localStorage.getItem(this.LS_KEY);
      if (!raw) return base;
      const g = JSON.parse(raw);
      if (!g || typeof g !== 'object' || Array.isArray(g)) return base;

      const num = (v: unknown, def: number | null) =>
        v === null ? null : typeof v === 'number' && Number.isFinite(v) ? v : def;

      const asignaciones: Record<string, FaseLiquidez> = {};
      if (g.asignaciones && typeof g.asignaciones === 'object' && !Array.isArray(g.asignaciones)) {
        for (const [id, fase] of Object.entries(g.asignaciones)) {
          if (this.esFase(fase)) asignaciones[id] = fase;
        }
      }

      return {
        version: 1,
        asignaciones,
        retirada: num(g.retirada, base.retirada),
        periodicidad: g.periodicidad === 'anual' ? 'anual' : 'mensual',
        horizonte: this.horizonteValido(g.horizonte),
        rentabilidadCartera: num(g.rentabilidadCartera, base.rentabilidadCartera),
        rentabilidadColchon: num(g.rentabilidadColchon, base.rentabilidadColchon),
        inflacion: num(g.inflacion, base.inflacion),
        estrategia: g.estrategia === 'vender' ? 'vender' : 'mantener',
        anioVenta: num(g.anioVenta, base.anioVenta),
        costesSalida: num(g.costesSalida, base.costesSalida),
        rentaNeta: num(g.rentaNeta, base.rentaNeta),
        revalorizacion: num(g.revalorizacion, base.revalorizacion),
        amortizacionDeuda: num(g.amortizacionDeuda, base.amortizacionDeuda),
        valoresReales: typeof g.valoresReales === 'boolean' ? g.valoresReales : base.valoresReales
      };
    } catch {
      return base;
    }
  }

  guardar(estado: EstadoPlanDesinversion) {
    try {
      localStorage.setItem(this.LS_KEY, JSON.stringify(estado));
    } catch (e) {
      console.error('No se pudo guardar el plan de desinversión', e);
    }
  }

  // ------------------------------------------------------
  // Utilidades
  // ------------------------------------------------------

  /** Tasa mensual equivalente a una rentabilidad anual efectiva (%). */
  private tasaMensual(rentabilidadAnual: number): number {
    return Math.pow(1 + rentabilidadAnual / 100, 1 / 12) - 1;
  }

  private finito(n: number | undefined): number {
    return typeof n === 'number' && Number.isFinite(n) ? n : 0;
  }

  private normalizar(texto: string): string {
    return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  /** 7 → «7»; 1.54 → «1,5» (máx. 1 decimal, coma decimal). */
  private num(n: number): string {
    return (Math.round(n * 10) / 10).toString().replace('.', ',');
  }
}
