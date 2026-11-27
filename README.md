# PatrimonioApp

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 21.0.0.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.


## Copias en Google Drive

La app puede subir una copia de seguridad mensual de tus datos a tu Google Drive, en **formato CSV** (el mismo
archivo que genera «Exportar CSV» en *Entrada mensual*, importable desde allí). Se configura desde el icono de nube
de la barra superior. Si no configuras nada, la función queda desactivada y el resto de la app no cambia.

### Cómo funciona

- **Permiso mínimo**: `https://www.googleapis.com/auth/drive.file`. La app solo accede a los archivos que crea y a la
  carpeta que elijas; no puede leer el resto de tu Drive.
- **Sin servidor**: autorización con *Google Identity Services* (flujo de token). El token vive solo en memoria de la
  pestaña y no se guarda en el navegador. En `localStorage` solo se guardan la carpeta elegida, los metadatos de la
  última copia y, si una subida falla, el CSV pendiente de reintentar.
- **Carpeta**: se elige con el selector de Google (navegación por subcarpetas y búsqueda), se crea una nueva o se usa
  «Mi unidad». Se guardan el `folderId` y la ruta legible.
- **Copia mensual**: una app web no puede ejecutarse en segundo plano, así que la copia del mes se comprueba al abrir la
  app (y al recuperar la conexión). Si Google necesita tu confirmación, aparece un aviso con un botón «Copiar ahora».
  Nombres: `patrimonio-backup-AAAA-MM.csv` (mensual, se sobrescribe dentro del mes) y
  `patrimonio-backup-AAAA-MM-DD_HHmm.csv` (manuales).

### Configuración en Google Cloud Console (una sola vez)

1. Crea un proyecto en <https://console.cloud.google.com/> y **habilita** las APIs *Google Drive API* y *Google Picker API*.
2. *Pantalla de consentimiento OAuth*: tipo «Externo», añade el scope `.../auth/drive.file` y, mientras la app esté en
   «Pruebas», añade tu cuenta de Google como usuario de prueba.
3. *Credenciales → ID de cliente de OAuth* → tipo **Aplicación web**. En **Orígenes autorizados de JavaScript** pon
   tu dominio de Netlify (`https://tu-sitio.netlify.app`) y, para desarrollo, `http://localhost:4200`.
4. *Credenciales → Clave de API* (solo para el selector de carpetas): restringe por **referentes HTTP** a esos mismos
   dominios y por API a *Google Picker API*.
5. El **número de proyecto** (Panel del proyecto) es el `appId` del selector.

### Variables de entorno

| Variable | Qué es |
| --- | --- |
| `GOOGLE_CLIENT_ID` | ID de cliente OAuth (paso 3) |
| `GOOGLE_API_KEY` | Clave de API del selector de carpetas (paso 4) |
| `GOOGLE_APP_ID` | Número de proyecto de Google Cloud (paso 5) |

En **Netlify** defínelas en *Site configuration → Environment variables* y usa `npm run build` como comando de build:
el script `prebuild` (`scripts/generate-env.mjs`) escribe `src/environments/environment.ts` con esos valores. En local,
exporta las variables antes de `npm run build`, o edita ese archivo (no subas tus valores al repositorio si no quieres).
Ninguno de estos valores es secreto —van en el JavaScript público—; la protección son los orígenes y referentes
restringidos. Sin `GOOGLE_API_KEY`/`GOOGLE_APP_ID` las copias funcionan igualmente, pero solo se puede elegir
«Mi unidad» o crear una carpeta nueva (sin el selector de Google).
