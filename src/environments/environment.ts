/**
 * Configuración de Google para las copias de seguridad en Drive.
 *
 * Valores vacíos = función desactivada (la app sigue funcionando; el panel de copias avisa de que falta configurar).
 * Se rellenan con las variables de entorno GOOGLE_CLIENT_ID, GOOGLE_API_KEY y GOOGLE_APP_ID: `npm run build`
 * ejecuta antes `scripts/generate-env.mjs`, que reescribe este archivo (ver README, apartado «Copias en Google Drive»).
 *
 * Ninguno de estos valores es un secreto (van en el JavaScript público): protege el acceso restringiendo
 * el Client ID por orígenes autorizados y la API key por referente HTTP en Google Cloud Console.
 */
export const environment = {
  googleDrive: {
    /** ID de cliente OAuth 2.0 (tipo «Aplicación web») */
    clientId: '',
    /** API key (solo para el selector de carpetas de Google) */
    apiKey: '',
    /** Número de proyecto de Google Cloud (appId del selector de carpetas) */
    appId: ''
  }
};
