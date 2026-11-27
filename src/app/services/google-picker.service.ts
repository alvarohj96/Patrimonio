import { Injectable, inject } from '@angular/core';
import { ErrorBackup } from '../shared/error-backup';
import { CONFIG_GOOGLE_DRIVE } from './google-auth.service';
import { GoogleScriptsService, PickerDocumento, PickerRespuesta } from './google-scripts.service';

/**
 * Selector de carpetas de Google (Google Picker): navegación por subcarpetas y búsqueda dentro del propio
 * Drive del usuario. Al elegir una carpeta, Google concede a la app acceso a ella con el scope `drive.file`,
 * que es lo que permite guardar archivos dentro (la app no puede listar el Drive por su cuenta).
 */
@Injectable({ providedIn: 'root' })
export class GooglePickerService {

  private readonly scripts = inject(GoogleScriptsService);
  private readonly config = inject(CONFIG_GOOGLE_DRIVE);

  /** Devuelve la carpeta elegida o `null` si el usuario cierra el selector. */
  async elegirCarpeta(token: string): Promise<PickerDocumento | null> {
    if (!this.config.apiKey || !this.config.appId) throw new ErrorBackup('no-configurado', 'API key / appId del selector');

    let picker;
    try {
      picker = await this.scripts.cargarPicker();
    } catch {
      throw new ErrorBackup('sin-conexion');
    }

    return new Promise<PickerDocumento | null>(resolve => {
      const vista = new picker.DocsView(picker.ViewId.FOLDERS);
      vista.setIncludeFolders(true);
      vista.setSelectFolderEnabled(true);
      vista.setMimeTypes('application/vnd.google-apps.folder');

      new picker.PickerBuilder()
        .addView(vista)
        .setOAuthToken(token)
        .setDeveloperKey(this.config.apiKey)
        .setAppId(this.config.appId)
        .setLocale('es')
        .setTitle('Elige la carpeta de las copias de seguridad')
        .setCallback((respuesta: PickerRespuesta) => {
          if (respuesta.action === picker.Action.PICKED) resolve(respuesta.docs?.[0] ?? null);
          else if (respuesta.action === picker.Action.CANCEL) resolve(null);
        })
        .build()
        .setVisible(true);
    });
  }
}
