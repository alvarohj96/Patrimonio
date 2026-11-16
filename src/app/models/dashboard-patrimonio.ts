/**
 * Modelos de la vista «Patrimonio general» (dashboard).
 *
 * Son estructuras derivadas: se calculan a partir de los registros mensuales
 * (`PatrimonioService`) y de los objetivos (`ObjetivosService`) y no se persisten.
 * Todos los importes son patrimonio NETO (valor − deuda), en euros.
 */

export type RangoEvolucion = '6M' | '1A' | 'ALL';
export type TipoGraficoEvolucion = 'barras' | 'lineas';

/** Categoría con el color con el que se pinta en todos los gráficos del dashboard. */
export interface CategoriaDashboard {
  nombre: string;
  color: string;
}

/** Patrimonio neto de un mes. */
export interface PuntoMensual {
  /** Mes en formato `YYYY-MM`. */
  mes: string;
  total: number;
  /** Valor neto por nombre de categoría. */
  valores: Readonly<Record<string, number>>;
}

export interface SerieDashboard {
  categorias: readonly CategoriaDashboard[];
  /** Ordenados cronológicamente. */
  puntos: readonly PuntoMensual[];
}

export interface MovimientoCategoria {
  categoria: string;
  variacion: number;
  color: string;
}

export interface ResumenMes {
  mes: string;
  /** `null` si solo hay un mes registrado. */
  mesAnterior: string | null;
  total: number;
  variacion: number;
  /** `null` si no hay mes anterior o su total es 0. */
  variacionPct: number | null;
  mayorSubida: MovimientoCategoria | null;
  mayorBajada: MovimientoCategoria | null;
}

export interface FilaCategoria {
  nombre: string;
  color: string;
  valor: number;
  /** Peso sobre el patrimonio neto total (0-100). */
  porcentaje: number;
  variacion: number;
  /** `null` si no hay mes anterior o el valor anterior era 0. */
  variacionPct: number | null;
  /** Meta individual en euros; 0 = sin meta definida. */
  objetivo: number;
  /** % de la meta alcanzado (0-100); `null` si no hay meta. */
  progreso: number | null;
}

/** Subcategoría de una categoría en el último mes (solo las de valor neto positivo). */
export interface FilaSubcategoria {
  nombre: string;
  /** Tono derivado del color de su categoría. */
  color: string;
  valor: number;
  /** Peso sobre el total de su categoría (0-100). */
  porcentaje: number;
}

export type SubcategoriasPorCategoria = Readonly<Record<string, readonly FilaSubcategoria[]>>;

export interface ResumenInmuebles {
  bruto: number;
  deuda: number;
  equity: number;
  /** Deuda sobre valor bruto (0-100), «loan-to-value». */
  ltv: number;
}

export interface PuntoConsistencia {
  mes: string;
  variacion: number;
}

export interface ConsistenciaAhorro {
  puntos: readonly PuntoConsistencia[];
  /** Meses con variación mayor o igual que 0. */
  positivos: number;
}

export interface FilaComparacion {
  nombre: string;
  color: string;
  valorInicio: number;
  valorFin: number;
  /** Peso sobre el total de cada fecha (0-100). */
  pesoInicio: number;
  pesoFin: number;
  diferencia: number;
}

export interface ComparacionFechas {
  totalInicio: number;
  totalFin: number;
  diferencia: number;
  /** `null` si el total inicial es 0. */
  diferenciaPct: number | null;
  filas: readonly FilaComparacion[];
}

export type EstadoProyeccion = 'sin-objetivo' | 'alcanzado' | 'en-progreso' | 'lejano';

export interface ProyeccionObjetivo {
  estado: EstadoProyeccion;
  /** Meses hasta la meta; `null` si no se alcanza en el periodo calculado. */
  meses: number | null;
  /** Mes estimado (`YYYY-MM`); `null` si no se alcanza. */
  fecha: string | null;
}

export interface RetiroSostenible {
  capitalBase: number;
  anual: number;
  mensual: number;
  /** Retiro mensual / gasto mensual (%), sin tope; `null` si no hay gasto indicado. */
  cobertura: number | null;
}

/** Preferencias de la pantalla persistidas en localStorage. */
export interface PreferenciasDashboard {
  version: 1;
  /** Ahorro mensual editado en la tarjeta de objetivo; `null` = usar el sugerido. */
  ahorroMensual: number | null;
  tipoEvolucion: TipoGraficoEvolucion;
  rangoEvolucion: RangoEvolucion;
  /** Tasa de retirada segura (%). */
  tasaRetiro: number;
  gastoMensual: number | null;
  incluirInmuebles: boolean;
}
