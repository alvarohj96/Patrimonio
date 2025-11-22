import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { PatrimonioService } from '../../services/patrimonio.service';

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

  categorias = ['Acciones', 'Fondos', 'Inmuebles', 'Liquidez', 'Cripto'];

  categoria = '';
  valor = 0;
  mes = '';

  constructor(private patrimonioService: PatrimonioService) {}

  guardar() {
    console.log('Categoría seleccionada:', this.categoria);
    console.log('Tipo de categoría:', typeof this.categoria);

    this.patrimonioService.addMovimiento({
      categoria: this.categoria,
      valor: this.valor,
      mes: this.mes
    });

    alert('Registrado correctamente 👍');

    this.categoria = '';
    this.valor = 0;
    this.mes = '';
  }
}