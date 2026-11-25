import { Component, computed, inject, input, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { BaseChartDirective } from 'ng2-charts';
import {
  CategoryScale,
  Chart,
  ChartConfiguration,
  ChartOptions,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  Plugin,
  PointElement,
  Tooltip
} from 'chart.js';
import { EstrategiaInmueble, TrayectoriaPlan, VistaGrafico } from '../../../../models/plan-desinversion';
import { PlanDesinversionService } from '../../../../services/plan-desinversion.service';
import { euros, eurosCompactos } from '../../../../shared/formato';
import { TOOLTIP_GRAFICO, coloresGrafico } from '../../../../shared/tema-graficos';

Chart.register(Filler, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);

const COLOR_VENDER = '#7c3aed';
const COLOR_MANTENER = '#14b8a6';

interface PlanVista {
  id: EstrategiaInmueble;
  nombre: string;
  color: string;
  tray: TrayectoriaPlan;
}

interface MarcaVenta {
  /** Posición (años desde hoy) en el eje X */
  indice: number;
  etiqueta: string;
  detalle: string;
}

/**
 * Bloque 3 · Trayectoria de la desinversión: patrimonio líquido vs patrimonio total año a año,
 * comparando «vender el inmueble en el año X» con «mantenerlo».
 */
@Component({
  selector: 'app-grafico-trayectoria',
  standalone: true,
  imports: [MatIconModule, BaseChartDirective],
  templateUrl: './grafico-trayectoria.component.html',
  styleUrl: './grafico-trayectoria.component.scss'
})
export class GraficoTrayectoriaComponent {
  private readonly calculo = inject(PlanDesinversionService);
  private readonly colores = coloresGrafico();

  readonly mantener = input.required<TrayectoriaPlan>();
  /** `null` si no hay activos indivisibles: solo existe el plan sin venta */
  readonly vender = input.required<TrayectoriaPlan | null>();
  /** Estrategia elegida por el usuario («tu plan») */
  readonly estrategia = input.required<EstrategiaInmueble>();
  readonly anioActual = input.required<number>();
  readonly valoresReales = input.required<boolean>();

  readonly cambioReales = output<boolean>();

  protected readonly vista = signal<VistaGrafico>('comparar');
  protected readonly euros = euros;

  protected fijarVista(v: VistaGrafico) {
    this.vista.set(v);
  }

  // ------------------------------------------------------
  // Planes dibujados
  // ------------------------------------------------------
  private readonly planes = computed<PlanVista[]>(() => {
    const mantener = this.mantener();
    const vender = this.vender();
    const anio = this.anioActual();

    if (!vender) return [{ id: 'mantener', nombre: 'Patrimonio', color: COLOR_MANTENER, tray: mantener }];

    const planVender: PlanVista = {
      id: 'vender',
      nombre: vender.venta ? `Vendiendo en ${anio + vender.venta.anio}` : 'Vendiendo el inmueble',
      color: COLOR_VENDER,
      tray: vender
    };
    const planMantener: PlanVista = { id: 'mantener', nombre: 'Manteniendo el inmueble', color: COLOR_MANTENER, tray: mantener };

    if (this.vista() === 'comparar') return [planVender, planMantener];
    return [this.estrategia() === 'vender' ? planVender : planMantener];
  });

  protected readonly hayComparativa = computed(() => this.vender() !== null);

  /** Línea vertical del año de la venta (solo si el plan con venta está en pantalla). */
  private readonly marcaVenta = computed<MarcaVenta | null>(() => {
    const plan = this.planes().find(p => p.id === 'vender');
    const venta = plan?.tray.venta;
    if (!plan || !venta) return null;

    const fila = plan.tray.filas[venta.anio];
    const neto = this.calculo.enModo(venta.neto, fila, this.valoresReales());
    return {
      indice: venta.anio,
      etiqueta: `Venta ${this.anioActual() + venta.anio}`,
      detalle: `Venta del inmueble: ${euros(neto, { signo: true })} de liquidez neta`
    };
  });

  // ------------------------------------------------------
  // Gráfico
  // ------------------------------------------------------
  protected readonly datos = computed<ChartConfiguration<'line'>['data']>(() => {
    const real = this.valoresReales();
    const planes = this.planes();
    const solo = planes.length === 1;
    const conInmuebles = this.vender() !== null;
    const marca = this.marcaVenta();
    const anio = this.anioActual();
    const filas = planes[0].tray.filas;

    const serie = (t: TrayectoriaPlan, valor: (f: TrayectoriaPlan['filas'][number]) => number) =>
      t.filas.map(f => this.calculo.enModo(valor(f), f, real));

    const datasets: ChartConfiguration<'line'>['data']['datasets'] = [];
    for (const p of planes) {
      const sufijo = conInmuebles ? ` · ${p.nombre.toLowerCase()}` : '';
      const esVenta = p.id === 'vender';

      datasets.push({
        label: conInmuebles ? `Líquido${sufijo}` : 'Patrimonio líquido',
        data: serie(p.tray, f => f.liquido),
        borderColor: p.color,
        backgroundColor: p.color + '26',
        borderWidth: 3,
        fill: solo,
        tension: 0.2,
        pointRadius: ctx => (esVenta && marca && ctx.dataIndex === marca.indice ? 6 : 0),
        pointBackgroundColor: p.color,
        pointHoverRadius: 5,
        order: 1
      });

      if (conInmuebles) {
        datasets.push({
          label: `Total${sufijo}`,
          data: serie(p.tray, f => f.total),
          borderColor: p.color,
          borderDash: [6, 4],
          borderWidth: 1.75,
          fill: false,
          tension: 0.2,
          pointRadius: 0,
          pointHoverRadius: 4,
          order: 2
        });
      }
    }

    return { labels: filas.map(f => String(anio + f.anio)), datasets };
  });

  /** Dibuja la línea vertical y la etiqueta del año de venta. */
  protected readonly plugins: Plugin<'line'>[] = [{
    id: 'marcaVenta',
    afterDatasetsDraw: chart => {
      const marca = this.marcaVenta();
      if (!marca) return;

      const x = chart.scales['x'].getPixelForValue(marca.indice);
      const { top, bottom, right } = chart.chartArea;
      const ctx = chart.ctx;

      ctx.save();
      ctx.strokeStyle = COLOR_VENDER;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = COLOR_VENDER;
      ctx.font = '600 12px Roboto, sans-serif';
      const ancho = ctx.measureText(marca.etiqueta).width;
      const alinearDerecha = x + ancho + 12 > right;
      ctx.textAlign = alinearDerecha ? 'right' : 'left';
      ctx.fillText(marca.etiqueta, alinearDerecha ? x - 6 : x + 6, top + 14);
      ctx.restore();
    }
  }];

  protected readonly opciones = computed<ChartOptions<'line'>>(() => {
    const c = this.colores();
    const marca = this.marcaVenta();

    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400, easing: 'easeInOutQuart' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { usePointStyle: true, boxWidth: 8, color: c.texto, font: { size: 12 } }
        },
        tooltip: {
          ...TOOLTIP_GRAFICO,
          bodySpacing: 6,
          itemSort: (a, b) => (b.parsed.y ?? 0) - (a.parsed.y ?? 0),
          callbacks: {
            title: items => {
              const i = items[0]?.dataIndex ?? 0;
              return i === 0 ? `Hoy (${items[0].label})` : `Año ${i} · ${items[0].label}`;
            },
            label: ctx => ` ${ctx.dataset.label}: ${euros(ctx.parsed.y ?? 0)}`,
            afterBody: items => (marca && items[0]?.dataIndex === marca.indice ? ['', marca.detalle] : [])
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: c.texto, font: { size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 }
        },
        y: {
          grid: { color: c.rejilla, lineWidth: 1 },
          border: { display: false },
          beginAtZero: true,
          ticks: { color: c.texto, font: { size: 11 }, callback: v => eurosCompactos(Number(v)) }
        }
      }
    };
  });

  protected readonly descripcion = computed(() => {
    const nombres = this.planes().map(p => p.nombre.toLowerCase()).join(' y ');
    return `Gráfico de líneas con la evolución anual del patrimonio líquido y total: ${nombres}.`;
  });

  // ------------------------------------------------------
  // Comparativa final
  // ------------------------------------------------------
  protected readonly resumen = computed(() => {
    const real = this.valoresReales();
    const anio = this.anioActual();
    const vender = this.vender();
    const planes: PlanVista[] = vender
      ? [
          {
            id: 'vender',
            nombre: vender.venta ? `Vendiendo en ${anio + vender.venta.anio}` : 'Vendiendo el inmueble',
            color: COLOR_VENDER,
            tray: vender
          },
          { id: 'mantener', nombre: 'Manteniendo el inmueble', color: COLOR_MANTENER, tray: this.mantener() }
        ]
      : [{ id: 'mantener', nombre: 'Tu plan', color: COLOR_MANTENER, tray: this.mantener() }];

    return planes.map(p => {
      const ultima = p.tray.filas[p.tray.filas.length - 1];
      const venta = p.tray.venta;
      return {
        id: p.id,
        nombre: p.nombre,
        color: p.color,
        suyo: !vender || p.id === this.estrategia(),
        liquido: this.calculo.enModo(ultima.liquido, ultima, real),
        total: this.calculo.enModo(ultima.total, ultima, real),
        cobertura: p.tray.anioDeficit === null ? 'Cubre todo el horizonte' : `Se agota en ${anio + p.tray.anioDeficit}`,
        cubre: p.tray.anioDeficit === null,
        costeVenta: venta ? this.calculo.enModo(venta.costes, p.tray.filas[venta.anio], real) : null
      };
    });
  });
}
