import { TestBed } from '@angular/core/testing';

import { CategoriaPatrimonio, ConfigCategoriaInversion } from '../models/objetivos-inversion';
import { ObjetivosInversionService } from './objetivos-inversion.service';

const CATS: CategoriaPatrimonio[] = [
  { id: 'a', nombre: 'Acciones' },
  { id: 'b', nombre: 'Fondos' },
  { id: 'c', nombre: 'Inmuebles' }
];

function config(id: string, pct: number, extra: Partial<ConfigCategoriaInversion> = {}): ConfigCategoriaInversion {
  return { categoriaId: id, porcentajeObjetivo: pct, admiteAportaciones: true, importeMinimo: null, incrementoMinimo: null, ...extra };
}

describe('ObjetivosInversionService', () => {
  let service: ObjetivosInversionService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(ObjetivosInversionService);
  });

  describe('validar', () => {
    it('acepta porcentajes que suman 100 (con decimales)', () => {
      const r = service.validar([config('a', 33.33), config('b', 33.33), config('c', 33.34)], CATS);
      expect(r.valida).toBe(true);
      expect(r.sumaPorcentajes).toBe(100);
    });

    it('rechaza una suma distinta de 100', () => {
      const r = service.validar([config('a', 50), config('b', 30), config('c', 10)], CATS);
      expect(r.valida).toBe(false);
      expect(r.sumaPorcentajes).toBe(90);
      expect(r.errores[0]).toContain('100 %');
    });

    it('rechaza porcentajes negativos y mayores de 100 indicando la categoría', () => {
      const r = service.validar([config('a', -10), config('b', 110), config('c', 0)], CATS);
      expect(r.valida).toBe(false);
      expect(r.errores.some(e => e.includes('Acciones') && e.includes('negativo'))).toBe(true);
      expect(r.errores.some(e => e.includes('Fondos') && e.includes('100 %'))).toBe(true);
    });

    it('rechaza valores no numéricos y límites de aportación negativos', () => {
      const r = service.validar([config('a', NaN), config('b', 100, { importeMinimo: -5, incrementoMinimo: -1 })], CATS);
      expect(r.valida).toBe(false);
      expect(r.errores.some(e => e.includes('Acciones'))).toBe(true);
      expect(r.errores.some(e => e.includes('importe mínimo'))).toBe(true);
      expect(r.errores.some(e => e.includes('incremento mínimo'))).toBe(true);
    });
  });

  describe('guardar / persistencia', () => {
    it('guarda una configuración válida y la recupera en otra sesión', () => {
      const r = service.guardar(
        [config('a', 60), config('b', 40, { importeMinimo: 50, incrementoMinimo: 25 }), config('c', 0, { admiteAportaciones: false })],
        CATS);
      expect(r.valida).toBe(true);

      const otra = new ObjetivosInversionService();
      const efectiva = otra.configEfectiva(CATS);
      expect(efectiva[0].porcentajeObjetivo).toBe(60);
      expect(efectiva[1]).toEqual(config('b', 40, { importeMinimo: 50, incrementoMinimo: 25 }));
      expect(efectiva[2].admiteAportaciones).toBe(false);
    });

    it('no guarda una configuración inválida', () => {
      const r = service.guardar([config('a', 70), config('b', 40), config('c', 0)], CATS);
      expect(r.valida).toBe(false);
      expect(localStorage.getItem('objetivos_inversion')).toBeNull();
      expect(service.hayConfiguracionGuardada(CATS)).toBe(false);
    });

    it('asocia los datos al id: un cambio de nombre no afecta a la configuración', () => {
      service.guardar([config('a', 100), config('b', 0), config('c', 0)], CATS);
      const renombradas = CATS.map(c => (c.id === 'a' ? { ...c, nombre: 'Renta variable' } : c));
      expect(service.configEfectiva(renombradas)[0].porcentajeObjetivo).toBe(100);
    });

    it('categorías nuevas reciben valores por defecto y las eliminadas se ignoran', () => {
      service.guardar([config('a', 70), config('b', 30), config('c', 0)], CATS);

      const nuevas = [CATS[0], { id: 'd', nombre: 'Cripto' }]; // 'b' y 'c' eliminadas, 'd' nueva
      const efectiva = service.configEfectiva(nuevas);
      expect(efectiva.map(c => c.categoriaId)).toEqual(['a', 'd']);
      expect(efectiva[0].porcentajeObjetivo).toBe(70);
      expect(efectiva[1]).toEqual(config('d', 0));

      // Al guardar se descartan las configuraciones de categorías que ya no existen
      service.guardar([config('a', 60), config('d', 40)], nuevas);
      expect(service.getConfig().categorias.map(c => c.categoriaId)).toEqual(['a', 'd']);
    });

    it('por defecto los inmuebles no admiten aportaciones y el resto sí', () => {
      const efectiva = service.configEfectiva(CATS);
      expect(efectiva.map(c => c.admiteAportaciones)).toEqual([true, true, false]);
      expect(efectiva.every(c => c.porcentajeObjetivo === 0)).toBe(true);
    });

    it('normaliza redondeando a 2 decimales y tratando 0 como «sin límite»', () => {
      service.guardar(
        [config('a', 33.333, { importeMinimo: 0, incrementoMinimo: 100.004 }), config('b', 66.667, { importeMinimo: 10.126 }), config('c', 0)],
        CATS);
      const [a, b] = service.configEfectiva(CATS);
      expect(a.porcentajeObjetivo).toBe(33.33);
      expect(a.importeMinimo).toBeNull();
      expect(a.incrementoMinimo).toBe(100);
      expect(b.importeMinimo).toBe(10.13);
    });

    it('tolera datos corruptos en localStorage', () => {
      localStorage.setItem('objetivos_inversion', '{no es json');
      expect(new ObjetivosInversionService().getConfig().categorias).toEqual([]);

      localStorage.setItem('objetivos_inversion', JSON.stringify({
        version: 1,
        categorias: [{ categoriaId: 'a', porcentajeObjetivo: -5 }, { categoriaId: 'b', porcentajeObjetivo: 40, admiteAportaciones: true, importeMinimo: -3 }, null]
      }));
      const s = new ObjetivosInversionService();
      expect(s.getConfig().categorias.map(c => c.categoriaId)).toEqual(['b']);
      expect(s.getConfig().categorias[0].importeMinimo).toBeNull();
    });
  });
});
