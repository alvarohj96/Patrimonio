import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { BackupDriveService } from '../../services/backup-drive.service';
import { esErrorBackup } from '../error-backup';

type TipoMensaje = 'ok' | 'error' | 'info';

/** Panel de configuración y estado de las copias de seguridad en Google Drive. */
@Component({
  selector: 'app-copias-drive-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatSlideToggleModule, MatProgressSpinnerModule],
  templateUrl: './copias-drive-dialog.component.html',
  styleUrl: './copias-drive-dialog.component.scss'
})
export class CopiasDriveDialogComponent {

  protected readonly backup = inject(BackupDriveService);
  private readonly dialogRef = inject(MatDialogRef<CopiasDriveDialogComponent>);

  protected readonly mensaje = signal<{ tipo: TipoMensaje; texto: string } | null>(null);
  protected readonly avisosCsv = signal<string[]>([]);
  protected readonly creandoCarpeta = signal(false);
  protected nombreCarpeta = '';

  protected readonly esRaiz = computed(() => this.backup.config().carpetaId === 'root');

  protected readonly etiquetaConexion = computed(() => {
    switch (this.backup.estadoConexion()) {
      case 'conectado': return 'Conectado';
      case 'desconectado': return 'Desconectado';
      default: return 'Sin configurar';
    }
  });

  constructor() {
    // Descarga el script de Google por adelantado: el clic siguiente abre la ventana sin esperas
    this.backup.precargar();
  }

  protected async conectar() {
    await this.ejecutar(async () => {
      await this.backup.conectar();
      return 'Conectado con Google Drive.';
    });
  }

  protected async desconectar() {
    await this.backup.desconectar();
    this.mensaje.set({ tipo: 'info', texto: 'Desconectado. Se ha revocado el permiso de esta sesión.' });
  }

  protected async elegirCarpeta() {
    await this.ejecutar(async () => {
      const elegida = await this.backup.seleccionarCarpeta();
      return elegida ? `Carpeta elegida: ${this.backup.config().carpetaRuta}` : null;
    });
  }

  protected usarRaiz() {
    this.backup.usarRaiz();
    this.creandoCarpeta.set(false);
    this.mensaje.set({ tipo: 'info', texto: 'Las copias se guardarán en «Mi unidad».' });
  }

  protected mostrarCrearCarpeta() {
    this.nombreCarpeta = '';
    this.creandoCarpeta.set(true);
  }

  protected async crearCarpeta() {
    await this.ejecutar(async () => {
      await this.backup.crearCarpeta(this.nombreCarpeta);
      this.creandoCarpeta.set(false);
      return `Carpeta creada: ${this.backup.config().carpetaRuta}`;
    });
  }

  protected cambiarAutomatica(activa: boolean) {
    this.backup.establecerAutomatica(activa);
    this.mensaje.set(activa
      ? { tipo: 'info', texto: 'Copia mensual activada: se comprobará al abrir la aplicación.' }
      : null);
  }

  protected async copiarAhora() {
    this.mensaje.set(null);
    const r = await this.backup.crearCopiaAhora();
    this.avisosCsv.set(r.avisos);
    this.mensaje.set(r.ok
      ? { tipo: 'ok', texto: `Copia subida: ${r.copia!.fileName}` }
      : { tipo: 'error', texto: r.error!.mensaje });
  }

  protected async reintentar() {
    this.mensaje.set(null);
    const r = await this.backup.reintentarPendiente();
    this.mensaje.set(r.ok
      ? { tipo: 'ok', texto: `Copia pendiente subida: ${r.copia!.fileName}` }
      : { tipo: 'error', texto: r.error!.mensaje });
  }

  protected cerrar() {
    this.dialogRef.close();
  }

  protected formatearFecha(iso: string): string {
    return new Date(iso).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' });
  }

  /** Ejecuta una acción con Google y muestra el resultado (o el error en español) sin romper la pantalla. */
  private async ejecutar(accion: () => Promise<string | null>) {
    this.mensaje.set(null);
    try {
      const texto = await accion();
      if (texto) this.mensaje.set({ tipo: 'ok', texto });
    } catch (e) {
      this.mensaje.set({
        tipo: 'error',
        texto: esErrorBackup(e) ? e.message : 'No se ha podido completar la operación con Google Drive.'
      });
    }
  }
}
