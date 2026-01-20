import { Component } from '@angular/core';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog'; // Añade MatDialogModule
import { MatSlideToggleModule } from '@angular/material/slide-toggle'; // Añade MatSlideToggleModule
import { MatButtonModule } from '@angular/material/button'; // Añade MatButtonModule
import { FormsModule } from '@angular/forms'; // Necesario para [(ngModel)]
import { UiConfigService } from '../../services/ui-config.service';

@Component({
  selector: 'app-configuracion-visual',
  imports: [
    MatDialogModule,
    MatSlideToggleModule,
    MatButtonModule,
    FormsModule
  ],
  template: `
  <div class="objetivos">
    <h2 class="titulo" mat-dialog-title>⚙️ Configuración visual</h2>

<mat-dialog-content class="contenido">

  <mat-slide-toggle
    [checked]="ui.value.mostrarObjetivos"
    (change)="toggleObjetivos($event.checked)">
    Mostrar objetivos financieros
  </mat-slide-toggle>

  <mat-slide-toggle
    [checked]="ui.value.mostrarBarras"
    (change)="toggleBarras($event.checked)">
    Mostrar gráfico de barras
  </mat-slide-toggle>

  <mat-slide-toggle
    [checked]="ui.value.mostrarLineas"
    (change)="toggleLineas($event.checked)">
    Mostrar gráfico de líneas
  </mat-slide-toggle>

</mat-dialog-content>

<mat-dialog-actions align="end">
  <button mat-button (click)="cerrar()">Cerrar</button>
</mat-dialog-actions>
  </div>
  `,
  styleUrl: './configuracion-visual.scss'
})
export class ConfiguracionVisualComponent {

  config: any;

  constructor(
    public ui: UiConfigService,
    private dialogRef: MatDialogRef<ConfiguracionVisualComponent>
  ) {
    this.config = { ...this.ui.value };
  }

  toggleObjetivos(value: boolean) {
    this.ui.update({ mostrarObjetivos: value });
  }

  toggleBarras(value: boolean) {
    this.ui.update({ mostrarBarras: value });
  }

  toggleLineas(value: boolean) {
    this.ui.update({ mostrarLineas: value });
  }

  cerrar() {
    this.dialogRef.close();
  }
}
