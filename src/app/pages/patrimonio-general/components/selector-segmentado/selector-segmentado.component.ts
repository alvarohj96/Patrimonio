import { Component, input, output } from '@angular/core';

export interface OpcionSegmentada<T extends string> {
  valor: T;
  etiqueta: string;
}

/** Conmutador de opciones excluyentes (estilo «pastilla»). */
@Component({
  selector: 'app-selector-segmentado',
  standalone: true,
  templateUrl: './selector-segmentado.component.html',
  styleUrl: './selector-segmentado.component.scss'
})
export class SelectorSegmentadoComponent<T extends string> {
  readonly opciones = input.required<readonly OpcionSegmentada<T>[]>();
  readonly valor = input.required<T>();
  readonly etiqueta = input('');
  readonly cambio = output<T>();
}
