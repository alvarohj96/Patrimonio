import { Injectable, effect, signal } from '@angular/core';
import { PreferenciasDashboard, RangoEvolucion, TipoGraficoEvolucion } from '../models/dashboard-patrimonio';

const TIPOS: readonly TipoGraficoEvolucion[] = ['barras', 'lineas'];
const RANGOS: readonly RangoEvolucion[] = ['6M', '1A', 'ALL'];

/**
 * Preferencias editables del dashboard «Patrimonio general» (ahorro mensual de la
 * proyección, tipo y rango del gráfico de evolución, simulador de la regla del 4 %).
 * Se guardan en localStorage, como el resto de ajustes de la aplicación.
 */
@Injectable({ providedIn: 'root' })
export class DashboardPreferenciasService {

  static readonly TASA_MIN = 3;
  static readonly TASA_MAX = 5;
  static readonly TASA_PASO = 0.1;
  static readonly TASA_POR_DEFECTO = 4;
  static readonly GASTO_POR_DEFECTO = 2000;

  private readonly LS_KEY = 'dashboard_preferencias';
  private readonly inicial = this.cargar();

  /** `null` = se usa el ahorro sugerido a partir del histórico. */
  readonly ahorroMensual = signal<number | null>(this.inicial.ahorroMensual);
  readonly tipoEvolucion = signal<TipoGraficoEvolucion>(this.inicial.tipoEvolucion);
  readonly rangoEvolucion = signal<RangoEvolucion>(this.inicial.rangoEvolucion);
  readonly tasaRetiro = signal<number>(this.inicial.tasaRetiro);
  readonly gastoMensual = signal<number | null>(this.inicial.gastoMensual);
  readonly incluirInmuebles = signal<boolean>(this.inicial.incluirInmuebles);

  /**
   * Categorías ocultas con los chips de cada vista del gráfico de evolución. Se guardan
   * ocultas (no visibles) para que una categoría nueva aparezca activada. Solo duran la sesión.
   */
  readonly categoriasOcultasBarras = signal<ReadonlySet<string>>(new Set());
  readonly categoriasOcultasLineas = signal<ReadonlySet<string>>(new Set());

  constructor() {
    effect(() => this.guardar({
      version: 1,
      ahorroMensual: this.ahorroMensual(),
      tipoEvolucion: this.tipoEvolucion(),
      rangoEvolucion: this.rangoEvolucion(),
      tasaRetiro: this.tasaRetiro(),
      gastoMensual: this.gastoMensual(),
      incluirInmuebles: this.incluirInmuebles()
    }));
  }

  private porDefecto(): PreferenciasDashboard {
    return {
      version: 1,
      ahorroMensual: null,
      tipoEvolucion: 'barras',
      rangoEvolucion: '1A',
      tasaRetiro: DashboardPreferenciasService.TASA_POR_DEFECTO,
      gastoMensual: DashboardPreferenciasService.GASTO_POR_DEFECTO,
      incluirInmuebles: false
    };
  }

  private cargar(): PreferenciasDashboard {
    const base = this.porDefecto();
    try {
      const raw = localStorage.getItem(this.LS_KEY);
      if (!raw) return base;
      const datos: Partial<Record<keyof PreferenciasDashboard, unknown>> = JSON.parse(raw);
      if (!datos || typeof datos !== 'object') return base;

      const numero = (v: unknown, min: number, max: number): number | null =>
        typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null;

      const tipo = TIPOS.find(t => t === datos.tipoEvolucion);
      const rango = RANGOS.find(r => r === datos.rangoEvolucion);

      return {
        version: 1,
        ahorroMensual: numero(datos.ahorroMensual, 0, 10_000_000),
        tipoEvolucion: tipo ?? base.tipoEvolucion,
        rangoEvolucion: rango ?? base.rangoEvolucion,
        tasaRetiro: numero(datos.tasaRetiro, DashboardPreferenciasService.TASA_MIN, DashboardPreferenciasService.TASA_MAX) ?? base.tasaRetiro,
        gastoMensual: datos.gastoMensual === null ? null : (numero(datos.gastoMensual, 0, 10_000_000) ?? base.gastoMensual),
        incluirInmuebles: typeof datos.incluirInmuebles === 'boolean' ? datos.incluirInmuebles : base.incluirInmuebles
      };
    } catch {
      return base;
    }
  }

  private guardar(estado: PreferenciasDashboard) {
    try {
      localStorage.setItem(this.LS_KEY, JSON.stringify(estado));
    } catch {
      /* almacenamiento no disponible: las preferencias solo viven en memoria */
    }
  }
}
