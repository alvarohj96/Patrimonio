/**
 * Modelos de las copias de seguridad mensuales en Google Drive.
 * La copia es siempre el CSV actual de la aplicación (mismo formato que «Exportar CSV»).
 */

/** Año y mes natural con formato `YYYY-MM`. */
export type PeriodoBackup = string;

export type TipoCopia = 'automatica' | 'manual';

/** Carpeta de destino. `carpetaId = 'root'` es «Mi unidad». */
export interface ConfigBackupDrive {
  version: 1;
  /** Copia mensual automática (desactivada por defecto: subir datos financieros a un tercero debe ser una decisión del usuario) */
  automatica: boolean;
  carpetaId: string;
  /** Ruta legible para la UI, p. ej. «Mi unidad / Finanzas / Patrimonio» */
  carpetaRuta: string;
  /** El usuario ya autorizó Drive alguna vez: permite intentar renovar el permiso sin pantalla de consentimiento */
  conectadoAntes: boolean;
}

/** Última copia subida correctamente. */
export interface UltimaCopia {
  /** ISO 8601 */
  lastBackupAt: string;
  lastBackupPeriod: PeriodoBackup;
  driveFileId: string;
  driveFolderPath: string;
  fileName: string;
  status: 'ok';
  tipo: TipoCopia;
}

export type CodigoErrorBackup =
  | 'no-configurado'
  | 'sin-datos'
  | 'cancelado'
  | 'requiere-interaccion'
  | 'permiso-denegado'
  | 'token-caducado'
  | 'sin-conexion'
  | 'carpeta-no-disponible'
  | 'cuota'
  | 'api';

export interface UltimoError {
  at: string;
  codigo: CodigoErrorBackup;
  mensaje: string;
}

/** Copia que no se pudo subir: se conserva el CSV para reintentarlo sin perder los datos de ese momento. */
export interface CopiaPendiente {
  periodo: PeriodoBackup;
  nombreArchivo: string;
  csv: string;
  creadoEn: string;
  tipo: TipoCopia;
}

export type EstadoConexion = 'no-configurado' | 'desconectado' | 'conectado';

export interface ResultadoBackup {
  ok: boolean;
  copia?: UltimaCopia;
  error?: UltimoError;
  /** Avisos que no impiden la copia (p. ej. nombres con «;» que romperían la importación) */
  avisos: string[];
}
