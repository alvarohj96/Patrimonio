import { TestBed } from '@angular/core/testing';
import { ErrorBackup } from '../shared/error-backup';
import { DriveApiService } from './drive-api.service';

function respuesta(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('DriveApiService', () => {
  let servicio: DriveApiService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    servicio = TestBed.inject(DriveApiService);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  const consulta = (i: number) => new URL((fetchMock.mock.calls[i] as [string])[0]).searchParams.get('q');

  const llamada = (i: number) => {
    const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
    return { url, init, cabeceras: init.headers as Record<string, string> };
  };

  describe('subirCsv', () => {
    it('crea el archivo como text/csv en la carpeta elegida con el CSV literal (UTF-8)', async () => {
      fetchMock.mockResolvedValueOnce(respuesta({ id: 'F1', name: 'patrimonio-backup-2026-11.csv' }));
      const csv = 'Mes;Categoría;Subcategoría\n2026-11;Fondos;ñandú';

      const r = await servicio.subirCsv('TOKEN', {
        nombre: 'patrimonio-backup-2026-11.csv', contenido: csv, carpetaId: 'CARPETA', reemplazarSiExiste: false
      });

      expect(r).toEqual({ id: 'F1', name: 'patrimonio-backup-2026-11.csv' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const { url, init, cabeceras } = llamada(0);
      expect(url).toContain('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart');
      expect(init.method).toBe('POST');
      expect(cabeceras['Authorization']).toBe('Bearer TOKEN');
      expect(cabeceras['Content-Type']).toMatch(/^multipart\/related; boundary=/);

      const cuerpo = init.body as string;
      expect(cuerpo).toContain(csv);
      expect(cuerpo).toContain('"name":"patrimonio-backup-2026-11.csv"');
      expect(cuerpo).toContain('"mimeType":"text/csv"');
      expect(cuerpo).toContain('"parents":["CARPETA"]');
      expect(cuerpo.charCodeAt(0)).not.toBe(0xfeff);
    });

    it('si ya existe la copia mensual la sobrescribe en lugar de duplicarla', async () => {
      fetchMock
        .mockResolvedValueOnce(respuesta({ files: [{ id: 'EXISTE', name: 'a.csv' }] }))
        .mockResolvedValueOnce(respuesta({ id: 'EXISTE', name: 'a.csv' }));

      const r = await servicio.subirCsv('T', { nombre: 'a.csv', contenido: 'x', carpetaId: 'C', reemplazarSiExiste: true });

      expect(r.id).toBe('EXISTE');
      expect(llamada(0).url).toContain('/drive/v3/files?');
      expect(consulta(0)).toBe("name = 'a.csv' and 'C' in parents and trashed = false");
      expect(llamada(1).init.method).toBe('PATCH');
      expect(llamada(1).url).toContain('/upload/drive/v3/files/EXISTE?uploadType=multipart');
      expect(llamada(1).init.body as string).not.toContain('"parents"');
    });

    it('si no existe, la crea; y si se borró entre la búsqueda y la subida, la crea de nuevo', async () => {
      fetchMock
        .mockResolvedValueOnce(respuesta({ files: [{ id: 'X', name: 'a.csv' }] }))
        .mockResolvedValueOnce(respuesta({ error: { status: 'NOT_FOUND' } }, 404))
        .mockResolvedValueOnce(respuesta({ id: 'NUEVO', name: 'a.csv' }));

      const r = await servicio.subirCsv('T', { nombre: 'a.csv', contenido: 'x', carpetaId: 'C', reemplazarSiExiste: true });
      expect(r.id).toBe('NUEVO');
      expect(llamada(2).init.method).toBe('POST');
    });

    it('escapa las comillas del nombre en la búsqueda', async () => {
      fetchMock.mockResolvedValueOnce(respuesta({ files: [] })).mockResolvedValueOnce(respuesta({ id: '1', name: 'x' }));
      await servicio.subirCsv('T', { nombre: "o'brien.csv", contenido: 'x', carpetaId: 'C', reemplazarSiExiste: true });
      expect(consulta(0)).toContain("name = 'o\\'brien.csv'");
    });
  });

  describe('errores', () => {
    const subir = () => servicio.subirCsv('T', { nombre: 'a.csv', contenido: 'x', carpetaId: 'C', reemplazarSiExiste: false });
    const codigo = async (p: Promise<unknown>) => {
      try { await p; } catch (e) { return (e as ErrorBackup).codigo; }
      return null;
    };

    it('401 → token caducado', async () => {
      fetchMock.mockResolvedValue(respuesta({}, 401));
      expect(await codigo(subir())).toBe('token-caducado');
    });

    it('404 → carpeta no disponible', async () => {
      fetchMock.mockResolvedValue(respuesta({}, 404));
      expect(await codigo(subir())).toBe('carpeta-no-disponible');
    });

    it('403 por cuota → cuota; 403 por permisos → permiso denegado', async () => {
      fetchMock.mockResolvedValueOnce(respuesta({ error: { errors: [{ reason: 'storageQuotaExceeded' }] } }, 403));
      expect(await codigo(subir())).toBe('cuota');
      fetchMock.mockResolvedValueOnce(respuesta({ error: { errors: [{ reason: 'insufficientFilePermissions' }] } }, 403));
      expect(await codigo(subir())).toBe('permiso-denegado');
    });

    it('fallo de red → sin conexión', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
      expect(await codigo(subir())).toBe('sin-conexion');
    });

    it('otros errores → api con el estado HTTP', async () => {
      fetchMock.mockResolvedValue(respuesta({}, 500));
      try { await subir(); } catch (e) {
        expect((e as ErrorBackup).codigo).toBe('api');
        expect((e as ErrorBackup).message).toContain('HTTP 500');
      }
    });
  });

  describe('carpetas', () => {
    it('crea una carpeta dentro de la carpeta padre', async () => {
      fetchMock.mockResolvedValueOnce(respuesta({ id: 'NC', name: 'Copias' }));
      const c = await servicio.crearCarpeta('T', 'Copias', 'PADRE');
      expect(c).toEqual({ id: 'NC', name: 'Copias' });
      expect(JSON.parse(llamada(0).init.body as string)).toEqual({
        name: 'Copias', mimeType: 'application/vnd.google-apps.folder', parents: ['PADRE']
      });
    });

    it('verifica que la carpeta existe y no está en la papelera', async () => {
      fetchMock.mockResolvedValueOnce(respuesta({ id: 'C', name: 'Finanzas', mimeType: 'application/vnd.google-apps.folder' }));
      expect(await servicio.verificarCarpeta('T', 'C')).toBe('Finanzas');

      fetchMock.mockResolvedValueOnce(respuesta({ id: 'C', name: 'Finanzas', trashed: true }));
      await expect(servicio.verificarCarpeta('T', 'C')).rejects.toMatchObject({ codigo: 'carpeta-no-disponible' });
    });

    it('la ruta de «root» es «Mi unidad» sin llamar a Drive', async () => {
      expect(await servicio.resolverRuta('T', 'root')).toBe('Mi unidad');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('resuelve la ruta completa subiendo por los padres hasta Mi unidad', async () => {
      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes('/files/root')) return respuesta({ id: 'RAIZ' });
        if (url.includes('/files/HIJA')) return respuesta({ id: 'HIJA', name: 'Patrimonio', parents: ['MEDIA'] });
        if (url.includes('/files/MEDIA')) return respuesta({ id: 'MEDIA', name: 'Finanzas', parents: ['RAIZ'] });
        return respuesta({}, 404);
      });
      expect(await servicio.resolverRuta('T', 'HIJA')).toBe('Mi unidad / Finanzas / Patrimonio');
    });

    it('si Drive no deja leer las carpetas superiores, la ruta empieza por «…»', async () => {
      fetchMock.mockImplementation(async (url: string) => {
        if (url.includes('/files/HIJA')) return respuesta({ id: 'HIJA', name: 'Patrimonio', parents: ['PADRE'] });
        return respuesta({}, 404);
      });
      expect(await servicio.resolverRuta('T', 'HIJA')).toBe('… / Patrimonio');
    });
  });
});
