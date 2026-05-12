import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { GestionarCategoriasComponent } from '../../shared/gestionar-categorias/gestionar-categorias.component';
import { GestionarSubcategoriasComponent } from '../../shared/gestionar-subcategorias/gestionar-subcategorias.component';
import { PatrimonioService } from '../../services/patrimonio.service';

@Component({
  selector: 'app-formulario-mensual-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatDatepickerModule,
    MatNativeDateModule
  ],
  templateUrl: './formulario-mensual-dialog.html',
  styleUrls: ['./formulario-mensual-dialog.scss']
})
export class FormularioMensualDialogComponent {

  categorias: string[] = [];

  subcategoriasPorCategoria: { [cat: string]: string[] } = {};

  categoria = '';
  subcategoria = '';

  valor = 0;
  deuda = 0;

  porcentajePropiedad = 100;

  mes = '';
  mesSeleccionado: Date | null = null;

  constructor(
    private patrimonioService: PatrimonioService,
    private dialog: MatDialog,
    private dialogRef: MatDialogRef<FormularioMensualDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {

    this.categorias = this.patrimonioService.getCategorias();

    this.subcategoriasPorCategoria =
      this.patrimonioService.getMapaSubcategorias();
  }

  onCategoriaChange() {
    this.subcategoria = '';

    // Reset valores inmuebles
    this.deuda = 0;
    this.porcentajePropiedad = 100;
  }

  abrirGestionCategorias() {
    this.dialog.open(GestionarCategoriasComponent, {
      width: 'auto',
      maxWidth: '95vw',
      maxHeight: '90vh',
      panelClass: 'dialogo-ancho'
    });

  }

  abrirGestionSubcategorias() {
    this.dialog.open(GestionarSubcategoriasComponent, {
      width: 'auto',
      maxWidth: '95vw',
      maxHeight: '90vh',
      panelClass: 'dialogo-ancho'
    });

  }

  seleccionarMes(event: Date, datepicker: any) {

    const year = event.getFullYear();

    const month = (event.getMonth() + 1)
      .toString()
      .padStart(2, '0');

    this.mes = `${year}-${month}`;

    this.mesSeleccionado = event;

    datepicker.close();
  }

  guardar() {

    if (
      !this.categoria ||
      !this.subcategoria ||
      !this.valor ||
      !this.mes
    ) {
      return;
    }

    const registros = this.patrimonioService.getRegistros();

    let registro = registros.find(r => r.mes === this.mes);

    // Crear mes si no existe
    if (!registro) {

      registro = {
        mes: this.mes,
        valores: {}
      };

      registros.push(registro);
    }

    // Crear categoría si no existe
    if (!registro.valores[this.categoria]) {
      registro.valores[this.categoria] = {};
    }

    // ===== INMUEBLES =====
    if (this.categoria === 'Inmuebles') {

      const porcentaje = this.porcentajePropiedad / 100;

      const valorNeto = this.valor * porcentaje;

      const deudaNeta = this.deuda * porcentaje;

      registro.valores[this.categoria][this.subcategoria] = {
        valor: valorNeto,
        deuda: deudaNeta,
        porcentaje: this.porcentajePropiedad
      };

    }

    // ===== RESTO =====
    else {

      registro.valores[this.categoria][this.subcategoria] = {
        valor: this.valor,
        deuda: 0,
        porcentaje: 100
      };

    }

    // Persistir
    this.patrimonioService.actualizarRegistros(registros);

    this.dialogRef.close(true);
  }

}