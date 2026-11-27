import { CodigoErrorBackup } from '../models/backup-drive';

const MENSAJES: Record<CodigoErrorBackup, string> = {
  'no-configurado': 'Faltan las credenciales de Google (Client ID). Revisa las instrucciones de configuración.',
  'sin-datos': 'No hay datos de patrimonio que copiar todavía.',
  'cancelado': 'Has cerrado la ventana de Google: no se ha hecho ninguna copia.',
  'requiere-interaccion': 'Google necesita tu confirmación y el navegador no ha permitido abrir la ventana. Pulsa «Conectar» o «Crear copia ahora».',
  'permiso-denegado': 'No has concedido permiso para guardar archivos en Google Drive.',
  'token-caducado': 'La sesión de Google ha caducado. Vuelve a conectar para continuar.',
  'sin-conexion': 'No hay conexión con Google. La copia queda guardada en este equipo y se reintentará.',
  'carpeta-no-disponible': 'La carpeta elegida ya no está disponible en tu Drive. Elige otra carpeta.',
  'cuota': 'Google Drive rechaza la subida (sin espacio o límite de uso alcanzado). Inténtalo más tarde.',
  'api': 'Google Drive ha devuelto un error inesperado.'
};

/** Error de las copias en Drive con un código estable y un mensaje listo para mostrar en español. */
export class ErrorBackup extends Error {
  constructor(readonly codigo: CodigoErrorBackup, detalle?: string) {
    super(detalle ? `${MENSAJES[codigo]} (${detalle})` : MENSAJES[codigo]);
    this.name = 'ErrorBackup';
  }
}

export function esErrorBackup(e: unknown): e is ErrorBackup {
  return e instanceof ErrorBackup;
}
