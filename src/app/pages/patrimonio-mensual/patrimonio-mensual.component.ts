import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { PatrimonioService } from '../../services/patrimonio.service';

interface RegistroMensual {
  mes: string;      // "2025-02"
  valores: { [categoria: string]: number };
}

@Component({
  selector: 'app-patrimonio-mensual',
  standalone: true,
  imports: [
    FormsModule,
    CommonModule
  ],
  templateUrl: './patrimonio-mensual.component.html',
  styleUrls: ['./patrimonio-mensual.component.scss']
})

export class PatrimonioMensualComponent {

  categorias = ['Fondos', 'Inmuebles', 'Liquidez', 'Cripto'];

  categoria = '';
  valor = 0;
  mes = '';

  registros: RegistroMensual[] = [];

  constructor(private patrimonioService: PatrimonioService) {}

  ngOnInit() {
    this.registros = this.patrimonioService.getRegistros();
  }

  guardar() {
    console.log('Categoría seleccionada:', this.categoria);
    console.log('Tipo de categoría:', typeof this.categoria);

    if (!this.categoria || !this.mes || !this.valor) return;

    const mesNormalizado = this.mes;

    let existente = this.registros.find(r => r.mes === mesNormalizado);

    if (!existente) {
      // Actualizar valores
      existente = {
        mes: mesNormalizado,
        valores: {}
      };
      // Inicializar todas las categorías a 0
      this.categorias.forEach(cat => {
        existente!.valores[cat] = 0;
      });

      this.registros.push(existente);

    } 

    existente.valores[this.categoria] = this.valor;

    // Ordenar por mes
    this.registros.sort((a, b) => a.mes.localeCompare(b.mes));

    alert('Registrado correctamente 👍');

    // Reset valores
    this.valor = 0;

    this.patrimonioService.actualizarRegistros(this.registros);
  }

  getTotal(r: RegistroMensual): number {
    return this.categorias.reduce((s, c) => s + (r.valores[c] || 0), 0);
  } 
}