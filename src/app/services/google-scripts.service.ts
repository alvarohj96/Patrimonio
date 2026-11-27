import { Injectable } from '@angular/core';

/** Parte de la API de Google Identity Services (token) que usamos. */
export interface GisTokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
}

export interface GisTokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}

export interface GisTokenClientConfig {
  client_id: string;
  scope: string;
  callback: (r: GisTokenResponse) => void;
  error_callback?: (e: { type?: string; message?: string }) => void;
}

export interface GoogleAccounts {
  oauth2: {
    initTokenClient(config: GisTokenClientConfig): GisTokenClient;
    revoke(token: string, done?: () => void): void;
  };
}

/** Parte de Google Picker que usamos. */
export interface PickerDocumento {
  id: string;
  name: string;
  parentId?: string;
}

export interface PickerRespuesta {
  action: string;
  docs?: PickerDocumento[];
}

export interface GooglePicker {
  Action: { PICKED: string; CANCEL: string };
  ViewId: { FOLDERS: string };
  DocsView: new (viewId?: string) => {
    setIncludeFolders(v: boolean): any;
    setSelectFolderEnabled(v: boolean): any;
    setMimeTypes(m: string): any;
  };
  PickerBuilder: new () => {
    addView(v: unknown): any;
    setOAuthToken(t: string): any;
    setDeveloperKey(k: string): any;
    setAppId(a: string): any;
    setLocale(l: string): any;
    setTitle(t: string): any;
    setCallback(cb: (r: PickerRespuesta) => void): any;
    build(): { setVisible(v: boolean): void };
  };
}

const URL_GIS = 'https://accounts.google.com/gsi/client';
const URL_GAPI = 'https://apis.google.com/js/api.js';

/**
 * Carga perezosa de los scripts de Google: solo se descargan cuando el usuario usa las copias en Drive, así
 * que quien no las use no contacta con Google. Aislado en un servicio para poder sustituirlo en los tests.
 */
@Injectable({ providedIn: 'root' })
export class GoogleScriptsService {

  private readonly cargas = new Map<string, Promise<void>>();

  async cargarGis(): Promise<GoogleAccounts> {
    await this.cargarScript(URL_GIS);
    const accounts = (window as any).google?.accounts;
    if (!accounts?.oauth2) throw new Error('Google Identity Services no está disponible');
    return accounts as GoogleAccounts;
  }

  async cargarPicker(): Promise<GooglePicker> {
    await this.cargarScript(URL_GAPI);
    await new Promise<void>((resolve, reject) => {
      const gapi = (window as any).gapi;
      if (!gapi?.load) return reject(new Error('Google API no está disponible'));
      gapi.load('picker', { callback: () => resolve(), onerror: () => reject(new Error('No se pudo cargar el selector de Google')) });
    });
    const picker = (window as any).google?.picker;
    if (!picker) throw new Error('El selector de carpetas de Google no está disponible');
    return picker as GooglePicker;
  }

  private cargarScript(url: string): Promise<void> {
    const existente = this.cargas.get(url);
    if (existente) return existente;

    const carga = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        this.cargas.delete(url); // permite reintentar si no había conexión
        reject(new Error(`No se pudo cargar ${url}`));
      };
      document.head.appendChild(script);
    });

    this.cargas.set(url, carga);
    return carga;
  }
}
