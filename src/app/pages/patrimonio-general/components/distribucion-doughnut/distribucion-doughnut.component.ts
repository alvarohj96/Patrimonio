import { Component, computed, inject, input } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { ArcElement, Chart, ChartData, ChartOptions, DoughnutController, Legend, Tooltip } from 'chart.js';
import { FilaCategoria } from '../../../../models/dashboard-patrimonio';
import { PrivacidadService } from '../../../../services/privacidad.service';
import { euros, porcentaje } from '../../../../shared/formato';
import { TOOLTIP_GRAFICO, coloresGrafico } from '../../../../shared/tema-graficos';

Chart.register(ArcElement, DoughnutController, Tooltip, Legend);

/** Fila 2 · Distribución actual del patrimonio por categorías. */
@Component({
  selector: 'app-distribucion-doughnut',
  standalone: true,
  imports: [BaseChartDirective],
  templateUrl: './distribucion-doughnut.component.html',
  styleUrl: './distribucion-doughnut.component.scss'
})
export class DistribucionDoughnutComponent {
  private readonly privacidad = inject(PrivacidadService);
  private readonly colores = coloresGrafico();

  readonly filas = input.required<readonly FilaCategoria[]>();
  readonly total = input.required<number>();

  protected readonly euros = euros;
  protected readonly porcentaje = porcentaje;

  /** Un sector no puede ser negativo: solo se dibujan las categorías con valor positivo. */
  protected readonly visibles = computed(() => this.filas().filter(f => f.valor > 0));

  protected readonly datos = computed<ChartData<'doughnut', number[], string>>(() => ({
    labels: this.visibles().map(f => f.nombre),
    datasets: [{
      data: this.visibles().map(f => f.valor),
      backgroundColor: this.visibles().map(f => f.color),
      borderColor: this.colores().superficie,
      borderWidth: 3,
      hoverOffset: 6
    }]
  }));

  protected readonly opciones = computed<ChartOptions<'doughnut'>>(() => {
    const oculto = this.privacidad.activo();
    const filas = this.visibles();

    return {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: { display: false },
        tooltip: {
          ...TOOLTIP_GRAFICO,
          callbacks: {
            label: ctx => {
              if (oculto) return ` ${ctx.label}: ••••`;
              const fila = filas[ctx.dataIndex];
              return fila ? ` ${ctx.label}: ${euros(fila.valor)} (${porcentaje(fila.porcentaje)})` : ` ${ctx.label}`;
            }
          }
        }
      }
    };
  });
}
