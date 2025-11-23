import { Component, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';

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

  patrimonio: any[] = [];
  total = 0;

  columnas: string[] = ['categoria', 'total'];

  constructor() {}

  ngOnInit(): void {
    // ⚠ Aquí debes leer del servicio real cuando lo conectemos
    // De momento lo dejo preparado:
    const stored = localStorage.getItem('movimientos');
    const movimientos = stored ? JSON.parse(stored) : [];

    const agregados: any = {};

    movimientos.forEach((m: any) => {
      if (!agregados[m.categoria]) agregados[m.categoria] = 0;
      agregados[m.categoria] += m.valor;
    });

    this.patrimonio = Object.keys(agregados).map(key => ({
      categoria: key,
      total: agregados[key]
    }));

    this.total = this.patrimonio.reduce((s, p) => s + p.total, 0);
  }
}
