import { ChangeDetectorRef, Component, ElementRef, Inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { GestionarCategoriasComponent } from '../../shared/gestionar-categorias/gestionar-categorias.component';
import { GestionarSubcategoriasComponent } from '../../shared/gestionar-subcategorias/gestionar-subcategorias.component';
import { PatrimonioService, RegistroMensual } from '../../services/patrimonio.service';

/** Valor guardado para una subcategoría en un mes (mismo formato que el servicio). */
type Entrada = {
  valor: number;
  deuda?: number;
  porcentaje?: number;
  cantidad?: number;
};

/** Valores tal y como se escriben en el formulario (Inmuebles: importes brutos, sin aplicar el %). */
type ValoresFormulario = {
  valor: number;
  deuda: number;
  porcentaje: number;
  cantidad: number | null;
};

interface EntradaSesion {
  mes: string;
  categoria: string;
  subcategoria: string;
  valor: number;
  deuda: number;
  /** Valor que había antes de esta acción (si existía), para poder restaurarlo al deshacer. */
  previo?: Entrada;
  copiado?: boolean;
}

interface CandidatoCopia {
  categoria: string;
  subcategoria: string;
  entrada: Entrada;
  /** Ya existe un valor en el mes destino → no se sobrescribe. */
  yaTiene: boolean;
  seleccionado: boolean;
}

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
    MatCheckboxModule,
    MatDatepickerModule,
    MatNativeDateModule
  ],
  templateUrl: './formulario-mensual-dialog.html',
  styleUrls: ['./formulario-mensual-dialog.scss']
})
export class FormularioMensualDialogComponent {

  @ViewChild('valorInput') valorInput?: ElementRef<HTMLInputElement>;

  categorias: string[] = [];

  subcategoriasPorCategoria: { [cat: string]: string[] } = {};

  categoria = '';
  subcategoria = '';

  /** null = campo vacío (así se distingue de un 0 € válido). */
  valor: number | null = null;
  deuda = 0;
  cantidad: number | null = null;

  porcentajePropiedad = 100;

  // -------------------------------------------------------
  // Categorías para las que tiene sentido guardar unidades
  // -------------------------------------------------------
  private readonly CATS_CON_UNIDADES = ['Cripto', 'Acciones', 'Fondos'];

  mostrarCampoUnidades(): boolean {
    return this.CATS_CON_UNIDADES.includes(this.categoria);
  }

  unidadLabel(): string {
    if (!this.subcategoria) return 'unidades';
    const upper = this.subcategoria.toUpperCase();
    const CRIPTO_CONOCIDOS = ['BTC', 'ETH', 'SOL', 'USDT', 'XRP', 'ADA', 'DOT', 'AVAX', 'MATIC', 'LINK'];
    if (CRIPTO_CONOCIDOS.some(c => upper.includes(c))) {
      const match = this.subcategoria.match(/\(([^)]+)\)/);
      return match ? match[1] : this.subcategoria;
    }
    return 'participaciones';
  }

  // Por defecto, el mes en curso
  mes = '';
  mesSeleccionado: Date | null = null;

  // Entradas guardadas/copiadas en esta sesión del diálogo (feedback visual y deshacer)
  entradasSesion: EntradaSesion[] = [];

  // ===== Datos del mes seleccionado (se recalculan en refrescar()) =====
  /** Copia local de los registros, para no clonar el JSON en cada ciclo de detección de cambios. */
  private registros: RegistroMensual[] = [];

  /** Último valor guardado de la subcategoría seleccionada en un mes anterior. */
  anterior: { mes: string; form: ValoresFormulario } | null = null;

  // ===== Copiar desde meses anteriores =====
  mostrarCopia = false;
  mesesOrigen: string[] = [];
  mesOrigen = '';
  candidatos: CandidatoCopia[] = [];
  mensajeCopia = '';

  constructor(
    private patrimonioService: PatrimonioService,
    private dialog: MatDialog,
    private dialogRef: MatDialogRef<FormularioMensualDialogComponent>,
    private cdr: ChangeDetectorRef,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.recargarCatalogo();

    // Mes en curso preseleccionado
    const hoy = new Date();
    this.mesSeleccionado = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    this.mes = this.formatoMes(this.mesSeleccionado);

    this.refrescar();
    this.preseleccionarOrigen();

    // Arrancamos en la primera categoría con subcategorías pendientes (un toque menos)
    const incompleta = this.categorias.find(c => {
      const r = this.resumenCategoria(c);
      return r.total > 0 && r.rellenas < r.total;
    });
    if (incompleta) {
      this.categoria = incompleta;
      this.onCategoriaChange(false);
    }
  }

  private recargarCatalogo() {
    this.categorias = this.patrimonioService.getCategorias();
    this.subcategoriasPorCategoria = this.patrimonioService.getMapaSubcategorias();
  }

  // =======================================================
  //  ESTADO DEL MES (qué está ya introducido)
  // =======================================================

  private formatoMes(d: Date): string {
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
  }

  nombreMes(m: string): string {
    const [y, mm] = m.split('-').map(Number);
    if (!y || !mm) return m;
    const texto = new Date(y, mm - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  private r2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  /** Vuelve a leer los registros y recalcula todo lo que depende del mes seleccionado. */
  private refrescar() {
    this.registros = this.patrimonioService.getRegistros();

    this.mesesOrigen = this.registros
      .filter(r => r.mes && r.mes < this.mes && this.tieneDatos(r))
      .map(r => r.mes)
      .sort()
      .reverse();

    if (!this.mesesOrigen.includes(this.mesOrigen)) {
      this.mesOrigen = this.mesesOrigen[0] ?? '';
    }

    this.actualizarAnterior();
    this.construirCandidatos();
  }

  private tieneDatos(r: RegistroMensual): boolean {
    return Object.values(r.valores || {}).some(subs => Object.keys(subs || {}).length > 0);
  }

  private preseleccionarOrigen() {
    this.mesOrigen = this.mesesOrigen[0] ?? '';
    this.construirCandidatos();
  }

  entradaDelMes(cat: string, sub: string, mes: string = this.mes): Entrada | undefined {
    return this.registros.find(r => r.mes === mes)?.valores?.[cat]?.[sub];
  }

  tieneValor(cat: string, sub: string): boolean {
    return !!this.entradaDelMes(cat, sub);
  }

  subcategoriasDe(cat: string): string[] {
    return this.subcategoriasPorCategoria[cat] || [];
  }

  /** Subcategorías con valor / total de una categoría en el mes seleccionado. */
  resumenCategoria(cat: string): { rellenas: number; total: number } {
    const subs = this.subcategoriasDe(cat);
    return {
      rellenas: subs.filter(s => this.tieneValor(cat, s)).length,
      total: subs.length
    };
  }

  /** Progreso global del mes (todas las categorías). */
  progresoMes(): { rellenas: number; total: number; pct: number } {
    let rellenas = 0;
    let total = 0;
    for (const c of this.categorias) {
      const r = this.resumenCategoria(c);
      rellenas += r.rellenas;
      total += r.total;
    }
    return { rellenas, total, pct: total ? Math.round((rellenas / total) * 100) : 0 };
  }

  // =======================================================
  //  CONVERSIÓN ENTRADA GUARDADA <-> CAMPOS DEL FORMULARIO
  //  (en Inmuebles se guarda el importe ya multiplicado por
  //   el % de propiedad; el formulario trabaja con el bruto)
  // =======================================================

  private aFormulario(cat: string, e: Entrada): ValoresFormulario {
    if (cat === 'Inmuebles') {
      const pct = e.porcentaje && e.porcentaje > 0 ? e.porcentaje : 100;
      return {
        valor: this.r2((e.valor * 100) / pct),
        deuda: this.r2(((e.deuda ?? 0) * 100) / pct),
        porcentaje: pct,
        cantidad: null
      };
    }
    return { valor: e.valor, deuda: 0, porcentaje: 100, cantidad: e.cantidad ?? null };
  }

  private cargarEnFormulario(f: ValoresFormulario) {
    this.valor = f.valor;
    this.deuda = f.deuda ?? 0;
    this.porcentajePropiedad = f.porcentaje;
    this.cantidad = f.cantidad;
  }

  private limpiarFormulario() {
    this.valor = null;
    this.deuda = 0;
    this.porcentajePropiedad = 100;
    this.cantidad = null;
  }

  // =======================================================
  //  SELECCIÓN
  // =======================================================

  seleccionarCategoria(cat: string) {
    if (cat === this.categoria) return;
    this.categoria = cat;
    this.onCategoriaChange();
  }

  onCategoriaChange(enfocar = true) {
    this.subcategoria = '';
    this.limpiarFormulario();
    this.anterior = null;

    // Si solo queda una pendiente, ahorramos un clic
    const pendientes = this.subcategoriasDe(this.categoria).filter(s => !this.tieneValor(this.categoria, s));
    if (pendientes.length === 1) {
      this.seleccionarSubcategoria(pendientes[0], enfocar);
    }
  }

  /**
   * Selecciona una subcategoría. Si ya tiene valor este mes, lo carga para editarlo;
   * si no, deja el formulario vacío y ofrece el valor del mes anterior.
   */
  seleccionarSubcategoria(sub: string, enfocar = true) {
    this.subcategoria = sub;

    const existente = this.entradaDelMes(this.categoria, sub);
    if (existente) {
      this.cargarEnFormulario(this.aFormulario(this.categoria, existente));
    } else {
      this.limpiarFormulario();
    }

    this.actualizarAnterior();

    if (enfocar) this.enfocarValor();
  }

  private enfocarValor() {
    // La app es zoneless: forzamos el render para que el input exista antes de enfocarlo
    this.cdr.detectChanges();
    setTimeout(() => this.valorInput?.nativeElement.focus());
  }

  /** Busca el valor más reciente de la subcategoría en meses anteriores al seleccionado. */
  private actualizarAnterior() {
    this.anterior = null;
    if (!this.categoria || !this.subcategoria) return;

    const previos = this.registros
      .filter(r => r.mes < this.mes && r.valores?.[this.categoria]?.[this.subcategoria])
      .sort((a, b) => b.mes.localeCompare(a.mes));

    if (previos.length) {
      const r = previos[0];
      this.anterior = {
        mes: r.mes,
        form: this.aFormulario(this.categoria, r.valores[this.categoria][this.subcategoria])
      };
    }
  }

  /** Rellena el formulario con el valor del mes anterior (no guarda; se puede ajustar antes). */
  usarAnterior() {
    if (!this.anterior) return;
    this.cargarEnFormulario(this.anterior.form);
    this.enfocarValor();
  }

  /** Siguiente subcategoría de la categoría actual que aún no tiene valor este mes. */
  private siguientePendiente(): string | undefined {
    const subs = this.subcategoriasDe(this.categoria);
    const idx = subs.indexOf(this.subcategoria);
    const orden = [...subs.slice(idx + 1), ...subs.slice(0, Math.max(idx, 0))];
    return orden.find(s => s !== this.subcategoria && !this.tieneValor(this.categoria, s));
  }

  abrirGestionCategorias() {
    this.dialog.open(GestionarCategoriasComponent, {
      width: 'auto',
      maxWidth: '95vw',
      maxHeight: '90vh',
      autoFocus: false,
      panelClass: 'dialogo-ancho'
    }).afterClosed().subscribe(() => this.trasGestion());
  }

  abrirGestionSubcategorias() {
    this.dialog.open(GestionarSubcategoriasComponent, {
      width: 'auto',
      maxWidth: '95vw',
      maxHeight: '90vh',
      autoFocus: false,
      panelClass: 'dialogo-ancho',
      data: { categoria: this.categoria || undefined }
    }).afterClosed().subscribe(() => this.trasGestion());
  }

  /** Recarga el catálogo y descarta la selección si la categoría/subcategoría ya no existe. */
  private trasGestion() {
    this.recargarCatalogo();

    if (!this.categorias.includes(this.categoria)) {
      this.categoria = '';
      this.subcategoria = '';
      this.limpiarFormulario();
      this.anterior = null;
    } else if (this.subcategoria && !this.subcategoriasDe(this.categoria).includes(this.subcategoria)) {
      this.subcategoria = '';
      this.limpiarFormulario();
      this.anterior = null;
    }

    this.refrescar();
    this.cdr.markForCheck();
  }

  /** Mes anterior (-1) o siguiente (+1) respecto al seleccionado. */
  cambiarMes(delta: number) {
    const base = this.mesSeleccionado ?? new Date();
    this.aplicarMes(new Date(base.getFullYear(), base.getMonth() + delta, 1));
  }

  seleccionarMes(event: Date, datepicker: any) {
    datepicker.close();
    this.aplicarMes(event);
  }

  private aplicarMes(event: Date) {
    this.mes = this.formatoMes(event);
    this.mesSeleccionado = event;
    this.mensajeCopia = '';

    this.refrescar();
    this.preseleccionarOrigen();

    // Recargar la subcategoría elegida con los datos del nuevo mes
    if (this.categoria && this.subcategoria) {
      this.seleccionarSubcategoria(this.subcategoria, false);
    }
  }

  // =======================================================
  //  GUARDAR
  // =======================================================

  /** Hay categoría, subcategoría, mes y un importe válido (0 € también lo es). */
  puedeGuardar(): boolean {
    return !!this.categoria && !!this.subcategoria && !!this.mes
      && typeof this.valor === 'number' && Number.isFinite(this.valor) && this.valor >= 0;
  }

  /** Inmuebles: parte neta (valor − deuda) que corresponde al % de propiedad. */
  netoInmueble(): number {
    const pct = (this.porcentajePropiedad || 0) / 100;
    return ((this.valor ?? 0) - (this.deuda || 0)) * pct;
  }

  /**
   * Guarda la entrada actual (categoría + subcategoría + valor) sin tocar el
   * estado del diálogo (no resetea campos ni cierra). Devuelve false si faltan
   * datos obligatorios.
   */
  private guardarEntradaActual(): boolean {

    if (!this.puedeGuardar()) return false;

    const valor = this.valor as number;

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

    const previo = registro.valores[this.categoria][this.subcategoria];

    let valorGuardado = valor;
    let deudaGuardada = 0;

    // ===== INMUEBLES =====
    if (this.categoria === 'Inmuebles') {

      const porcentaje = this.porcentajePropiedad / 100;

      const valorNeto = valor * porcentaje;

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
        valor,
        deuda: 0,
        porcentaje: 100,
        ...(this.cantidad !== null && this.cantidad > 0 ? { cantidad: this.cantidad } : {})
      };

    }

    // Persistir
    this.patrimonioService.actualizarRegistros(registros);

    // Si ya se había tocado en esta sesión, sustituimos la línea en vez de duplicarla
    const yaEnSesion = this.entradasSesion.findIndex(
      e => e.mes === this.mes && e.categoria === this.categoria && e.subcategoria === this.subcategoria
    );
    const previoOriginal = yaEnSesion >= 0 ? this.entradasSesion[yaEnSesion].previo : previo;
    if (yaEnSesion >= 0) this.entradasSesion.splice(yaEnSesion, 1);

    this.entradasSesion.push({
      mes: this.mes,
      categoria: this.categoria,
      subcategoria: this.subcategoria,
      valor: valorGuardado,
      deuda: deudaGuardada,
      previo: previoOriginal
    });

    this.refrescar();

    return true;
  }

  /**
   * Acción principal (botón por defecto / tecla Enter): guarda el valor actual
   * y salta a la siguiente subcategoría pendiente de la misma categoría, con el
   * foco ya en el campo de valor.
   */
  guardarYAnadirOtro() {

    if (!this.guardarEntradaActual()) return;

    const siguiente = this.siguientePendiente();

    if (siguiente) {
      this.seleccionarSubcategoria(siguiente);
    } else {
      // Categoría completa: dejamos el formulario limpio para elegir otra
      this.subcategoria = '';
      this.anterior = null;
      this.limpiarFormulario();
    }
  }

  /**
   * Guarda (si hay algo pendiente y válido) y cierra el diálogo.
   */
  guardarYCerrar() {

    if (this.puedeGuardar()) {
      this.guardarEntradaActual();
    }

    this.dialogRef.close(this.entradasSesion.length > 0);
  }

  /**
   * Deshace una entrada de esta sesión: restaura el valor anterior si lo había
   * (p. ej. si se había sobrescrito) o la elimina si era nueva.
   */
  quitarEntrada(index: number) {

    const entrada = this.entradasSesion[index];
    if (!entrada) return;

    const registros = this.patrimonioService.getRegistros();
    const registro = registros.find(r => r.mes === entrada.mes);

    if (registro) {
      if (!registro.valores[entrada.categoria]) registro.valores[entrada.categoria] = {};

      if (entrada.previo) {
        registro.valores[entrada.categoria][entrada.subcategoria] = entrada.previo;
      } else {
        delete registro.valores[entrada.categoria][entrada.subcategoria];
      }
    }

    this.patrimonioService.actualizarRegistros(registros);

    this.entradasSesion.splice(index, 1);

    this.refrescar();

    // Si justo se está editando esa subcategoría, recargamos el formulario
    if (entrada.mes === this.mes && entrada.categoria === this.categoria && entrada.subcategoria === this.subcategoria) {
      this.seleccionarSubcategoria(this.subcategoria, false);
    }
  }

  // =======================================================
  //  COPIAR VALORES DE MESES ANTERIORES
  // =======================================================

  alternarCopia() {
    this.mostrarCopia = !this.mostrarCopia;
    this.mensajeCopia = '';
    if (this.mostrarCopia) this.construirCandidatos();
  }

  cambiarMesOrigen(m: string) {
    this.mesOrigen = m;
    this.construirCandidatos();
  }

  /** Lista lo que hay en el mes origen, marcando lo que ya tiene valor en el mes destino. */
  private construirCandidatos() {
    const previos = new Map(this.candidatos.map(c => [`${c.categoria}|${c.subcategoria}`, c.seleccionado]));
    const origen = this.registros.find(r => r.mes === this.mesOrigen);
    const lista: CandidatoCopia[] = [];

    if (origen) {
      const cats = [
        ...this.categorias.filter(c => origen.valores?.[c]),
        ...Object.keys(origen.valores || {}).filter(c => !this.categorias.includes(c))
      ];

      for (const cat of cats) {
        for (const sub of Object.keys(origen.valores[cat] || {})) {
          const yaTiene = this.tieneValor(cat, sub);
          const key = `${cat}|${sub}`;
          lista.push({
            categoria: cat,
            subcategoria: sub,
            entrada: origen.valores[cat][sub],
            yaTiene,
            seleccionado: !yaTiene && (previos.has(key) ? !!previos.get(key) : true)
          });
        }
      }
    }

    this.candidatos = lista;
  }

  /** Categorías (en orden) presentes en la lista de candidatos, para agrupar en la vista. */
  categoriasCandidatos(): string[] {
    return [...new Set(this.candidatos.map(c => c.categoria))];
  }

  candidatosDe(cat: string): CandidatoCopia[] {
    return this.candidatos.filter(c => c.categoria === cat);
  }

  totalSeleccionados(): number {
    return this.candidatos.filter(c => c.seleccionado && !c.yaTiene).length;
  }

  totalCopiables(): number {
    return this.candidatos.filter(c => !c.yaTiene).length;
  }

  marcarTodos(valor: boolean) {
    this.candidatos.forEach(c => c.seleccionado = valor && !c.yaTiene);
  }

  copiarSeleccionados() {
    const elegidos = this.candidatos.filter(c => c.seleccionado && !c.yaTiene);
    if (!elegidos.length || !this.mes) return;

    const registros = this.patrimonioService.getRegistros();
    let registro = registros.find(r => r.mes === this.mes);

    if (!registro) {
      registro = { mes: this.mes, valores: {} };
      registros.push(registro);
    }

    for (const c of elegidos) {
      if (!registro.valores[c.categoria]) registro.valores[c.categoria] = {};

      // Nunca machacamos un valor que ya existe en el mes destino
      if (registro.valores[c.categoria][c.subcategoria]) continue;

      registro.valores[c.categoria][c.subcategoria] = { ...c.entrada };

      this.entradasSesion.push({
        mes: this.mes,
        categoria: c.categoria,
        subcategoria: c.subcategoria,
        valor: c.entrada.valor,
        deuda: c.entrada.deuda ?? 0,
        copiado: true
      });
    }

    this.patrimonioService.actualizarRegistros(registros);

    this.mensajeCopia = `Copiados ${elegidos.length} valores de ${this.nombreMes(this.mesOrigen)}. Revísalos y ajusta los que hayan cambiado.`;
    this.mostrarCopia = false;

    this.refrescar();

    // Si la subcategoría abierta acaba de recibir valor, mostrarla como "editando"
    if (this.categoria && this.subcategoria) {
      this.seleccionarSubcategoria(this.subcategoria, false);
    }
  }

}
