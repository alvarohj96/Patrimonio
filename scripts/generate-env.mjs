// Genera src/environments/environment.ts a partir de variables de entorno (p. ej. las de Netlify).
// Si no hay ninguna definida, no toca el archivo (queda la configuración vacía = copias en Drive desactivadas).
import { writeFileSync } from 'node:fs';

const clientId = process.env.GOOGLE_CLIENT_ID ?? '';
const apiKey = process.env.GOOGLE_API_KEY ?? '';
const appId = process.env.GOOGLE_APP_ID ?? '';

if (!clientId && !apiKey && !appId) {
  console.log('[generate-env] Sin variables GOOGLE_*: se mantiene src/environments/environment.ts');
  process.exit(0);
}

const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const contenido = `// Archivo generado por scripts/generate-env.mjs. No editar a mano.
export const environment = {
  googleDrive: {
    clientId: '${esc(clientId)}',
    apiKey: '${esc(apiKey)}',
    appId: '${esc(appId)}'
  }
};
`;
writeFileSync(new URL('../src/environments/environment.ts', import.meta.url), contenido);
console.log('[generate-env] src/environments/environment.ts generado' + (clientId ? ' (con Client ID)' : ''));
