import { Component, input, output } from '@angular/core';

export interface ChipOpcion {
  id: string;
  etiqueta: string;
  /** Color del punto y del estado activo; sin color se usa el acento. */
  color?: string;
}

/**
 * Fila de chips con estado activo. Solo pinta y emite el id pulsado: quien lo usa decide si
 * la selección es única (donut) o múltiple (evolución). Admite botones de acción proyectados.
 */
@Component({
  selector: 'app-chips-categoria',
  standalone: true,
  templateUrl: './chips-categoria.component.html',
  styleUrl: './chips-categoria.component.scss'
})
export class ChipsCategoriaComponent {
  readonly opciones = input.required<readonly ChipOpcion[]>();
  readonly activos = input.required<ReadonlySet<string>>();
  readonly etiqueta = input('');
  readonly seleccion = output<string>();
}
