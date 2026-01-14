import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';

import { ObjetivosService } from '../../services/objetivos.service';
import { PatrimonioService } from '../../services/patrimonio.service';

@Component({
  selector: 'app-objetivos',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatInputModule,
    MatProgressBarModule
  ],
  templateUrl: './objetivos.component.html',
  styleUrls: ['./objetivos.component.scss']
})
export class ObjetivosComponent implements OnInit {

  objetivoTotal = 0;
  patrimonioActual = 0;

  categorias: string[] = [];
  objetivosCat: { categoria: string; objetivo: number; actual: number }[] = [];

  constructor(
    private objetivosSrv: ObjetivosService,
    private patrimonioSrv: PatrimonioService
  ) { }

  ngOnInit() {
    this.categorias = this.patrimonioSrv.getCategorias();

    this.objetivoTotal = this.objetivosSrv.getObjetivos().total;

    this.patrimonioSrv.registros$.subscribe(regs => {
      if (!regs || !regs.length) {
        this.patrimonioActual = 0;
        return;
      }

      const ultimo = regs[regs.length - 1];

      // 🔹 Patrimonio NETO total (valor - deuda)
      this.patrimonioActual = Object.values(ultimo.valores).reduce(
        (sum: number, categoria: any) =>
          sum +
          Object.values(categoria || {}).reduce((a: number, b: any) => {
            if (typeof b === 'number') {
              return a + b; // datos antiguos
            }
            return a + (b.valor - (b.deuda || 0)); // datos nuevos
          }, 0),
        0
      );

      this.recalcularCategorias(ultimo);
    });
  }

  recalcularCategorias(ultimo: any) {
    const objetivos = this.objetivosSrv.getObjetivos().categorias;

    this.objetivosCat = this.categorias.map(cat => {
      const totalActual = Object.values(ultimo.valores[cat] || {})
        .reduce((sum: number, item: any) =>
          sum + (item?.valor ?? 0) - (item?.deuda ?? 0)
          , 0);

      return {
        categoria: cat,
        objetivo: objetivos.find(o => o.categoria === cat)?.objetivo || 0,
        actual: totalActual
      };
    });
  }

  guardarTotal() {
    this.objetivosSrv.setObjetivoTotal(this.objetivoTotal);
  }

  guardarCategoria(cat: any) {
    this.objetivosSrv.setObjetivoCategoria(cat.categoria, cat.objetivo);
  }

  progreso(actual: number, objetivo: number): number {
    if (!objetivo || objetivo <= 0) return 0;
    return Math.min(100, (actual / objetivo) * 100);
  }

  estado(pct: number): string {
    if (pct >= 90) return 'estado-ok';
    if (pct >= 60) return 'estado-medio';
    return 'estado-bajo';
  }

  private sumarValoresCategoria(categoria: any): number {
    if (!categoria) return 0;

    return Object.values(categoria).reduce((a: number, b: any) => {
      if (typeof b === 'number') {
        return a + b; // datos antiguos
      }
      return a + (b.valor - (b.deuda || 0)); // datos nuevos
    }, 0);
  }
}
