import { Component, ElementRef, ViewChild, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList } from '@angular/cdk/drag-drop';

import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { PatrimonioService } from '../../services/patrimonio.service';

/** Normaliza para comparar nombres: sin mayúsculas, tildes ni espacios sobrantes. */
function normalizar(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('es').normalize('NFD').replace(/\p{M}/gu, '');
}

@Component({
  selector: 'app-gestionar-subcategorias',
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
  templateUrl: './gestionar-subcategorias.component.html',
  styleUrls: ['./gestionar-subcategorias.component.scss']
})
export class GestionarSubcategoriasComponent {

  private serv = inject(PatrimonioService);
  private snack = inject(MatSnackBar);
  private data = inject<{ categoria?: string } | null>(MAT_DIALOG_DATA, { optional: true });
  dialogRef = inject(MatDialogRef<GestionarSubcategoriasComponent>);

  @ViewChild('nuevaInput') nuevaInput?: ElementRef<HTMLInputElement>;

  categorias = signal<string[]>(this.serv.getCategorias());
  mapa = signal(this.serv.getMapaSubcategorias());
  categoria = signal('');
  nuevaSub = signal('');

  /** Subcategorías de la categoría seleccionada. */
  subs = computed(() => this.mapa()[this.categoria()] ?? []);

  /** Meses con dato por subcategoría de la categoría seleccionada (se calcula al cambiar de categoría). */
  meses = signal<{ [sub: string]: number }>({});

  constructor() {
    const pedida = this.data?.categoria;
    const inicial = pedida && this.categorias().includes(pedida) ? pedida : (this.categorias()[0] ?? '');
    this.seleccionar(inicial);
  }

  numSubs(cat: string): number {
    return (this.mapa()[cat] || []).length;
  }

  seleccionar(cat: string) {
    this.categoria.set(cat);
    this.meses.set(cat ? this.serv.contarMesesPorSubcategoria(cat) : {});
    this.nuevaSub.set('');
  }

  // ----- Añadir (admite varias a la vez separadas por comas) -----

  /** Nombres que se van a añadir según lo escrito (sin vacíos ni repetidos). */
  private candidatas(): string[] {
    const vistos = new Set<string>();
    return this.nuevaSub()
      .split(/[,;\n]+/)
      .map(s => s.trim().replace(/\s+/g, ' '))
      .filter(s => {
        const k = normalizar(s);
        if (!s || vistos.has(k)) return false;
        vistos.add(k);
        return true;
      });
  }

  error(): string {
    const existentes = new Map(this.subs().map(s => [normalizar(s), s]));
    const repetidas = this.candidatas().filter(c => existentes.has(normalizar(c)));
    if (!repetidas.length) return '';
    return repetidas.length === 1
      ? `«${existentes.get(normalizar(repetidas[0]))}» ya existe en ${this.categoria()}.`
      : `Ya existen en ${this.categoria()}: ${repetidas.map(r => `«${r}»`).join(', ')}.`;
  }

  puedeAnadir(): boolean {
    return !!this.categoria() && this.candidatas().length > 0 && !this.error();
  }

  anyadir() {
    if (!this.puedeAnadir()) return;
    for (const s of this.candidatas()) this.serv.addSubcategoria(this.categoria(), s);
    this.mapa.set(this.serv.getMapaSubcategorias());
    this.nuevaSub.set('');
    this.nuevaInput?.nativeElement.focus();
  }

  // ----- Eliminar (sin perder datos: se puede deshacer) -----

  eliminar(sub: string) {
    const cat = this.categoria();
    const ordenAnterior = [...this.subs()];
    const meses = this.meses()[sub] || 0;

    this.serv.removeSubcategoria(cat, sub);
    this.mapa.set(this.serv.getMapaSubcategorias());

    const aviso = meses
      ? `«${sub}» eliminada. Sus ${meses} ${meses === 1 ? 'mes registrado se conserva' : 'meses registrados se conservan'}.`
      : `«${sub}» eliminada.`;

    this.snack.open(aviso, 'Deshacer', { duration: 7000 }).onAction().subscribe(() => {
      this.serv.addSubcategoria(cat, sub);
      this.serv.ordenarSubcategorias(cat, ordenAnterior);
      this.mapa.set(this.serv.getMapaSubcategorias());
    });
  }

  // ----- Reordenar (arrastrar o Alt + ↑/↓ sobre el asa) -----

  soltar(ev: CdkDragDrop<string[]>) {
    this.mover(ev.previousIndex, ev.currentIndex);
  }

  mover(desde: number, hasta: number) {
    const lista = [...this.subs()];
    if (hasta < 0 || hasta >= lista.length || desde === hasta) return;
    const [item] = lista.splice(desde, 1);
    lista.splice(hasta, 0, item);
    this.serv.ordenarSubcategorias(this.categoria(), lista);
    this.mapa.set(this.serv.getMapaSubcategorias());
  }
}
