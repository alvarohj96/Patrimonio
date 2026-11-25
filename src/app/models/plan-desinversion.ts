/**
 * Modelos del «Plan de desinversión».
 *
 * Idea clave: no todo el patrimonio se puede consumir poco a poco. El colchón de liquidez
 * y los activos líquidos admiten retiradas fraccionadas; los inmuebles (o activos ilíquidos)
 * son indivisibles: se mantienen enteros o se venden en bloque en un año concreto.
 */

import { Periodicidad } from './independencia-financiera';

/** Nivel de liquidez de una categoría (orden de la cascada de retirada). */
export type FaseLiquidez = 'colchon' | 'liquidos' | 'indivisibles';

export type EstrategiaInmueble = 'mantener' | 'vender';
export type VistaGrafico = 'comparar' | 'plan';

/** Categoría del patrimonio ya clasificada en una fase de liquidez. */
export interface CategoriaClasificada {
  id: string;
  nombre: string;
  /** Fase aplicada (la elegida por el usuario o, si no hay elección, la sugerida). */
  fase: FaseLiquidez;
  faseSugerida: FaseLiquidez;
  /** `true` si el usuario la ha movido a una fase distinta de la sugerida. */
  personalizada: boolean;
  /** Último mes registrado */
  valorBruto: number;
  deuda: number;
  valorNeto: number;
}

/** Patrimonio de partida repartido por fases. */
export interface SituacionInicial {
  /** Fase 1 · neto de deudas */
  colchon: number;
  /** Fase 2 · neto de deudas */
  liquidos: number;
  /** Fase 3 · valor bruto (sin descontar la deuda asociada) */
  brutoIndivisible: number;
  /** Fase 3 · deuda asociada (hipotecas, etc.) */
  deudaIndivisible: number;
  /** Fase 3 · bruto − deuda */
  netoIndivisible: number;
  /** colchon + liquidos + netoIndivisible */
  total: number;
}

/** Parámetros ya saneados que consume el cálculo. */
export interface ParametrosPlan {
  colchonInicial: number;
  carteraInicial: number;
  brutoIndivisible: number;
  deudaIndivisible: number;
  /** Retirada mensual en euros de hoy (se indexa con la inflación) */
  retiradaMensual: number;
  /** Años del plan (5-35) */
  horizonte: number;
  /** Rentabilidad anual neta de la cartera de activos líquidos fraccionables (%) */
  rentabilidadCartera: number;
  /** Rentabilidad anual neta del colchón de liquidez (%) */
  rentabilidadColchon: number;
  /** Inflación anual (%): indexa retiradas y renta; se usa también para pasar a euros de hoy */
  inflacion: number;
  /** Renta neta mensual del inmueble en euros de hoy (alquiler − gastos − impuestos) */
  rentaNetaMensual: number;
  /** Revalorización anual del bien indivisible (%) */
  revalorizacion: number;
  /** Deuda del bien indivisible amortizada cada año (€) */
  amortizacionAnualDeuda: number;
  /** Gastos e impuestos de salida sobre el valor de venta (%) */
  costesSalida: number;
  /** Año de la venta, en años desde hoy (1…horizonte); solo aplica a la estrategia «vender» */
  anioVenta: number;
}

export interface DetalleVenta {
  /** Año de la venta, en años desde hoy */
  anio: number;
  bruto: number;
  costes: number;
  deuda: number;
  /** bruto − costes − deuda: liquidez que entra de golpe (puede ser negativa) */
  neto: number;
}

/** Situación al final de cada año (el año 0 es el punto de partida). */
export interface FilaPlan {
  anio: number;
  /** (1 + inflación)^año: pasa euros futuros a euros de hoy */
  deflactor: number;
  colchon: number;
  cartera: number;
  /** colchon + cartera */
  liquido: number;
  /** Patrimonio neto del bien indivisible (0 una vez vendido) */
  inmuebleNeto: number;
  /** liquido + inmuebleNeto */
  total: number;
  /** Retiradas cubiertas con la liquidez durante el año (nominal) */
  deColchon: number;
  deCartera: number;
  /** Renta neta cobrada durante el año (nominal) */
  rentaCobrada: number;
  /** Necesidad de retirada que NO se pudo cubrir durante el año (nominal) */
  deficit: number;
}

export interface TrayectoriaPlan {
  estrategia: EstrategiaInmueble;
  filas: FilaPlan[];
  /** `null` si no hay venta en este plan */
  venta: DetalleVenta | null;
  /** Primer año (desde hoy) con retiradas sin cubrir; `null` = el plan cubre todo el horizonte */
  anioDeficit: number | null;
  /** Mes (desde hoy, 1 = primero) en que se agota por primera vez el colchón; `null` = no se agota */
  colchonAgotadoMes: number | null;
  /** Mes en que empieza a venderse cartera para cubrir retiradas; `null` = nunca */
  carteraInicioMes: number | null;
  /** Mes en que se agota por primera vez la cartera; `null` = no se agota */
  carteraAgotadaMes: number | null;
  liquidoFinal: number;
  totalFinal: number;
}

export type NivelAlerta = 'critica' | 'aviso' | 'info' | 'ok';

export interface AlertaPlan {
  id: string;
  nivel: NivelAlerta;
  titulo: string;
  texto: string;
}

/** Estado persistido de la pantalla (localStorage). */
export interface EstadoPlanDesinversion {
  version: 1;
  /** Fase elegida por el usuario, por id de categoría (solo las que difieren de la sugerida) */
  asignaciones: Record<string, FaseLiquidez>;
  retirada: number | null;
  periodicidad: Periodicidad;
  horizonte: number;
  rentabilidadCartera: number | null;
  rentabilidadColchon: number | null;
  inflacion: number | null;
  estrategia: EstrategiaInmueble;
  /** Año natural de la venta */
  anioVenta: number | null;
  costesSalida: number | null;
  /** Renta neta del inmueble, en la periodicidad elegida */
  rentaNeta: number | null;
  revalorizacion: number | null;
  amortizacionDeuda: number | null;
  valoresReales: boolean;
}
