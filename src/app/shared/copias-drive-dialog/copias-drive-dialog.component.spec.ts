import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { AHORA } from '../../services/backup-drive.service';
import { DriveApiService } from '../../services/drive-api.service';
import { GoogleAuthService } from '../../services/google-auth.service';
import { GooglePickerService } from '../../services/google-picker.service';
import { PatrimonioService } from '../../services/patrimonio.service';
import { ErrorBackup } from '../error-backup';
import { CopiasDriveDialogComponent } from './copias-drive-dialog.component';

describe('CopiasDriveDialogComponent', () => {
  let fixture: ComponentFixture<CopiasDriveDialogComponent>;
  let auth: any;
  let drive: any;

  const el = () => fixture.nativeElement as HTMLElement;
  const boton = (texto: string) =>
    [...el().querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes(texto))!;

  async function crear(configurado = true) {
    localStorage.clear();
    auth = {
      configurado,
      selectorDisponible: configurado,
      conectado: signal(false),
      tieneTokenValido: vi.fn().mockReturnValue(true),
      obtenerToken: vi.fn().mockResolvedValue('T'),
      olvidarToken: vi.fn(),
      desconectar: vi.fn(),
      precargar: vi.fn()
    };
    drive = { subirCsv: vi.fn().mockResolvedValue({ id: 'ID', name: 'a.csv' }), crearCarpeta: vi.fn(), resolverRuta: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [CopiasDriveDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
        { provide: AHORA, useValue: () => new Date(2026, 10, 26, 14, 5) },
        { provide: PatrimonioService, useValue: { getRegistros: () => [{ mes: '2026-11', valores: { A: { B: { valor: 1 } } } }] } },
        { provide: GoogleAuthService, useValue: auth },
        { provide: DriveApiService, useValue: drive },
        { provide: GooglePickerService, useValue: { elegirCarpeta: vi.fn() } }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CopiasDriveDialogComponent);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  afterEach(() => TestBed.resetTestingModule());

  it('sin credenciales de Google explica que falta configurar y desactiva las acciones', async () => {
    await crear(false);
    expect(el().textContent).toContain('todavía no tiene credenciales de Google');
    expect(el().textContent).toContain('Sin configurar');
    expect(boton('Crear copia ahora').disabled).toBe(true);
    expect(boton('Conectar con Google').disabled).toBe(true);
  });

  it('muestra la carpeta por defecto «Mi unidad», el interruptor desactivado y que aún no hay copias', async () => {
    await crear();
    expect(el().querySelector('.ruta-texto')?.textContent).toContain('Mi unidad');
    expect(el().textContent).toContain('Desactivada');
    expect(el().textContent).toContain('Todavía no se ha hecho ninguna copia');
    expect(boton('Usar «Mi unidad»')).toBeUndefined();
  });

  it('«Crear copia ahora» sube el CSV y muestra la fecha, el archivo y el resultado', async () => {
    await crear();
    boton('Crear copia ahora').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(drive.subirCsv).toHaveBeenCalledTimes(1);
    expect(el().textContent).toContain('Copia subida: a.csv');
    expect(el().textContent).toContain('Correcta (manual)');
    expect(el().querySelector('.datos')?.textContent).toContain('a.csv');
  });

  it('si Google falla muestra un mensaje claro en español y la copia pendiente con «Reintentar»', async () => {
    await crear();
    drive.subirCsv.mockRejectedValue(new ErrorBackup('sin-conexion'));
    boton('Crear copia ahora').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el().textContent).toContain('No hay conexión con Google');
    expect(el().textContent).toContain('pendiente de subir');
    expect(boton('Reintentar')).toBeTruthy();
  });

  it('activar la copia mensual se refleja y persiste', async () => {
    await crear();
    const toggle = el().querySelector<HTMLButtonElement>('mat-slide-toggle button[role="switch"]')!;
    toggle.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el().textContent).toContain('Activada');
    expect(JSON.parse(localStorage.getItem('backup_drive_config')!).automatica).toBe(true);
  });

  it('«Carpeta nueva» muestra el campo de nombre', async () => {
    await crear();
    boton('Carpeta nueva').click();
    fixture.detectChanges();
    expect(el().querySelector('input[name="nombreCarpeta"]')).toBeTruthy();
  });
});
