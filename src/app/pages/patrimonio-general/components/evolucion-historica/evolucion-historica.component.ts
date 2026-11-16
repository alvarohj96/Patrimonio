import { Component, computed, inject, input } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import {
  BarController, BarElement, CategoryScale, Chart, ChartData, ChartOptions, Legend,
  LineController, LineElement, LinearScale, PointElement, Tooltip
} from 'chart.js';
import { RangoEvolucion, SerieDashboard, TipoGraficoEvolucion } from '../../../../models/dashboard-patrimonio';
import { DashboardPatrimonioService } from '../../../../services/dashboard-patrimonio.service';
import { DashboardPreferenciasService } from '../../../../services/dashboard-preferencias.service';
import { PrivacidadService } from '../../../../services/privacidad.service';
import { etiquetaMes, euros, eurosCompactos } from '../../../../shared/formato';
import { TOOLTIP_GRAFICO, coloresGrafico } from '../../../../shared/tema-graficos';
import { OpcionSegmentada, SelectorSegmentadoComponent } from '../selector-segmentado/selector-segmentado.component';

Chart.register(BarController, BarElement, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);

const OPCIONES_RANGO: readonly OpcionSegmentada<RangoEvolucion>[] = [
  { valor: '6M', etiqueta: '6M' },
  { valor: '1A', etiqueta: '1A' },
  { valor: 'ALL', etiqueta: 'Todo' }
];

/** Fila 3 · Evolución histórica por categoría (barras apiladas o líneas) con filtro temporal. */
@Component({
  selector: 'app-evolucion-historica',
  standalone: true,
  imports: [BaseChartDirective, SelectorSegmentadoComponent],
  templateUrl: './evolucion-historica.component.html',
  styleUrl: './evolucion-historica.component.scss'
})
export class EvolucionHistoricaComponent {
  private readonly calculo = inject(DashboardPatrimonioService);
  private readonly privacidad = inject(PrivacidadService);
  private readonly colores = coloresGrafico();
  protected readonly prefs = inject(DashboardPreferenciasService);

  readonly serie = input.required<SerieDashboard>();
  /** Permite ocultar una de las dos vistas desde «Configuración visual». */
  readonly permitirBarras = input(true);
  readonly permitirLineas = input(true);

  protected readonly opcionesRango = OPCIONES_RANGO;

  protected readonly opcionesTipo = computed<readonly OpcionSegmentada<TipoGraficoEvolucion>[]>(() => [
    ...(this.permitirBarras() ? [{ valor: 'barras' as const, etiqueta: 'Barras apiladas' }] : []),
    ...(this.permitirLineas() ? [{ valor: 'lineas' as const, etiqueta: 'Líneas' }] : [])
  ]);

  /** Tipo mostrado: el elegido, salvo que la configuración visual lo haya desactivado. */
  protected readonly tipo = computed<TipoGraficoEvolucion>(() => {
    const elegido = this.prefs.tipoEvolucion();
    if (elegido === 'barras' && !this.permitirBarras() && this.permitirLineas()) return 'lineas';
    if (elegido === 'lineas' && !this.permitirLineas() && this.permitirBarras()) return 'barras';
    return elegido;
  });

  protected readonly subtitulo = computed(() =>
    this.tipo() === 'barras'
      ? 'Patrimonio acumulado mes a mes en barras apiladas'
      : 'Evolución individual por categoría en gráfico de líneas');

  private readonly puntos = computed(() => this.calculo.recortar(this.serie(), this.prefs.rangoEvolucion()));
  protected readonly hayDatos = computed(() => this.puntos().length > 0);

  private readonly etiquetas = computed(() => this.puntos().map(p => etiquetaMes(p.mes)));

  protected readonly datosBarras = computed<ChartData<'bar', number[], string>>(() => ({
    labels: this.etiquetas(),
    datasets: this.serie().categorias.map(c => ({
      label: c.nombre,
      data: this.puntos().map(p => p.valores[c.nombre]),
      backgroundColor: c.color,
      borderRadius: 4,
      maxBarThickness: 48
    }))
  }));

  protected readonly datosLineas = computed<ChartData<'line', number[], string>>(() => ({
    labels: this.etiquetas(),
    datasets: this.serie().categorias.map(c => ({
      label: c.nombre,
      data: this.puntos().map(p => p.valores[c.nombre]),
      borderColor: c.color,
      backgroundColor: c.color,
      borderWidth: 2.5,
      tension: 0.35,
      pointRadius: 3,
      pointHoverRadius: 5
    }))
  }));

  protected readonly opcionesBarras = computed<ChartOptions<'bar'>>(() => this.opciones(true));
  protected readonly opcionesLineas = computed<ChartOptions<'line'>>(() => this.opciones(false));

  private opciones(apilado: boolean): ChartOptions<'bar'> & ChartOptions<'line'> {
    const { texto, rejilla } = this.colores();
    const oculto = this.privacidad.activo();

    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            usePointStyle: true,
            pointStyle: 'circle',
            color: texto,
            font: { size: 11, weight: 600 }
          }
        },
        tooltip: {
          ...TOOLTIP_GRAFICO,
          callbacks: {
            label: ctx => (oculto ? ` ${ctx.dataset.label}: ••••` : ` ${ctx.dataset.label}: ${euros(ctx.parsed.y ?? 0)}`)
          }
        }
      },
      scales: {
        x: {
          stacked: apilado,
          grid: { display: false },
          ticks: { color: texto, font: { size: 11 }, maxRotation: 45 }
        },
        y: {
          stacked: apilado,
          grid: { color: rejilla },
          border: { display: false },
          ticks: {
            color: texto,
            font: { size: 11 },
            callback: valor => (oculto ? '•••' : eurosCompactos(Number(valor)))
          }
        }
      }
    };
  }
}
