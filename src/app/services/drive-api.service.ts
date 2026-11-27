import { Injectable } from '@angular/core';
import { ErrorBackup } from '../shared/error-backup';
import { construirMultipart, formatearRuta } from '../shared/backup-drive.utils';
import { MIME_CSV } from '../shared/csv-patrimonio';

const API = 'https://www.googleapis.com/drive/v3';
const API_SUBIDA = 'https://www.googleapis.com/upload/drive/v3';
export const MIME_CARPETA = 'application/vnd.google-apps.folder';
const MAX_NIVELES_RUTA = 10;

export interface ArchivoDrive {
  id: string;
  name: string;
}

interface CarpetaDrive extends ArchivoDrive {
  parents?: string[];
}

export interface SubidaCsv {
  nombre: string;
  contenido: string;
  carpetaId: string;
  /** Si ya existe un archivo con ese nombre en la carpeta (creado por esta app), se sobrescribe en vez de duplicarlo */
  reemplazarSiExiste: boolean;
}

/**
 * Cliente mínimo de Google Drive v3 (fetch, sin dependencias). Todas las llamadas reciben el token:
 * este servicio no guarda nada. Con el scope `drive.file` solo ve lo que la app creó o el usuario eligió.
 */
@Injectable({ providedIn: 'root' })
export class DriveApiService {

  /** Sube el CSV como archivo `text/csv` (UTF-8, tal cual, sin BOM). */
  async subirCsv(token: string, subida: SubidaCsv): Promise<ArchivoDrive> {
    if (subida.reemplazarSiExiste) {
      const existente = await this.buscarArchivo(token, subida.nombre, subida.carpetaId);
      if (existente) {
        try {
          return await this.subirMultipart(token, `${API_SUBIDA}/files/${encodeURIComponent(existente.id)}`, 'PATCH',
            { name: subida.nombre, mimeType: MIME_CSV }, subida.contenido);
        } catch (e) {
          // El archivo se borró o dejó de ser accesible entre la búsqueda y la subida: se crea de nuevo
          if (!(e instanceof ErrorBackup) || e.codigo !== 'carpeta-no-disponible') throw e;
        }
      }
    }

    return this.subirMultipart(token, `${API_SUBIDA}/files`, 'POST',
      { name: subida.nombre, mimeType: MIME_CSV, parents: [subida.carpetaId] }, subida.contenido);
  }

  async buscarArchivo(token: string, nombre: string, carpetaId: string): Promise<ArchivoDrive | null> {
    const escapar = (t: string) => t.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const q = `name = '${escapar(nombre)}' and '${escapar(carpetaId)}' in parents and trashed = false`;
    const params = new URLSearchParams({
      q, fields: 'files(id,name)', pageSize: '1', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true'
    });
    const r = await this.solicitar<{ files?: ArchivoDrive[] }>(token, `${API}/files?${params}`);
    return r.files?.[0] ?? null;
  }

  async crearCarpeta(token: string, nombre: string, padreId: string): Promise<ArchivoDrive> {
    return this.solicitar<ArchivoDrive>(token, `${API}/files?supportsAllDrives=true&fields=id,name`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ name: nombre, mimeType: MIME_CARPETA, parents: [padreId] })
    });
  }

  /** Comprueba que la carpeta existe, no está en la papelera y es accesible; devuelve su nombre. */
  async verificarCarpeta(token: string, carpetaId: string): Promise<string> {
    const c = await this.solicitar<CarpetaDrive & { trashed?: boolean; mimeType?: string }>(
      token, `${API}/files/${encodeURIComponent(carpetaId)}?fields=id,name,trashed,mimeType&supportsAllDrives=true`);
    if (c.trashed || (c.mimeType && c.mimeType !== MIME_CARPETA)) throw new ErrorBackup('carpeta-no-disponible');
    return c.name;
  }

  /**
   * Ruta legible de una carpeta («Mi unidad / Finanzas / Patrimonio»). Con el scope `drive.file` Drive no
   * siempre deja leer las carpetas superiores: si no se puede completar, la ruta empieza por «…».
   */
  async resolverRuta(token: string, carpetaId: string): Promise<string> {
    if (carpetaId === 'root') return 'Mi unidad';

    let idRaiz: string | null = null;
    try {
      idRaiz = (await this.solicitar<ArchivoDrive>(token, `${API}/files/root?fields=id`)).id;
    } catch { /* sin acceso a los metadatos de la raíz */ }

    const tramos: string[] = [];
    let actual: string | undefined = carpetaId;
    let completa = false;

    for (let nivel = 0; nivel < MAX_NIVELES_RUTA && actual; nivel++) {
      if (idRaiz !== null && actual === idRaiz) { tramos.unshift('Mi unidad'); completa = true; break; }
      let carpeta: CarpetaDrive;
      try {
        carpeta = await this.solicitar<CarpetaDrive>(
          token, `${API}/files/${encodeURIComponent(actual)}?fields=id,name,parents&supportsAllDrives=true`);
      } catch {
        break;
      }
      tramos.unshift(carpeta.name);
      actual = carpeta.parents?.[0];
      if (!actual) { completa = true; break; } // unidad compartida o raíz sin padre
    }

    return formatearRuta(completa ? tramos : ['…', ...tramos]);
  }

  // ------------------------------------------------------
  private async subirMultipart(
    token: string, url: string, metodo: 'POST' | 'PATCH', metadatos: Record<string, unknown>, contenido: string
  ): Promise<ArchivoDrive> {
    const limite = `patrimonio_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    return this.solicitar<ArchivoDrive>(token, `${url}?uploadType=multipart&supportsAllDrives=true&fields=id,name`, {
      method: metodo,
      headers: { 'Content-Type': `multipart/related; boundary=${limite}` },
      body: construirMultipart(metadatos, contenido, MIME_CSV, limite)
    });
  }

  private async solicitar<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new ErrorBackup('sin-conexion');

    let respuesta: Response;
    try {
      respuesta = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}` } });
    } catch {
      throw new ErrorBackup('sin-conexion');
    }

    if (!respuesta.ok) throw await this.errorDeRespuesta(respuesta);
    return respuesta.json() as Promise<T>;
  }

  private async errorDeRespuesta(r: Response): Promise<ErrorBackup> {
    let motivo = '';
    try {
      const cuerpo = await r.json();
      motivo = cuerpo?.error?.errors?.[0]?.reason ?? cuerpo?.error?.status ?? '';
    } catch { /* cuerpo no JSON */ }

    if (r.status === 401) return new ErrorBackup('token-caducado');
    if (r.status === 404) return new ErrorBackup('carpeta-no-disponible');
    if (r.status === 403 || r.status === 429) {
      return /quota|ratelimit|rate_limit|limit/i.test(motivo) || r.status === 429
        ? new ErrorBackup('cuota')
        : new ErrorBackup('permiso-denegado', motivo || undefined);
    }
    return new ErrorBackup('api', `HTTP ${r.status}${motivo ? ' · ' + motivo : ''}`);
  }
}
