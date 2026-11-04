/**
 * Modelos de la sección «Objetivos de inversión».
 *
 * Los objetivos se asocian SIEMPRE al identificador estable de la categoría
 * (`CategoriaPatrimonio.id`), nunca a su nombre.
 */

/** Categoría del patrimonio con su identificador estable. */
export interface CategoriaPatrimonio {
  id: string;
  nombre: string;
}

/** Configuración persistida de una categoría. */
export interface ConfigCategoriaInversion {
  categoriaId: string;
  /** Porcentaje objetivo (0-100, máximo 2 decimales). */
  porcentajeObjetivo: number;
  /** Si la categoría puede recibir nuevas aportaciones en el simulador. */
  admiteAportaciones: boolean;
  /** Importe mínimo (€) por operación; `null` = sin mínimo. */
  importeMinimo: number | null;
  /** Incremento mínimo (€): la aportación debe ser múltiplo de este valor; `null` = sin incremento. */
  incrementoMinimo: number | null;
}

export interface ObjetivosInversionConfig {
  version: 1;
  categorias: ConfigCategoriaInversion[];
}

export interface ResultadoValidacion {
  valida: boolean;
  errores: string[];
  /** Suma de los porcentajes objetivo (0-100). */
  sumaPorcentajes: number;
}

/** Datos de entrada de una categoría para los cálculos (ya cruzados categoría + valor + configuración). */
export interface EntradaCategoria {
  categoriaId: string;
  nombre: string;
  /** Valor neto actual (valor − deuda) en euros. */
  valorActual: number;
  porcentajeObjetivo: number;
  admiteAportaciones: boolean;
  importeMinimo: number | null;
  incrementoMinimo: number | null;
}

export type EstadoPonderacion = 'sobreponderada' | 'infraponderada' | 'equilibrada';

export interface FilaDistribucion {
  categoriaId: string;
  nombre: string;
  valorActual: number;
  porcentajeActual: number;
  porcentajeObjetivo: number;
  /** porcentajeActual − porcentajeObjetivo (puntos porcentuales). */
  desviacionPuntos: number;
  /** patrimonioTotal * porcentajeObjetivo / 100 */
  importeIdeal: number;
  /** valorActual − importeIdeal (positivo = sobra, negativo = falta). */
  diferencia: number;
  admiteAportaciones: boolean;
  estado: EstadoPonderacion;
}

export interface DistribucionActual {
  patrimonioTotal: number;
  filas: FilaDistribucion[];
  sumaObjetivos: number;
}

export interface FilaSimulacion {
  categoriaId: string;
  nombre: string;
  admiteAportaciones: boolean;
  valorActual: number;
  aportacion: number;
  valorProyectado: number;
  porcentajeProyectado: number;
  porcentajeObjetivo: number;
  /** porcentajeProyectado − porcentajeObjetivo (puntos porcentuales). */
  desviacionProyectada: number;
  estadoProyectado: EstadoPonderacion;
}

export interface ResultadoSimulacion {
  importe: number;
  asignado: number;
  noAsignado: number;
  patrimonioActual: number;
  patrimonioProyectado: number;
  filas: FilaSimulacion[];
  /** Explicación cuando no se asigna todo el importe o no se alcanza el objetivo; `null` si no procede. */
  explicacion: string | null;
  /** Avisos puntuales (p. ej. categorías sobreponderadas que reciben dinero por las restricciones). */
  avisos: string[];
  /** `true` si, tras la aportación, todas las desviaciones quedan dentro de la tolerancia. */
  alcanzaObjetivos: boolean;
}
