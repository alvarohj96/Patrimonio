import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DecimalPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { BaseChartDirective } from 'ng2-charts';
import { PatrimonioService, RegistroMensual } from '../../services/patrimonio.service';
import { ObjetivosComponent } from '../objetivos/objetivos.component';
import { UiConfigService, UiConfig } from '../../services/ui-config.service';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { Observable } from 'rxjs';
import { FormsModule } from '@angular/forms';

import {
  Chart,
  ArcElement,
  DoughnutController,
  BarController,
  LineController,
  BarElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend
} from 'chart.js';

Chart.register(
  ArcElement,
  DoughnutController,
  BarController,
  LineController,
  BarElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend
);


@Component({
  selector: 'app-patrimonio-general',
  standalone: true,
  imports: [
    CommonModule,
    DecimalPipe,
    MatCardModule,
    MatTableModule,
    BaseChartDirective,
    MatIconModule,
    ObjetivosComponent,
    MatButtonToggleModule,
    FormsModule
  ],
  templateUrl: './patrimonio-general.component.html',
  styleUrls: ['./patrimonio-general.component.scss']
})
export class PatrimonioGeneralComponent implements OnInit, OnDestroy {

  registros: RegistroMensual[] = [];
  datosUltimoMes: { categoria: string; total: number, porcentaje: number, variacion: number }[] = [];
  totalUltimoMes = 0;
  totalMesAnterior = 0;
  variacionAbsoluta = 0;
  variacionPorcentaje = 0;
  tendencia: 'sube' | 'baja' | 'igual' = 'igual';

  colorPalette: string[] = [
    '#1e88e5', // azul
    '#43a047', // verde
    '#e53935', // rojo
    '#fb8c00', // naranja
    '#FFD700',
    '#00897b', // teal
    '#6d4c41', // marrón
    '#3949ab'  // índigo
  ];

  // Gráfico donut (último mes)
  chartLabels: string[] = [];
  chartData: number[] = [];
  chartColors = [{ backgroundColor: ['#1e88e5'] }];

  // Gráfico de barras (acumulado por mes)
  barLabels: string[] = [];
  barData: any = { labels: [], datasets: [] };
  barOptions = {
    responsive: true,
    scales: {
      x: { stacked: true },
      y: { stacked: true }
    }
  };

  doughnutOptions = {
    plugins: {
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const label = context.label || '';
            const value = context.raw || 0;

            // Obtener todos los valores del dataset
            const dataArray = context.chart.data.datasets[0].data;
            const total = dataArray.reduce((a: number, b: number) => a + b, 0);

            // Calcular porcentaje
            const pct = total > 0 ? ((value / total) * 100).toFixed(1) : 0;

            return `${label}: ${value.toLocaleString()} € (${pct}%)`;
          }
        }
      }
    }
  };

  // Gráfico de líneas (evolución por categoría)
  lineLabels: string[] = [];
  lineData: any = { labels: [], datasets: [] };

  sub: any;

  categoriasDisponibles: string[] = [];

  // Selección independiente
  categoriasBarras = new Set<string>();
  categoriasLineas = new Set<string>();
  categoriasSeleccionadas = new Set<string>();

  config$!: Observable<UiConfig>;

  rangoMeses: 12 | 24 | 'all' = 12;

  deudaInmuebles = 0;
  valorBrutoInmuebles = 0;
  valorNetoInmuebles = 0;

  deudaBarData: any;
  deudaBarOptions: any;

  constructor(private patrimonioService: PatrimonioService, private ui: UiConfigService) {
    this.config$ = this.ui.config$;
  }

  ngOnInit(): void {
    this.sub = this.patrimonioService.registros$.subscribe(regs => {
      this.registros = regs || [];
      this.procesarDatos();
    });
  }

  ngOnDestroy(): void {
    if (this.sub) this.sub.unsubscribe();
  }

  // ======================================================
  // Procesamiento general de datos
  // ======================================================
  procesarDatos() {

    if (!this.registros.length) {
      this.datosUltimoMes = [];

      // Donut
      this.chartLabels = [];
      this.chartData = [];

      // Barras
      this.barLabels = [];
      this.barData = { labels: [], datasets: [] };

      // Líneas
      this.lineLabels = [];
      this.lineData = { labels: [], datasets: [] };

      // Variación
      this.totalUltimoMes = 0;
      this.totalMesAnterior = 0;
      this.variacionAbsoluta = 0;
      this.variacionPorcentaje = 0;
      this.tendencia = 'igual';

      return;
    }

    this.categoriasDisponibles = this.obtenerCategoriasGlobales();

    // Inicializar si están vacíos
    if (this.categoriasBarras.size === 0) {
      this.categoriasDisponibles.forEach(c => this.categoriasBarras.add(c));
    }

    if (this.categoriasLineas.size === 0) {
      this.categoriasDisponibles.forEach(c => this.categoriasLineas.add(c));
    }

    this.registros.sort((a, b) => a.mes.localeCompare(b.mes));
    const ultimo = this.registros[this.registros.length - 1];
    const penultimo = this.registros[this.registros.length - 2];

    this.procesarUltimoMes(ultimo, penultimo);
    const anterior = this.registros.length > 1
      ? this.registros[this.registros.length - 2]
      : null;

    if (anterior) {
      this.totalMesAnterior = this.sumarTotalMes(anterior);

      this.variacionAbsoluta = this.totalUltimoMes - this.totalMesAnterior;

      this.variacionPorcentaje =
        this.totalMesAnterior > 0
          ? (this.variacionAbsoluta / this.totalMesAnterior) * 100
          : 0;

      if (this.variacionAbsoluta > 0) this.tendencia = 'sube';
      else if (this.variacionAbsoluta < 0) this.tendencia = 'baja';
      else this.tendencia = 'igual';

    } else {
      this.totalMesAnterior = 0;
      this.variacionAbsoluta = 0;
      this.variacionPorcentaje = 0;
      this.tendencia = 'igual';
    }
    this.procesarBarras();
    this.procesarLineas();
  }

  // ======================================================
  // GRÁFICO DONUT (último mes)
  // ======================================================
  procesarUltimoMes(ultimo: RegistroMensual, penultimo: RegistroMensual) {
    const categorias = Object.keys(ultimo.valores);
    const totalesPorCategoria = categorias.map(cat => {
      const total = this.sumarValoresCategoria(ultimo.valores[cat]);
      const totalPenultimo = this.sumarValoresCategoria(penultimo.valores[cat]);

      return {
        categoria: cat,
        total,
        totalPenultimo
      };
    });

    this.totalUltimoMes = totalesPorCategoria
      .reduce((s, c) => s + c.total, 0);

    const resumen = totalesPorCategoria.map(c => ({
      categoria: c.categoria,
      total: c.total,
      porcentaje: this.totalUltimoMes > 0 ? (c.total / this.totalUltimoMes) * 100 : 0,
      variacion: c.total - c.totalPenultimo
    }));

    this.datosUltimoMes = resumen;

    this.chartLabels = resumen.map(r => r.categoria);
    this.chartData = resumen.map(r => r.total);

    this.chartColors = [{
      backgroundColor: resumen.map(r =>
        this.getColorCategoria(r.categoria)
      )
    }];

    const inmuebles = ultimo.valores['Inmuebles'];

    if (inmuebles) {
      let bruto = 0;
      let deuda = 0;

      Object.values(inmuebles).forEach((v: any) => {
        if (typeof v === 'number') {
          bruto += v;
        } else {
          bruto += v.valor || 0;
          deuda += v.deuda || 0;
        }
      });

      this.valorBrutoInmuebles = bruto;
      this.deudaInmuebles = deuda;
      this.valorNetoInmuebles = bruto - deuda;
    } else {
      this.valorBrutoInmuebles = 0;
      this.deudaInmuebles = 0;
      this.valorNetoInmuebles = 0;
    }

    this.deudaBarData = {
      labels: [''],
      datasets: [
        {
          label: 'Valor neto',
          data: [this.valorNetoInmuebles],
          backgroundColor: '#2e7d32',
          borderRadius: 6
        },
        {
          label: 'Deuda',
          data: [this.deudaInmuebles],
          backgroundColor: '#c62828',
          borderRadius: 6
        }
      ]
    };

    this.deudaBarOptions = {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          stacked: true,
          display: false
        },
        y: {
          stacked: true,
          display: false
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: any) =>
              `${ctx.dataset.label}: ${ctx.raw.toLocaleString()} €`
          }
        }
      }
    };

  }

  // ======================================================
  // GRÁFICO DE BARRAS (totales por mes)
  // ======================================================
  procesarBarras() {
    const registros = this.getRegistrosFiltrados();
    this.barLabels = registros.map(r => r.mes);

    this.barData = {
      labels: this.barLabels,
      datasets: this.categoriasDisponibles
        .filter(cat => this.categoriasBarras.has(cat))
        .map((categoria, idx) => ({
          label: categoria,
          data: registros.map(r =>
            this.sumarValoresCategoria(r.valores[categoria])
          ),
          backgroundColor: this.getColorCategoria(categoria),
          animation: { duration: 700, easing: 'easeInOutQuart' }
        }))
    };
  }

  // ======================================================
  // GRÁFICO DE LÍNEAS (evolución por categoría)
  // ======================================================
  procesarLineas() {
    const registros = this.getRegistrosFiltrados();
    this.lineLabels = registros.map(r => r.mes);

    this.lineData = {
      labels: this.lineLabels,
      datasets: this.categoriasDisponibles
        .filter(cat => this.categoriasLineas.has(cat))
        .map((categoria, idx) => ({
          label: categoria,
          data: registros.map(r =>
            this.sumarValoresCategoria(r.valores[categoria])
          ),
          borderColor: this.getColorCategoria(categoria),
          tension: 0.3,
          fill: false,
          animation: {
            duration: 700,
            easing: 'easeInOutQuart'
          }
        }))
    };
  }

  // ======================================================
  // Utilidades
  // ======================================================
  obtenerCategoriasGlobales(): string[] {
    const set = new Set<string>();
    this.registros.forEach(r => {
      Object.keys(r.valores).forEach(cat => set.add(cat));
    });
    return Array.from(set);
  }

  sumarCategoria(obj?: { [sub: string]: number }): number {
    if (!obj) return 0;
    return Object.values(obj).reduce((a, b) => a + b, 0);
  }

  sumarTotalMes(r: RegistroMensual): number {
    return Object.keys(r.valores)
      .reduce((sum, cat) =>
        sum + this.sumarValoresCategoria(r.valores[cat])
        , 0);
  }

  toggleCategoriaBarra(cat: string, checked: boolean) {
    checked ? this.categoriasBarras.add(cat) : this.categoriasBarras.delete(cat);
    this.procesarBarras();
  }

  toggleCategoriaLinea(cat: string, checked: boolean) {
    checked ? this.categoriasLineas.add(cat) : this.categoriasLineas.delete(cat);
    this.procesarLineas();
  }

  getColorCategoria(categoria: string): string {
    const idx = this.categoriasDisponibles.indexOf(categoria);
    return this.colorPalette[idx % this.colorPalette.length];
  }

  seleccionarTodasBarras() {
    this.categoriasDisponibles.forEach(c => this.categoriasBarras.add(c));
    this.procesarBarras();
  }

  ocultarTodasBarras() {
    this.categoriasBarras.clear();
    this.procesarBarras();
  }

  seleccionarTodasLineas() {
    this.categoriasDisponibles.forEach(c => this.categoriasLineas.add(c));
    this.procesarLineas();
  }

  ocultarTodasLineas() {
    this.categoriasLineas.clear();
    this.procesarLineas();
  }

  getRegistrosFiltrados(): RegistroMensual[] {
    if (this.rangoMeses === 'all') {
      return this.registros;
    }

    const total = this.rangoMeses;
    return this.registros.slice(-total);
  }

  actualizarGraficos() {
    this.procesarBarras();
    this.procesarLineas();
  }

  private sumarValoresCategoria(categoria: any): number {
    if (!categoria) return 0;

    return Object.values(categoria).reduce((a: number, b: any) => {
      if (typeof b === 'number') {
        return a + b; // datos antiguos
      }
      return a + (b.valor - (b.deuda || 0)); // datos nuevos
    }, 0);
  }

}
