import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';

import { ObjetivosService } from '../../services/objetivos.service';
import { PatrimonioService } from '../../services/patrimonio.service';

interface CategoriaObjetivo {
  categoria: string;
  objetivo: number;
  actual: number;
  icono: string;
  color: string;
}

interface EstiloCategoria {
  clave: string;
  icono: string;
  color: string;
}

/** Icono + color identificativo por tipo de activo (se busca por coincidencia parcial). */
const ESTILOS_CATEGORIA: EstiloCategoria[] = [
  { clave: 'fondo', icono: 'pie_chart', color: '#06b6d4' },
  { clave: 'inmueble', icono: 'home_work', color: '#f59e0b' },
  { clave: 'liquidez', icono: 'account_balance_wallet', color: '#10b981' },
  { clave: 'cripto', icono: 'currency_bitcoin', color: '#8b5cf6' },
  { clave: 'crowd', icono: 'handshake', color: '#ec4899' },
  { clave: 'accion', icono: 'show_chart', color: '#3b82f6' }
];

/** Colores de reserva para categorías personalizadas creadas por el usuario. */
const LS_OCULTAS = 'objetivos_categorias_ocultas';

const COLORES_RESERVA = ['#14b8a6', '#ef4444', '#84cc16', '#0ea5e9', '#d946ef', '#f97316'];

@Component({
  selector: 'app-objetivos',
  standalone: true,
  imports: [
    FormsModule,
    MatIconModule
  ],
  templateUrl: './objetivos.component.html',
  styleUrls: ['./objetivos.component.scss']
})
export class ObjetivosComponent implements OnInit {

  objetivoTotal = 0;
  patrimonioActual = 0;

  categorias: string[] = [];
  objetivosCat: CategoriaObjetivo[] = [];

  /** Categorías que el usuario ha ocultado (persistido en localStorage). */
  ocultas = new Set<string>();
  panelAbierto = false;

  private readonly formatoEuro = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    // 'always' fuerza el separador de miles también en cifras de 4 dígitos (1.234,00 €)
    useGrouping: 'always' as any
  });

  private readonly formatoPct = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1
  });

  constructor(
    private objetivosSrv: ObjetivosService,
    private patrimonioSrv: PatrimonioService
  ) { }

  ngOnInit() {
    this.ocultas = this.cargarOcultas();
    this.categorias = this.patrimonioSrv.getCategorias();

    this.objetivoTotal = this.objetivosSrv.getObjetivos().total;

    this.patrimonioSrv.registros$.subscribe(regs => {
      if (!regs || !regs.length) {
        this.patrimonioActual = 0;
        return;
      }

      const ultimo = regs[regs.length - 1];

      // 🔹 Patrimonio NETO total (valor - deuda)
      this.patrimonioActual = Object.values(ultimo.valores).reduce(
        (sum: number, categoria: any) =>
          sum +
          Object.values(categoria || {}).reduce((a: number, b: any) => {
            if (typeof b === 'number') {
              return a + b; // datos antiguos
            }
            return a + (b.valor - (b.deuda || 0)); // datos nuevos
          }, 0),
        0
      );

      this.recalcularCategorias(ultimo);
    });
  }

  recalcularCategorias(ultimo: any) {
    const objetivos = this.objetivosSrv.getObjetivos().categorias;

    this.objetivosCat = this.categorias.map((cat, i) => {
      const totalActual = Object.values(ultimo.valores[cat] || {})
        .reduce((sum: number, item: any) =>
          sum + (item?.valor ?? 0) - (item?.deuda ?? 0)
          , 0);

      const estilo = this.estiloCategoria(cat, i);

      return {
        categoria: cat,
        objetivo: objetivos.find(o => o.categoria === cat)?.objetivo || 0,
        actual: totalActual,
        icono: estilo.icono,
        color: estilo.color
      };
    });
  }

  get visibles(): CategoriaObjetivo[] {
    return this.objetivosCat.filter(c => !this.ocultas.has(c.categoria));
  }

  get numOcultas(): number {
    return this.objetivosCat.filter(c => this.ocultas.has(c.categoria)).length;
  }

  estaOculta(cat: string): boolean {
    return this.ocultas.has(cat);
  }

  alternarCategoria(cat: string) {
    const nuevas = new Set(this.ocultas);
    if (nuevas.has(cat)) nuevas.delete(cat);
    else nuevas.add(cat);
    this.ocultas = nuevas;
    this.guardarOcultas();
  }

  mostrarTodas() {
    this.ocultas = new Set();
    this.guardarOcultas();
  }

  togglePanel() {
    this.panelAbierto = !this.panelAbierto;
  }

  private cargarOcultas(): Set<string> {
    try {
      const raw = localStorage.getItem(LS_OCULTAS);
      const lista = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(lista) ? lista : []);
    } catch {
      return new Set();
    }
  }

  private guardarOcultas() {
    try {
      localStorage.setItem(LS_OCULTAS, JSON.stringify([...this.ocultas]));
    } catch {
      /* almacenamiento no disponible: se mantiene solo en memoria */
    }
  }

  guardarTotal() {
    this.objetivoTotal = this.sanear(this.objetivoTotal);
    this.objetivosSrv.setObjetivoTotal(this.objetivoTotal);
  }

  guardarCategoria(cat: CategoriaObjetivo) {
    cat.objetivo = this.sanear(cat.objetivo);
    this.objetivosSrv.setObjetivoCategoria(cat.categoria, cat.objetivo);
  }

  progreso(actual: number, objetivo: number): number {
    if (!objetivo || objetivo <= 0) return 0;
    return Math.max(0, Math.min(100, (actual / objetivo) * 100));
  }

  estado(pct: number): string {
    if (pct >= 90) return 'estado-ok';
    if (pct >= 60) return 'estado-medio';
    return 'estado-bajo';
  }

  /** 1234.5 → "1.234,50 €" */
  euros(valor: number): string {
    return this.formatoEuro.format(valor || 0);
  }

  /** 42.35 → "42,4" */
  porcentaje(pct: number): string {
    return this.formatoPct.format(pct || 0);
  }

  /** Texto de lo que falta (o sobra) respecto a la meta. */
  restante(actual: number, objetivo: number): string {
    if (!objetivo || objetivo <= 0) return 'Define una meta para empezar';
    const diff = objetivo - actual;
    if (diff > 0) return `Faltan ${this.euros(diff)}`;
    if (diff === 0) return 'Meta alcanzada';
    return `Superada en ${this.euros(-diff)}`;
  }

  private sanear(valor: number | null): number {
    const n = Number(valor);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  private estiloCategoria(nombre: string, indice: number): { icono: string; color: string } {
    const normalizado = nombre
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    const encontrado = ESTILOS_CATEGORIA.find(e => normalizado.includes(e.clave));
    if (encontrado) return encontrado;

    return {
      icono: 'category',
      color: COLORES_RESERVA[indice % COLORES_RESERVA.length]
    };
  }

  private sumarValoresCategoria(categoria: any): number {
    if (!categoria) return 0;

    return Object.values(categoria).reduce((a: number, b: any) => {
      if (typeof b === 'number') {
        return a + b; // datos antiguos
      }
      return a + (b.valor - (b.deuda || 0)); // datos nuevos
    }, 0);
  }
}
