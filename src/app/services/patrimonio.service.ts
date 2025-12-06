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

  // Mapa de subcategorías por categoría
  private subcategoriasMap: { [categoria: string]: string[] } = {
    Acciones: [],
    Fondos: [],
    Inmuebles: [],
    Liquidez: ['Efectivo', 'Santander', 'Revolut'],
    Cripto: ['Bitcoin', 'Ethereum']
  };

  constructor() {
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
}
