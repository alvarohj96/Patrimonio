import { Component, computed, inject, input } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { BarController, BarElement, CategoryScale, Chart, ChartData, ChartOptions, LinearScale, Tooltip } from 'chart.js';
import { SerieDashboard } from '../../../../models/dashboard-patrimonio';
import { DashboardPatrimonioService } from '../../../../services/dashboard-patrimonio.service';
import { PrivacidadService } from '../../../../services/privacidad.service';
import { etiquetaMes, euros, eurosCompactos, porcentaje } from '../../../../shared/formato';
import { TOOLTIP_GRAFICO, coloresGrafico } from '../../../../shared/tema-graficos';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

const COLOR_POSITIVO = '#10b981';
const COLOR_NEGATIVO = '#f43f5e';

/** Fila 4 · Variación neta mensual: meses en positivo frente a meses en negativo. */
@Component({
  selector: 'app-consistencia-ahorro',
  standalone: true,
  imports: [BaseChartDirective],
  templateUrl: './consistencia-ahorro.component.html',
  styleUrl: './consistencia-ahorro.component.scss'
})
export class ConsistenciaAhorroComponent {
  private readonly calculo = inject(DashboardPatrimonioService);
  private readonly privacidad = inject(PrivacidadService);
  private readonly colores = coloresGrafico();

  readonly serie = input.required<SerieDashboard>();

  protected readonly consistencia = computed(() => this.calculo.consistencia(this.serie()));

  protected readonly resumen = computed(() => {
    const { puntos, positivos } = this.consistencia();
    return `${positivos} de ${puntos.length} meses en positivo (${porcentaje((positivos / puntos.length) * 100, 0)})`;
  });

  protected readonly mayoriaPositiva = computed(() => {
    const { puntos, positivos } = this.consistencia();
    return positivos * 2 >= puntos.length;
  });

  protected readonly datos = computed<ChartData<'bar', number[], string>>(() => {
    const { puntos } = this.consistencia();
    return {
      labels: puntos.map(p => etiquetaMes(p.mes, false)),
      datasets: [{
        label: 'Variación mensual',
        data: puntos.map(p => p.variacion),
        backgroundColor: puntos.map(p => (p.variacion >= 0 ? COLOR_POSITIVO : COLOR_NEGATIVO)),
        borderRadius: 5,
        maxBarThickness: 26
      }]
    };
  });

  protected readonly opciones = computed<ChartOptions<'bar'>>(() => {
    const { texto, rejilla } = this.colores();
    const oculto = this.privacidad.activo();

    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...TOOLTIP_GRAFICO,
          callbacks: {
            title: items => {
              const mes = this.consistencia().puntos[items[0]?.dataIndex ?? 0]?.mes;
              return mes ? etiquetaMes(mes) : '';
            },
            label: ctx => (oculto ? ' Variación: ••••' : ` Variación: ${euros(ctx.parsed.y ?? 0, { signo: true })}`)
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: texto, font: { size: 11 } }
        },
        y: {
          grid: { color: rejilla },
          border: { display: false },
          ticks: {
            color: texto,
            font: { size: 11 },
            callback: valor => (oculto ? '•••' : eurosCompactos(Number(valor), true))
          }
        }
      }
    };
  });
}
