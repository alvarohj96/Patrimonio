/**
 * Modelos del «Simulador de independencia financiera».
 */

export type EscenarioId = 'conservador' | 'moderado' | 'optimista' | 'personalizado';
export type Periodicidad = 'mensual' | 'anual';

export interface EscenarioPredefinido {
  id: Exclude<EscenarioId, 'personalizado'>;
  nombre: string;
  /** Rentabilidad anual efectiva (%) */
  rentabilidad: number;
  descripcion: string;
}

/** Parámetros ya saneados que consume el cálculo. */
export interface ParametrosProyeccion {
  /** Patrimonio de partida (€) */
  patrimonioInicial: number;
  /** Importe ahorrado por periodo (€) */
  aportacion: number;
  periodicidad: Periodicidad;
  /** Incremento anual de la aportación (%) */
  crecimientoAportacion: number;
  /** Rentabilidad anual efectiva esperada (%) */
  rentabilidad: number;
  /** Inflación anual (%) */
  inflacion: number;
  /** Gastos mensuales estimados, en euros de hoy */
  gastosMensuales: number;
  /** Tasa de retirada segura (%) */
  tasaRetirada: number;
  /** Años visibles de la proyección */
  horizonte: number;
}

/** Situación al final de cada año (el año 0 es el punto de partida). */
export interface FilaProyeccion {
  anio: number;
  /** Factor (1 + inflación)^año para pasar de euros futuros a euros de hoy */
  deflactor: number;
  /** Capital aportado acumulado (sin incluir el patrimonio inicial) */
  aportado: number;
  /** Rendimientos acumulados */
  rendimientos: number;
  /** Patrimonio total en euros del año correspondiente (nominal) */
  patrimonio: number;
  /** Capital necesario para la libertad financiera (nominal); `null` si no aplica */
  objetivoLibertad: number | null;
  /** Gastos anuales del año (nominal) */
  gastosAnuales: number;
  /** Rendimiento anual estimado del patrimonio (nominal) */
  rendimientoAnual: number;
  /** rendimientoAnual / gastosAnuales; `null` si no hay gastos */
  cobertura: number | null;
}

export type TipoHito = 'capital' | 'rendimientos' | 'libertad';

export interface Hito {
  tipo: TipoHito;
  /** Capital umbral (solo hitos de capital) */
  umbral: number | null;
  /** Años hasta alcanzarlo (0 = ya alcanzado); `null` = no se alcanza en el periodo calculado */
  anio: number | null;
  /** Patrimonio en ese momento (en el modo real/nominal elegido) */
  patrimonio: number | null;
  /** Capital objetivo (libertad) o gastos anuales (rendimientos) en ese momento */
  referencia: number | null;
}

export interface ResumenEscenario {
  patrimonioFinal: number;
  /** Capital aportado en total: patrimonio inicial + aportaciones acumuladas */
  aportado: number;
  rendimientos: number;
  /** Años hasta la libertad financiera; `null` = no se alcanza */
  anioLibertad: number | null;
}

/** Estado persistido de la pantalla (localStorage). */
export interface EstadoSimulador {
  version: 1;
  usarRegistrado: boolean;
  patrimonioManual: number | null;
  categoriasExcluidas: string[];
  aportacion: number | null;
  periodicidad: Periodicidad;
  crecimientoAportacion: number | null;
  escenario: EscenarioId;
  rentabilidadPersonalizada: number | null;
  inflacion: number | null;
  gastosMensuales: number | null;
  tasaRetirada: number | null;
  horizonte: number;
  valoresReales: boolean;
}
