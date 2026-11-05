import { TestBed } from '@angular/core/testing';

import { PatrimonioService, RegistroMensual } from './patrimonio.service';

describe('PatrimonioService', () => {
  let service: PatrimonioService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(PatrimonioService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('identificadores de categoría', () => {
    it('asigna un id único a cada categoría existente', () => {
      const cats = service.getCategoriasConId();
      expect(cats.map(c => c.nombre)).toEqual(service.getCategorias());
      expect(cats.every(c => !!c.id)).toBe(true);
      expect(new Set(cats.map(c => c.id)).size).toBe(cats.length);
    });

    it('los ids se conservan entre sesiones y al reordenar', () => {
      const antes = new Map(service.getCategoriasConId().map(c => [c.nombre, c.id]));

      service.ordenarCategorias([...service.getCategorias()].reverse());
      const reordenadas = service.getCategoriasConId();
      reordenadas.forEach(c => expect(c.id).toBe(antes.get(c.nombre)));

      const otraSesion = new PatrimonioService();
      otraSesion.getCategoriasConId().forEach(c => expect(c.id).toBe(antes.get(c.nombre)));
    });

    it('una categoría nueva obtiene id y una eliminada lo pierde (no se reutiliza al recrearla)', () => {
      service.addCategoria('Oro');
      const oro = service.getCategoriasConId().find(c => c.nombre === 'Oro')!;
      expect(oro.id).toBeTruthy();

      service.removeCategoria('Oro');
      expect(service.getCategoriasConId().some(c => c.id === oro.id)).toBe(false);

      service.addCategoria('Oro');
      const nuevo = service.getCategoriasConId().find(c => c.nombre === 'Oro')!;
      expect(nuevo.id).not.toBe(oro.id);
    });

    it('migra datos existentes sin ids y elimina ids huérfanos', () => {
      localStorage.setItem('categorias_patrimonio', JSON.stringify(['A', 'B']));
      localStorage.setItem('categorias_patrimonio_ids', JSON.stringify({ A: 'id-a', Z: 'id-z' }));

      const s = new PatrimonioService();
      const cats = s.getCategoriasConId();
      expect(cats[0]).toEqual({ id: 'id-a', nombre: 'A' });
      expect(cats[1].nombre).toBe('B');
      expect(cats[1].id).toBeTruthy();
      expect(JSON.parse(localStorage.getItem('categorias_patrimonio_ids')!)['Z']).toBeUndefined();
    });

    it('emite las categorías al añadir y eliminar', () => {
      const emisiones: string[][] = [];
      const sub = service.categorias$.subscribe(c => emisiones.push(c));
      service.addCategoria('Oro');
      service.removeCategoria('Oro');
      sub.unsubscribe();
      expect(emisiones.at(-2)).toContain('Oro');
      expect(emisiones.at(-1)).not.toContain('Oro');
    });
  });

  describe('valorNetoPorCategoria', () => {
    it('devuelve vacío sin registros', () => {
      expect(service.valorNetoPorCategoria([])).toEqual({});
    });

    it('usa el último mes (aunque lleguen desordenados) y descuenta la deuda', () => {
      const registros: RegistroMensual[] = [
        { mes: '2026-03', valores: { Inmuebles: { Piso: { valor: 200000, deuda: 120000 } }, Fondos: { F1: { valor: 5000 }, F2: { valor: 1000 } } } },
        { mes: '2026-01', valores: { Fondos: { F1: { valor: 1 } } } },
        { mes: '2026-02', valores: { Fondos: { F1: { valor: 2 } } } }
      ];
      expect(service.valorNetoPorCategoria(registros)).toEqual({ Inmuebles: 80000, Fondos: 6000 });
    });

    it('admite el formato antiguo con valores numéricos', () => {
      const registros = [{ mes: '2025-12', valores: { Liquidez: { General: 300 } } }] as unknown as RegistroMensual[];
      expect(service.valorNetoPorCategoria(registros)).toEqual({ Liquidez: 300 });
    });
  });

  describe('conservación del histórico al eliminar', () => {
    const registros = (): RegistroMensual[] => [
      {
        mes: '2026-01',
        valores: {
          Acciones: { General: { valor: 100 } },
          Cripto: { BTC: { valor: 40 }, ETH: { valor: 10 } }
        }
      }
    ];

    it('eliminar una categoría no modifica los registros ya almacenados', () => {
      service.actualizarRegistros(registros());
      service.removeCategoria('Cripto');

      expect(service.getCategorias()).not.toContain('Cripto');
      expect(service.getRegistros()).toEqual(registros());

      const otraSesion = new PatrimonioService();
      expect(otraSesion.getRegistros()).toEqual(registros());
      expect(otraSesion.valorNetoPorCategoria(otraSesion.getRegistros())['Cripto']).toBe(50);
    });

    it('al volver a crear la categoría recupera su histórico', () => {
      service.actualizarRegistros(registros());
      service.removeCategoria('Cripto');
      service.addCategoria('Cripto');

      expect(service.getRegistros()).toEqual(registros());
    });

    it('eliminar una subcategoría no modifica los registros', () => {
      service.actualizarRegistros(registros());
      service.removeSubcategoria('Cripto', 'BTC');

      expect(service.getSubcategorias('Cripto')).not.toContain('BTC');
      expect(service.getRegistros()).toEqual(registros());
    });

    it('una subcategoría eliminada no reaparece al recargar aunque exista en el histórico', () => {
      service.actualizarRegistros(registros());
      service.addSubcategoria('Cripto', 'BTC');
      service.addSubcategoria('Cripto', 'ETH');
      service.removeSubcategoria('Cripto', 'BTC');

      const otraSesion = new PatrimonioService();
      expect(otraSesion.getSubcategorias('Cripto')).toEqual(['ETH']);
      expect(otraSesion.getRegistros()).toEqual(registros());
    });

    it('sin catálogo guardado se siguen recogiendo las subcategorías del histórico', () => {
      localStorage.setItem('patrimonioMensual', JSON.stringify(registros()));
      const s = new PatrimonioService();
      expect(s.getSubcategorias('Cripto').sort()).toEqual(['BTC', 'ETH']);
    });
  });
  describe('subcategorías: orden y uso', () => {
    it('ordenarSubcategorias reordena sin añadir ni perder ninguna', () => {
      ['A', 'B', 'C'].forEach(x => service.addSubcategoria('Fondos', x));

      service.ordenarSubcategorias('Fondos', ['C', 'A', 'B']);
      expect(service.getSubcategorias('Fondos')).toEqual(['C', 'A', 'B']);

      // Una lista parcial o con intrusas no elimina ni inventa subcategorías
      service.ordenarSubcategorias('Fondos', ['B', 'Z']);
      expect(service.getSubcategorias('Fondos')).toEqual(['B', 'C', 'A']);
    });

    it('el orden de subcategorías se conserva entre sesiones', () => {
      ['A', 'B'].forEach(x => service.addSubcategoria('Fondos', x));
      service.ordenarSubcategorias('Fondos', ['B', 'A']);
      expect(new PatrimonioService().getSubcategorias('Fondos')).toEqual(['B', 'A']);
    });

    it('contarMesesPorSubcategoria cuenta los meses con dato de cada una', () => {
      service.actualizarRegistros([
        { mes: '2026-01', valores: { Fondos: { A: { valor: 1 }, B: { valor: 1 } } } },
        { mes: '2026-02', valores: { Fondos: { A: { valor: 2 } }, Cripto: { BTC: { valor: 3 } } } }
      ]);
      expect(service.contarMesesPorSubcategoria('Fondos')).toEqual({ A: 2, B: 1 });
      expect(service.contarMesesPorSubcategoria('Vacia')).toEqual({});
    });
  });
});
