import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FormsModule } from '@angular/forms';

import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';

import { PatrimonioService } from '../../services/patrimonio.service';


@Component({
  selector: 'app-gestionar-categorias',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    DragDropModule
  ],
  template: `
    <h2>Gestionar categorías</h2>

    <!-- LISTA ARRASTRABLE -->
    <div cdkDropList 
         class="lista" 
         (cdkDropListDropped)="reordenar($event)">

      <div class="item" *ngFor="let c of categorias" cdkDrag>
        <div class="drag-handle" cdkDragHandle>
          <mat-icon>drag_indicator</mat-icon>
        </div>

        <span class="nombre">{{ c }}</span>

        <button mat-icon-button color="warn" (click)="eliminar(c)" *ngIf="categorias.length > 1">
          <mat-icon>delete</mat-icon>
        </button>
      </div>
    </div>

    <!-- NUEVA CATEGORÍA -->
    <div class="nueva">
      <input type="text" placeholder="Nueva categoría" [(ngModel)]="nueva">
      <button mat-raised-button color="primary" (click)="agregar()">Añadir</button>
    </div>

    <div class="acciones">
      <button mat-button (click)="dialogRef.close()">Cerrar</button>
    </div>
  `,
  styles: [`
    h2 {
      text-align:center;
      margin: 0 0 20px;
      font-size: 22px;
      font-weight: 600;
    }

    .lista {
      border: 1px solid #ddd;
      border-radius: 10px;
      padding: 10px;
      margin-bottom: 20px;
      max-height: 300px;
      overflow-y: auto;
    }

    .item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 6px;
      border-bottom: 1px solid #eee;
      background: white;
      border-radius: 6px;
      margin-bottom: 4px;
    }

    .item:last-child {
      border-bottom: none;
      margin-bottom: 0;
    }

    .drag-handle {
      cursor: grab;
      padding-right: 10px;
      display: flex;
      align-items: center;
    }

    .nombre {
      flex: 1;
      font-size: 16px;
    }

    .nueva {
      display:flex;
      gap:10px;
      margin-bottom: 15px;
    }

    input {
      flex: 1; 
      padding: 8px 10px;
      border: 1px solid #ccc;
      border-radius: 6px;
      font-size: 15px;
    }

    .acciones {
      display:flex;
      justify-content: flex-end;
    }
  `]
})
export class GestionarCategoriasComponent {

  categorias: string[] = [];
  nueva = '';

  constructor(
    private service: PatrimonioService,
    public dialogRef: MatDialogRef<GestionarCategoriasComponent>
  ) {
    this.categorias = this.service.getCategorias();
  }

  agregar() {
    const c = this.nueva.trim();
    if (!c) return;

    this.service.addCategoria(c);
    this.categorias = this.service.getCategorias();
    this.nueva = '';
  }

  eliminar(c: string) {
    this.service.removeCategoria(c);
    this.categorias = this.service.getCategorias();
  }

  reordenar(event: CdkDragDrop<string[]>) {
    moveItemInArray(this.categorias, event.previousIndex, event.currentIndex);
    this.service.ordenarCategorias(this.categorias);
  }
}
