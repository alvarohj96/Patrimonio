import { Component, Injector, inject } from '@angular/core';

// Formularios
import { ReactiveFormsModule } from '@angular/forms';

// Angular Material
import { MatTabsModule } from '@angular/material/tabs';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatDialog } from '@angular/material/dialog';
import { RouterModule } from '@angular/router';
import { MatMenuModule } from '@angular/material/menu';

// Tus componentes standalone
import { PatrimonioGeneralComponent } from './pages/patrimonio-general/patrimonio-general.component';
import { PatrimonioMensualComponent } from './pages/patrimonio-mensual/patrimonio-mensual.component';
import { ThemeService } from './services/theme/theme.service';
import { ConfiguracionVisualComponent } from './pages/configuracion-visual/configuracion-visual.component';
import { GuiaUsoDialogComponent } from './shared/guia-uso-dialog/guia-uso-dialog.component';
import { AvisoCopiaDriveComponent } from './shared/aviso-copia-drive/aviso-copia-drive.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    // Angular Material
    RouterModule,
    MatTabsModule,
    MatInputModule,
    MatButtonModule,
    MatTableModule,
    MatIconModule,
    MatCardModule,
    MatFormFieldModule,
    MatSelectModule,
    MatToolbarModule,
    MatMenuModule,
    AvisoCopiaDriveComponent,

    // Formularios
    ReactiveFormsModule
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})

export class App {
  private readonly injector = inject(Injector);

  constructor(public theme: ThemeService, private dialog: MatDialog) {
    // Copia mensual en Google Drive: se comprueba al abrir la app, sin retrasar la primera pantalla
    // (el servicio se descarga entonces, no forma parte de la carga inicial)
    setTimeout(async () => {
      const { BackupDriveService } = await import('./services/backup-drive.service');
      void this.injector.get(BackupDriveService).comprobarCopiaMensual();
    }, 2000);
  }

  /** El panel se descarga al abrirlo (no pesa en la carga inicial de la app). */
  async abrirCopiasDrive() {
    const { CopiasDriveDialogComponent } = await import('./shared/copias-drive-dialog/copias-drive-dialog.component');
    this.dialog.open(CopiasDriveDialogComponent, { width: '560px', maxWidth: '95vw', maxHeight: '90vh' });
  }

  abrirConfiguracion() {
    this.dialog.open(ConfiguracionVisualComponent, {
      width: '350px'
    });
  }
  abrirGuia() {
    this.dialog.open(GuiaUsoDialogComponent, {
      width: '900px',
      maxWidth: '95vw',
      maxHeight: '90vh',
      panelClass: 'guia-uso-dialog'
    });
  }
}