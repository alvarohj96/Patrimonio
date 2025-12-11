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
  donutColors = [{ backgroundColor: ['#1e88e5', '#43a047', '#fb8c00', '#8e24aa', '#e53935'] }];

  totalMes = 0;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    public dialogRef: MatDialogRef<DetalleMensualDialogComponent>
  ) {}

  ngOnInit(): void {
    this.categorias = Object.keys(this.data.valores);
    this.calcularTotales();
    this.prepararDonut();
  }

  calcularTotales() {
    this.totalMes = 0;

    this.categorias.forEach(cat => {
      const valores = Object.values(this.data.valores[cat] || {}) as number[];
      const totalCat = valores.reduce((a, b) => a + (typeof b === 'number' ? b : Number(b)), 0);

      this.totalesPorCategoria[cat] = totalCat;
      this.totalMes += totalCat;
    });
  }

  getPorcentajeCategoria(cat: string): number {
    if (!this.totalMes) return 0;
    return (this.totalesPorCategoria[cat] / this.totalMes) * 100;
  }

  getSubcategorias(cat: string): string[] {
    return Object.keys(this.data.valores[cat] || {});
  }

  getValorSubcategoria(cat: string, sub: string): number {
    return this.data.valores[cat][sub] || 0;
  }

  getPorcentajeSubcategoria(cat: string, sub: string): number {
    const totalCat = this.totalesPorCategoria[cat] || 0;
    if (!totalCat) return 0;
    return (this.getValorSubcategoria(cat, sub) / totalCat) * 100;
  }

  prepararDonut() {
    this.donutLabels = this.categorias;
    this.donutData = this.categorias.map(c => this.totalesPorCategoria[c]);
  }
}
