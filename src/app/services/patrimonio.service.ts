// src/app/services/patrimonio.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/**
 * Interfaz centralizada: exporta el tipo para que componentes lo importen
 */
export interface RegistroMensual {
  mes: string; // "YYYY-MM"
  valores: {
    [categoria: string]: { [subcategoria: string]: number };
  };
}

@Injectable({
  providedIn: 'root'
})
export class PatrimonioService {

  private LS_KEY = 'patrimonioMensual';
  private LS_SUBS = 'patrimonioSubcategorias';

  // BehaviorSubject con los registros migrados/alineados
  private registrosSubject = new BehaviorSubject<RegistroMensual[]>([]);
  registros$ = this.registrosSubject.asObservable();

  private categorias: string[] = [];
  private categoriasKey = 'categorias_patrimonio';

  categoriaSubject = new BehaviorSubject<string[]>(this.categorias);
  categorias$ = this.categoriaSubject.asObservable();


  // Mapa de subcategorías por categoría
  private subcategoriasMap: { [categoria: string]: string[] } = {
    Acciones: [],
    Fondos: [],
    Inmuebles: [],
    Liquidez: ['Efectivo', 'Santander', 'Revolut'],
    Cripto: ['Bitcoin']
  };

  constructor() {
    const stored = localStorage.getItem(this.categoriasKey);
    this.categorias = stored ? JSON.parse(stored) : ['Acciones', 'Fondos', 'Inmuebles', 'Liquidez', 'Cripto'];
    this.categoriaSubject.next([...this.categorias]);
    // cargar subcategorías guardadas (si existen)
    const guardadasSubs = localStorage.getItem(this.LS_SUBS);
    if (guardadasSubs) {
      try {
        this.subcategoriasMap = JSON.parse(guardadasSubs);
      } catch (e) { /* noop */ }
    }

    // Cargar registros y migrarlos si vienen en formato antiguo
    const raw = localStorage.getItem(this.LS_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const mig = this.migrarRegistrosSiNecesario(parsed);
        this.registrosSubject.next(mig);
      } catch (e) {
        console.error('Error parseando localStorage patrimonio:', e);
        this.registrosSubject.next([]);
      }
    } else {
      this.registrosSubject.next([]);
    }
  }

  // Devuelve copia (para seguridad)
  getRegistros(): RegistroMensual[] {
    return JSON.parse(JSON.stringify(this.registrosSubject.value));
  }

  // Actualiza (guarda en LS y emite)
  actualizarRegistros(registros: RegistroMensual[]) {
    try {
      localStorage.setItem(this.LS_KEY, JSON.stringify(registros));
    } catch (e) {
      console.error('No se pudo guardar localStorage', e);
    }
    // Asegurarnos de emitir una copia
    this.registrosSubject.next(JSON.parse(JSON.stringify(registros)));
  }

  getCategorias(): string[] {
    return [...this.categorias];
  }

  addCategoria(cat: string) {
    if (!this.categorias.includes(cat)) {
      this.categorias.push(cat);
      localStorage.setItem(this.categoriasKey, JSON.stringify(this.categorias));

      // Crear categoría vacía en todos los registros
      const registros = this.getRegistros();
      registros.forEach(r => {
        if (!r.valores[cat]) r.valores[cat] = {};
      });
      this.actualizarRegistros(registros);
    }
  }


  removeCategoria(cat: string) {
    this.categorias = this.categorias.filter(c => c !== cat);
    localStorage.setItem(this.categoriasKey, JSON.stringify(this.categorias));

    // Eliminar categoría de todos los registros
    const registros = this.getRegistros();
    registros.forEach(r => {
      delete r.valores[cat];
    });
    this.actualizarRegistros(registros);
  }

  // -------------------------
  // Subcategorías API pública
  // -------------------------
  getMapaSubcategorias(): { [categoria: string]: string[] } {
    return JSON.parse(JSON.stringify(this.subcategoriasMap));
  }

  getSubcategorias(categoria: string): string[] {
    return (this.subcategoriasMap[categoria] || []).slice();
  }

  addSubcategoria(categoria: string, subcat: string) {
    if (!categoria || !subcat) return;
    if (!this.subcategoriasMap[categoria]) this.subcategoriasMap[categoria] = [];
    if (!this.subcategoriasMap[categoria].includes(subcat)) {
      this.subcategoriasMap[categoria].push(subcat);
      this.saveSubcategorias();
    }
  }

  removeSubcategoria(categoria: string, subcat: string) {
    if (!this.subcategoriasMap[categoria]) return;
    this.subcategoriasMap[categoria] = this.subcategoriasMap[categoria].filter(s => s !== subcat);
    this.saveSubcategorias();
  }

  ordenarCategorias(cats: string[]) {
    this.categorias = [...cats];
    localStorage.setItem(this.categoriasKey, JSON.stringify(this.categorias));
    this.categoriaSubject.next([...this.categorias]);
  }

  private saveSubcategorias() {
    try {
      localStorage.setItem(this.LS_SUBS, JSON.stringify(this.subcategoriasMap));
    } catch (e) { console.error('No se pudo guardar subcategorias', e); }
  }

  // -------------------------
  // Migración automática
  // -------------------------
  /**
   * Convierte registros antiguos (valores: {categoria: number}) al nuevo formato:
   * valores: { categoria: { 'General': number } }
   */
  private migrarRegistrosSiNecesario(raw: any[]): RegistroMensual[] {
    if (!Array.isArray(raw)) return [];

    const converted: RegistroMensual[] = raw.map(r => {
      // si el registro ya tiene la estructura nueva, se conserva
      if (r && r.valores && typeof r.valores === 'object') {
        // Detectar si es viejo: valores[categoria] es number
        const anyVals = Object.values(r.valores);
        const primer = anyVals.length ? anyVals[0] : undefined;
        if (typeof primer === 'number') {
          // formato antiguo -> convertir
          const nuevoVals: any = {};
          Object.keys(r.valores).forEach((cat: string) => {
            nuevoVals[cat] = { 'General': r.valores[cat] };
            // añadir subcategoría 'General' al mapa (si no existe)
            if (!this.subcategoriasMap[cat]) this.subcategoriasMap[cat] = [];
            if (!this.subcategoriasMap[cat].includes('General')) this.subcategoriasMap[cat].push('General');
          });
          return { mes: r.mes, valores: nuevoVals };
        } else {
          // ya parece el formato nuevo
          // aseguramos que las subcategorías se recojan en el mapa
          Object.keys(r.valores).forEach(cat => {
            const subs = Object.keys(r.valores[cat] || {});
            if (!this.subcategoriasMap[cat]) this.subcategoriasMap[cat] = [];
            subs.forEach(s => {
              if (!this.subcategoriasMap[cat].includes(s)) this.subcategoriasMap[cat].push(s);
            });
          });
          return r as RegistroMensual;
        }
      } else {
        return { mes: r?.mes || '', valores: {} };
      }
    });

    // Guardar mapa actualizado (por si añadimos 'General' u otras)
    this.saveSubcategorias();

    // opcional: sobrescribir localStorage con el formato migrado
    try {
      localStorage.setItem(this.LS_KEY, JSON.stringify(converted));
    } catch (e) { /* noop */ }

    return converted;
  }
  // --------------------------------------------------------------------
  // RESET TOTAL DEL SISTEMA 
  // --------------------------------------------------------------------
  resetearTodo() {

    // 1. Vaciar localStorage
    localStorage.removeItem(this.LS_KEY);
    localStorage.removeItem(this.LS_SUBS);
    localStorage.removeItem(this.categoriasKey);

    // 2. Restaurar categorías por defecto
    this.categorias = [];
    this.categoriaSubject.next([...this.categorias]);

    // 3. Restaurar mapa de subcategorías por defecto
    this.subcategoriasMap = {
      Acciones: [],
      Fondos: [],
      Inmuebles: [],
      Liquidez: [],
      Cripto: []
    };

    // Guardar subcategorías base
    this.saveSubcategorias();

    // 4. Emitir lista de registros vacía
    this.registrosSubject.next([]);

    console.warn("⚠️ TODO EL SISTEMA HA SIDO RESETEADO");
  }

}
