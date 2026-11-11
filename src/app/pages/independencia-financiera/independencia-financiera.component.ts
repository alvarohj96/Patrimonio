import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { BaseChartDirective } from 'ng2-charts';
import {
  Chart,
  ChartConfiguration,
  ChartOptions,
  Filler,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend
} from 'chart.js';

import {
  EscenarioId,
  EstadoSimulador,
  FilaProyeccion,
  Hito,
  ParametrosProyeccion,
  Periodicidad
} from '../../models/independencia-financiera';
import { PatrimonioService } from '../../services/patrimonio.service';
import { SimuladorIndependenciaService } from '../../services/simulador-independencia.service';

Chart.register(Filler, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);

/** Colores de los indicadores de categoría (mismos que «Objetivos de inversión»). */
const COLORES_CATEGORIA = ['#3b82f6', '#06b6d4', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6', '#ef4444', '#84cc16', '#f97316'];

const COLOR_ESCENARIO: Record<EscenarioId, string> = {
  conservador: '#06b6d4',
  moderado: '#4f46e5',
  optimista: '#10b981',
  personalizado: '#ec4899'
};

interface EscenarioVista {
  id: EscenarioId;
  nombre: string;
  descripcion: string;
  rentabilidad: number;
  color: string;
  filas: FilaProyeccion[];
}

@Component({
  selector: 'app-independencia-financiera',
  standalone: true,
  imports: [MatIconModule, BaseChartDirective],
  templateUrl: './independencia-financiera.component.html',
  styleUrls: ['./independencia-financiera.component.scss']
})
export class IndependenciaFinancieraComponent {

  private readonly patrimonio = inject(PatrimonioService);
  private readonly calculo = inject(SimuladorIndependenciaService);

  readonly horizontesRapidos = [10, 20, 30];
  readonly tasasRapidas = [3, 3.5, 4, 5];
  readonly horizonteMin = SimuladorIndependenciaService.HORIZONTE_MIN;
  readonly horizonteMax = SimuladorIndependenciaService.HORIZONTE_MAX;
  readonly anioActual = new Date().getFullYear();

  // ------------------------------------------------------
  // Datos reales de la aplicación
  // ------------------------------------------------------
  private readonly registros = toSignal(this.patrimonio.registros$, { initialValue: this.patrimonio.getRegistros() });
  private readonly nombresCategorias = toSignal(this.patrimonio.categorias$, { initialValue: this.patrimonio.getCategorias() });

  private readonly categorias = computed(() => {
    this.nombresCategorias();
    return this.patrimonio.getCategoriasConId();
  });

  private readonly valoresActuales = computed(() => this.patrimonio.valorNetoPorCategoria(this.registros()));

  // ------------------------------------------------------
  // Estado editable (persistido)
  // ------------------------------------------------------
  private readonly inicial = this.calculo.cargar();

  readonly usarRegistrado = signal(this.inicial.usarRegistrado);
  readonly patrimonioManual = signal<number | null>(this.inicial.patrimonioManual);
  readonly excluidas = signal<readonly string[]>(this.inicial.categoriasExcluidas);
  readonly aportacion = signal<number | null>(this.inicial.aportacion);
  readonly periodicidad = signal<Periodicidad>(this.inicial.periodicidad);
  readonly crecimientoAportacion = signal<number | null>(this.inicial.crecimientoAportacion);
  readonly escenario = signal<EscenarioId>(this.inicial.escenario);
  readonly rentabilidadPersonalizada = signal<number | null>(this.inicial.rentabilidadPersonalizada);
  readonly inflacion = signal<number | null>(this.inicial.inflacion);
  readonly gastosMensuales = signal<number | null>(this.inicial.gastosMensuales);
  readonly tasaRetirada = signal<number | null>(this.inicial.tasaRetirada);
  readonly horizonte = signal<number>(this.inicial.horizonte);
  readonly valoresReales = signal(this.inicial.valoresReales);

  private readonly estado = computed<EstadoSimulador>(() => ({
    version: 1,
    usarRegistrado: this.usarRegistrado(),
    patrimonioManual: this.patrimonioManual(),
    categoriasExcluidas: [...this.excluidas()],
    aportacion: this.aportacion(),
    periodicidad: this.periodicidad(),
    crecimientoAportacion: this.crecimientoAportacion(),
    escenario: this.escenario(),
    rentabilidadPersonalizada: this.rentabilidadPersonalizada(),
    inflacion: this.inflacion(),
    gastosMensuales: this.gastosMensuales(),
    tasaRetirada: this.tasaRetirada(),
    horizonte: this.horizonte(),
    valoresReales: this.valoresReales()
  }));

  constructor() {
    effect(() => this.calculo.guardar(this.estado()));
  }

  // ------------------------------------------------------
  // Patrimonio de partida
  // ------------------------------------------------------
  readonly hayRegistros = computed(() => this.registros().length > 0);

  readonly categoriasVista = computed(() => {
    const valores = this.valoresActuales();
    const excluidas = new Set(this.excluidas());
    return this.categorias().map((c, i) => ({
      id: c.id,
      nombre: c.nombre,
      valor: valores[c.nombre] ?? 0,
      color: COLORES_CATEGORIA[i % COLORES_CATEGORIA.length],
      incluida: !excluidas.has(c.id)
    }));
  });

  readonly patrimonioRegistrado = computed(() =>
    this.categoriasVista().filter(c => c.incluida).reduce((s, c) => s + c.valor, 0));

  readonly patrimonioInicial = computed(() =>
    Math.max(0, this.usarRegistrado() ? this.patrimonioRegistrado() : (this.patrimonioManual() ?? 0)));

  /** Variación media mensual reciente del patrimonio (referencia para estimar el ahorro). */
  readonly ahorroSugerido = computed(() => {
    const categorias = this.categoriasVista().filter(c => c.incluida).map(c => c.nombre);
    const totales = this.registros().map(r => {
      const netos = this.patrimonio.valorNetoPorCategoria([r]);
      return { mes: r.mes, total: categorias.reduce((s, nombre) => s + (netos[nombre] ?? 0), 0) };
    });
    const v = this.calculo.variacionMediaMensual(totales);
    return v && v.importe > 0 ? { importe: Math.round(v.importe), meses: v.meses } : null;
  });

  // ------------------------------------------------------
  // Proyección
  // ------------------------------------------------------
  private readonly parametrosBase = computed<Omit<ParametrosProyeccion, 'rentabilidad'>>(() => ({
    patrimonioInicial: this.patrimonioInicial(),
    aportacion: this.calculo.limitar(this.aportacion(), 0, 10_000_000),
    periodicidad: this.periodicidad(),
    crecimientoAportacion: this.calculo.limitar(this.crecimientoAportacion(), -20, 30),
    inflacion: this.calculo.limitar(this.inflacion(), -5, 25, 0),
    gastosMensuales: this.calculo.limitar(this.gastosMensuales(), 0, 1_000_000),
    tasaRetirada: this.calculo.limitar(this.tasaRetirada(), 0, 20, 0),
    horizonte: this.calculo.horizonteValido(this.horizonte())
  }));

  readonly rentabilidadPersonalizadaEfectiva = computed(() =>
    this.calculo.limitar(this.rentabilidadPersonalizada(), -20, 40, 0));

  /** Escenarios dibujados: los predefinidos y, si está elegido, el personalizado. */
  readonly escenarios = computed<EscenarioVista[]>(() => {
    const base = this.parametrosBase();
    const crear = (id: EscenarioId, nombre: string, descripcion: string, rentabilidad: number): EscenarioVista => ({
      id, nombre, descripcion, rentabilidad, color: COLOR_ESCENARIO[id],
      filas: this.calculo.proyectar({ ...base, rentabilidad })
    });

    return [
      ...this.calculo.escenarios.map(e => crear(e.id, e.nombre, e.descripcion, e.rentabilidad)),
      crear('personalizado', 'Personalizado', 'Tu propia rentabilidad', this.rentabilidadPersonalizadaEfectiva())
    ];
  });

  readonly escenarioActivo = computed(() => this.escenarios().find(e => e.id === this.escenario()) ?? this.escenarios()[1]);

  readonly resumenes = computed(() => {
    const real = this.valoresReales();
    const h = this.parametrosBase().horizonte;
    return this.escenarios().map(e => ({ ...e, ...this.calculo.resumir(e.filas, h, real) }));
  });

  readonly resumenActivo = computed(() => this.resumenes().find(r => r.id === this.escenario()) ?? this.resumenes()[1]);

  readonly hitos = computed(() => this.calculo.hitos(this.escenarioActivo().filas, this.valoresReales()));

  /** Filas del escenario activo hasta el horizonte, ya en el modo real/nominal elegido. */
  readonly tabla = computed(() => {
    const real = this.valoresReales();
    const h = this.parametrosBase().horizonte;
    return this.escenarioActivo().filas.slice(0, h + 1).map(f => ({
      anio: f.anio,
      calendario: this.anioActual + f.anio,
      aportado: this.calculo.enModo(f.aportado + this.parametrosBase().patrimonioInicial, f, real),
      rendimientos: this.calculo.enModo(f.rendimientos, f, real),
      patrimonio: this.calculo.enModo(f.patrimonio, f, real),
      objetivo: f.objetivoLibertad === null ? null : this.calculo.enModo(f.objetivoLibertad, f, real),
      cobertura: f.cobertura
    }));
  });

  readonly hayGastos = computed(() => this.parametrosBase().gastosMensuales > 0);
  readonly hayObjetivo = computed(() => this.hayGastos() && this.parametrosBase().tasaRetirada > 0);

  /** Capital necesario hoy para la libertad financiera (euros de hoy). */
  readonly capitalObjetivoHoy = computed(() => {
    const p = this.parametrosBase();
    return this.hayObjetivo() ? (p.gastosMensuales * 12) / (p.tasaRetirada / 100) : null;
  });

  readonly progresoObjetivo = computed(() => {
    const objetivo = this.capitalObjetivoHoy();
    return objetivo ? this.limitar((this.patrimonioInicial() / objetivo) * 100) : 0;
  });

  /** Ahorro expresado en €/mes, para el texto del hero. */
  readonly ahorroMensualEquivalente = computed(() => {
    const p = this.parametrosBase();
    return p.periodicidad === 'anual' ? p.aportacion / 12 : p.aportacion;
  });

  // ------------------------------------------------------
  // Gráfico
  // ------------------------------------------------------
  readonly chartData = computed<ChartConfiguration<'line'>['data']>(() => {
    const real = this.valoresReales();
    const h = this.parametrosBase().horizonte;
    const activo = this.escenarioActivo();
    const visibles = this.escenarios().filter(e => e.id !== 'personalizado' || this.escenario() === 'personalizado');

    const serie = (filas: FilaProyeccion[], valor: (f: FilaProyeccion) => number | null) =>
      filas.slice(0, h + 1).map(f => {
        const v = valor(f);
        return v === null ? null : this.calculo.enModo(v, f, real);
      });

    const datasets: ChartConfiguration<'line'>['data']['datasets'] = visibles.map(e => {
      const seleccionado = e.id === activo.id;
      return {
        label: `${e.nombre} (${this.porcentaje(e.rentabilidad)} %)`,
        data: serie(e.filas, f => f.patrimonio),
        borderColor: e.color,
        backgroundColor: e.color + '22',
        borderWidth: seleccionado ? 3 : 1.5,
        fill: seleccionado,
        tension: 0.25,
        pointRadius: 0,
        pointHoverRadius: 5,
        order: seleccionado ? 1 : 2
      };
    });

    datasets.push({
      label: 'Capital aportado',
      data: serie(activo.filas, f => this.parametrosBase().patrimonioInicial + f.aportado),
      borderColor: '#94a3b8',
      borderDash: [6, 4],
      borderWidth: 1.5,
      fill: false,
      tension: 0.25,
      pointRadius: 0,
      pointHoverRadius: 4,
      order: 3
    });

    if (this.hayObjetivo()) {
      datasets.push({
        label: 'Capital para la libertad financiera',
        data: serie(activo.filas, f => f.objetivoLibertad),
        borderColor: '#f59e0b',
        borderDash: [2, 4],
        borderWidth: 2,
        fill: false,
        tension: 0,
        pointRadius: 0,
        pointHoverRadius: 4,
        order: 0
      });
    }

    return {
      labels: activo.filas.slice(0, h + 1).map(f => String(this.anioActual + f.anio)),
      datasets
    };
  });

  readonly chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 400, easing: 'easeInOutQuart' },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'bottom',
        labels: { usePointStyle: true, boxWidth: 8, color: 'rgba(100,116,139,0.95)', font: { size: 12 } }
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
        itemSort: (a, b) => (b.parsed.y ?? 0) - (a.parsed.y ?? 0),
        callbacks: {
          title: items => {
            const i = items[0]?.dataIndex ?? 0;
            return i === 0 ? `Hoy (${items[0].label})` : `Año ${i} · ${items[0].label}`;
          },
          label: ctx => ` ${ctx.dataset.label}: ${this.euros(ctx.parsed.y ?? 0)}`
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: 'rgba(100,116,139,0.8)', font: { size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 }
      },
      y: {
        grid: { color: 'rgba(148,163,184,0.12)', lineWidth: 1 },
        border: { display: false, dash: [4, 4] },
        beginAtZero: true,
        ticks: {
          color: 'rgba(100,116,139,0.8)',
          font: { size: 11 },
          callback: value => {
            const v = Number(value);
            if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} M €`;
            if (Math.abs(v) >= 1_000) return `${(v / 1_000).toLocaleString('es-ES', { maximumFractionDigits: 0 })} k €`;
            return `${v} €`;
          }
        }
      }
    }
  };

  // ------------------------------------------------------
  // Formato
  // ------------------------------------------------------
  private readonly formatoEuro = new Intl.NumberFormat('es-ES', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: 'always' as any
  });
  private readonly formatoPct = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  euros(v: number): string {
    return this.formatoEuro.format(Math.round(v || 0));
  }

  porcentaje(v: number): string {
    return this.formatoPct.format(v || 0);
  }

  limitar(v: number): number {
    return Math.max(0, Math.min(100, v || 0));
  }

  /** «Ya alcanzado», «Año 12 · 2038» o «No se alcanza». */
  textoAnio(anio: number | null): string {
    if (anio === null) return `No se alcanza en ${SimuladorIndependenciaService.ANIOS_CALCULO} años`;
    if (anio === 0) return 'Ya alcanzado';
    return `Año ${anio} · ${this.anioActual + anio}`;
  }

  /** Años expresados de forma legible: «12 años», «1 año». */
  textoAnios(anio: number): string {
    return anio === 1 ? '1 año' : `${anio} años`;
  }

  tituloHito(h: Hito): string {
    switch (h.tipo) {
      case 'capital': return `Alcanzar ${this.euros(h.umbral ?? 0)}`;
      case 'rendimientos': return 'Tus rendimientos cubren tus gastos';
      case 'libertad': return `Independencia financiera (regla del ${this.porcentaje(this.parametrosBase().tasaRetirada)} %)`;
    }
  }

  detalleHito(h: Hito): string {
    if (h.anio === null) return 'Prueba a aumentar el ahorro, la rentabilidad o el horizonte.';
    switch (h.tipo) {
      case 'capital':
        return `Patrimonio en ese momento: ${this.euros(h.patrimonio ?? 0)}`;
      case 'rendimientos':
        return `Rendimiento anual estimado ≥ gastos anuales (${this.euros(h.referencia ?? 0)})`;
      case 'libertad':
        return `Patrimonio ${this.euros(h.patrimonio ?? 0)} ≥ capital necesario ${this.euros(h.referencia ?? 0)}`;
    }
  }

  iconoHito(h: Hito): string {
    return h.tipo === 'capital' ? 'flag' : h.tipo === 'rendimientos' ? 'payments' : 'beach_access';
  }

  // ------------------------------------------------------
  // Acciones
  // ------------------------------------------------------
  private numero(texto: string): number | null {
    if (texto.trim() === '') return null;
    const n = Number(texto.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  fijarUsarRegistrado(valor: boolean) { this.usarRegistrado.set(valor); }
  editarPatrimonioManual(t: string) { this.patrimonioManual.set(this.numero(t)); }

  alternarCategoria(id: string) {
    const actuales = this.excluidas();
    this.excluidas.set(actuales.includes(id) ? actuales.filter(x => x !== id) : [...actuales, id]);
  }

  editarAportacion(t: string) { this.aportacion.set(this.numero(t)); }
  fijarPeriodicidad(p: Periodicidad) { this.periodicidad.set(p); }
  editarCrecimiento(t: string) { this.crecimientoAportacion.set(this.numero(t)); }

  usarAhorroSugerido() {
    const s = this.ahorroSugerido();
    if (!s) return;
    this.periodicidad.set('mensual');
    this.aportacion.set(s.importe);
  }

  editarGastos(t: string) { this.gastosMensuales.set(this.numero(t)); }
  editarTasa(t: string) { this.tasaRetirada.set(this.numero(t)); }
  fijarTasa(v: number) { this.tasaRetirada.set(v); }
  editarInflacion(t: string) { this.inflacion.set(this.numero(t)); }
  fijarReales(v: boolean) { this.valoresReales.set(v); }

  seleccionarEscenario(id: EscenarioId) { this.escenario.set(id); }

  editarRentabilidadPersonalizada(t: string) {
    this.rentabilidadPersonalizada.set(this.numero(t));
    this.escenario.set('personalizado');
  }

  fijarHorizonte(v: number | string) {
    this.horizonte.set(this.calculo.horizonteValido(Number(v)));
  }
}
