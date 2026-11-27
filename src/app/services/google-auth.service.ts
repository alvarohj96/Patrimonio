import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { ErrorBackup } from '../shared/error-backup';
import { GoogleScriptsService } from './google-scripts.service';

export interface ConfigGoogleDrive {
  clientId: string;
  apiKey: string;
  appId: string;
}

/** Credenciales de Google (sustituibles en los tests). */
export const CONFIG_GOOGLE_DRIVE = new InjectionToken<ConfigGoogleDrive>('CONFIG_GOOGLE_DRIVE', {
  providedIn: 'root',
  factory: () => environment.googleDrive
});

interface TokenEnMemoria {
  valor: string;
  /** ms desde epoch */
  caduca: number;
}

/** Margen antes de la caducidad real para no usar un token a punto de expirar. */
const MARGEN_MS = 60_000;
/** Si en una renovación silenciosa Google no responde, se considera que hace falta interacción. */
const TIMEOUT_SILENCIOSO_MS = 15_000;

/**
 * Autorización con Google Identity Services (flujo de token, sin backend).
 *
 * Seguridad: el access token vive solo en memoria de la pestaña; nunca se escribe en localStorage ni en
 * ningún otro almacenamiento. Scope mínimo: `drive.file` (solo archivos/carpetas creados o elegidos por el
 * usuario con esta app; no puede leer el resto del Drive).
 */
@Injectable({ providedIn: 'root' })
export class GoogleAuthService {

  static readonly SCOPE = 'https://www.googleapis.com/auth/drive.file';

  private readonly scripts = inject(GoogleScriptsService);
  readonly config = inject(CONFIG_GOOGLE_DRIVE);

  private token: TokenEnMemoria | null = null;

  /** Hay un token válido en esta sesión de la pestaña. */
  readonly conectado = signal(false);

  get configurado(): boolean {
    return this.config.clientId.trim() !== '';
  }

  /** El selector de carpetas de Google necesita además API key y appId. */
  get selectorDisponible(): boolean {
    return this.configurado && this.config.apiKey.trim() !== '' && this.config.appId.trim() !== '';
  }

  tieneTokenValido(): boolean {
    const valido = this.token !== null && Date.now() < this.token.caduca;
    if (!valido && this.token) this.olvidarToken();
    return valido;
  }

  /** Descarga el script de Google por adelantado para que el clic posterior abra la ventana sin esperas. */
  precargar(): void {
    if (this.configurado) this.scripts.cargarGis().catch(() => { /* se reintenta al conectar */ });
  }

  /**
   * Devuelve un token válido. Con `interactivo` abre la ventana de Google (debe llamarse desde un clic);
   * sin él intenta renovarlo en silencio y, si Google necesita al usuario, falla con `requiere-interaccion`.
   */
  async obtenerToken(opciones: { interactivo: boolean }): Promise<string> {
    if (!this.configurado) throw new ErrorBackup('no-configurado');
    if (this.tieneTokenValido()) return this.token!.valor;

    let accounts;
    try {
      accounts = await this.scripts.cargarGis();
    } catch {
      throw new ErrorBackup('sin-conexion');
    }

    return new Promise<string>((resolve, reject) => {
      let terminado = false;
      const fin = (accion: () => void) => {
        if (terminado) return;
        terminado = true;
        clearTimeout(temporizador);
        accion();
      };
      const temporizador = opciones.interactivo
        ? undefined
        : setTimeout(() => fin(() => reject(new ErrorBackup('requiere-interaccion'))), TIMEOUT_SILENCIOSO_MS);

      const cliente = accounts.oauth2.initTokenClient({
        client_id: this.config.clientId,
        scope: GoogleAuthService.SCOPE,
        callback: respuesta => fin(() => {
          if (respuesta.error || !respuesta.access_token) {
            return reject(this.errorDeRespuesta(respuesta.error));
          }
          const segundos = Number(respuesta.expires_in) || 3600;
          this.token = { valor: respuesta.access_token, caduca: Date.now() + segundos * 1000 - MARGEN_MS };
          this.conectado.set(true);
          resolve(respuesta.access_token);
        }),
        error_callback: e => fin(() => reject(this.errorDePopup(e?.type)))
      });

      // prompt '' = no forzar el selector de cuenta: si ya hay permiso y sesión, Google responde sin pantallas
      cliente.requestAccessToken({ prompt: '' });
    });
  }

  /** Descarta el token (p. ej. tras un 401 de Drive). */
  olvidarToken(): void {
    this.token = null;
    this.conectado.set(false);
  }

  /** Revoca el permiso de esta sesión y descarta el token. */
  async desconectar(): Promise<void> {
    const actual = this.token?.valor;
    this.olvidarToken();
    if (!actual) return;
    try {
      const accounts = await this.scripts.cargarGis();
      accounts.oauth2.revoke(actual);
    } catch {
      /* sin conexión: el token ya está descartado localmente y caduca solo */
    }
  }

  private errorDeRespuesta(codigo?: string): ErrorBackup {
    switch (codigo) {
      case 'access_denied': return new ErrorBackup('permiso-denegado');
      case 'interaction_required':
      case 'login_required':
      case 'consent_required': return new ErrorBackup('requiere-interaccion');
      default: return new ErrorBackup('api', codigo);
    }
  }

  private errorDePopup(tipo?: string): ErrorBackup {
    switch (tipo) {
      case 'popup_closed': return new ErrorBackup('cancelado');
      case 'popup_failed_to_open': return new ErrorBackup('requiere-interaccion');
      default: return new ErrorBackup('api', tipo);
    }
  }
}
