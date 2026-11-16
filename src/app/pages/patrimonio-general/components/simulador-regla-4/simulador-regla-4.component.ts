import { Component, computed, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DashboardPatrimonioService } from '../../../../services/dashboard-patrimonio.service';
import { DashboardPreferenciasService } from '../../../../services/dashboard-preferencias.service';
import { euros, porcentaje } from '../../../../shared/formato';
import { BarraProgresoComponent } from '../barra-progreso/barra-progreso.component';

/** Fila 5 · Simulador de retiro sostenible (regla del 4 %). */
@Component({
  selector: 'app-simulador-regla-4',
  standalone: true,
  imports: [FormsModule, BarraProgresoComponent],
  templateUrl: './simulador-regla-4.component.html',
  styleUrl: './simulador-regla-4.component.scss'
})
export class SimuladorRegla4Component {
  private readonly calculo = inject(DashboardPatrimonioService);
  protected readonly prefs = inject(DashboardPreferenciasService);

  /** Patrimonio neto total (€). */
  readonly patrimonioTotal = input.required<number>();
  /** Patrimonio neto de las categorías inmobiliarias (€); 0 si no hay. */
  readonly patrimonioInmobiliario = input(0);

  protected readonly euros = euros;
  protected readonly porcentaje = porcentaje;
  protected readonly tasaMin = DashboardPreferenciasService.TASA_MIN;
  protected readonly tasaMax = DashboardPreferenciasService.TASA_MAX;
  protected readonly tasaPaso = DashboardPreferenciasService.TASA_PASO;

  protected readonly hayInmuebles = computed(() => this.patrimonioInmobiliario() !== 0);

  protected readonly capitalBase = computed(() =>
    this.prefs.incluirInmuebles() ? this.patrimonioTotal() : this.patrimonioTotal() - this.patrimonioInmobiliario());

  protected readonly retiro = computed(() => this.calculo.retiroSostenible({
    capitalBase: this.capitalBase(),
    tasaRetiro: this.prefs.tasaRetiro(),
    gastoMensual: this.prefs.gastoMensual()
  }));

  protected readonly coberturaBarra = computed(() => Math.min(100, this.retiro().cobertura ?? 0));

  protected editarTasa(evento: Event) {
    this.prefs.tasaRetiro.set(Number((evento.target as HTMLInputElement).value));
  }

  protected editarGasto(valor: number | null) {
    this.prefs.gastoMensual.set(typeof valor === 'number' && Number.isFinite(valor) && valor >= 0 ? valor : null);
  }

  protected alternarInmuebles(evento: Event) {
    this.prefs.incluirInmuebles.set((evento.target as HTMLInputElement).checked);
  }
}
