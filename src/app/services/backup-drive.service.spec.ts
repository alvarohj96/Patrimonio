import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RegistroMensual } from './patrimonio.service';
import { PatrimonioService } from './patrimonio.service';
import { AHORA, BackupDriveService } from './backup-drive.service';
import { DriveApiService } from './drive-api.service';
import { GoogleAuthService } from './google-auth.service';
import { GooglePickerService } from './google-picker.service';
import { serializarRegistrosCsv } from '../shared/csv-patrimonio';
import { ErrorBackup } from '../shared/error-backup';

const REGISTROS: RegistroMensual[] = [
  { mes: '2026-11', valores: { Fondos: { 'Fondo ñandú': { valor: 1000.5 } }, Cripto: { BTC: { valor: 50, cantidad: 0.5 } } } }
];

describe('BackupDriveService', () => {
  let ahora: Date;
  let registros: RegistroMensual[];
  let auth: any;
  let drive: { subirCsv: ReturnType<typeof vi.fn>; crearCarpeta: ReturnType<typeof vi.fn>; resolverRuta: ReturnType<typeof vi.fn> };
  let picker: { elegirCarpeta: ReturnType<typeof vi.fn> };

  function crear(): BackupDriveService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: AHORA, useValue: () => ahora },
        { provide: PatrimonioService, useValue: { getRegistros: () => registros } },
        { provide: GoogleAuthService, useValue: auth },
        { provide: DriveApiService, useValue: drive },
        { provide: GooglePickerService, useValue: picker }
      ]
    });
    return TestBed.inject(BackupDriveService);
  }

  beforeEach(() => {
    localStorage.clear();
    ahora = new Date(2026, 10, 26, 14, 5);
    registros = REGISTROS;
    auth = {
      configurado: true,
      selectorDisponible: true,
      conectado: signal(false),
      tieneTokenValido: vi.fn().mockReturnValue(true),
      obtenerToken: vi.fn().mockResolvedValue('TOKEN'),
      olvidarToken: vi.fn(),
      desconectar: vi.fn().mockResolvedValue(undefined),
      precargar: vi.fn()
    };
    drive = {
      subirCsv: vi.fn().mockImplementation(async (_t: string, s: { nombre: string }) => ({ id: 'DRIVE-ID', name: s.nombre })),
      crearCarpeta: vi.fn().mockResolvedValue({ id: 'NUEVA', name: 'Copias' }),
      resolverRuta: vi.fn().mockResolvedValue('Mi unidad / Finanzas / Patrimonio')
    };
    picker = { elegirCarpeta: vi.fn().mockResolvedValue({ id: 'ELEGIDA', name: 'Patrimonio' }) };
  });

  describe('crear copia ahora (manual)', () => {
    it('sube el CSV idéntico al de «Exportar CSV» con nombre con fecha y hora', async () => {
      const servicio = crear();
      const r = await servicio.crearCopiaAhora();

      expect(r.ok).toBe(true);
      const [token, subida] = drive.subirCsv.mock.calls[0];
      expect(token).toBe('TOKEN');
      expect(subida.contenido).toBe(serializarRegistrosCsv(REGISTROS));
      expect(subida.nombre).toBe('patrimonio-backup-2026-11-26_1405.csv');
      expect(subida.carpetaId).toBe('root');
      expect(subida.reemplazarSiExiste).toBe(false);
      expect(auth.obtenerToken).toHaveBeenCalledWith({ interactivo: true });
    });

    it('guarda los metadatos de la última copia (periodo, archivo, carpeta, estado)', async () => {
      const servicio = crear();
      await servicio.crearCopiaAhora();

      const u = servicio.ultimaCopia()!;
      expect(u).toEqual({
        lastBackupAt: ahora.toISOString(),
        lastBackupPeriod: '2026-11',
        driveFileId: 'DRIVE-ID',
        driveFolderPath: 'Mi unidad',
        fileName: 'patrimonio-backup-2026-11-26_1405.csv',
        status: 'ok',
        tipo: 'manual'
      });
      expect(JSON.parse(localStorage.getItem('backup_drive_ultima')!)).toEqual(u);
    });

    it('sin datos no sube nada y lo explica', async () => {
      registros = [];
      const servicio = crear();
      const r = await servicio.crearCopiaAhora();
      expect(r.ok).toBe(false);
      expect(r.error!.codigo).toBe('sin-datos');
      expect(drive.subirCsv).not.toHaveBeenCalled();
      expect(servicio.hayPendiente()).toBe(false);
    });

    it('avisa de los nombres que romperían la importación, sin alterar el CSV subido', async () => {
      registros = [{ mes: '2026-11', valores: { 'A;B': { x: { valor: 1 } } } }];
      const servicio = crear();
      const r = await servicio.crearCopiaAhora();
      expect(r.ok).toBe(true);
      expect(r.avisos[0]).toContain('A;B');
      expect(drive.subirCsv.mock.calls[0][1].contenido).toBe(serializarRegistrosCsv(registros));
    });

    it('cancelar la ventana de Google no deja copia pendiente ni error guardado', async () => {
      auth.obtenerToken.mockRejectedValue(new ErrorBackup('cancelado'));
      const servicio = crear();
      const r = await servicio.crearCopiaAhora();
      expect(r.ok).toBe(false);
      expect(r.error!.codigo).toBe('cancelado');
      expect(servicio.hayPendiente()).toBe(false);
      expect(servicio.ultimoError()).toBeNull();
    });

    it('si falla la red guarda el CSV como copia pendiente y recuerda el error', async () => {
      drive.subirCsv.mockRejectedValue(new ErrorBackup('sin-conexion'));
      const servicio = crear();
      const r = await servicio.crearCopiaAhora();

      expect(r.ok).toBe(false);
      expect(servicio.hayPendiente()).toBe(true);
      expect(servicio.pendiente()!.csv).toBe(serializarRegistrosCsv(REGISTROS));
      expect(servicio.pendiente()!.nombreArchivo).toBe('patrimonio-backup-2026-11-26_1405.csv');
      expect(servicio.ultimoError()!.codigo).toBe('sin-conexion');
      expect(JSON.parse(localStorage.getItem('backup_drive_pendiente')!).csv).toContain('Fondo ñandú');
    });

    it('reintentar sube exactamente el CSV pendiente (no los datos de ahora) y limpia el estado', async () => {
      drive.subirCsv.mockRejectedValueOnce(new ErrorBackup('sin-conexion'));
      const servicio = crear();
      await servicio.crearCopiaAhora();
      const csvPendiente = servicio.pendiente()!.csv;

      registros = [{ mes: '2026-12', valores: { Otra: { cosa: { valor: 9 } } } }];
      ahora = new Date(2026, 10, 27, 9, 0);
      const r = await servicio.reintentarPendiente();

      expect(r.ok).toBe(true);
      const subida = drive.subirCsv.mock.calls[1][1];
      expect(subida.contenido).toBe(csvPendiente);
      expect(subida.nombre).toBe('patrimonio-backup-2026-11-26_1405.csv');
      expect(servicio.hayPendiente()).toBe(false);
      expect(servicio.ultimoError()).toBeNull();
      expect(localStorage.getItem('backup_drive_pendiente')).toBeNull();
    });

    it('si el token caduca en el servidor lo renueva una vez y repite la subida', async () => {
      drive.subirCsv
        .mockRejectedValueOnce(new ErrorBackup('token-caducado'))
        .mockImplementationOnce(async (_t: string, s: { nombre: string }) => ({ id: 'ID2', name: s.nombre }));
      auth.obtenerToken.mockResolvedValueOnce('VIEJO').mockResolvedValueOnce('NUEVO');
      const servicio = crear();
      const r = await servicio.crearCopiaAhora();

      expect(r.ok).toBe(true);
      expect(auth.olvidarToken).toHaveBeenCalled();
      expect(drive.subirCsv.mock.calls[1][0]).toBe('NUEVO');
    });

    it('ignora un segundo clic mientras hay una copia en curso', async () => {
      let liberar!: () => void;
      drive.subirCsv.mockImplementation(() => new Promise(res => { liberar = () => res({ id: 'X', name: 'x.csv' }); }));
      const servicio = crear();
      const a = servicio.crearCopiaAhora();
      const b = servicio.crearCopiaAhora();
      await Promise.resolve();
      liberar();
      await Promise.all([a, b]);
      expect(drive.subirCsv).toHaveBeenCalledTimes(1);
    });
  });

  describe('copia mensual automática', () => {
    it('desactivada por defecto: no hace nada', async () => {
      const servicio = crear();
      expect(servicio.config().automatica).toBe(false);
      expect(await servicio.comprobarCopiaMensual()).toBe('desactivada');
      expect(drive.subirCsv).not.toHaveBeenCalled();
    });

    it('sin credenciales de Google no intenta nada', async () => {
      auth.configurado = false;
      const servicio = crear();
      servicio.establecerAutomatica(true);
      expect(await servicio.comprobarCopiaMensual()).toBe('no-configurado');
    });

    it('si no hay copia del mes la hace, sin abrir ventanas, con el nombre mensual y reemplazando', async () => {
      const servicio = crear();
      servicio.establecerAutomatica(true);

      expect(await servicio.comprobarCopiaMensual()).toBe('copiada');
      expect(auth.obtenerToken).toHaveBeenCalledWith({ interactivo: false });
      const subida = drive.subirCsv.mock.calls[0][1];
      expect(subida.nombre).toBe('patrimonio-backup-2026-11.csv');
      expect(subida.reemplazarSiExiste).toBe(true);
      expect(servicio.ultimaCopia()!.tipo).toBe('automatica');
      expect(servicio.ultimaCopia()!.lastBackupPeriod).toBe('2026-11');
    });

    it('no repite la copia en el mismo mes, ni siquiera en otro día', async () => {
      const servicio = crear();
      servicio.establecerAutomatica(true);
      await servicio.comprobarCopiaMensual();

      ahora = new Date(2026, 10, 30, 23, 59);
      expect(await servicio.comprobarCopiaMensual()).toBe('al-dia');
      expect(drive.subirCsv).toHaveBeenCalledTimes(1);
    });

    it('una copia manual del mes cuenta como la copia mensual', async () => {
      const servicio = crear();
      servicio.establecerAutomatica(true);
      await servicio.crearCopiaAhora();
      expect(await servicio.comprobarCopiaMensual()).toBe('al-dia');
      expect(drive.subirCsv).toHaveBeenCalledTimes(1);
    });

    it('al cambiar el mes (o el año) vuelve a hacerla', async () => {
      const servicio = crear();
      servicio.establecerAutomatica(true);
      await servicio.comprobarCopiaMensual();

      ahora = new Date(2026, 11, 1, 8, 0);
      expect(await servicio.comprobarCopiaMensual()).toBe('copiada');
      expect(drive.subirCsv.mock.calls[1][1].nombre).toBe('patrimonio-backup-2026-12.csv');

      ahora = new Date(2027, 0, 3, 8, 0);
      expect(await servicio.comprobarCopiaMensual()).toBe('copiada');
      expect(drive.subirCsv.mock.calls[2][1].nombre).toBe('patrimonio-backup-2027-01.csv');
    });

    it('sin datos no hay nada que copiar', async () => {
      registros = [];
      const servicio = crear();
      servicio.establecerAutomatica(true);
      expect(await servicio.comprobarCopiaMensual()).toBe('sin-datos');
      expect(drive.subirCsv).not.toHaveBeenCalled();
      expect(servicio.aviso()).toBeNull();
    });

    it('si nunca se ha autorizado, no abre ventanas por sorpresa: deja un aviso con un clic', async () => {
      auth.tieneTokenValido.mockReturnValue(false);
      const servicio = crear();
      servicio.establecerAutomatica(true);

      expect(await servicio.comprobarCopiaMensual()).toBe('requiere-accion');
      expect(auth.obtenerToken).not.toHaveBeenCalled();
      expect(servicio.aviso()!.mensaje).toContain('2026-11');

      // El clic del usuario hace la copia mensual y retira el aviso
      auth.tieneTokenValido.mockReturnValue(true);
      const r = await servicio.hacerCopiaMensualAhora();
      expect(r.ok).toBe(true);
      expect(drive.subirCsv.mock.calls[0][1].nombre).toBe('patrimonio-backup-2026-11.csv');
      expect(servicio.aviso()).toBeNull();
    });

    it('si ya se autorizó antes pero Google pide interacción: aviso no intrusivo y copia pendiente guardada', async () => {
      auth.tieneTokenValido.mockReturnValue(false);
      auth.obtenerToken.mockRejectedValue(new ErrorBackup('requiere-interaccion'));
      localStorage.setItem('backup_drive_config', JSON.stringify({
        version: 1, automatica: true, carpetaId: 'root', carpetaRuta: 'Mi unidad', conectadoAntes: true
      }));
      const servicio = crear();

      expect(await servicio.comprobarCopiaMensual()).toBe('requiere-accion');
      expect(servicio.aviso()!.mensaje).toContain('confirmación');
      expect(servicio.hayPendiente()).toBe(true);
    });

    it('un fallo de red no molesta con avisos: queda pendiente y se reintenta al volver la conexión', async () => {
      drive.subirCsv.mockRejectedValueOnce(new ErrorBackup('sin-conexion'));
      const servicio = crear();
      servicio.establecerAutomatica(true);

      expect(await servicio.comprobarCopiaMensual()).toBe('requiere-accion');
      expect(servicio.aviso()).toBeNull();
      expect(servicio.hayPendiente()).toBe(true);

      // Vuelve la conexión: se sube lo pendiente (y no se duplica la del mes)
      expect(await servicio.comprobarCopiaMensual()).toBe('copiada');
      expect(servicio.hayPendiente()).toBe(false);
      expect(drive.subirCsv).toHaveBeenCalledTimes(2);
      expect(drive.subirCsv.mock.calls[1][1].nombre).toBe('patrimonio-backup-2026-11.csv');
    });

    it('si pasó un mes con una copia pendiente, sube primero la pendiente y luego la del mes nuevo', async () => {
      drive.subirCsv.mockRejectedValueOnce(new ErrorBackup('sin-conexion'));
      const servicio = crear();
      servicio.establecerAutomatica(true);
      await servicio.comprobarCopiaMensual();

      ahora = new Date(2026, 11, 2, 10, 0);
      expect(await servicio.comprobarCopiaMensual()).toBe('copiada');
      const nombres = drive.subirCsv.mock.calls.map(c => c[1].nombre);
      expect(nombres).toEqual(['patrimonio-backup-2026-11.csv', 'patrimonio-backup-2026-11.csv', 'patrimonio-backup-2026-12.csv']);
      expect(servicio.ultimaCopia()!.lastBackupPeriod).toBe('2026-12');
    });
  });

  describe('carpeta de destino', () => {
    it('por defecto guarda en «Mi unidad» (raíz)', () => {
      const c = crear().config();
      expect(c.carpetaId).toBe('root');
      expect(c.carpetaRuta).toBe('Mi unidad');
    });

    it('elegir carpeta guarda el folderId y la ruta legible, y las copias van a ella', async () => {
      const servicio = crear();
      expect(await servicio.seleccionarCarpeta()).toBe(true);

      expect(servicio.config().carpetaId).toBe('ELEGIDA');
      expect(servicio.config().carpetaRuta).toBe('Mi unidad / Finanzas / Patrimonio');
      expect(drive.resolverRuta).toHaveBeenCalledWith('TOKEN', 'ELEGIDA');

      await servicio.crearCopiaAhora();
      expect(drive.subirCsv.mock.calls[0][1].carpetaId).toBe('ELEGIDA');
      expect(servicio.ultimaCopia()!.driveFolderPath).toBe('Mi unidad / Finanzas / Patrimonio');
    });

    it('cerrar el selector no cambia la carpeta', async () => {
      picker.elegirCarpeta.mockResolvedValue(null);
      const servicio = crear();
      expect(await servicio.seleccionarCarpeta()).toBe(false);
      expect(servicio.config().carpetaId).toBe('root');
    });

    it('crear carpeta nueva la crea dentro de la actual y la elige, concatenando la ruta', async () => {
      const servicio = crear();
      await servicio.seleccionarCarpeta();
      await servicio.crearCarpeta('  Copias  ');

      expect(drive.crearCarpeta).toHaveBeenCalledWith('TOKEN', 'Copias', 'ELEGIDA');
      expect(servicio.config().carpetaId).toBe('NUEVA');
      expect(servicio.config().carpetaRuta).toBe('Mi unidad / Finanzas / Patrimonio / Copias');
    });

    it('no crea carpetas sin nombre', async () => {
      await expect(crear().crearCarpeta('   ')).rejects.toBeInstanceOf(ErrorBackup);
      expect(drive.crearCarpeta).not.toHaveBeenCalled();
    });

    it('se puede volver a la raíz en cualquier momento', async () => {
      const servicio = crear();
      await servicio.seleccionarCarpeta();
      servicio.usarRaiz();
      expect(servicio.config().carpetaId).toBe('root');
      expect(servicio.config().carpetaRuta).toBe('Mi unidad');
    });

    it('la configuración persiste entre sesiones y no contiene tokens', async () => {
      const servicio = crear();
      servicio.establecerAutomatica(true);
      await servicio.seleccionarCarpeta();

      const otra = crear();
      expect(otra.config()).toEqual({
        version: 1, automatica: true, carpetaId: 'ELEGIDA', carpetaRuta: 'Mi unidad / Finanzas / Patrimonio', conectadoAntes: true
      });
      expect(JSON.stringify({ ...localStorage })).not.toContain('TOKEN');
    });

    it('si la carpeta ya no existe el error es claro y la copia queda pendiente', async () => {
      drive.subirCsv.mockRejectedValue(new ErrorBackup('carpeta-no-disponible'));
      const servicio = crear();
      const r = await servicio.crearCopiaAhora();
      expect(r.error!.codigo).toBe('carpeta-no-disponible');
      expect(r.error!.mensaje).toContain('Elige otra carpeta');
      expect(servicio.hayPendiente()).toBe(true);
    });

    it('una configuración corrupta en localStorage no rompe la app', () => {
      localStorage.setItem('backup_drive_config', '{no json');
      localStorage.setItem('backup_drive_pendiente', JSON.stringify({ csv: 3 }));
      const servicio = crear();
      expect(servicio.config().carpetaId).toBe('root');
      expect(servicio.hayPendiente()).toBe(false);
    });
  });
});
