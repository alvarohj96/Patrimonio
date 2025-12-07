import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogRef } from '@angular/material/dialog';

import { PatrimonioService } from '../../services/patrimonio.service';

@Component({
  selector: 'app-gestionar-subcategorias',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatSelectModule,
    MatInputModule,
    MatIconModule
  ],
  template: `
    <h2>Gestionar subcategorías</h2>

    <mat-form-field appearance="outline" style="width:100%">
      <mat-label>Categoría</mat-label>
      <mat-select [(ngModel)]="categoria" (selectionChange)="cargar()">
        <mat-option *ngFor="let c of categorias" [value]="c">{{ c }}</mat-option>
      </mat-select>
    </mat-form-field>

    <div *ngIf="categoria">

      <h3>Subcategorías</h3>

      <ul>
        <li *ngFor="let s of subs">
          {{ s }}
          <button mat-icon-button color="warn" (click)="eliminar(s)">
            <mat-icon>delete</mat-icon>
          </button>
        </li>
      </ul>

      <mat-form-field appearance="outline" style="width:100%">
        <mat-label>Nueva subcategoría</mat-label>
        <input matInput [(ngModel)]="nuevaSub">
      </mat-form-field>

      <button mat-raised-button color="primary" (click)="anyadir()">
        Añadir
      </button>
    </div>

    <div style="text-align:right;margin-top:15px">
      <button mat-button (click)="dialogRef.close()">Cerrar</button>
    </div>
  `
})
export class GestionarSubcategoriasComponent {

  categorias: string[] = [];
  categoria = "";
  nuevaSub = "";
  subs: string[] = [];

  constructor(
    private serv: PatrimonioService,
    public dialogRef: MatDialogRef<GestionarSubcategoriasComponent>
  ) {}

  ngOnInit() {
    // Obtener categorías dinámicas del servicio
    this.categorias = this.serv.getCategorias();
  }

  cargar() {
    this.subs = [...this.serv.getSubcategorias(this.categoria)];
  }

  anyadir() {
    if (!this.nuevaSub.trim()) return;
    this.serv.addSubcategoria(this.categoria, this.nuevaSub.trim());
    this.cargar();
    this.nuevaSub = "";
  }

  eliminar(s: string) {
    this.serv.removeSubcategoria(this.categoria, s);
    this.cargar();
  }
}
