import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { BackupDriveService } from '../../services/backup-drive.service';

/** Aviso no intrusivo (franja bajo la barra) cuando la copia mensual necesita un clic del usuario. */
@Component({
  selector: 'app-aviso-copia-drive',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  template: `
    @if (backup.aviso(); as aviso) {
      <div class="aviso" role="status" aria-live="polite">
        <mat-icon aria-hidden="true">cloud_upload</mat-icon>
        <span class="texto">{{ error() ?? aviso.mensaje }}</span>
        <span class="botones">
          <button mat-flat-button type="button" (click)="copiar()" [disabled]="backup.trabajando()">Copiar ahora</button>
          <button mat-button type="button" (click)="configurar()">Configurar</button>
          <button mat-icon-button type="button" aria-label="Ahora no" (click)="descartar()">
            <mat-icon>close</mat-icon>
          </button>
        </span>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }

    .aviso {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px 12px;
      padding: 8px 16px;
      font-size: 13.5px;
      color: var(--app-text);
      background: color-mix(in srgb, #f59e0b 16%, var(--card-bg, #fff));
      border-bottom: 1px solid color-mix(in srgb, #f59e0b 40%, transparent);
    }

    mat-icon { flex-shrink: 0; color: #d97706; }

    .texto { flex: 1 1 260px; min-width: 0; }

    .botones { display: inline-flex; align-items: center; gap: 4px; margin-left: auto; }

    @media (max-width: 600px) {
      .aviso { padding: 8px 12px; }
      .botones { width: 100%; justify-content: flex-end; }
    }
  `]
})
export class AvisoCopiaDriveComponent {

  protected readonly backup = inject(BackupDriveService);
  private readonly dialog = inject(MatDialog);

  /** Resultado del último intento desde este aviso (sustituye al texto del aviso) */
  protected readonly error = signal<string | null>(null);

  protected async copiar() {
    this.error.set(null);
    const r = await this.backup.hacerCopiaMensualAhora();
    if (!r.ok) this.error.set(r.error?.mensaje ?? null);
  }

  protected async configurar() {
    const { CopiasDriveDialogComponent } = await import('../copias-drive-dialog/copias-drive-dialog.component');
    this.dialog.open(CopiasDriveDialogComponent, { width: '560px', maxWidth: '95vw', maxHeight: '90vh' });
  }

  protected descartar() {
    this.error.set(null);
    this.backup.descartarAviso();
  }
}
