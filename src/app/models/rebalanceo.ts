/**
 * Modelos de la calculadora de rebalanceo de «Objetivos de inversión».
 * Los importes se expresan en euros (los cálculos internos van en céntimos enteros).
 */

import { VehiculoInversion } from './objetivos-inversion';

/**
 * - `aportaciones`: solo capital nuevo, sin vender (la lógica del simulador original).
 * - `venta`: sin aportar; se vende/traspasa lo sobreponderado para comprar lo infraponderado.
 * - `mixto`: primero se invierte la aportación y solo se vende lo mínimo imprescindible.
 */
export type ModoRebalanceo = 'aportaciones' | 'venta' | 'mixto';

export type AccionRebalanceo = 'aportar' | 'comprar' | 'vender' | 'traspasar' | 'mantener';

/**
 * Efecto de una salida:
 * - `sin-efecto`: liquidez (no genera ganancia patrimonial).
 * - `traspaso`: fondo de inversión que se traspasa a otro fondo (diferimiento fiscal si cumple los requisitos).
 * - `tributable`: venta/reembolso con posible ganancia o pérdida patrimonial.
 */
export type TratamientoSalida = 'sin-efecto' | 'traspaso' | 'tributable';

export interface OpcionesRebalanceo {
  modo: ModoRebalanceo;
  /** Capital nuevo (€). Se ignora en el modo `venta`. */
  aportacion: number;
  /** Los movimientos inferiores a este importe (€) se descartan; 0 = sin umbral. */
  umbralMinimo: number;
}

export interface FilaRebalanceo {
  categoriaId: string;
  nombre: string;
  vehiculo: VehiculoInversion;
  valorActual: number;
  porcentajeActual: number;
  porcentajeObjetivo: number;
  /** porcentajeActual − porcentajeObjetivo (puntos porcentuales) */
  desviacionPuntos: number;
  /** valorActual − (patrimonio actual × objetivo): positivo si sobra, negativo si falta */
  desviacionImporte: number;
  /** Movimiento con signo: positivo = entra dinero (compra/aportación), negativo = sale (venta/traspaso) */
  movimiento: number;
  accion: AccionRebalanceo;
  /** Solo si hay salida */
  tratamiento: TratamientoSalida | null;
  /** valorActual + movimiento */
  valorObjetivo: number;
  porcentajeFinal: number;
  /** porcentajeFinal − porcentajeObjetivo (puntos porcentuales) */
  desviacionFinalPuntos: number;
  puedeComprar: boolean;
  puedeVender: boolean;
}

export interface ResumenFiscal {
  /** Salidas de fondos que pueden traspasarse a otros fondos (hasta lo que entra en fondos) */
  traspasable: number;
  /** Salidas que son venta/reembolso con posible ganancia o pérdida patrimonial */
  tributable: number;
  /** Salidas de liquidez (sin efecto fiscal) */
  sinEfecto: number;
}

export interface ResultadoRebalanceo {
  modo: ModoRebalanceo;
  patrimonioActual: number;
  patrimonioFinal: number;
  /** Cantidad introducida (0 en el modo `venta`) */
  aportacion: number;
  aportacionUsada: number;
  aportacionNoAsignada: number;
  /** Suma de los movimientos positivos */
  totalEntradas: number;
  /** Suma de los movimientos negativos, en positivo */
  totalSalidas: number;
  filas: FilaRebalanceo[];
  fiscal: ResumenFiscal;
  /** totalEntradas = totalSalidas + aportacionUsada (exacto, en céntimos) */
  cuadra: boolean;
  /** `true` si, tras el plan, todas las desviaciones quedan dentro de la tolerancia */
  alcanzaObjetivos: boolean;
  explicacion: string | null;
  avisos: string[];
}
