import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

import {
  CategoriaPatrimonio,
  ConfigCategoriaInversion,
  EstadoPonderacion
} from '../../models/objetivos-inversion';
import { ObjetivosInversionService } from '../../services/objetivos-inversion.service';
import { PatrimonioService } from '../../services/patrimonio.service';
import { SimuladorAportacionesService } from '../../services/simulador-aportaciones.service';

type CampoEditable = 'porcentajeObjetivo' | 'importeMinimo' | 'incrementoMinimo';

/** Colores de los indicadores de categoría (asignados por posición). */
const COLORES = ['#3b82f6', '#06b6d4', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6', '#ef4444', '#84cc16', '#f97316'];

@Component({
  selector: 'app-objetivos-inversion',
  standalone: true,
  imports: [MatIconModule, RouterLink],
  templateUrl: './objetivos-inversion.component.html',
  styleUrls: ['./objetivos-inversion.component.scss']
})
export class ObjetivosInversionComponent implements OnDestroy {

  private readonly patrimonio = inject(PatrimonioService);
  private readonly objetivos = inject(ObjetivosInversionService);
  private readonly calculador = inject(SimuladorAportacionesService);

  readonly importesRapidos = [500, 1000, 2000];
  readonly tolerancia = SimuladorAportacionesService.TOLERANCIA_PP;

  // ------------------------------------------------------
  // Datos reales de la aplicación (única fuente de verdad)
  // ------------------------------------------------------
  private readonly registros = toSignal(this.patrimonio.registros$, { initialValue: this.patrimonio.getRegistros() });
  private readonly nombresCategorias = toSignal(this.patrimonio.categorias$, { initialValue: this.patrimonio.getCategorias() });
  private readonly configGuardada = toSignal(this.objetivos.config$, { initialValue: this.objetivos.getConfig() });

  readonly categorias = computed<CategoriaPatrimonio[]>(() => {
    this.nombresCategorias();
    return this.patrimonio.getCategoriasConId();
  });

  private readonly valores = computed(() => this.patrimonio.valorNetoPorCategoria(this.registros()));

  /** Configuración guardada (o valores por defecto) de las categorías vigentes. */
  readonly configBase = computed<ConfigCategoriaInversion[]>(() => {
    this.configGuardada();
    return this.objetivos.configEfectiva(this.categorias());
  });

  // ------------------------------------------------------
  // Edición (borrador sin guardar)
  // ------------------------------------------------------
  private readonly ediciones = signal<ReadonlyMap<string, ConfigCategoriaInversion>>(new Map());
  readonly guardadoOk = signal(false);
  private temporizador?: ReturnType<typeof setTimeout>;

  readonly filasEdicion = computed(() => {
    const ediciones = this.ediciones();
    const nombres = new Map(this.categorias().map(c => [c.id, c.nombre]));
    return this.configBase().map((base, i) => ({
      ...(ediciones.get(base.categoriaId) ?? base),
      nombre: nombres.get(base.categoriaId) ?? '',
      color: COLORES[i % COLORES.length]
    }));
  });

  readonly hayCambios = computed(() => this.ediciones().size > 0);

  readonly validacion = computed(() =>
    this.objetivos.validar(this.filasEdicion().map(f => this.objetivos.normalizar(f)), this.categorias()));

  // ------------------------------------------------------
  // Distribución actual y simulador (usan la configuración GUARDADA)
  // ------------------------------------------------------
  readonly hayConfiguracion = computed(() => {
    this.configGuardada();
    return this.objetivos.hayConfiguracionGuardada(this.categorias());
  });

  /** La configuración guardada es utilizable (p. ej. deja de serlo si se elimina una categoría con objetivo). */
  readonly configUtilizable = computed(() =>
    this.hayConfiguracion() && this.objetivos.validar(this.configBase(), this.categorias()).valida);

  private readonly entradas = computed(() =>
    this.calculador.construirEntradas(this.categorias(), this.valores(), this.configBase()));

  readonly distribucion = computed(() => this.calculador.calcularDistribucion(this.entradas()));

  readonly importe = signal<number | null>(1000);

  readonly simulacion = computed(() =>
    this.configUtilizable() ? this.calculador.simularAportacion(this.entradas(), this.importe() ?? 0) : null);

  readonly colores = computed(() => new Map(this.categorias().map((c, i) => [c.id, COLORES[i % COLORES.length]])));

  private readonly formatoEuro = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: 'always' as any
  });
  private readonly formatoPct = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  private readonly formatoPuntos = new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: 'exceptZero'
  });
  private readonly formatoEuroSigno = new Intl.NumberFormat('es-ES', {
    style: 'currency', currency: 'EUR', signDisplay: 'exceptZero', useGrouping: 'always' as any
  });

  ngOnDestroy() {
    clearTimeout(this.temporizador);
  }

  // ------------------------------------------------------
  // Acciones
  // ------------------------------------------------------
  editarNumero(id: string, campo: CampoEditable, texto: string) {
    const valor = texto.trim() === '' ? null : Number(texto.replace(',', '.'));
    this.modificar(id, c => ({
      ...c,
      [campo]: campo === 'porcentajeObjetivo' ? (valor ?? 0) : valor
    }));
  }

  editarAdmite(id: string, admite: boolean) {
    this.modificar(id, c => ({ ...c, admiteAportaciones: admite }));
  }

  guardar() {
    const resultado = this.objetivos.guardar(
      this.filasEdicion().map(f => this.soloConfig(f)), this.categorias());
    if (!resultado.valida) return;

    this.ediciones.set(new Map());
    this.guardadoOk.set(true);
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => this.guardadoOk.set(false), 3000);
  }

  descartar() {
    this.ediciones.set(new Map());
  }

  editarImporte(texto: string) {
    const n = texto.trim() === '' ? null : Number(texto.replace(',', '.'));
    this.importe.set(n === null || !Number.isFinite(n) ? null : n);
  }

  fijarImporte(valor: number) {
    this.importe.set(valor);
  }

  // ------------------------------------------------------
  // Presentación
  // ------------------------------------------------------
  euros(v: number): string {
    return this.formatoEuro.format(v || 0);
  }

  eurosConSigno(v: number): string {
    return this.formatoEuroSigno.format(Math.abs(v) < 0.005 ? 0 : v);
  }

  porcentaje(v: number): string {
    return this.formatoPct.format(v || 0);
  }

  puntos(v: number): string {
    return this.formatoPuntos.format(Math.abs(v) < 0.05 ? 0 : v);
  }

  etiquetaEstado(estado: EstadoPonderacion): string {
    return estado === 'sobreponderada' ? 'Sobreponderada'
      : estado === 'infraponderada' ? 'Infraponderada'
      : 'Equilibrada';
  }

  /** Posición (0-100) para barras: se limita para que el marcador no se salga. */
  limitar(v: number): number {
    return Math.max(0, Math.min(100, v || 0));
  }

  // ------------------------------------------------------
  // Internos
  // ------------------------------------------------------
  private modificar(id: string, cambio: (c: ConfigCategoriaInversion) => ConfigCategoriaInversion) {
    const actual = this.filasEdicion().find(f => f.categoriaId === id);
    if (!actual) return;

    const editado = cambio(this.soloConfig(actual));
    const original = this.configBase().find(c => c.categoriaId === id);
    const siguiente = new Map(this.ediciones());

    // Si vuelve a coincidir con lo guardado, deja de contar como cambio pendiente
    if (original && JSON.stringify(this.objetivos.normalizar(editado)) === JSON.stringify(this.objetivos.normalizar(original))) {
      siguiente.delete(id);
    } else {
      siguiente.set(id, editado);
    }
    this.ediciones.set(siguiente);
    this.guardadoOk.set(false);
  }

  private soloConfig(f: ConfigCategoriaInversion): ConfigCategoriaInversion {
    return {
      categoriaId: f.categoriaId,
      porcentajeObjetivo: f.porcentajeObjetivo,
      admiteAportaciones: f.admiteAportaciones,
      importeMinimo: f.importeMinimo,
      incrementoMinimo: f.incrementoMinimo
    };
  }
}
