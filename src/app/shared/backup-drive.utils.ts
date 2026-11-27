import { CopiaPendiente, PeriodoBackup, UltimaCopia } from '../models/backup-drive';

const dos = (n: number) => String(n).padStart(2, '0');

/** `YYYY-MM` del mes natural (hora local) de la fecha. */
export function periodoDe(fecha: Date): PeriodoBackup {
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}`;
}

/** Copia mensual automática: `patrimonio-backup-2026-11.csv` (una por mes y carpeta). */
export function nombreArchivoMensual(periodo: PeriodoBackup): string {
  return `patrimonio-backup-${periodo}.csv`;
}

/** Copia manual: `patrimonio-backup-2026-11-26_1405.csv` (cada copia manual es un archivo nuevo). */
export function nombreArchivoManual(fecha: Date): string {
  return `patrimonio-backup-${periodoDe(fecha)}-${dos(fecha.getDate())}_${dos(fecha.getHours())}${dos(fecha.getMinutes())}.csv`;
}

/** Une los tramos de una ruta de Drive: `['Mi unidad', 'Finanzas']` → «Mi unidad / Finanzas». */
export function formatearRuta(tramos: readonly string[]): string {
  return tramos.filter(t => t.trim() !== '').join(' / ');
}

/**
 * ¿Toca hacer la copia mensual? Sí si no hay ninguna copia correcta, o si la última es de un mes anterior
 * al actual. Cualquier copia correcta del mes en curso (manual o automática) cuenta como la copia del mes.
 * Si el reloj estuviera atrasado (último periodo posterior al actual) no se repite la copia.
 */
export function necesitaCopiaMensual(ultima: Pick<UltimaCopia, 'lastBackupPeriod'> | null, ahora: Date): boolean {
  if (!ultima) return true;
  return ultima.lastBackupPeriod < periodoDe(ahora);
}

/** ¿Hay una copia que no llegó a subirse (por fallo de red/API/autorización)? */
export function hayCopiaPendiente(pendiente: CopiaPendiente | null): pendiente is CopiaPendiente {
  return pendiente !== null && pendiente.csv.length > 0;
}

/**
 * Cuerpo `multipart/related` de la subida a Drive (metadatos JSON + contenido CSV en UTF-8).
 * El CSV se incluye literal (sin tocar tildes, `;` ni saltos de línea).
 */
export function construirMultipart(
  metadatos: Record<string, unknown>, contenido: string, tipoMime: string, limite: string
): string {
  return [
    `--${limite}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadatos),
    `--${limite}`,
    `Content-Type: ${tipoMime}; charset=UTF-8`,
    '',
    contenido,
    `--${limite}--`,
    ''
  ].join('\r\n');
}
