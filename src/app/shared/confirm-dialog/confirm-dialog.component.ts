import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="dialog-container">
      <mat-icon class="warning-icon">warning</mat-icon>

      <h2 class="dialog-title">Confirmar eliminación</h2>

      <p class="dialog-message">
        {{ data.mensaje }}
      </p>

      <div class="dialog-actions">
        <button mat-raised-button (click)="dialogRef.close(false)">Cancelar</button>
        <button mat-raised-button (click)="dialogRef.close(true)">Eliminar</button>
      </div>
    </div>
  `,
  styles: [`
    .dialog-container {
      padding: 20px;
      text-align: center;
      background-color: var(--card-bg);
    }

    .warning-icon {
      font-size: 48px;
      color: #e53935;
      margin-bottom: 10px;
    }

    .dialog-title {
      margin: 0;
      font-weight: 600;
    }

    .dialog-message {
      margin: 15px 0 25px;
      font-size: 16px;
    }

    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      button {
        background-color: var(--card-bg);
        border: 1px solid #e0e0e0;
      }
    }
  `]
})
export class ConfirmDialogComponent {
  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef: MatDialogRef<ConfirmDialogComponent>
  ) { }
}
