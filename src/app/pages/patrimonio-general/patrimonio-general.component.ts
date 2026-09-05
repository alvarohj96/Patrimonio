import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DecimalPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { BaseChartDirective } from 'ng2-charts';
import { PatrimonioService, RegistroMensual } from '../../services/patrimonio.service';
import { ObjetivosComponent } from '../objetivos/objetivos.component';
import { ObjetivosService } from '../../services/objetivos.service';
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

  // ===== Comparativa interanual (YoY) =====
  comparativaInteranual: {
    disponible: boolean;
    totalAnterior: number;
    absoluta: number;
    porcentaje: number;
    tendencia: 'sube' | 'baja' | 'igual';
  } = {
      disponible: false,
      totalAnterior: 0,
      absoluta: 0,
      porcentaje: 0,
      tendencia: 'igual'
    };

  // ===== Ranking "qué ha movido el mes" =====
  rankingMes: {
    disponible: boolean;
    mayorSubida: { categoria: string; variacion: number; variacionPorcentaje: number | null } | null;
    mayorBajada: { categoria: string; variacion: number; variacionPorcentaje: number | null } | null;
  } = {
      disponible: false,
      mayorSubida: null,
      mayorBajada: null
    };

  // ===== Calendario de variación (heatmap) =====
  private readonly MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  heatmapAnios: {
    anio: number;
    meses: { mes: number; label: string; estado: 'sube' | 'baja' | 'igual' | 'sin-dato'; tooltip: string }[];
  }[] = [];

  @ViewChild('heatmapScroll') heatmapScrollRef?: ElementRef<HTMLDivElement>;

  colorPalette: string[] = [
    '#2563EB',
    '#10B981',
    '#F59E0B',
    '#EF4444',
    '#8B5CF6',
    '#06B6D4',
    '#EC4899',
    '#84CC16',
    '#F97316',
    '#14B8A6'
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
    maintainAspectRatio: false,
    animation: { duration: 600, easing: 'easeInOutQuart' as const },

    plugins: {
      legend: {
        display: false  // La leyenda la manejamos con los chips del HTML
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        titleColor: 'rgba(255,255,255,0.6)',
        bodyColor: '#fff',
        padding: 14,
        cornerRadius: 12,
        bodySpacing: 6,
        usePointStyle: true,
        boxPadding: 6,
        callbacks: {
          label: (context: any) => {
            const value: number = context.raw ?? 0;
            return ` ${context.dataset.label}: ${value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
          }
        }
      }
    },

    scales: {
      x: {
        stacked: true,
        grid: { display: false },
        border: { display: false },
        ticks: {
          color: 'rgba(100,116,139,0.8)',
          font: { size: 11 },
          maxRotation: 45
        }
      },
      y: {
        stacked: true,
        grid: { color: 'rgba(148,163,184,0.12)', lineWidth: 1 },
        border: { display: false, dash: [4, 4] },
        ticks: {
          color: 'rgba(100,116,139,0.8)',
          font: { size: 11 },
          callback: (value: any) => {
            if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M €`;
            if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k €`;
            return `${value} €`;
          }
        }
      }
    }
  };

  doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
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

  lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 600, easing: 'easeInOutQuart' as const },

    plugins: {
      legend: {
        display: false  // La leyenda la manejamos con los chips del HTML
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        titleColor: 'rgba(255,255,255,0.6)',
        bodyColor: '#fff',
        footerColor: 'rgba(255,255,255,0.5)',
        padding: 14,
        cornerRadius: 12,
        bodySpacing: 6,
        usePointStyle: true,
        boxPadding: 6,
        callbacks: {
          label: (context: any) => {
            const value: number = context.raw ?? 0;
            return ` ${context.dataset.label}: ${value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
          }
        }
      }
    },

    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: {
          color: 'rgba(100,116,139,0.8)',
          font: { size: 11 },
          maxRotation: 45
        }
      },
      y: {
        grid: { color: 'rgba(148,163,184,0.12)', lineWidth: 1 },
        border: { display: false, dash: [4, 4] },
        ticks: {
          color: 'rgba(100,116,139,0.8)',
          font: { size: 11 },
          callback: (value: any) => {
            if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M €`;
            if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k €`;
            return `${value} €`;
          }
        }
      }
    }
  };

  sub: any;

  categoriasDisponibles: string[] = [];

  // Selección independiente
  categoriasBarras = new Set<string>();
  categoriasLineas = new Set<string>();
  categoriasSeleccionadas = new Set<string>();
  // Categorías que ya se han visto al menos una vez (para no reactivar
  // en los filtros una categoría que el usuario haya desmarcado a mano)
  categoriasConocidas = new Set<string>();

  config$!: Observable<UiConfig>;

  rangoMeses: 12 | 24 | 'all' = 12;

  deudaInmuebles = 0;
  valorBrutoInmuebles = 0;
  valorNetoInmuebles = 0;

  deudaBarData: any;
  deudaBarOptions: any;

  // ===== Proyección hacia el objetivo =====
  objetivoTotal = 0;

  proyeccion: {
    estado: 'sin-objetivo' | 'datos-insuficientes' | 'alcanzado' | 'sin-ritmo' | 'en-progreso';
    ritmoMensual: number;
    mesesRestantes: number | null;
    fechaEstimadaTexto: string | null;
  } = {
      estado: 'sin-objetivo',
      ritmoMensual: 0,
      mesesRestantes: null,
      fechaEstimadaTexto: null
    };

  private readonly MESES_ES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];

  private subObjetivos: any;

  // ===== Comparativa Donuts Antes → Después =====
  mesesDisponiblesComparativa: string[] = [];
  mesComparativaSeleccionado: string = '';
  mesActual: string = '';

  donutAntes: any = { labels: [], datasets: [] };
  donutDespues: any = { labels: [], datasets: [] };

  donutComparativaOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context: any) => {
            const value = context.raw || 0;
            const dataArray = context.chart.data.datasets[0].data;
            const total = dataArray.reduce((a: number, b: number) => a + b, 0);
            const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0';
            return `${context.label}: ${value.toLocaleString()} € (${pct}%)`;
          }
        }
      }
    }
  };

  constructor(
    private patrimonioService: PatrimonioService,
    private ui: UiConfigService,
    private objetivosService: ObjetivosService
  ) {
    this.config$ = this.ui.config$;
  }

  ngOnInit(): void {
    this.sub = this.patrimonioService.registros$.subscribe(regs => {
      this.registros = regs || [];
      this.procesarDatos();
    });

    // El objetivo se puede editar desde la tarjeta de Objetivos en esta misma
    // página, así que recalculamos la proyección en cuanto cambie.
    this.subObjetivos = this.objetivosService.objetivos$.subscribe(obj => {
      this.objetivoTotal = obj?.total || 0;
      this.calcularProyeccion();
    });
  }

  ngOnDestroy(): void {
    if (this.sub) this.sub.unsubscribe();
    if (this.subObjetivos) this.subObjetivos.unsubscribe();
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

      this.calcularProyeccion();

      this.calcularComparativaInteranual();
      this.calcularRankingMes();
      this.calcularHeatmap();
      this.calcularComparativaDonuts();

      return;
    }

    this.categoriasDisponibles = this.obtenerCategoriasGlobales();

    // Seleccionar por defecto SOLO las categorías que no se hayan visto nunca antes,
    // para no reactivar una categoría que el usuario haya desmarcado manualmente.
    this.categoriasDisponibles.forEach(c => {
      if (!this.categoriasConocidas.has(c)) {
        this.categoriasConocidas.add(c);
        this.categoriasBarras.add(c);
        this.categoriasLineas.add(c);
      }
    });

    // Limpiar los sets de categorías que ya no existan (p.ej. tras eliminarlas)
    [this.categoriasConocidas, this.categoriasBarras, this.categoriasLineas].forEach(set => {
      Array.from(set).forEach(c => {
        if (!this.categoriasDisponibles.includes(c)) set.delete(c);
      });
    });

    this.registros.sort((a, b) => a.mes.localeCompare(b.mes));
    const ultimo = this.registros[this.registros.length - 1];
    const anterior = this.registros.length > 1
      ? this.registros[this.registros.length - 2]
      : null;

    this.procesarUltimoMes(ultimo, anterior);

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
    this.calcularProyeccion();

    this.calcularComparativaInteranual();
    this.calcularRankingMes();
    this.calcularHeatmap();
    this.calcularComparativaDonuts();
  }

  // ======================================================
  // GRÁFICO DONUT (último mes)
  // ======================================================
  procesarUltimoMes(ultimo: RegistroMensual, penultimo: RegistroMensual | null) {
    const categorias = Object.keys(ultimo.valores);
    const totalesPorCategoria = categorias.map(cat => {
      const total = this.sumarValoresCategoria(ultimo.valores[cat]);
      const totalPenultimo = penultimo
        ? this.sumarValoresCategoria(penultimo.valores[cat])
        : 0;

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

    const catSeleccionadas = this.categoriasDisponibles.filter(cat => this.categoriasBarras.has(cat));

    this.barData = {
      labels: this.barLabels,
      datasets: catSeleccionadas.map((cat, idx) => ({
        label: cat,
        data: registros.map(r => this.sumarValoresCategoria(r.valores[cat])),
        backgroundColor: this.getColorCategoria(cat),
        borderRadius: {
          topLeft: 7,
          topRight: 7,
          bottomLeft: 7,
          bottomRight: 7
        },
        borderSkipped: false,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.92)',
        maxBarThickness: 60,
        stack: 'patrimonio'
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

  // ======================================================
  // COMPARATIVA INTERANUAL (YoY)
  // ======================================================
  calcularComparativaInteranual() {

    if (!this.registros.length) {
      this.comparativaInteranual = { disponible: false, totalAnterior: 0, absoluta: 0, porcentaje: 0, tendencia: 'igual' };
      return;
    }

    const ultimo = this.registros[this.registros.length - 1];
    const [anioStr, mesStr] = ultimo.mes.split('-');
    const mesAnioAnterior = `${Number(anioStr) - 1}-${mesStr}`;

    const registroAnioAnterior = this.registros.find(r => r.mes === mesAnioAnterior);

    if (!registroAnioAnterior) {
      this.comparativaInteranual = { disponible: false, totalAnterior: 0, absoluta: 0, porcentaje: 0, tendencia: 'igual' };
      return;
    }

    const totalAnterior = this.sumarTotalMes(registroAnioAnterior);
    const absoluta = this.totalUltimoMes - totalAnterior;
    const porcentaje = totalAnterior > 0 ? (absoluta / totalAnterior) * 100 : 0;
    const tendencia = absoluta > 0 ? 'sube' : absoluta < 0 ? 'baja' : 'igual';

    this.comparativaInteranual = { disponible: true, totalAnterior, absoluta, porcentaje, tendencia };
  }

  // ======================================================
  // RANKING "QUÉ HA MOVIDO EL MES"
  // ======================================================
  calcularRankingMes() {

    // Sin mes anterior no hay nada que comparar
    if (!this.datosUltimoMes.length || !this.totalMesAnterior) {
      this.rankingMes = { disponible: false, mayorSubida: null, mayorBajada: null };
      return;
    }

    const conVariacion = this.datosUltimoMes.filter(d => d.variacion !== 0);

    if (!conVariacion.length) {
      this.rankingMes = { disponible: false, mayorSubida: null, mayorBajada: null };
      return;
    }

    const construir = (d: { categoria: string; total: number; variacion: number }) => {
      const valorAnterior = d.total - d.variacion;
      const variacionPorcentaje = valorAnterior !== 0
        ? (d.variacion / Math.abs(valorAnterior)) * 100
        : null;

      return { categoria: d.categoria, variacion: d.variacion, variacionPorcentaje };
    };

    const ordenadas = [...conVariacion].sort((a, b) => b.variacion - a.variacion);
    const top = ordenadas[0];
    const bottom = ordenadas[ordenadas.length - 1];

    this.rankingMes = {
      disponible: true,
      mayorSubida: top.variacion > 0 ? construir(top) : null,
      // Evita mostrar la misma categoría como "mayor subida" y "mayor bajada"
      // cuando solo hay una categoría con variación ese mes.
      mayorBajada: (bottom.variacion < 0 && bottom !== top) ? construir(bottom) : null
    };
  }

  // ======================================================
  // CALENDARIO DE VARIACIÓN (heatmap tipo "contribuciones")
  // ======================================================
  calcularHeatmap() {

    if (!this.registros.length) {
      this.heatmapAnios = [];
      return;
    }

    const totalesPorMes = new Map<string, number>();
    this.registros.forEach(r => totalesPorMes.set(r.mes, this.sumarTotalMes(r)));

    const anios = Array.from(
      new Set(this.registros.map(r => Number(r.mes.split('-')[0])))
    ).sort((a, b) => a - b);

    this.heatmapAnios = anios.map(anio => {
      const meses = [];

      for (let m = 1; m <= 12; m++) {
        const mesStr = `${anio}-${m.toString().padStart(2, '0')}`;
        const total = totalesPorMes.get(mesStr);

        // Mes anterior, con salto de año si m === 1 (enero mira a diciembre del año previo)
        const mAnt = m === 1 ? 12 : m - 1;
        const anioAnt = m === 1 ? anio - 1 : anio;
        const mesAntStr = `${anioAnt}-${mAnt.toString().padStart(2, '0')}`;
        const totalAnterior = totalesPorMes.get(mesAntStr);

        let estado: 'sube' | 'baja' | 'igual' | 'sin-dato' = 'sin-dato';
        let tooltip = `${this.MESES_CORTO[m - 1]} ${anio}: sin datos`;

        if (total !== undefined && totalAnterior !== undefined) {
          const variacion = total - totalAnterior;
          const variacionPorcentaje = totalAnterior > 0 ? (variacion / totalAnterior) * 100 : 0;

          estado = variacion > 0 ? 'sube' : variacion < 0 ? 'baja' : 'igual';

          tooltip = `${this.MESES_CORTO[m - 1]} ${anio}: ` +
            `${variacion.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € ` +
            `(${variacionPorcentaje.toFixed(1)}%)`;
        }

        meses.push({ mes: m, label: this.MESES_CORTO[m - 1], estado, tooltip });
      }

      return { anio, meses };
    });

    // Por defecto se ve el histórico más reciente (abajo), no el más antiguo.
    // Se espera al siguiente ciclo para que la vista ya tenga las nuevas filas pintadas.
    setTimeout(() => {
      const el = this.heatmapScrollRef?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  // ======================================================
  // PROYECCIÓN HACIA EL OBJETIVO
  // ======================================================
  calcularProyeccion() {

    if (!this.objetivoTotal || this.objetivoTotal <= 0) {
      this.proyeccion = { estado: 'sin-objetivo', ritmoMensual: 0, mesesRestantes: null, fechaEstimadaTexto: null };
      return;
    }

    if (this.registros.length < 2) {
      this.proyeccion = { estado: 'datos-insuficientes', ritmoMensual: 0, mesesRestantes: null, fechaEstimadaTexto: null };
      return;
    }

    // Ritmo medio mensual: media de los incrementos netos mes a mes de, como
    // máximo, los últimos 12 meses. Así reflejamos el ritmo de ahorro reciente
    // en vez de diluirlo con todo el histórico si llevas años usando la app.
    const historicos = this.registros.slice(-13);
    const totales = historicos.map(r => this.sumarTotalMes(r));

    const incrementos: number[] = [];
    for (let i = 1; i < totales.length; i++) {
      incrementos.push(totales[i] - totales[i - 1]);
    }

    const ritmoMensual = incrementos.length
      ? incrementos.reduce((a, b) => a + b, 0) / incrementos.length
      : 0;

    const actual = this.totalUltimoMes;

    if (actual >= this.objetivoTotal) {
      this.proyeccion = { estado: 'alcanzado', ritmoMensual, mesesRestantes: 0, fechaEstimadaTexto: null };
      return;
    }

    if (ritmoMensual <= 0) {
      this.proyeccion = { estado: 'sin-ritmo', ritmoMensual, mesesRestantes: null, fechaEstimadaTexto: null };
      return;
    }

    const mesesRestantes = Math.ceil((this.objetivoTotal - actual) / ritmoMensual);

    const [anioStr, mesStr] = this.registros[this.registros.length - 1].mes.split('-');
    const fecha = new Date(Number(anioStr), Number(mesStr) - 1 + mesesRestantes, 1);
    const fechaEstimadaTexto = `${this.MESES_ES[fecha.getMonth()]} de ${fecha.getFullYear()}`;

    this.proyeccion = { estado: 'en-progreso', ritmoMensual, mesesRestantes, fechaEstimadaTexto };
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

  get porcentajeDeuda(): number {
    return this.valorBrutoInmuebles > 0
      ? (this.deudaInmuebles / this.valorBrutoInmuebles) * 100
      : 0;
  }

  get porcentajeValorNeto(): number {
    return this.valorBrutoInmuebles > 0
      ? (this.valorNetoInmuebles / this.valorBrutoInmuebles) * 100
      : 0;
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

  // ======================================================
  // COMPARATIVA DONUTS ANTES → DESPUÉS
  // ======================================================
  calcularComparativaDonuts() {
    if (this.registros.length < 2) {
      this.mesesDisponiblesComparativa = [];
      this.mesComparativaSeleccionado = '';
      this.donutAntes = { labels: [], datasets: [] };
      this.donutDespues = { labels: [], datasets: [] };
      return;
    }

    const ordenados = [...this.registros].sort((a, b) => a.mes.localeCompare(b.mes));
    const ultimo = ordenados[ordenados.length - 1];
    this.mesActual = ultimo.mes;

    // Todos los meses menos el actual (son los candidatos para "antes")
    this.mesesDisponiblesComparativa = ordenados
      .slice(0, ordenados.length - 1)
      .map(r => r.mes)
      .reverse(); // más reciente primero en el selector

    // Seleccionar por defecto el inmediatamente anterior si no hay selección previa
    if (
      !this.mesComparativaSeleccionado ||
      !this.mesesDisponiblesComparativa.includes(this.mesComparativaSeleccionado)
    ) {
      this.mesComparativaSeleccionado = this.mesesDisponiblesComparativa[0] ?? '';
    }

    this.actualizarComparativaDonuts();
  }

  actualizarComparativaDonuts() {
    if (!this.mesComparativaSeleccionado) return;

    const ordenados = [...this.registros].sort((a, b) => a.mes.localeCompare(b.mes));
    const registroAntes = ordenados.find(r => r.mes === this.mesComparativaSeleccionado);
    const registroDespues = ordenados[ordenados.length - 1];

    if (!registroAntes || !registroDespues) return;

    this.donutAntes = this.buildDonutData(registroAntes);
    this.donutDespues = this.buildDonutData(registroDespues);
  }

  private buildDonutData(registro: RegistroMensual): any {
    const categorias = this.categoriasDisponibles.length
      ? this.categoriasDisponibles
      : Object.keys(registro.valores);

    const labels: string[] = [];
    const data: number[] = [];
    const colors: string[] = [];

    categorias.forEach((cat, idx) => {
      const total = this.sumarValoresCategoria(registro.valores[cat]);
      if (total > 0) {
        labels.push(cat);
        data.push(total);
        colors.push(this.colorPalette[idx % this.colorPalette.length]);
      }
    });

    return {
      labels,
      datasets: [{ data, backgroundColor: colors }]
    };
  }

}