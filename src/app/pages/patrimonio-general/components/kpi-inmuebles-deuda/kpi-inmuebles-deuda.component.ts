import { Component, computed, input } from '@angular/core';
import { ResumenInmuebles } from '../../../../models/dashboard-patrimonio';
import { euros, porcentaje } from '../../../../shared/formato';

/** Fila 1 · Inmuebles: valor bruto frente a deuda y equity neto. */
@Component({
  selector: 'app-kpi-inmuebles-deuda',
  standalone: true,
  templateUrl: './kpi-inmuebles-deuda.component.html',
  styleUrl: './kpi-inmuebles-deuda.component.scss'
})
export class KpiInmueblesDeudaComponent {
  /** `null` si no hay inmuebles registrados. */
  readonly inmuebles = input.required<ResumenInmuebles | null>();

  protected readonly euros = euros;
  protected readonly porcentaje = porcentaje;

  /** Peso de la deuda y del equity sobre el valor bruto, acotados a 0-100 para la barra. */
  protected readonly pesoDeuda = computed(() => {
    const i = this.inmuebles();
    return i && i.bruto > 0 ? Math.max(0, Math.min(100, (i.deuda / i.bruto) * 100)) : 0;
  });
  protected readonly pesoEquity = computed(() => 100 - this.pesoDeuda());
}
