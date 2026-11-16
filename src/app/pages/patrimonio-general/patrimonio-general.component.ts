import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';

import { DashboardPatrimonioService } from '../../services/dashboard-patrimonio.service';
import { ObjetivosService } from '../../services/objetivos.service';
import { PatrimonioService } from '../../services/patrimonio.service';
import { PrivacidadService } from '../../services/privacidad.service';
import { UiConfigService } from '../../services/ui-config.service';
import { mesLargo } from '../../shared/formato';
import { ObjetivosComponent } from '../objetivos/objetivos.component';
import { ComparadorFechasComponent } from './components/comparador-fechas/comparador-fechas.component';
import { ConsistenciaAhorroComponent } from './components/consistencia-ahorro/consistencia-ahorro.component';
import { DesgloseCategoriasComponent } from './components/desglose-categorias/desglose-categorias.component';
import { DistribucionDoughnutComponent } from './components/distribucion-doughnut/distribucion-doughnut.component';
import { EvolucionHistoricaComponent } from './components/evolucion-historica/evolucion-historica.component';
import { KpiInmueblesDeudaComponent } from './components/kpi-inmuebles-deuda/kpi-inmuebles-deuda.component';
import { KpiObjetivoGlobalComponent } from './components/kpi-objetivo-global/kpi-objetivo-global.component';
import { KpiPatrimonioNetoComponent } from './components/kpi-patrimonio-neto/kpi-patrimonio-neto.component';
import { SimuladorRegla4Component } from './components/simulador-regla-4/simulador-regla-4.component';

/**
 * Dashboard «Patrimonio general».
 *
 * Contenedor: lee los datos reales (registros mensuales, objetivos y configuración visual),
 * los transforma con `DashboardPatrimonioService` y los reparte entre las tarjetas de las
 * cinco filas del grid de 12 columnas.
 */
@Component({
  selector: 'app-patrimonio-general',
  standalone: true,
  imports: [
    MatIconModule,
    ObjetivosComponent,
    KpiPatrimonioNetoComponent,
    KpiObjetivoGlobalComponent,
    KpiInmueblesDeudaComponent,
    DistribucionDoughnutComponent,
    DesgloseCategoriasComponent,
    EvolucionHistoricaComponent,
    ConsistenciaAhorroComponent,
    ComparadorFechasComponent,
    SimuladorRegla4Component
  ],
  templateUrl: './patrimonio-general.component.html',
  styleUrl: './patrimonio-general.component.scss'
})
export class PatrimonioGeneralComponent {
  private readonly patrimonio = inject(PatrimonioService);
  private readonly objetivos = inject(ObjetivosService);
  private readonly ui = inject(UiConfigService);
  private readonly calculo = inject(DashboardPatrimonioService);
  protected readonly privacidad = inject(PrivacidadService);

  private readonly registros = toSignal(this.patrimonio.registros$, { requireSync: true });
  private readonly nombresCategorias = toSignal(this.patrimonio.categorias$, { requireSync: true });
  private readonly metas = toSignal(this.objetivos.objetivos$, { requireSync: true });
  protected readonly config = toSignal(this.ui.config$, { requireSync: true });

  protected readonly mesLargo = mesLargo;

  protected readonly serie = computed(() => this.calculo.construirSerie(this.registros(), this.nombresCategorias()));
  protected readonly resumen = computed(() => this.calculo.resumenMes(this.serie()));
  protected readonly filas = computed(() => this.calculo.filasCategorias(this.serie(), this.metas()));
  protected readonly inmuebles = computed(() => this.calculo.resumenInmuebles(this.registros()));
  protected readonly patrimonioInmobiliario = computed(() => this.calculo.patrimonioInmobiliario(this.serie()));
  protected readonly ahorroSugerido = computed(() => this.calculo.ahorroMensualSugerido(this.serie()));
  protected readonly objetivoTotal = computed(() => this.metas().total || 0);

  /** El gráfico de evolución se oculta solo si el usuario desactiva barras y líneas. */
  protected readonly mostrarEvolucion = computed(() => this.config().mostrarBarras || this.config().mostrarLineas);
}
