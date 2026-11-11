import { Injectable } from '@angular/core';
import {
  EscenarioPredefinido,
  EstadoSimulador,
  FilaProyeccion,
  Hito,
  ParametrosProyeccion,
  ResumenEscenario
} from '../models/independencia-financiera';

/**
 * Cálculo (puro) de las proyecciones del simulador de independencia financiera y
 * persistencia (localStorage, como el resto de servicios) de los parámetros elegidos.
 *
 * Modelo: capitalización mensual con la rentabilidad anual EFECTIVA indicada
 * (i_mensual = (1 + r)^(1/12) − 1) y aportaciones al final de cada mes. Si el ahorro se
 * indica en euros al año se reparte a partes iguales entre los 12 meses.
 */
@Injectable({ providedIn: 'root' })
export class SimuladorIndependenciaService {

  /** Años máximos que se calculan (para localizar hitos más allá del horizonte). */
  static readonly ANIOS_CALCULO = 60;
  static readonly HORIZONTE_MIN = 1;
  static readonly HORIZONTE_MAX = 50;

  /** Hitos de capital candidatos (se muestran los que superan el patrimonio actual). */
  static readonly UMBRALES_CAPITAL = [50_000, 100_000, 250_000, 500_000, 1_000_000, 2_000_000];
  static readonly MAX_HITOS_CAPITAL = 4;

  readonly escenarios: EscenarioPredefinido[] = [
    { id: 'conservador', nombre: 'Conservador', rentabilidad: 3, descripcion: 'Perfil prudente: renta fija y liquidez' },
    { id: 'moderado', nombre: 'Moderado', rentabilidad: 5, descripcion: 'Cartera diversificada' },
    { id: 'optimista', nombre: 'Optimista', rentabilidad: 7, descripcion: 'Mayor peso en renta variable' }
  ];

  private readonly LS_KEY = 'simulador_independencia';

  // ------------------------------------------------------
  // Proyección
  // ------------------------------------------------------

  /** Proyección año a año (fila 0 = hoy) durante `anios` años. */
  proyectar(p: ParametrosProyeccion, anios: number = SimuladorIndependenciaService.ANIOS_CALCULO): FilaProyeccion[] {
    const n = Math.max(0, Math.floor(anios));
    const iMensual = Math.pow(1 + p.rentabilidad / 100, 1 / 12) - 1;
    const aportacionMensualBase = p.periodicidad === 'anual' ? p.aportacion / 12 : p.aportacion;
    const gastosAnualesHoy = p.gastosMensuales * 12;
    const tasa = p.tasaRetirada / 100;

    const fila = (anio: number, saldo: number, aportado: number): FilaProyeccion => {
      const deflactor = Math.pow(1 + p.inflacion / 100, anio);
      const gastosAnuales = gastosAnualesHoy * deflactor;
      const rendimientoAnual = Math.max(0, saldo * (p.rentabilidad / 100));
      return {
        anio,
        deflactor,
        aportado,
        rendimientos: saldo - p.patrimonioInicial - aportado,
        patrimonio: saldo,
        objetivoLibertad: tasa > 0 && gastosAnuales > 0 ? gastosAnuales / tasa : null,
        gastosAnuales,
        rendimientoAnual,
        cobertura: gastosAnuales > 0 ? rendimientoAnual / gastosAnuales : null
      };
    };

    const filas: FilaProyeccion[] = [fila(0, p.patrimonioInicial, 0)];
    let saldo = p.patrimonioInicial;
    let aportado = 0;

    for (let anio = 1; anio <= n; anio++) {
      const aportacionMes = aportacionMensualBase * Math.pow(1 + p.crecimientoAportacion / 100, anio - 1);
      for (let mes = 0; mes < 12; mes++) {
        saldo = saldo * (1 + iMensual) + aportacionMes;
        aportado += aportacionMes;
      }
      filas.push(fila(anio, saldo, aportado));
    }
    return filas;
  }

  /** Pasa un importe nominal de la fila a euros de hoy si `real` es `true`. */
  enModo(valor: number, fila: FilaProyeccion, real: boolean): number {
    return real ? valor / fila.deflactor : valor;
  }

  /** Primer año en que el patrimonio alcanza la libertad financiera (regla de retirada). */
  anioLibertad(filas: FilaProyeccion[]): number | null {
    const f = filas.find(x => x.objetivoLibertad !== null && x.patrimonio >= x.objetivoLibertad);
    return f ? f.anio : null;
  }

  /** Resumen de un escenario en el horizonte indicado. */
  resumir(filas: FilaProyeccion[], horizonte: number, real: boolean): ResumenEscenario {
    const f = filas[Math.min(horizonte, filas.length - 1)];
    return {
      patrimonioFinal: this.enModo(f.patrimonio, f, real),
      aportado: this.enModo(f.aportado + filas[0].patrimonio, f, real),
      rendimientos: this.enModo(f.rendimientos, f, real),
      anioLibertad: this.anioLibertad(filas)
    };
  }

  /** Hitos clave ordenados cronológicamente (los no alcanzables, al final). */
  hitos(filas: FilaProyeccion[], real: boolean): Hito[] {
    const valor = (f: FilaProyeccion) => this.enModo(f.patrimonio, f, real);
    const inicial = valor(filas[0]);
    const hitos: Hito[] = [];

    // Hitos de capital
    for (const umbral of SimuladorIndependenciaService.UMBRALES_CAPITAL) {
      if (umbral <= inicial) continue;
      const f = filas.find(x => valor(x) >= umbral);
      if (!f) continue;
      hitos.push({ tipo: 'capital', umbral, anio: f.anio, patrimonio: valor(f), referencia: null });
      if (hitos.length >= SimuladorIndependenciaService.MAX_HITOS_CAPITAL) break;
    }

    // Hitos de independencia (solo si hay gastos definidos)
    if (filas[0].gastosAnuales > 0) {
      const fr = filas.find(x => x.cobertura !== null && x.cobertura >= 1);
      hitos.push({
        tipo: 'rendimientos',
        umbral: null,
        anio: fr ? fr.anio : null,
        patrimonio: fr ? valor(fr) : null,
        referencia: fr ? this.enModo(fr.gastosAnuales, fr, real) : null
      });

      if (filas[0].objetivoLibertad !== null) {
        const fl = filas.find(x => x.objetivoLibertad !== null && x.patrimonio >= x.objetivoLibertad);
        hitos.push({
          tipo: 'libertad',
          umbral: null,
          anio: fl ? fl.anio : null,
          patrimonio: fl ? valor(fl) : null,
          referencia: fl ? this.enModo(fl.objetivoLibertad!, fl, real) : null
        });
      }
    }

    return hitos.sort((a, b) => (a.anio ?? Infinity) - (b.anio ?? Infinity));
  }

  /**
   * Ahorro mensual implícito en el histórico: variación media mensual del patrimonio en
   * los últimos `maxMeses` meses (incluye revalorizaciones, no solo aportaciones).
   */
  variacionMediaMensual(
    totales: { mes: string; total: number }[],
    maxMeses = 12
  ): { importe: number; meses: number } | null {
    const validos = totales
      .filter(t => /^\d{4}-\d{2}$/.test(t.mes) && Number.isFinite(t.total))
      .sort((a, b) => a.mes.localeCompare(b.mes));
    if (validos.length < 2) return null;

    const indice = (mes: string) => Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7));
    const ultimo = validos[validos.length - 1];
    const primero = validos.find(t => indice(ultimo.mes) - indice(t.mes) <= maxMeses)!;
    const meses = indice(ultimo.mes) - indice(primero.mes);
    if (meses <= 0) return null;

    return { importe: (ultimo.total - primero.total) / meses, meses };
  }

  // ------------------------------------------------------
  // Saneamiento y persistencia
  // ------------------------------------------------------

  estadoPorDefecto(): EstadoSimulador {
    return {
      version: 1,
      usarRegistrado: true,
      patrimonioManual: null,
      categoriasExcluidas: [],
      aportacion: 500,
      periodicidad: 'mensual',
      crecimientoAportacion: 0,
      escenario: 'moderado',
      rentabilidadPersonalizada: 6,
      inflacion: 2,
      gastosMensuales: 2000,
      tasaRetirada: 4,
      horizonte: 20,
      valoresReales: true
    };
  }

  /** Limita `n` al rango dado; los valores no numéricos o `null` valen `porDefecto`. */
  limitar(n: number | null | undefined, min: number, max: number, porDefecto = 0): number {
    if (n === null || n === undefined || !Number.isFinite(n)) return porDefecto;
    return Math.min(max, Math.max(min, n));
  }

  horizonteValido(n: number | null | undefined): number {
    return Math.round(this.limitar(n, SimuladorIndependenciaService.HORIZONTE_MIN, SimuladorIndependenciaService.HORIZONTE_MAX, 20));
  }

  cargar(): EstadoSimulador {
    const base = this.estadoPorDefecto();
    try {
      const raw = localStorage.getItem(this.LS_KEY);
      if (!raw) return base;
      const g = JSON.parse(raw);
      if (!g || typeof g !== 'object' || Array.isArray(g)) return base;

      const num = (v: unknown, def: number | null) =>
        v === null ? null : typeof v === 'number' && Number.isFinite(v) ? v : def;

      return {
        version: 1,
        usarRegistrado: typeof g.usarRegistrado === 'boolean' ? g.usarRegistrado : base.usarRegistrado,
        patrimonioManual: num(g.patrimonioManual, base.patrimonioManual),
        categoriasExcluidas: Array.isArray(g.categoriasExcluidas)
          ? g.categoriasExcluidas.filter((x: unknown) => typeof x === 'string')
          : [],
        aportacion: num(g.aportacion, base.aportacion),
        periodicidad: g.periodicidad === 'anual' ? 'anual' : 'mensual',
        crecimientoAportacion: num(g.crecimientoAportacion, base.crecimientoAportacion),
        escenario: ['conservador', 'moderado', 'optimista', 'personalizado'].includes(g.escenario) ? g.escenario : base.escenario,
        rentabilidadPersonalizada: num(g.rentabilidadPersonalizada, base.rentabilidadPersonalizada),
        inflacion: num(g.inflacion, base.inflacion),
        gastosMensuales: num(g.gastosMensuales, base.gastosMensuales),
        tasaRetirada: num(g.tasaRetirada, base.tasaRetirada),
        horizonte: this.horizonteValido(g.horizonte),
        valoresReales: typeof g.valoresReales === 'boolean' ? g.valoresReales : base.valoresReales
      };
    } catch {
      return base;
    }
  }

  guardar(estado: EstadoSimulador) {
    try {
      localStorage.setItem(this.LS_KEY, JSON.stringify(estado));
    } catch (e) {
      console.error('No se pudo guardar el simulador de independencia financiera', e);
    }
  }
}
