import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogRef } from '@angular/material/dialog';

import { PatrimonioService } from '../../services/patrimonio.service';

@Component({
  selector: 'app-gestionar-categorias',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatInputModule,
    MatIconModule
  ],
  templateUrl: './gestionar-categorias.component.html',
  styleUrls: ['./gestionar-categorias.component.scss']
})
export class GestionarCategoriasComponent {

  categorias: string[] = [];
  nuevaCat = '';

  constructor(
    private serv: PatrimonioService,
    public dialogRef: MatDialogRef<GestionarCategoriasComponent>
  ) {
    this.categorias = [...this.serv.getCategorias()];
  }

  addCat() {
    if (!this.nuevaCat.trim()) return;
    this.serv.addCategoria(this.nuevaCat.trim());
    this.categorias.push(this.nuevaCat.trim());
    this.nuevaCat = '';
  }

  removeCat(cat: string) {
    this.serv.removeCategoria(cat);
    this.categorias = this.categorias.filter(c => c !== cat);
  }
}
