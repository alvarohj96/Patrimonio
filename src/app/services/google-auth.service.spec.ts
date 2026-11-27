import { TestBed } from '@angular/core/testing';
import { CONFIG_GOOGLE_DRIVE, GoogleAuthService } from './google-auth.service';
import { GisTokenClientConfig, GoogleScriptsService } from './google-scripts.service';

describe('GoogleAuthService', () => {
  let configs: GisTokenClientConfig[];
  let peticiones: Array<{ prompt?: string } | undefined>;
  let cargarGis: ReturnType<typeof vi.fn>;
  let revocar: ReturnType<typeof vi.fn>;
  /** Qué hace «Google» cuando se pide un token */
  let respuesta: (cfg: GisTokenClientConfig) => void;

  function crear(clientId = 'CLIENT.apps.googleusercontent.com') {
    configs = [];
    peticiones = [];
    revocar = vi.fn();
    cargarGis = vi.fn().mockResolvedValue({
      oauth2: {
        initTokenClient: (cfg: GisTokenClientConfig) => {
          configs.push(cfg);
          return { requestAccessToken: (o?: { prompt?: string }) => { peticiones.push(o); respuesta(cfg); } };
        },
        revoke: revocar
      }
    });
    TestBed.configureTestingModule({
      providers: [
        { provide: GoogleScriptsService, useValue: { cargarGis } },
        { provide: CONFIG_GOOGLE_DRIVE, useValue: { clientId, apiKey: 'K', appId: 'A' } }
      ]
    });
    return TestBed.inject(GoogleAuthService);
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    respuesta = cfg => cfg.callback({ access_token: 'TOKEN-1', expires_in: 3600 });
  });

  it('sin Client ID no hace nada y lo indica', async () => {
    const auth = crear('');
    expect(auth.configurado).toBe(false);
    await expect(auth.obtenerToken({ interactivo: true })).rejects.toMatchObject({ codigo: 'no-configurado' });
    expect(cargarGis).not.toHaveBeenCalled();
  });

  it('el selector de carpetas exige también API key y appId', () => {
    expect(crear().selectorDisponible).toBe(true);
  });

  it('obtiene un token con el scope mínimo drive.file y lo reutiliza mientras no caduque', async () => {
    const auth = crear();
    expect(await auth.obtenerToken({ interactivo: true })).toBe('TOKEN-1');
    expect(configs[0].scope).toBe('https://www.googleapis.com/auth/drive.file');
    expect(configs[0].client_id).toBe('CLIENT.apps.googleusercontent.com');
    expect(auth.conectado()).toBe(true);

    expect(await auth.obtenerToken({ interactivo: false })).toBe('TOKEN-1');
    expect(peticiones.length).toBe(1);
  });

  it('nunca guarda el token en el almacenamiento del navegador', async () => {
    const auth = crear();
    await auth.obtenerToken({ interactivo: true });
    const todo = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
    expect(todo).not.toContain('TOKEN-1');
    expect(localStorage.length).toBe(0);
  });

  it('un token caducado se descarta y se pide otro', async () => {
    vi.useFakeTimers();
    try {
      const auth = crear();
      respuesta = cfg => cfg.callback({ access_token: 'CORTO', expires_in: 100 });
      await auth.obtenerToken({ interactivo: true });
      // 100 s de vida menos 60 s de margen de seguridad: al principio es válido...
      expect(auth.tieneTokenValido()).toBe(true);
      // ...y pasados 41 s se considera caducado y se descarta
      vi.advanceTimersByTime(41_000);
      expect(auth.tieneTokenValido()).toBe(false);
      expect(auth.conectado()).toBe(false);

      respuesta = cfg => cfg.callback({ access_token: 'RENOVADO', expires_in: 3600 });
      expect(await auth.obtenerToken({ interactivo: false })).toBe('RENOVADO');
    } finally {
      vi.useRealTimers();
    }
  });

  it('renueva sin forzar el selector de cuenta (prompt vacío)', async () => {
    const auth = crear();
    await auth.obtenerToken({ interactivo: false });
    expect(peticiones[0]).toEqual({ prompt: '' });
  });

  describe('errores claros', () => {
    const codigo = async (auth: GoogleAuthService, interactivo = true) => {
      try { await auth.obtenerToken({ interactivo }); } catch (e) { return (e as { codigo: string }).codigo; }
      return null;
    };

    it('el usuario cierra la ventana → cancelado', async () => {
      const auth = crear();
      respuesta = cfg => cfg.error_callback!({ type: 'popup_closed' });
      expect(await codigo(auth)).toBe('cancelado');
    });

    it('el navegador bloquea la ventana → requiere interacción', async () => {
      const auth = crear();
      respuesta = cfg => cfg.error_callback!({ type: 'popup_failed_to_open' });
      expect(await codigo(auth, false)).toBe('requiere-interaccion');
    });

    it('el usuario deniega el permiso → permiso denegado', async () => {
      const auth = crear();
      respuesta = cfg => cfg.callback({ error: 'access_denied' });
      expect(await codigo(auth)).toBe('permiso-denegado');
    });

    it('Google exige iniciar sesión o consentir → requiere interacción', async () => {
      const auth = crear();
      respuesta = cfg => cfg.callback({ error: 'interaction_required' });
      expect(await codigo(auth, false)).toBe('requiere-interaccion');
    });

    it('no se puede cargar el script de Google (sin red) → sin conexión', async () => {
      const auth = crear();
      cargarGis.mockRejectedValueOnce(new Error('offline'));
      expect(await codigo(auth)).toBe('sin-conexion');
    });

    it('una renovación silenciosa que Google no contesta termina como «requiere interacción»', async () => {
      vi.useFakeTimers();
      try {
        const auth = crear();
        respuesta = () => { /* Google no responde */ };
        const promesa = auth.obtenerToken({ interactivo: false }).catch((e: { codigo: string }) => e.codigo);
        await vi.advanceTimersByTimeAsync(16_000);
        expect(await promesa).toBe('requiere-interaccion');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it('desconectar revoca el token y limpia la sesión', async () => {
    const auth = crear();
    await auth.obtenerToken({ interactivo: true });
    await auth.desconectar();
    expect(revocar).toHaveBeenCalledWith('TOKEN-1');
    expect(auth.conectado()).toBe(false);
    expect(auth.tieneTokenValido()).toBe(false);
  });
});
