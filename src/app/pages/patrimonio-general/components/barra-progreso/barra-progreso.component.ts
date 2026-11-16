import { Component, computed, input } from '@angular/core';

export type GrosorBarra = 'fina' | 'normal' | 'gruesa';

/** Barra de progreso accesible (0-100 %). */
@Component({
  selector: 'app-barra-progreso',
  standalone: true,
  templateUrl: './barra-progreso.component.html',
  styleUrl: './barra-progreso.component.scss'
})
export class BarraProgresoComponent {
  readonly porcentaje = input.required<number>();
  /** Cualquier valor CSS de fondo (color o degradado). */
  readonly color = input('var(--dash-acento)');
  readonly etiqueta = input('');
  readonly grosor = input<GrosorBarra>('normal');
  /** Versión atenuada, para el valor de referencia («antes») de una comparación. */
  readonly tenue = input(false);

  protected readonly ancho = computed(() => {
    const p = this.porcentaje();
    return Number.isFinite(p) ? Math.max(0, Math.min(100, p)) : 0;
  });
}
