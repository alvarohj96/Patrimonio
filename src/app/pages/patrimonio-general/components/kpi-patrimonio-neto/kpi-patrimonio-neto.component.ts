import { Component, computed, input } from '@angular/core';
import { ResumenMes } from '../../../../models/dashboard-patrimonio';
import { euros, porcentaje } from '../../../../shared/formato';

type Tendencia = 'sube' | 'baja' | 'igual';

/** Fila 1 · Patrimonio neto, variación del último mes y mayores movimientos. */
@Component({
  selector: 'app-kpi-patrimonio-neto',
  standalone: true,
  templateUrl: './kpi-patrimonio-neto.component.html',
  styleUrl: './kpi-patrimonio-neto.component.scss'
})
export class KpiPatrimonioNetoComponent {
  readonly resumen = input.required<ResumenMes>();

  protected readonly euros = euros;
  protected readonly porcentaje = porcentaje;

  protected readonly tendencia = computed<Tendencia>(() => {
    const v = this.resumen().variacion;
    return v > 0 ? 'sube' : v < 0 ? 'baja' : 'igual';
  });

  protected readonly simbolo = computed(() => ({ sube: '▲', baja: '▼', igual: '■' }[this.tendencia()]));
}
