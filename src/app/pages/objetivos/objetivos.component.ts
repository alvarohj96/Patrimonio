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
      if (!regs.length) return;

      const ultimo = regs[regs.length - 1];
      this.patrimonioActual = Object.values(ultimo.valores)
        .reduce((sum, cat) => sum + Object.values(cat).reduce((a, b) => a + b, 0), 0);

      this.recalcularCategorias(ultimo);
    });
  }

  recalcularCategorias(ultimo: any) {
    const objetivos = this.objetivosSrv.getObjetivos().categorias;

    this.objetivosCat = this.categorias.map(cat => ({
      categoria: cat,
      objetivo: objetivos.find(o => o.categoria === cat)?.objetivo || 0,
      actual: Object.values(ultimo.valores[cat] || {})
        .reduce<number>((a, b) => a + (b as number), 0)
    }));
  }

  guardarTotal() {
    this.objetivosSrv.setObjetivoTotal(this.objetivoTotal);
  }

  guardarCategoria(cat: any) {
    this.objetivosSrv.setObjetivoCategoria(cat.categoria, cat.objetivo);
  }

  progreso(actual: number, objetivo: number): number {
    if (!objetivo || objetivo <= 0) return 0;
    return Math.min(100, Math.round((actual / objetivo) * 100));
  }

  estado(pct: number): string {
    if (pct >= 90) return 'estado-ok';
    if (pct >= 60) return 'estado-medio';
    return 'estado-bajo';
  } 
  
}
