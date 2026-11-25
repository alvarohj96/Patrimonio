import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { Periodicidad } from '../../models/independencia-financiera';
import { EstrategiaInmueble, FaseLiquidez, ParametrosPlan } from '../../models/plan-desinversion';
import { PatrimonioService } from '../../services/patrimonio.service';
import { PlanDesinversionService } from '../../services/plan-desinversion.service';
import { euros, porcentaje } from '../../shared/formato';
import { AgrupacionLiquidezComponent, CategoriaVista } from './components/agrupacion-liquidez/agrupacion-liquidez.component';
import { CascadaRetiradaComponent } from './components/cascada-retirada/cascada-retirada.component';
import { GraficoTrayectoriaComponent } from './components/grafico-trayectoria/grafico-trayectoria.component';
import { GuiaFriccionComponent } from './components/guia-friccion/guia-friccion.component';

/** Colores de los indicadores de categoría (mismos que «Objetivos de inversión»). */
const COLORES_CATEGORIA = ['#3b82f6', '#06b6d4', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6', '#ef4444', '#84cc16', '#f97316'];

const MAX_IMPORTE = 10_000_000;

@Component({
  selector: 'app-plan-desinversion',
  standalone: true,
  imports: [
    MatIconModule,
    AgrupacionLiquidezComponent,
    CascadaRetiradaComponent,
    GraficoTrayectoriaComponent,
    GuiaFriccionComponent
  ],
  templateUrl: './plan-desinversion.component.html',
  styleUrl: './plan-desinversion.component.scss'
})
export class PlanDesinversionComponent {

  private readonly patrimonio = inject(PatrimonioService);
  private readonly calculo = inject(PlanDesinversionService);

  readonly anioActual = new Date().getFullYear();
  readonly horizontesRapidos = [10, 20, 30];
  readonly horizonteMin = PlanDesinversionService.HORIZONTE_MIN;
  readonly horizonteMax = PlanDesinversionService.HORIZONTE_MAX;

  protected readonly euros = euros;
  protected readonly porcentaje = porcentaje;

  // ------------------------------------------------------
  // Datos reales de la aplicación
  // ------------------------------------------------------
  private readonly registros = toSignal(this.patrimonio.registros$, { initialValue: this.patrimonio.getRegistros() });
  private readonly nombresCategorias = toSignal(this.patrimonio.categorias$, { initialValue: this.patrimonio.getCategorias() });

  private readonly categoriasConId = computed(() => {
    this.nombresCategorias();
    return this.patrimonio.getCategoriasConId();
  });

  // ------------------------------------------------------
  // Estado editable (persistido)
  // ------------------------------------------------------
  private readonly inicial = this.calculo.cargar(this.anioActual);

  readonly asignaciones = signal<Readonly<Record<string, FaseLiquidez>>>(this.inicial.asignaciones);
  readonly retirada = signal<number | null>(this.inicial.retirada);
  readonly periodicidad = signal<Periodicidad>(this.inicial.periodicidad);
  readonly horizonte = signal<number>(this.inicial.horizonte);
  readonly rentabilidadCartera = signal<number | null>(this.inicial.rentabilidadCartera);
  readonly rentabilidadColchon = signal<number | null>(this.inicial.rentabilidadColchon);
  readonly inflacion = signal<number | null>(this.inicial.inflacion);
  readonly estrategia = signal<EstrategiaInmueble>(this.inicial.estrategia);
  readonly anioVenta = signal<number | null>(this.inicial.anioVenta);
  readonly costesSalida = signal<number | null>(this.inicial.costesSalida);
  readonly rentaNeta = signal<number | null>(this.inicial.rentaNeta);
  readonly revalorizacion = signal<number | null>(this.inicial.revalorizacion);
  readonly amortizacionDeuda = signal<number | null>(this.inicial.amortizacionDeuda);
  readonly valoresReales = signal(this.inicial.valoresReales);

  constructor() {
    effect(() => this.calculo.guardar({
      version: 1,
      asignaciones: { ...this.asignaciones() },
      retirada: this.retirada(),
      periodicidad: this.periodicidad(),
      horizonte: this.horizonte(),
      rentabilidadCartera: this.rentabilidadCartera(),
      rentabilidadColchon: this.rentabilidadColchon(),
      inflacion: this.inflacion(),
      estrategia: this.estrategia(),
      anioVenta: this.anioVenta(),
      costesSalida: this.costesSalida(),
      rentaNeta: this.rentaNeta(),
      revalorizacion: this.revalorizacion(),
      amortizacionDeuda: this.amortizacionDeuda(),
      valoresReales: this.valoresReales()
    }));
  }

  // ------------------------------------------------------
  // Clasificación por liquidez
  // ------------------------------------------------------
  readonly categorias = computed<CategoriaVista[]>(() => {
    const desglose = this.patrimonio.desgloseValorPorCategoria(this.registros());
    return this.calculo
      .clasificar(this.categoriasConId(), desglose, this.asignaciones())
      .map((c, i) => ({ ...c, color: COLORES_CATEGORIA[i % COLORES_CATEGORIA.length] }));
  });

  readonly situacion = computed(() => this.calculo.situacionInicial(this.categorias()));

  readonly hayIndivisibles = computed(() => {
    const s = this.situacion();
    return s.brutoIndivisible > 0 || s.deudaIndivisible > 0;
  });

  // ------------------------------------------------------
  // Parámetros y proyección
  // ------------------------------------------------------
  readonly parametros = computed<ParametrosPlan>(() => {
    const s = this.situacion();
    const c = this.calculo;
    const h = c.horizonteValido(this.horizonte());
    const aMes = (v: number | null) => {
      const x = c.limitar(v, 0, MAX_IMPORTE);
      return this.periodicidad() === 'anual' ? x / 12 : x;
    };

    return {
      colchonInicial: s.colchon,
      carteraInicial: s.liquidos,
      brutoIndivisible: s.brutoIndivisible,
      deudaIndivisible: s.deudaIndivisible,
      retiradaMensual: aMes(this.retirada()),
      horizonte: h,
      rentabilidadCartera: c.limitar(this.rentabilidadCartera(), -20, 30, 0),
      rentabilidadColchon: c.limitar(this.rentabilidadColchon(), -5, 15, 0),
      inflacion: c.limitar(this.inflacion(), -5, 25, 0),
      rentaNetaMensual: aMes(this.rentaNeta()),
      revalorizacion: c.limitar(this.revalorizacion(), -10, 15, 0),
      amortizacionAnualDeuda: c.limitar(this.amortizacionDeuda(), 0, MAX_IMPORTE),
      costesSalida: c.limitar(this.costesSalida(), 0, 50, 0),
      anioVenta: c.anioVentaValido((this.anioVenta() ?? this.anioActual + 10) - this.anioActual, h)
    };
  });

  /** Año natural de la venta, ya acotado al horizonte. */
  readonly anioVentaEfectivo = computed(() => this.anioActual + this.parametros().anioVenta);

  readonly estrategiaEfectiva = computed<EstrategiaInmueble>(() =>
    this.hayIndivisibles() ? this.estrategia() : 'mantener');

  readonly trayMantener = computed(() => this.calculo.simular(this.parametros(), 'mantener'));
  readonly trayVender = computed(() =>
    this.hayIndivisibles() ? this.calculo.simular(this.parametros(), 'vender') : null);

  readonly activa = computed(() =>
    this.estrategiaEfectiva() === 'vender' ? this.trayVender()! : this.trayMantener());

  private readonly alternativa = computed(() => {
    if (!this.hayIndivisibles()) return null;
    return this.estrategiaEfectiva() === 'vender' ? this.trayMantener() : this.trayVender();
  });

  readonly alertas = computed(() =>
    this.calculo.alertas(this.parametros(), this.activa(), this.alternativa(), this.anioActual));

  // ------------------------------------------------------
  // Hero
  // ------------------------------------------------------
  readonly hero = computed(() => {
    const p = this.parametros();
    const a = this.activa();
    const ultima = a.filas[a.filas.length - 1];
    const sinRetirada = p.retiradaMensual <= 0;
    const cubre = a.anioDeficit === null;

    let titular: string;
    let estado: 'ok' | 'mal' | 'neutro';
    if (sinRetirada) {
      titular = 'Define tu retirada';
      estado = 'neutro';
    } else if (cubre) {
      titular = `Plan sostenible durante ${p.horizonte} años`;
      estado = 'ok';
    } else if (a.anioDeficit === 1) {
      titular = 'La liquidez se agota en el primer año';
      estado = 'mal';
    } else {
      titular = `La liquidez se agota en ${this.anioActual + a.anioDeficit!}`;
      estado = 'mal';
    }

    return {
      titular,
      estado,
      badge: a.venta ? `Vendiendo el inmueble en ${this.anioActual + a.venta.anio}` : 'Manteniendo el inmueble',
      hayInmueble: this.hayIndivisibles(),
      retiradaAnual: p.retiradaMensual * 12,
      liquidoFinal: ultima.liquido / ultima.deflactor
    };
  });

  /** Importe elegido, expresado en la otra periodicidad (ayuda bajo el campo). */
  readonly equivalenciaRetirada = computed(() => {
    const v = this.calculo.limitar(this.retirada(), 0, MAX_IMPORTE);
    return this.periodicidad() === 'mensual' ? `${euros(v * 12)} al año` : `${euros(v / 12)} al mes`;
  });

  readonly sliderRetiradaMax = computed(() => (this.periodicidad() === 'mensual' ? 10_000 : 120_000));
  readonly sliderRetiradaPaso = computed(() => (this.periodicidad() === 'mensual' ? 50 : 500));

  /** Pasos del año de venta, para el slider. */
  readonly anioVentaMin = computed(() => this.anioActual + 1);
  readonly anioVentaMax = computed(() => this.anioActual + this.parametros().horizonte);

  /** Resultado estimado de la venta para el año elegido (aunque el plan sea «mantener»). */
  readonly ventaEstimada = computed(() => this.trayVender()?.venta ?? null);

  // ------------------------------------------------------
  // Acciones
  // ------------------------------------------------------
  private numero(texto: string): number | null {
    if (texto.trim() === '') return null;
    const n = Number(texto.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  editarRetirada(t: string) { this.retirada.set(this.numero(t)); }
  fijarPeriodicidad(p: Periodicidad) { this.periodicidad.set(p); }
  fijarHorizonte(v: number | string) { this.horizonte.set(this.calculo.horizonteValido(Number(v))); }
  editarRentabilidadCartera(t: string) { this.rentabilidadCartera.set(this.numero(t)); }
  editarRentabilidadColchon(t: string) { this.rentabilidadColchon.set(this.numero(t)); }
  editarInflacion(t: string) { this.inflacion.set(this.numero(t)); }
  fijarEstrategia(e: EstrategiaInmueble) { this.estrategia.set(e); }
  fijarAnioVenta(v: number | string) { this.anioVenta.set(Number(v)); }
  editarCostesSalida(t: string) { this.costesSalida.set(this.numero(t)); }
  editarRentaNeta(t: string) { this.rentaNeta.set(this.numero(t)); }
  editarRevalorizacion(t: string) { this.revalorizacion.set(this.numero(t)); }
  editarAmortizacion(t: string) { this.amortizacionDeuda.set(this.numero(t)); }
  fijarReales(v: boolean) { this.valoresReales.set(v); }

  /** Mueve una categoría de fase; si coincide con la sugerida se elimina la excepción. */
  asignarFase(e: { id: string; fase: FaseLiquidez }) {
    const cat = this.categorias().find(c => c.id === e.id);
    if (!cat) return;

    const siguiente = { ...this.asignaciones() };
    if (e.fase === cat.faseSugerida) delete siguiente[e.id];
    else siguiente[e.id] = e.fase;
    this.asignaciones.set(siguiente);
  }

  restablecerFases() {
    this.asignaciones.set({});
  }
}
