import { Component, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';

import { PatrimonioService } from '../../services/patrimonio.service';

interface RegistroMensual {
  mes: string;
  valores: { [categoria: string]: number };
}

@Component({
  selector: 'app-patrimonio-general',
  standalone: true,
  imports: [
    CommonModule,
    DecimalPipe,
    MatCardModule,
    MatTableModule
  ],
  templateUrl: './patrimonio-general.component.html',
  styleUrls: ['./patrimonio-general.component.scss']
})
export class PatrimonioGeneralComponent implements OnInit {

  ultimoMes = '';
  datosUltimoMes: { categoria: string, valor: number }[] = [];
  total = 0;

  constructor(private patrimonioService: PatrimonioService) {}

  ngOnInit(): void {

    this.patrimonioService.registros$.subscribe(registros => {
      if (!registros || registros.length === 0) {
        this.datosUltimoMes = [];
        this.ultimoMes = '';
        this.total = 0;
        return;
      }

      // Ordenar por mes y elegir el último
      registros.sort((a, b) => a.mes.localeCompare(b.mes));
      const ultimo = registros[registros.length - 1];

      this.ultimoMes = ultimo.mes;

      this.datosUltimoMes = Object.keys(ultimo.valores).map(cat => ({
        categoria: cat,
        valor: ultimo.valores[cat] || 0
      }));

      this.total = this.datosUltimoMes.reduce((s, x) => s + x.valor, 0);
    });
  }
}
