import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { Chart, ArcElement, Tooltip, Legend } from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';

Chart.register(ArcElement, Tooltip, Legend);

@Component({
  selector: 'app-detalle-mensual-dialog',
  standalone: true,
  imports: [CommonModule, BaseChartDirective, MatButtonModule],
  templateUrl: './detalle-mensual-dialog.component.html',
  styleUrls: ['./detalle-mensual-dialog.component.scss']
})
export class DetalleMensualDialogComponent implements OnInit {

  categorias: string[] = [];
  totalesPorCategoria: { [cat: string]: number } = {};

  donutLabels: string[] = [];
  donutData: number[] = [];
  donutColors = [{
    backgroundColor: [
      '#1e88e5',
      '#43a047',
      '#fb8c00',
      '#8e24aa',
      '#e53935',
      '#00acc1',
      '#f06292'
    ]
  }];

  totalMes = 0;

  /** Ya no se usa para expandir/colapsar — se mantiene por si se reutiliza */
  categoriasAbiertas: { [cat: string]: boolean } = {};

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef: MatDialogRef<DetalleMensualDialogComponent>
  ) { }

  ngOnInit(): void {
    this.categorias = Object.keys(this.data.valores);

    // Todas abiertas por defecto (ya no se pliegan)
    this.categorias.forEach(cat => {
      this.categoriasAbiertas[cat] = true;
    });

    this.calcularTotales();
    this.prepararDonut();
  }

  public donutOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { enabled: true }
    }
  };

  // ===============================
  // Cálculo de totales (NETO)
  // ===============================
  calcularTotales() {
    this.totalMes = 0;
    this.totalesPorCategoria = {};

    this.categorias.forEach(cat => {
      const totalCat = Object.values(this.data.valores[cat] || {})
        .reduce((sum: number, item: any) =>
          sum + (item?.valor ?? 0) - (item?.deuda ?? 0)
          , 0);

      this.totalesPorCategoria[cat] = totalCat;
      this.totalMes += totalCat;
    });
  }

  // ===============================
  // Porcentajes por categoría
  // ===============================
  getPorcentajeCategoria(cat: string): number {
    if (!this.totalMes) return 0;
    return (this.totalesPorCategoria[cat] / this.totalMes) * 100;
  }

  // ===============================
  // Subcategorías
  // ===============================
  getSubcategorias(cat: string): string[] {
    return Object.keys(this.data.valores[cat] || {});
  }

  // ===============================
  // Valor NETO por subcategoría
  // ===============================
  getValorSubcategoria(cat: string, sub: string): number {
    const item = this.data.valores[cat]?.[sub];
    return (item?.valor ?? 0) - (item?.deuda ?? 0);
  }

  // ===============================
  // % de subcategoría dentro de categoría
  // ===============================
  getPorcentajeSubcategoria(cat: string, sub: string): number {
    const totalCat = this.totalesPorCategoria[cat] || 0;
    if (!totalCat) return 0;
    return (this.getValorSubcategoria(cat, sub) / totalCat) * 100;
  }

  // ===============================
  // Donut
  // ===============================
  prepararDonut() {
    this.donutLabels = this.categorias;
    this.donutData = this.categorias.map(c => this.totalesPorCategoria[c]);
  }

  esInmuebles(cat: string): boolean {
    return cat.toLowerCase().includes('inmueble');
  }
}
