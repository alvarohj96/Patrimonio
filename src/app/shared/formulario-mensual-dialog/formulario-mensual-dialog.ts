import { Component, Inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule, MatSelect } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
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
    MatIconModule,
    MatDatepickerModule,
    MatNativeDateModule
  ],
  templateUrl: './formulario-mensual-dialog.html',
  styleUrls: ['./formulario-mensual-dialog.scss']
})
export class FormularioMensualDialogComponent {

  @ViewChild('subcategoriaSelect') subcategoriaSelect?: MatSelect;

  categorias: string[] = [];

  subcategoriasPorCategoria: { [cat: string]: string[] } = {};

  categoria = '';
  subcategoria = '';

  valor = 0;
  deuda = 0;

  porcentajePropiedad = 100;

  mes = '';
  mesSeleccionado: Date | null = null;

  // ===== Añadido para permitir cargar varios valores seguidos =====
  // Entradas ya guardadas en esta sesión del diálogo (para feedback visual y poder deshacer)
  entradasSesion: { categoria: string; subcategoria: string; valor: number; deuda: number }[] = [];

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

  // Subcategorías de la categoría actual que todavía no se han guardado en esta sesión.
  // Así, tras guardar una subcategoría, desaparece de la lista y el usuario pasa
  // directamente a la siguiente sin arriesgarse a machacar por error el valor recién metido.
  subcategoriasDisponibles(): string[] {
    const todas = this.subcategoriasPorCategoria[this.categoria] || [];
    const yaGuardadas = new Set(
      this.entradasSesion
        .filter(e => e.categoria === this.categoria)
        .map(e => e.subcategoria)
    );
    return todas.filter(s => !yaGuardadas.has(s));
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

  /**
   * Guarda la entrada actual (categoría + subcategoría + valor) sin tocar el
   * estado del diálogo (no resetea campos ni cierra). Devuelve false si faltan
   * datos obligatorios.
   */
  private guardarEntradaActual(): boolean {

    if (
      !this.categoria ||
      !this.subcategoria ||
      !this.valor ||
      !this.mes
    ) {
      return false;
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

    let valorGuardado = this.valor;
    let deudaGuardada = 0;

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

      valorGuardado = valorNeto;
      deudaGuardada = deudaNeta;

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

    this.entradasSesion.push({
      categoria: this.categoria,
      subcategoria: this.subcategoria,
      valor: valorGuardado,
      deuda: deudaGuardada
    });

    return true;
  }

  /**
   * Acción principal (botón por defecto / tecla Enter): guarda el valor actual
   * y deja el diálogo ABIERTO con la misma categoría y mes seleccionados, listo
   * para introducir la siguiente subcategoría sin tener que volver a elegirlos.
   */
  guardarYAnadirOtro() {

    if (!this.guardarEntradaActual()) return;

    // Solo reseteamos lo que cambia entrada a entrada.
    // Categoría y mes se mantienen a propósito.
    this.subcategoria = '';
    this.valor = 0;
    this.deuda = 0;
    this.porcentajePropiedad = 100;

    // Devolver el foco al selector de subcategoría para poder encadenar
    // "seleccionar subcategoría -> escribir valor -> Enter" sin usar el ratón.
    setTimeout(() => this.subcategoriaSelect?.focus());
  }

  /**
   * Guarda (si hay algo pendiente y válido) y cierra el diálogo.
   */
  guardarYCerrar() {

    if (this.categoria && this.subcategoria && this.valor && this.mes) {
      this.guardarEntradaActual();
    }

    this.dialogRef.close(this.entradasSesion.length > 0);
  }

  /**
   * Deshace una entrada ya guardada en esta sesión (por si el usuario se
   * equivoca de valor o subcategoría), eliminándola también del registro persistido.
   */
  quitarEntrada(index: number) {

    const entrada = this.entradasSesion[index];
    if (!entrada) return;

    const registros = this.patrimonioService.getRegistros();
    const registro = registros.find(r => r.mes === this.mes);

    if (registro?.valores[entrada.categoria]) {
      delete registro.valores[entrada.categoria][entrada.subcategoria];
    }

    this.patrimonioService.actualizarRegistros(registros);

    this.entradasSesion.splice(index, 1);
  }

}