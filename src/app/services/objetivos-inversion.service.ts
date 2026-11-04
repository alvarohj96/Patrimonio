import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  CategoriaPatrimonio,
  ConfigCategoriaInversion,
  ObjetivosInversionConfig,
  ResultadoValidacion
} from '../models/objetivos-inversion';

/**
 * Gestiona y persiste (localStorage, como el resto de servicios) los objetivos
 * porcentuales de inversión y la configuración de aportaciones por categoría.
 * Todo se asocia al id de la categoría, nunca a su nombre.
 */
@Injectable({ providedIn: 'root' })
export class ObjetivosInversionService {

  private readonly LS_KEY = 'objetivos_inversion';

  private subject = new BehaviorSubject<ObjetivosInversionConfig>(this.cargar());
  config$ = this.subject.asObservable();

  getConfig(): ObjetivosInversionConfig {
    return structuredClone(this.subject.value);
  }

  /**
   * Configuración efectiva de las categorías vigentes, en su mismo orden:
   * categorías nuevas → valores por defecto; categorías eliminadas → se ignoran.
   */
  configEfectiva(categorias: CategoriaPatrimonio[]): ConfigCategoriaInversion[] {
    const guardadas = new Map(this.subject.value.categorias.map(c => [c.categoriaId, c]));
    return categorias.map(cat => structuredClone(guardadas.get(cat.id) ?? this.configPorDefecto(cat)));
  }

  /** `true` si ya hay una configuración guardada para alguna de las categorías vigentes. */
  hayConfiguracionGuardada(categorias: CategoriaPatrimonio[]): boolean {
    const ids = new Set(categorias.map(c => c.id));
    return this.subject.value.categorias.some(c => ids.has(c.categoriaId));
  }

  /** Valores por defecto: 0 %, y admite aportaciones salvo los inmuebles. */
  configPorDefecto(categoria: CategoriaPatrimonio): ConfigCategoriaInversion {
    return {
      categoriaId: categoria.id,
      porcentajeObjetivo: 0,
      admiteAportaciones: this.admiteAportacionesPorDefecto(categoria.nombre),
      importeMinimo: null,
      incrementoMinimo: null
    };
  }

  /**
   * Valida y, solo si es válida, guarda la configuración de las categorías vigentes.
   * Las configuraciones de categorías que ya no existen se descartan.
   */
  guardar(configs: ConfigCategoriaInversion[], categoriasVigentes: CategoriaPatrimonio[]): ResultadoValidacion {
    const ids = new Set(categoriasVigentes.map(c => c.id));
    const normalizadas = configs.filter(c => ids.has(c.categoriaId)).map(c => this.normalizar(c));
    const validacion = this.validar(normalizadas, categoriasVigentes);

    if (validacion.valida) {
      const nueva: ObjetivosInversionConfig = { version: 1, categorias: normalizadas };
      try {
        localStorage.setItem(this.LS_KEY, JSON.stringify(nueva));
      } catch (e) {
        console.error('No se pudo guardar objetivos de inversión', e);
      }
      this.subject.next(structuredClone(nueva));
    }
    return validacion;
  }

  /** No negativos, suma exactamente 100 % (a 2 decimales) y límites de aportación coherentes. */
  validar(configs: ConfigCategoriaInversion[], categorias: CategoriaPatrimonio[] = []): ResultadoValidacion {
    const nombres = new Map(categorias.map(c => [c.id, c.nombre]));
    const errores: string[] = [];
    let centesimas = 0;

    configs.forEach(c => {
      const nombre = nombres.get(c.categoriaId) ?? c.categoriaId;
      const p = c.porcentajeObjetivo;

      if (typeof p !== 'number' || !Number.isFinite(p)) {
        errores.push(`${nombre}: el porcentaje objetivo no es un número válido.`);
      } else if (p < 0) {
        errores.push(`${nombre}: el porcentaje objetivo no puede ser negativo.`);
      } else if (p > 100) {
        errores.push(`${nombre}: el porcentaje objetivo no puede superar el 100 %.`);
      } else {
        centesimas += Math.round(p * 100);
      }

      if (c.importeMinimo !== null && (!Number.isFinite(c.importeMinimo) || c.importeMinimo < 0)) {
        errores.push(`${nombre}: el importe mínimo no puede ser negativo.`);
      }
      if (c.incrementoMinimo !== null && (!Number.isFinite(c.incrementoMinimo) || c.incrementoMinimo < 0)) {
        errores.push(`${nombre}: el incremento mínimo no puede ser negativo.`);
      }
    });

    if (centesimas !== 10000) {
      const suma = centesimas / 100;
      errores.unshift(
        `Los porcentajes objetivo deben sumar exactamente el 100 % (ahora suman ${this.formatear(suma)} %).`
      );
    }

    return { valida: errores.length === 0, errores, sumaPorcentajes: centesimas / 100 };
  }

  /** Redondea a 2 decimales y convierte «0 / vacío» en «sin límite». */
  normalizar(c: ConfigCategoriaInversion): ConfigCategoriaInversion {
    const num = (v: unknown): number | null => {
      if (v === null || v === undefined || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : NaN;
    };
    const limite = (v: unknown): number | null => {
      const n = num(v);
      if (n === null) return null;
      if (Number.isNaN(n)) return n;
      const r = Math.round(n * 100) / 100;
      return r === 0 ? null : r;
    };
    const pct = num(c.porcentajeObjetivo);

    return {
      categoriaId: c.categoriaId,
      porcentajeObjetivo: pct === null ? 0 : Number.isNaN(pct) ? pct : Math.round(pct * 100) / 100,
      admiteAportaciones: !!c.admiteAportaciones,
      importeMinimo: limite(c.importeMinimo),
      incrementoMinimo: limite(c.incrementoMinimo)
    };
  }

  private admiteAportacionesPorDefecto(nombre: string): boolean {
    const n = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return !n.includes('inmueble');
  }

  private formatear(valor: number): string {
    return valor.toLocaleString('es-ES', { maximumFractionDigits: 2 });
  }

  private cargar(): ObjetivosInversionConfig {
    const vacio: ObjetivosInversionConfig = { version: 1, categorias: [] };
    try {
      const raw = localStorage.getItem(this.LS_KEY);
      if (!raw) return vacio;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.categorias)) return vacio;

      const vistos = new Set<string>();
      const categorias: ConfigCategoriaInversion[] = [];
      for (const c of parsed.categorias) {
        if (!c || typeof c.categoriaId !== 'string' || vistos.has(c.categoriaId)) continue;
        vistos.add(c.categoriaId);
        const n = this.normalizar(c);
        // Datos corruptos → se descarta la entrada (la categoría vuelve a sus valores por defecto)
        if (!Number.isFinite(n.porcentajeObjetivo) || n.porcentajeObjetivo < 0) continue;
        if (n.importeMinimo !== null && (!Number.isFinite(n.importeMinimo) || n.importeMinimo < 0)) n.importeMinimo = null;
        if (n.incrementoMinimo !== null && (!Number.isFinite(n.incrementoMinimo) || n.incrementoMinimo < 0)) n.incrementoMinimo = null;
        categorias.push(n);
      }
      return { version: 1, categorias };
    } catch {
      return vacio;
    }
  }
}
