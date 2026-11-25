import { Component, computed, input, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { CategoriaClasificada, FaseLiquidez } from '../../../../models/plan-desinversion';
import { euros, porcentaje } from '../../../../shared/formato';

/** Categoría clasificada con el color con el que se pinta en toda la pantalla. */
export interface CategoriaVista extends CategoriaClasificada {
  color: string;
}

interface FaseVista {
  id: FaseLiquidez;
  numero: number;
  titulo: string;
  ayuda: string;
  icono: string;
}

const FASES: readonly FaseVista[] = [
  { id: 'colchon', numero: 1, titulo: 'Colchón de liquidez', ayuda: 'Efectivo, cuentas remuneradas, monetarios', icono: 'savings' },
  { id: 'liquidos', numero: 2, titulo: 'Activos líquidos fraccionables', ayuda: 'Fondos, ETFs, acciones, cripto', icono: 'show_chart' },
  { id: 'indivisibles', numero: 3, titulo: 'Activos indivisibles', ayuda: 'Inmuebles y activos ilíquidos', icono: 'home_work' }
];

/** Cómo se agrupa el patrimonio actual en las 3 fases de liquidez (editable por categoría). */
@Component({
  selector: 'app-agrupacion-liquidez',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './agrupacion-liquidez.component.html',
  styleUrl: './agrupacion-liquidez.component.scss'
})
export class AgrupacionLiquidezComponent {
  readonly categorias = input.required<readonly CategoriaVista[]>();

  readonly asignar = output<{ id: string; fase: FaseLiquidez }>();
  readonly restablecer = output<void>();

  protected readonly fases = FASES;
  protected readonly euros = euros;
  protected readonly porcentaje = porcentaje;

  protected readonly hayPersonalizadas = computed(() => this.categorias().some(c => c.personalizada));

  protected readonly columnas = computed(() => {
    const columnas = FASES.map(fase => {
      const categorias = this.categorias().filter(c => c.fase === fase.id);
      const bruto = categorias.reduce((s, c) => s + c.valorBruto, 0);
      const deuda = categorias.reduce((s, c) => s + c.deuda, 0);
      return { fase, categorias, bruto, deuda, total: Math.max(0, bruto - deuda), porcentaje: 0 };
    });

    const total = columnas.reduce((s, c) => s + c.total, 0);
    return columnas.map(c => ({ ...c, porcentaje: total > 0 ? (c.total / total) * 100 : 0 }));
  });

  protected readonly hayPatrimonio = computed(() => this.columnas().some(c => c.total > 0));

  protected resumenBarra(): string {
    return this.columnas()
      .map(c => `Fase ${c.fase.numero}, ${c.fase.titulo}: ${porcentaje(c.porcentaje, 0)}`)
      .join('. ');
  }

  protected mover(c: CategoriaVista, fase: FaseLiquidez) {
    if (c.fase !== fase) this.asignar.emit({ id: c.id, fase });
  }
}
