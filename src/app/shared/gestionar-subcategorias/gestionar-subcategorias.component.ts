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
  templateUrl: './gestionar-subcategorias.component.html',
  styleUrls: ['./gestionar-subcategorias.component.scss']
})
export class GestionarSubcategoriasComponent {

  categorias: string[] = [];
  categoria = '';
  subs: string[] = [];
  nuevaSub = '';

  constructor(
    private serv: PatrimonioService,
    public dialogRef: MatDialogRef<GestionarSubcategoriasComponent>
  ) {
    this.categorias = this.serv.getCategorias();
  }

  cargar() {
    this.subs = [...this.serv.getSubcategorias(this.categoria)];
  }

  anyadir() {
    if (!this.nuevaSub.trim()) return;
    this.serv.addSubcategoria(this.categoria, this.nuevaSub.trim());
    this.cargar();
    this.nuevaSub = '';
  }

  eliminar(s: string) {
    this.serv.removeSubcategoria(this.categoria, s);
    this.cargar();
  }
}
