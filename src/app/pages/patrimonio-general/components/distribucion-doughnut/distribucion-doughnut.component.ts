import { Component, computed, inject, input, signal } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { ArcElement, Chart, ChartData, ChartOptions, DoughnutController, Legend, Tooltip } from 'chart.js';
import { FilaCategoria, SubcategoriasPorCategoria } from '../../../../models/dashboard-patrimonio';
import { PrivacidadService } from '../../../../services/privacidad.service';
import { euros, porcentaje } from '../../../../shared/formato';
import { TOOLTIP_GRAFICO, coloresGrafico } from '../../../../shared/tema-graficos';
import { ChipOpcion, ChipsCategoriaComponent } from '../chips-categoria/chips-categoria.component';

Chart.register(ArcElement, DoughnutController, Tooltip, Legend);

/** Un sector del donut: una categoría (vista global) o una subcategoría (detalle). */
interface SectorDonut {
  nombre: string;
  color: string;
  valor: number;
  /** Peso sobre el total que se está mostrando (0-100). */
  porcentaje: number;
}

const ID_GLOBAL = '__global__';

/** Fila 2 · Distribución actual del patrimonio por categorías, con detalle por subcategorías. */
@Component({
  selector: 'app-distribucion-doughnut',
  standalone: true,
  imports: [BaseChartDirective, ChipsCategoriaComponent],
  templateUrl: './distribucion-doughnut.component.html',
  styleUrl: './distribucion-doughnut.component.scss'
})
export class DistribucionDoughnutComponent {
  private readonly privacidad = inject(PrivacidadService);
  private readonly colores = coloresGrafico();

  readonly filas = input.required<readonly FilaCategoria[]>();
  readonly total = input.required<number>();
  /** Subcategorías del último mes por categoría, para el detalle al elegir una categoría. */
  readonly subcategorias = input<SubcategoriasPorCategoria>({});

  protected readonly euros = euros;
  protected readonly porcentaje = porcentaje;

  /** `null` = vista global. */
  private readonly seleccion = signal<string | null>(null);

  /** Categorías con alguna subcategoría de valor positivo que mostrar. */
  private readonly categoriasConDetalle = computed(() =>
    this.filas().filter(f => (this.subcategorias()[f.nombre]?.length ?? 0) > 0));

  /** La categoría elegida, o `null` si no existe ya (p. ej. cambió el mes) o se vuelve a la vista global. */
  protected readonly categoriaActiva = computed(() => {
    const elegida = this.seleccion();
    return elegida && this.categoriasConDetalle().some(f => f.nombre === elegida) ? elegida : null;
  });

  protected readonly opcionesChips = computed<readonly ChipOpcion[]>(() => [
    { id: ID_GLOBAL, etiqueta: 'Global' },
    ...this.categoriasConDetalle().map(f => ({ id: f.nombre, etiqueta: f.nombre, color: f.color }))
  ]);

  protected readonly chipsActivos = computed<ReadonlySet<string>>(() => new Set([this.categoriaActiva() ?? ID_GLOBAL]));

  /** Un sector no puede ser negativo: solo se dibujan los de valor positivo. */
  protected readonly sectores = computed<readonly SectorDonut[]>(() => {
    const activa = this.categoriaActiva();
    return activa
      ? (this.subcategorias()[activa] ?? [])
      : this.filas().filter(f => f.valor > 0);
  });

  protected readonly totalCentro = computed(() =>
    this.categoriaActiva() ? this.sectores().reduce((suma, s) => suma + s.valor, 0) : this.total());

  protected readonly subtitulo = computed(() => {
    const activa = this.categoriaActiva();
    return activa ? `Subcategorías de ${activa}` : 'Peso actual sobre el patrimonio neto';
  });

  protected elegir(id: string) {
    this.seleccion.set(id === ID_GLOBAL ? null : id);
  }

  protected readonly datos = computed<ChartData<'doughnut', number[], string>>(() => ({
    labels: this.sectores().map(s => s.nombre),
    datasets: [{
      data: this.sectores().map(s => s.valor),
      backgroundColor: this.sectores().map(s => s.color),
      borderColor: this.colores().superficie,
      borderWidth: 3,
      hoverOffset: 6
    }]
  }));

  protected readonly opciones = computed<ChartOptions<'doughnut'>>(() => {
    const oculto = this.privacidad.activo();
    const sectores = this.sectores();

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
              const sector = sectores[ctx.dataIndex];
              return sector ? ` ${ctx.label}: ${euros(sector.valor)} (${porcentaje(sector.porcentaje)})` : ` ${ctx.label}`;
            }
          }
        }
      }
    };
  });
}
