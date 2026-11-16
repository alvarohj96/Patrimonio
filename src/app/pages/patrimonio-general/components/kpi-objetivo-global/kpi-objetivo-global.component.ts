import { Component, computed, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DashboardPatrimonioService } from '../../../../services/dashboard-patrimonio.service';
import { DashboardPreferenciasService } from '../../../../services/dashboard-preferencias.service';
import { euros, mesLargo, porcentaje } from '../../../../shared/formato';
import { BarraProgresoComponent } from '../barra-progreso/barra-progreso.component';

/** Fila 1 · Objetivo global y fecha estimada para alcanzarlo según el ahorro mensual. */
@Component({
  selector: 'app-kpi-objetivo-global',
  standalone: true,
  imports: [FormsModule, BarraProgresoComponent],
  templateUrl: './kpi-objetivo-global.component.html',
  styleUrl: './kpi-objetivo-global.component.scss'
})
export class KpiObjetivoGlobalComponent {
  private readonly calculo = inject(DashboardPatrimonioService);
  private readonly prefs = inject(DashboardPreferenciasService);

  /** Patrimonio neto actual (€). */
  readonly patrimonio = input.required<number>();
  /** Meta total (€); 0 = sin meta definida. */
  readonly objetivo = input.required<number>();
  /** Último mes registrado (`YYYY-MM`), punto de partida de la proyección. */
  readonly mesBase = input.required<string>();
  /** Ahorro mensual de referencia calculado del histórico. */
  readonly ahorroSugerido = input<number | null>(null);

  protected readonly euros = euros;
  protected readonly porcentaje = porcentaje;
  protected readonly rentabilidad = DashboardPatrimonioService.RENTABILIDAD_PROYECCION;

  protected readonly hayObjetivo = computed(() => this.objetivo() > 0);
  protected readonly progreso = computed(() =>
    this.hayObjetivo() ? Math.max(0, Math.min(100, (this.patrimonio() / this.objetivo()) * 100)) : 0);
  protected readonly faltan = computed(() => Math.max(0, this.objetivo() - this.patrimonio()));

  /** Ahorro editado por el usuario o, si aún no lo ha tocado, el sugerido. */
  protected readonly ahorro = computed(() => this.prefs.ahorroMensual() ?? this.ahorroSugerido() ?? 0);

  protected readonly proyeccion = computed(() => this.calculo.proyectarObjetivo({
    actual: this.patrimonio(),
    objetivo: this.objetivo(),
    ahorroMensual: this.ahorro(),
    mesBase: this.mesBase()
  }));

  protected readonly textoProyeccion = computed(() => {
    const p = this.proyeccion();
    switch (p.estado) {
      case 'alcanzado': return '¡Meta alcanzada!';
      case 'lejano': return 'Más de 50 años';
      case 'en-progreso': return `Meta estimada: ${mesLargo(p.fecha ?? '')}`;
      default: return '';
    }
  });

  protected editarAhorro(valor: number | null) {
    // Un campo vacío o inválido se interpreta como 0 (no como «sin editar»)
    this.prefs.ahorroMensual.set(typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 ? valor : 0);
  }
}
