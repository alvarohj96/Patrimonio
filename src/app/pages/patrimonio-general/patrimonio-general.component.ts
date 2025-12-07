import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DecimalPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { BaseChartDirective } from 'ng2-charts';
import { PatrimonioService, RegistroMensual } from '../../services/patrimonio.service';

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
    MatIconModule
  ],
  templateUrl: './patrimonio-general.component.html',
  styleUrls: ['./patrimonio-general.component.scss']
})
export class PatrimonioGeneralComponent implements OnInit, OnDestroy {

  registros: RegistroMensual[] = [];
  datosUltimoMes: { categoria: string; total: number }[] = [];
  totalUltimoMes = 0;
  totalMesAnterior = 0;
  variacionAbsoluta = 0;
  variacionPorcentaje = 0;
  tendencia: 'sube' | 'baja' | 'igual' = 'igual';


  // Gráfico donut (último mes)
  chartLabels: string[] = [];
  chartData: number[] = [];
  chartColors = [{ backgroundColor: ['#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#e53935'] }];

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

  // Gráfico de líneas (evolución por categoría)
  lineLabels: string[] = [];
  lineData: any = { labels: [], datasets: [] };

  sub: any;

  constructor(private patrimonioService: PatrimonioService) { }

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
      this.chartLabels = [];
      this.chartData = [];
      return;
    }

    this.registros.sort((a, b) => a.mes.localeCompare(b.mes));
    const ultimo = this.registros[this.registros.length - 1];

    this.procesarUltimoMes(ultimo);
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
  procesarUltimoMes(ultimo: RegistroMensual) {
    const categorias = Object.keys(ultimo.valores);
    const resumen = categorias.map(cat => ({
      categoria: cat,
      total: Object.values(ultimo.valores[cat]).reduce((a, b) => a + b, 0)
    }));

    this.datosUltimoMes = resumen;

    this.chartLabels = resumen.map(r => r.categoria);
    this.chartData = resumen.map(r => r.total);

    // ➜ TOTAL GENERAL DEL MES
    this.totalUltimoMes = this.datosUltimoMes
      .reduce((s, c) => s + c.total, 0);
  }

  // ======================================================
  // GRÁFICO DE BARRAS (totales por mes)
  // ======================================================
  procesarBarras() {
    this.barLabels = this.registros.map(r => r.mes);

    const categorias = this.obtenerCategoriasGlobales();

    this.barData = {
      labels: this.barLabels,
      datasets: categorias.map((categoria, idx) => ({
        label: categoria,
        data: this.registros.map(r =>
          this.sumarCategoria(r.valores[categoria])
        ),
        backgroundColor: this.obtenerColor(idx)
      }))
    };
  }

  // ======================================================
  // GRÁFICO DE LÍNEAS (evolución por categoría)
  // ======================================================
  procesarLineas() {
    this.lineLabels = this.registros.map(r => r.mes);

    const categorias = this.obtenerCategoriasGlobales();

    this.lineData = {
      labels: this.lineLabels,
      datasets: categorias.map((categoria, idx) => ({
        label: categoria,
        data: this.registros.map(r =>
          this.sumarCategoria(r.valores[categoria])
        ),
        borderColor: this.obtenerColor(idx),
        tension: 0.3,
        fill: false
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

  obtenerColor(i: number): string {
    const colores = ['#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#e53935'];
    return colores[i % colores.length];
  }

  sumarTotalMes(r: RegistroMensual): number {
    return Object.keys(r.valores)
      .reduce((sum, cat) =>
        sum + this.sumarCategoria(r.valores[cat])
        , 0);
  }

}
