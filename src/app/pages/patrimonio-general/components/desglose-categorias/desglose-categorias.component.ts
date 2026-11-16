import { Component, input } from '@angular/core';
import { FilaCategoria } from '../../../../models/dashboard-patrimonio';
import { etiquetaMes, euros, porcentaje } from '../../../../shared/formato';
import { BarraProgresoComponent } from '../barra-progreso/barra-progreso.component';

/** Fila 2 · Desglose del último mes (valor y variación) y progreso hacia la meta de cada categoría. */
@Component({
  selector: 'app-desglose-categorias',
  standalone: true,
  imports: [BarraProgresoComponent],
  templateUrl: './desglose-categorias.component.html',
  styleUrl: './desglose-categorias.component.scss'
})
export class DesgloseCategoriasComponent {
  readonly filas = input.required<readonly FilaCategoria[]>();
  /** Último mes registrado (`YYYY-MM`). */
  readonly mes = input.required<string>();
  /** Mes anterior (`YYYY-MM`) o `null` si solo hay un mes. */
  readonly mesAnterior = input<string | null>(null);

  protected readonly euros = euros;
  protected readonly porcentaje = porcentaje;
  protected readonly etiquetaMes = etiquetaMes;
}
