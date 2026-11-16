import { Component, computed, inject, input, signal } from '@angular/core';
import { SerieDashboard } from '../../../../models/dashboard-patrimonio';
import { DashboardPatrimonioService } from '../../../../services/dashboard-patrimonio.service';
import { etiquetaMes, euros, porcentaje } from '../../../../shared/formato';
import { BarraProgresoComponent } from '../barra-progreso/barra-progreso.component';

/** Fila 4 · Comparador «Antes → Después» entre dos meses cualesquiera. */
@Component({
  selector: 'app-comparador-fechas',
  standalone: true,
  imports: [BarraProgresoComponent],
  templateUrl: './comparador-fechas.component.html',
  styleUrl: './comparador-fechas.component.scss'
})
export class ComparadorFechasComponent {
  private readonly calculo = inject(DashboardPatrimonioService);

  readonly serie = input.required<SerieDashboard>();

  protected readonly euros = euros;
  protected readonly porcentaje = porcentaje;
  protected readonly etiquetaMes = etiquetaMes;

  private readonly inicioElegido = signal<string | null>(null);
  private readonly finElegido = signal<string | null>(null);

  protected readonly meses = computed(() => this.serie().puntos.map(p => p.mes));

  /** Fin: el elegido (si sigue existiendo) o el último mes. */
  protected readonly fin = computed(() => {
    const meses = this.meses();
    const elegido = this.finElegido();
    return elegido && meses.includes(elegido) ? elegido : (meses.at(-1) ?? '');
  });

  /** Inicio: el elegido o, por defecto, un año antes del último mes (o el primero disponible). */
  protected readonly inicio = computed(() => {
    const meses = this.meses();
    const elegido = this.inicioElegido();
    if (elegido && meses.includes(elegido)) return elegido;
    const hace12 = meses.length > 12 ? meses[meses.length - 13] : meses[0];
    return hace12 ?? '';
  });

  protected readonly comparacion = computed(() => this.calculo.comparar(this.serie(), this.inicio(), this.fin()));

  protected elegirInicio(evento: Event) {
    this.inicioElegido.set((evento.target as HTMLSelectElement).value);
  }

  protected elegirFin(evento: Event) {
    this.finElegido.set((evento.target as HTMLSelectElement).value);
  }
}
