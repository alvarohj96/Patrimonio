import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';

import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

import { PatrimonioService } from '../../services/patrimonio.service';
import { ObjetivosInversionService } from '../../services/objetivos-inversion.service';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { GestionarSubcategoriasComponent } from '../gestionar-subcategorias/gestionar-subcategorias.component';

/** Normaliza para comparar nombres: sin mayúsculas, tildes ni espacios sobrantes. */
export function normalizarNombre(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es').normalize('NFD').replace(/\p{M}/gu, '');
}

@Component({
  selector: 'app-gestionar-categorias',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    MatDialogModule,
    MatButtonModule,
    MatInputModule,
    MatIconModule
  ],
  templateUrl: './gestionar-categorias.component.html',
  styleUrls: ['./gestionar-categorias.component.scss']
})
export class GestionarCategoriasComponent {

  private serv = inject(PatrimonioService);
  private objetivos = inject(ObjetivosInversionService);
  private dialog = inject(MatDialog);
  dialogRef = inject(MatDialogRef<GestionarCategoriasComponent>);

  @ViewChild('nuevaInput') nuevaInput?: ElementRef<HTMLInputElement>;

  categorias = signal<string[]>(this.serv.getCategorias());
  mapaSubs = signal(this.serv.getMapaSubcategorias());
  nuevaCat = signal('');

  /** Mensaje de validación mientras se escribe (vacío si todo está bien). */
  error(): string {
    const nombre = this.nuevaCat().trim();
    if (!nombre) return '';
    const clave = normalizarNombre(nombre);
    const existente = this.categorias().find(c => normalizarNombre(c) === clave);
    return existente ? `Ya existe la categoría «${existente}».` : '';
  }

  puedeAnadir(): boolean {
    return !!this.nuevaCat().trim() && !this.error();
  }

  numSubs(cat: string): number {
    return (this.mapaSubs()[cat] || []).length;
  }

  addCat() {
    if (!this.puedeAnadir()) return;
    this.serv.addCategoria(this.nuevaCat().trim().replace(/\s+/g, ' '));
    this.categorias.set(this.serv.getCategorias());
    this.nuevaCat.set('');
    this.nuevaInput?.nativeElement.focus();
  }

  eliminar(cat: string) {
    const id = this.serv.getCategoriasConId().find(c => c.nombre === cat)?.id;
    const tieneObjetivo = !!id && this.objetivos.hayConfiguracionGuardada([{ id, nombre: cat }]);
    const n = this.numSubs(cat);

    let mensaje = `¿Eliminar la categoría «${cat}»?`;
    if (n) mensaje += ` Sus ${n} ${n === 1 ? 'subcategoría dejará' : 'subcategorías dejarán'} de ofrecerse al registrar datos.`;
    if (tieneObjetivo) mensaje += ' También se perderá su configuración en Objetivos de inversión.';
    mensaje += ' Los meses ya registrados se conservan.';

    this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      maxWidth: '92vw',
      data: { titulo: 'Eliminar categoría', mensaje, confirmar: 'Eliminar' }
    }).afterClosed().subscribe(ok => {
      if (!ok) return;
      this.serv.removeCategoria(cat);
      this.categorias.set(this.serv.getCategorias());
    });
  }

  /** Abre la gestión de subcategorías ya posicionada en esta categoría. */
  abrirSubcategorias(cat: string) {
    this.dialog.open(GestionarSubcategoriasComponent, {
      width: 'auto',
      maxWidth: '95vw',
      maxHeight: '90vh',
      autoFocus: false,
      panelClass: 'dialogo-ancho',
      data: { categoria: cat }
    }).afterClosed().subscribe(() => this.mapaSubs.set(this.serv.getMapaSubcategorias()));
  }

  // ----- Reordenar (arrastrar o Alt + ↑/↓ sobre el asa) -----

  soltar(ev: CdkDragDrop<string[]>) {
    this.mover(ev.previousIndex, ev.currentIndex);
  }

  mover(desde: number, hasta: number) {
    const lista = [...this.categorias()];
    if (hasta < 0 || hasta >= lista.length || desde === hasta) return;
    moveItemInArray(lista, desde, hasta);
    this.categorias.set(lista);
    this.serv.ordenarCategorias(lista);
  }
}
