import { Injectable, inject } from '@angular/core';
import {
  CategoriaDashboard,
  ComparacionFechas,
  ConsistenciaAhorro,
  FilaCategoria,
  MovimientoCategoria,
  ProyeccionObjetivo,
  PuntoMensual,
  RangoEvolucion,
  ResumenInmuebles,
  ResumenMes,
  RetiroSostenible,
  SerieDashboard
} from '../models/dashboard-patrimonio';
import { sumarMeses } from '../shared/formato';
import { ObjetivosSuggest } from './objetivos.model';
import { RegistroMensual } from './patrimonio.service';
import { SimuladorIndependenciaService } from './simulador-independencia.service';

/**
 * Un valor de subcategoría. Los registros migrados del formato antiguo pueden traer
 * el importe como número directo en lugar de `{ valor, deuda }`.
 */
type ValorSubcategoria = RegistroMensual['valores'][string][string] | number;
type Subcategorias = Readonly<Record<string, ValorSubcategoria>>;

/** Colores de las categorías, asignados por posición (la 1ª, 2ª, 3ª y 4ª coinciden con el prototipo). */
export const PALETA_CATEGORIAS = [
  '#4f46e5', '#14b8a6', '#0ea5e9', '#f59e0b', '#8b5cf6',
  '#ec4899', '#10b981', '#ef4444', '#84cc16', '#f97316'
];

const MES_VALIDO = /^\d{4}-\d{2}$/;

/**
 * Cálculo (puro) de todo lo que muestra el dashboard «Patrimonio general».
 *
 * Convierte los registros mensuales reales y los objetivos en estructuras listas para
 * pintar. No lee ni escribe nada: los datos llegan por parámetro.
 */
@Injectable({ providedIn: 'root' })
export class DashboardPatrimonioService {

  /** Rentabilidad anual supuesta en la proyección hacia el objetivo (%). */
  static readonly RENTABILIDAD_PROYECCION = 5;
  /** Meses máximos que se simulan (50 años). */
  static readonly MESES_MAXIMOS_PROYECCION = 600;

  private readonly independencia = inject(SimuladorIndependenciaService);

  // ------------------------------------------------------
  // Serie mensual
  // ------------------------------------------------------

  /**
   * Serie cronológica de patrimonio neto por categoría. Incluye las categorías que
   * aparecen en cualquier registro (también las ya eliminadas del catálogo, cuyo
   * histórico se conserva) y respeta el orden `orden` para las que existan.
   */
  construirSerie(registros: readonly RegistroMensual[], orden: readonly string[] = []): SerieDashboard {
    const porMes = new Map<string, RegistroMensual>();
    for (const r of registros) {
      if (MES_VALIDO.test(r.mes)) porMes.set(r.mes, r);
    }
    const ordenados = [...porMes.values()].sort((a, b) => a.mes.localeCompare(b.mes));

    const presentes = new Set<string>();
    for (const r of ordenados) {
      Object.keys(r.valores ?? {}).forEach(nombre => presentes.add(nombre));
    }
    const nombres = [
      ...orden.filter(nombre => presentes.has(nombre)),
      ...[...presentes].filter(nombre => !orden.includes(nombre))
    ];

    const categorias: CategoriaDashboard[] = nombres.map((nombre, i) => ({
      nombre,
      color: PALETA_CATEGORIAS[i % PALETA_CATEGORIAS.length]
    }));

    const puntos: PuntoMensual[] = ordenados.map(r => {
      const valores: Record<string, number> = {};
      let total = 0;
      for (const { nombre } of categorias) {
        const neto = this.netoCategoria(r.valores?.[nombre]);
        valores[nombre] = neto;
        total += neto;
      }
      return { mes: r.mes, total, valores };
    });

    return { categorias, puntos };
  }

  /** Valor neto (valor − deuda) de todas las subcategorías de una categoría. */
  netoCategoria(subcategorias: Subcategorias | undefined): number {
    if (!subcategorias) return 0;
    return Object.values(subcategorias).reduce((suma: number, sub) => {
      const { valor, deuda } = this.desglosar(sub);
      return suma + valor - deuda;
    }, 0);
  }

  // ------------------------------------------------------
  // Fila 1
  // ------------------------------------------------------

  /** Patrimonio del último mes, variación frente al anterior y mayores movimientos. */
  resumenMes(serie: SerieDashboard): ResumenMes | null {
    const { puntos, categorias } = serie;
    const actual = puntos.at(-1);
    if (!actual) return null;

    const anterior = puntos.length > 1 ? puntos.at(-2)! : null;
    const variacion = anterior ? actual.total - anterior.total : 0;
    const variacionPct = anterior && anterior.total !== 0 ? (variacion / Math.abs(anterior.total)) * 100 : null;

    let mayorSubida: MovimientoCategoria | null = null;
    let mayorBajada: MovimientoCategoria | null = null;

    if (anterior) {
      const movimientos: MovimientoCategoria[] = categorias
        .map(c => ({ categoria: c.nombre, color: c.color, variacion: actual.valores[c.nombre] - anterior.valores[c.nombre] }))
        .filter(m => m.variacion !== 0)
        .sort((a, b) => b.variacion - a.variacion);

      const primero = movimientos[0];
      const ultimo = movimientos[movimientos.length - 1];
      if (primero && primero.variacion > 0) mayorSubida = primero;
      // Una misma categoría no puede ser a la vez subida (> 0) y bajada (< 0)
      if (ultimo && ultimo.variacion < 0) mayorBajada = ultimo;
    }

    return {
      mes: actual.mes,
      mesAnterior: anterior?.mes ?? null,
      total: actual.total,
      variacion,
      variacionPct,
      mayorSubida,
      mayorBajada
    };
  }

  /** Valor bruto, deuda y equity de las categorías inmobiliarias en el último mes registrado. */
  resumenInmuebles(registros: readonly RegistroMensual[]): ResumenInmuebles | null {
    const validos = registros.filter(r => MES_VALIDO.test(r.mes));
    if (!validos.length) return null;
    const ultimo = validos.reduce((a, b) => (b.mes.localeCompare(a.mes) >= 0 ? b : a));

    let bruto = 0;
    let deuda = 0;
    for (const [nombre, subcategorias] of Object.entries(ultimo.valores ?? {})) {
      if (!this.esCategoriaInmobiliaria(nombre)) continue;
      const subs: Subcategorias = subcategorias ?? {};
      for (const sub of Object.values(subs)) {
        const d = this.desglosar(sub);
        bruto += d.valor;
        deuda += d.deuda;
      }
    }

    if (bruto === 0 && deuda === 0) return null;
    return { bruto, deuda, equity: bruto - deuda, ltv: bruto > 0 ? (deuda / bruto) * 100 : 0 };
  }

  /**
   * Ahorro mensual de referencia: variación media mensual del patrimonio en los últimos
   * 12 meses (incluye revalorizaciones). `null` si no es positiva o no hay histórico.
   */
  ahorroMensualSugerido(serie: SerieDashboard): number | null {
    const media = this.independencia.variacionMediaMensual(serie.puntos.map(p => ({ mes: p.mes, total: p.total })));
    return media && media.importe > 0 ? Math.round(media.importe) : null;
  }

  /**
   * Meses hasta alcanzar el objetivo capitalizando `RENTABILIDAD_PROYECCION` anual y
   * sumando `ahorroMensual` cada mes. `mesBase` es el último mes registrado (`YYYY-MM`).
   */
  proyectarObjetivo(p: { actual: number; objetivo: number; ahorroMensual: number; mesBase: string }): ProyeccionObjetivo {
    if (!(p.objetivo > 0)) return { estado: 'sin-objetivo', meses: null, fecha: null };
    if (p.actual >= p.objetivo) return { estado: 'alcanzado', meses: 0, fecha: p.mesBase };

    const ahorro = Number.isFinite(p.ahorroMensual) ? Math.max(0, p.ahorroMensual) : 0;
    const tasaMensual = DashboardPatrimonioService.RENTABILIDAD_PROYECCION / 100 / 12;
    let saldo = p.actual;
    let meses = 0;

    while (saldo < p.objetivo && meses < DashboardPatrimonioService.MESES_MAXIMOS_PROYECCION) {
      saldo = saldo * (1 + tasaMensual) + ahorro;
      meses++;
    }

    if (saldo < p.objetivo) return { estado: 'lejano', meses: null, fecha: null };
    return { estado: 'en-progreso', meses, fecha: sumarMeses(p.mesBase, meses) };
  }

  // ------------------------------------------------------
  // Fila 2
  // ------------------------------------------------------

  /** Una fila por categoría con valor, peso, variación mensual y progreso hacia su meta. */
  filasCategorias(serie: SerieDashboard, objetivos: ObjetivosSuggest): FilaCategoria[] {
    const actual = serie.puntos.at(-1);
    if (!actual) return [];
    const anterior = serie.puntos.length > 1 ? serie.puntos.at(-2)! : null;

    return serie.categorias.map(c => {
      const valor = actual.valores[c.nombre];
      const previo = anterior ? anterior.valores[c.nombre] : null;
      const variacion = previo === null ? 0 : valor - previo;
      const objetivo = objetivos.categorias.find(o => o.categoria === c.nombre)?.objetivo ?? 0;

      return {
        nombre: c.nombre,
        color: c.color,
        valor,
        porcentaje: actual.total > 0 ? (valor / actual.total) * 100 : 0,
        variacion,
        variacionPct: previo !== null && previo !== 0 ? (variacion / Math.abs(previo)) * 100 : null,
        objetivo,
        progreso: objetivo > 0 ? this.limitarPorcentaje((valor / objetivo) * 100) : null
      };
    });
  }

  // ------------------------------------------------------
  // Filas 3 y 4
  // ------------------------------------------------------

  /** Últimos 6 / 12 meses registrados o todos. */
  recortar(serie: SerieDashboard, rango: RangoEvolucion): readonly PuntoMensual[] {
    const cantidad = rango === '6M' ? 6 : rango === '1A' ? 12 : serie.puntos.length;
    return cantidad > 0 ? serie.puntos.slice(-cantidad) : [];
  }

  /** Variación neta mensual de los últimos `maxMeses` meses (hacen falta `maxMeses + 1` registros). */
  consistencia(serie: SerieDashboard, maxMeses = 12): ConsistenciaAhorro {
    const ventana = serie.puntos.slice(-(maxMeses + 1));
    const puntos = ventana.slice(1).map((p, i) => ({ mes: p.mes, variacion: p.total - ventana[i].total }));
    return { puntos, positivos: puntos.filter(p => p.variacion >= 0).length };
  }

  /** Composición y valor de cada categoría en dos meses; `null` si alguno no existe. */
  comparar(serie: SerieDashboard, mesInicio: string, mesFin: string): ComparacionFechas | null {
    const inicio = serie.puntos.find(p => p.mes === mesInicio);
    const fin = serie.puntos.find(p => p.mes === mesFin);
    if (!inicio || !fin) return null;

    const peso = (valor: number, total: number) => (total > 0 ? (valor / total) * 100 : 0);
    const diferencia = fin.total - inicio.total;

    return {
      totalInicio: inicio.total,
      totalFin: fin.total,
      diferencia,
      diferenciaPct: inicio.total !== 0 ? (diferencia / Math.abs(inicio.total)) * 100 : null,
      filas: serie.categorias.map(c => ({
        nombre: c.nombre,
        color: c.color,
        valorInicio: inicio.valores[c.nombre],
        valorFin: fin.valores[c.nombre],
        pesoInicio: peso(inicio.valores[c.nombre], inicio.total),
        pesoFin: peso(fin.valores[c.nombre], fin.total),
        diferencia: fin.valores[c.nombre] - inicio.valores[c.nombre]
      }))
    };
  }

  // ------------------------------------------------------
  // Fila 5
  // ------------------------------------------------------

  /** Patrimonio neto de las categorías inmobiliarias en el último mes. */
  patrimonioInmobiliario(serie: SerieDashboard): number {
    const actual = serie.puntos.at(-1);
    if (!actual) return 0;
    return serie.categorias
      .filter(c => this.esCategoriaInmobiliaria(c.nombre))
      .reduce((suma, c) => suma + actual.valores[c.nombre], 0);
  }

  /** Renta perpetua que genera el capital con la tasa de retirada indicada y su cobertura de gastos. */
  retiroSostenible(p: { capitalBase: number; tasaRetiro: number; gastoMensual: number | null }): RetiroSostenible {
    const capital = Math.max(0, Number.isFinite(p.capitalBase) ? p.capitalBase : 0);
    const anual = capital * (p.tasaRetiro / 100);
    const mensual = anual / 12;
    const cobertura = p.gastoMensual !== null && p.gastoMensual > 0 ? (mensual / p.gastoMensual) * 100 : null;
    return { capitalBase: capital, anual, mensual, cobertura };
  }

  // ------------------------------------------------------
  // Utilidades
  // ------------------------------------------------------

  /** «Inmuebles», «Inmueble en alquiler»… (sin distinguir mayúsculas ni tildes). */
  esCategoriaInmobiliaria(nombre: string): boolean {
    return nombre
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .includes('inmueble');
  }

  private desglosar(sub: ValorSubcategoria | null | undefined): { valor: number; deuda: number } {
    if (sub === null || sub === undefined) return { valor: 0, deuda: 0 };
    if (typeof sub === 'number') return { valor: this.finito(sub), deuda: 0 };
    return { valor: this.finito(sub.valor), deuda: this.finito(sub.deuda) };
  }

  private finito(n: number | undefined): number {
    return typeof n === 'number' && Number.isFinite(n) ? n : 0;
  }

  private limitarPorcentaje(n: number): number {
    return Math.max(0, Math.min(100, n));
  }
}
