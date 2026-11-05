import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

/** `titulo` y `confirmar` son opcionales: sin ellos se mantiene el aspecto de «Confirmar eliminación». */
export interface ConfirmDialogData {
  mensaje: string;
  titulo?: string;
  confirmar?: string;
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="dialog-container">
      <span class="warning-icon"><mat-icon aria-hidden="true">delete_outline</mat-icon></span>

      <h2 class="dialog-title" mat-dialog-title>{{ data.titulo || 'Confirmar eliminación' }}</h2>

      <p class="dialog-message">{{ data.mensaje }}</p>

      <div class="dialog-actions">
        <button mat-button type="button" cdkFocusInitial (click)="dialogRef.close(false)">Cancelar</button>
        <button mat-flat-button type="button" class="btn-peligro" (click)="dialogRef.close(true)">
          {{ data.confirmar || 'Eliminar' }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .dialog-container {
      display: grid;
      justify-items: center;
      padding: 24px 24px 20px;
      text-align: center;
      background-color: var(--card-bg);
      color: var(--app-text);
    }

    .warning-icon {
      display: grid;
      place-items: center;
      width: 52px;
      height: 52px;
      margin-bottom: 12px;
      border-radius: 18px;
      color: #dc2626;
      background: color-mix(in srgb, #dc2626 14%, transparent);

      mat-icon {
        width: 28px;
        height: 28px;
        font-size: 28px;
      }
    }

    .dialog-title {
      margin: 0;
      padding: 0;
      font-size: 1.15rem;
      font-weight: 700;
      color: var(--app-text);

      &::before { display: none; }
    }

    .dialog-message {
      margin: 10px 0 22px;
      font-size: 0.95rem;
      line-height: 1.45;
      opacity: 0.85;
    }

    .dialog-actions {
      display: flex;
      justify-content: center;
      flex-wrap: wrap;
      gap: 10px;
      width: 100%;

      button {
        flex: 1 1 120px;
        min-height: 44px;
        border-radius: 999px;
        font-weight: 600;
      }

      .btn-peligro {
        color: #fff;
        background: #dc2626;
      }
    }

    :host-context(.dark-theme) .dialog-actions button:not(.btn-peligro) {
      color: #93c5fd;
    }
  `]
})
export class ConfirmDialogComponent {
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: ConfirmDialogData,
    public dialogRef: MatDialogRef<ConfirmDialogComponent>
  ) { }
}
