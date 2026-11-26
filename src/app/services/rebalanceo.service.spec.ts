import { TestBed } from '@angular/core/testing';

import { EntradaCategoria, VehiculoInversion } from '../models/objetivos-inversion';
import { ModoRebalanceo, ResultadoRebalanceo } from '../models/rebalanceo';
import { RebalanceoService } from './rebalanceo.service';

function cat(
  nombre: string, valorActual: number, porcentajeObjetivo: number,
  extra: Partial<EntradaCategoria> & { vehiculo?: VehiculoInversion } = {}
): EntradaCategoria {
  return {
    categoriaId: nombre.toLowerCase(),
    nombre,
    valorActual,
    porcentajeObjetivo,
    admiteAportaciones: true,
    importeMinimo: null,
    incrementoMinimo: null,
    ...extra
  };
}

/** Fondos infraponderados, acciones sobreponderadas y cripto equilibrada (total 10.000 €). */
const CARTERA = () => [
  cat('Fondos', 2000, 40, { vehiculo: 'fondos' }),
  cat('Acciones', 6000, 40, { vehiculo: 'bolsa' }),
  cat('Cripto', 2000, 20, { vehiculo: 'cripto' })
];

describe('RebalanceoService', () => {
  let servicio: RebalanceoService;

  const calcular = (entradas: EntradaCategoria[], modo: ModoRebalanceo, aportacion = 0, umbralMinimo = 0) =>
    servicio.calcular(entradas, { modo, aportacion, umbralMinimo });
  const fila = (r: ResultadoRebalanceo, nombre: string) => r.filas.find(f => f.nombre === nombre)!;

  /** Invariantes que deben cumplirse en cualquier plan. */
  function comprobarCuadre(r: ResultadoRebalanceo) {
    expect(r.cuadra).toBe(true);
    const movimientos = r.filas.reduce((s, f) => s + Math.round(f.movimiento * 100), 0);
    expect(movimientos).toBe(Math.round(r.aportacionUsada * 100));
    expect(Math.round(r.totalEntradas * 100)).toBe(Math.round(r.totalSalidas * 100) + Math.round(r.aportacionUsada * 100));
    const valores = r.filas.reduce((s, f) => s + Math.round(f.valorObjetivo * 100), 0);
    expect(valores).toBe(Math.round(r.patrimonioFinal * 100));
  }

  beforeEach(() => {
    TestBed.configureTestingModule({});
    servicio = TestBed.inject(RebalanceoService);
  });

  // ------------------------------------------------------
  describe('Solo aportaciones', () => {
    it('reparte solo a las infraponderadas y nunca vende', () => {
      const r = calcular(CARTERA(), 'aportaciones', 1000);
      expect(r.totalSalidas).toBe(0);
      expect(fila(r, 'Fondos').movimiento).toBe(1000);
      expect(fila(r, 'Acciones').movimiento).toBe(0);
      expect(fila(r, 'Fondos').accion).toBe('aportar');
      expect(fila(r, 'Acciones').accion).toBe('mantener');
      expect(r.aportacionUsada).toBe(1000);
      comprobarCuadre(r);
    });

    it('con una aportación insuficiente la invierte entera y avisa de que no se alcanza el objetivo', () => {
      const r = calcular(CARTERA(), 'aportaciones', 500);
      expect(fila(r, 'Fondos').movimiento).toBe(500);
      expect(r.alcanzaObjetivos).toBe(false);
      expect(r.explicacion).toContain('no se contemplan ventas');
      comprobarCuadre(r);
    });

    it('respeta las categorías que no admiten aportaciones', () => {
      const entradas = CARTERA();
      entradas[0] = cat('Fondos', 2000, 40, { vehiculo: 'fondos', admiteAportaciones: false });
      const r = calcular(entradas, 'aportaciones', 1000);
      expect(fila(r, 'Fondos').movimiento).toBe(0);
      expect(fila(r, 'Cripto').movimiento).toBeGreaterThan(0);
      comprobarCuadre(r);
    });

    it('umbral: descarta las aportaciones pequeñas y reparte el resto entre las demás', () => {
      const entradas = [cat('A', 0, 50), cat('B', 0, 30), cat('C', 0, 20)];
      const sinUmbral = calcular(entradas, 'aportaciones', 300);
      expect(sinUmbral.filas.map(f => f.movimiento)).toEqual([150, 90, 60]);

      const r = calcular(entradas, 'aportaciones', 300, 100);
      expect(fila(r, 'C').movimiento).toBe(0);
      expect(fila(r, 'A').movimiento).toBeCloseTo(187.5, 2);
      expect(fila(r, 'B').movimiento).toBeCloseTo(112.5, 2);
      expect(r.aportacionUsada).toBe(300);
      expect(r.avisos.join(' ')).toContain('umbral');
      comprobarCuadre(r);
    });

    it('sin aportación no propone nada', () => {
      const r = calcular(CARTERA(), 'aportaciones', 0);
      expect(r.filas.every(f => f.accion === 'mantener')).toBe(true);
      expect(r.explicacion).toBeNull();
    });
  });

  // ------------------------------------------------------
  describe('Venta / Traspaso', () => {
    it('vende lo sobreponderado para comprar lo infraponderado hasta el objetivo', () => {
      const r = calcular(CARTERA(), 'venta');
      expect(fila(r, 'Acciones').movimiento).toBe(-2000);
      expect(fila(r, 'Acciones').accion).toBe('vender');
      expect(fila(r, 'Fondos').movimiento).toBe(2000);
      expect(fila(r, 'Fondos').accion).toBe('comprar');
      expect(fila(r, 'Cripto').accion).toBe('mantener');
      expect(r.aportacionUsada).toBe(0);
      expect(r.alcanzaObjetivos).toBe(true);
      expect(r.patrimonioFinal).toBe(r.patrimonioActual);
      r.filas.forEach(f => expect(f.porcentajeFinal).toBeCloseTo(f.porcentajeObjetivo, 6));
      comprobarCuadre(r);
    });

    it('ignora la aportación introducida', () => {
      const r = calcular(CARTERA(), 'venta', 5000);
      expect(r.aportacion).toBe(0);
      expect(r.patrimonioFinal).toBe(10000);
    });

    it('un fondo que se reduce a favor de otro fondo se traspasa (diferimiento fiscal)', () => {
      const entradas = [
        cat('Fondo A', 6000, 40, { vehiculo: 'fondos' }),
        cat('Fondo B', 2000, 40, { vehiculo: 'fondos' }),
        cat('Liquidez', 2000, 20, { vehiculo: 'liquidez' })
      ];
      const r = calcular(entradas, 'venta');
      expect(fila(r, 'Fondo A').movimiento).toBe(-2000);
      expect(fila(r, 'Fondo A').accion).toBe('traspasar');
      expect(fila(r, 'Fondo A').tratamiento).toBe('traspaso');
      expect(r.fiscal).toEqual({ traspasable: 2000, tributable: 0, sinEfecto: 0 });
      comprobarCuadre(r);
    });

    it('un fondo que se reduce a favor de acciones es un reembolso (tributable), no un traspaso', () => {
      const entradas = [
        cat('Fondos', 6000, 40, { vehiculo: 'fondos' }),
        cat('Acciones', 2000, 40, { vehiculo: 'bolsa' }),
        cat('Cripto', 2000, 20, { vehiculo: 'cripto' })
      ];
      const r = calcular(entradas, 'venta');
      expect(fila(r, 'Fondos').accion).toBe('vender');
      expect(fila(r, 'Fondos').tratamiento).toBe('tributable');
      expect(r.fiscal.traspasable).toBe(0);
      expect(r.fiscal.tributable).toBe(2000);
    });

    it('vender liquidez no tiene efecto fiscal', () => {
      const entradas = [
        cat('Liquidez', 6000, 20, { vehiculo: 'liquidez' }),
        cat('Fondos', 4000, 80, { vehiculo: 'fondos' })
      ];
      const r = calcular(entradas, 'venta');
      expect(fila(r, 'Liquidez').tratamiento).toBe('sin-efecto');
      expect(r.fiscal).toEqual({ traspasable: 0, tributable: 0, sinEfecto: 4000 });
    });

    it('cartera ya equilibrada: todo «Mantener» y sin explicación', () => {
      const r = calcular([cat('A', 4000, 40), cat('B', 4000, 40), cat('C', 2000, 20)], 'venta');
      expect(r.filas.every(f => f.accion === 'mantener')).toBe(true);
      expect(r.totalEntradas).toBe(0);
      expect(r.totalSalidas).toBe(0);
      expect(r.alcanzaObjetivos).toBe(true);
      expect(r.explicacion).toBeNull();
      comprobarCuadre(r);
    });

    it('un activo ilíquido que no admite ventas ni compras queda fijo y el resto se rebalancea', () => {
      const entradas = [
        cat('Inmuebles', 50000, 50, { vehiculo: 'iliquido', admiteAportaciones: false, admiteVentas: false }),
        cat('Fondos', 10000, 30, { vehiculo: 'fondos' }),
        cat('Acciones', 20000, 20, { vehiculo: 'bolsa' })
      ];
      const r = calcular(entradas, 'venta');
      expect(fila(r, 'Inmuebles').movimiento).toBe(0);
      expect(fila(r, 'Fondos').movimiento).toBeGreaterThan(0);
      expect(fila(r, 'Acciones').movimiento).toBeLessThan(0);
      expect(r.explicacion).toContain('Inmuebles');
      comprobarCuadre(r);
    });

    it('si ninguna categoría admite ventas lo explica', () => {
      const entradas = CARTERA().map(e => ({ ...e, admiteVentas: false }));
      const r = calcular(entradas, 'venta');
      expect(r.totalSalidas).toBe(0);
      expect(r.explicacion).toContain('admite ventas');
    });

    it('umbral: descarta las operaciones por debajo del importe indicado', () => {
      const entradas = [cat('Fondos', 3900, 40), cat('Acciones', 4100, 40), cat('Cripto', 2000, 20)];
      const con = calcular(entradas, 'venta', 0, 50);
      expect(fila(con, 'Fondos').movimiento).toBe(100);
      expect(fila(con, 'Acciones').movimiento).toBe(-100);

      const sin = calcular(entradas, 'venta', 0, 150);
      expect(sin.filas.every(f => f.accion === 'mantener')).toBe(true);
      expect(sin.totalEntradas).toBe(0);
      comprobarCuadre(sin);
    });

    it('los movimientos de céntimos por redondeo se ignoran siempre (umbral 0)', () => {
      const r = calcular([cat('A', 3333.33, 33.33), cat('B', 3333.33, 33.33), cat('C', 3333.34, 33.34)], 'venta');
      expect(r.filas.every(f => f.accion === 'mantener')).toBe(true);
    });
  });

  // ------------------------------------------------------
  describe('Mixto (Aportación + Ajuste)', () => {
    it('la aportación absorbe primero las infraponderaciones y solo se vende lo imprescindible', () => {
      const r = calcular(CARTERA(), 'mixto', 2000);
      // Objetivo sobre 12.000 €: Fondos 4.800 · Acciones 4.800 · Cripto 2.400
      expect(fila(r, 'Fondos').movimiento).toBe(2800);
      expect(fila(r, 'Acciones').movimiento).toBe(-1200);
      expect(fila(r, 'Cripto').movimiento).toBe(400);
      expect(r.totalSalidas).toBe(1200);
      expect(r.totalEntradas).toBe(3200);
      expect(r.aportacionUsada).toBe(2000);
      expect(r.patrimonioFinal).toBe(12000);
      expect(r.alcanzaObjetivos).toBe(true);
      comprobarCuadre(r);
    });

    it('vende menos que en el modo «Venta / Traspaso»', () => {
      const venta = calcular(CARTERA(), 'venta');
      const mixto = calcular(CARTERA(), 'mixto', 1000);
      expect(mixto.totalSalidas).toBeLessThan(venta.totalSalidas);
    });

    it('si la aportación basta no hay ventas y coincide con «Solo aportaciones»', () => {
      const mixto = calcular(CARTERA(), 'mixto', 5000);
      const aportes = calcular(CARTERA(), 'aportaciones', 5000);
      expect(mixto.totalSalidas).toBe(0);
      expect(mixto.filas.map(f => f.movimiento)).toEqual(aportes.filas.map(f => f.movimiento));
      expect(fila(mixto, 'Fondos').accion).toBe('aportar');
      expect(mixto.alcanzaObjetivos).toBe(true);
      comprobarCuadre(mixto);
    });

    it('con aportación 0 equivale al modo «Venta / Traspaso»', () => {
      const mixto = calcular(CARTERA(), 'mixto', 0);
      const venta = calcular(CARTERA(), 'venta');
      expect(mixto.filas.map(f => f.movimiento)).toEqual(venta.filas.map(f => f.movimiento));
    });

    it('las compras cuadran con las ventas más la aportación con importes con céntimos', () => {
      const entradas = [cat('A', 1234.57, 33.33), cat('B', 7891.23, 33.33), cat('C', 456.78, 33.34)];
      const r = calcular(entradas, 'mixto', 333.33);
      expect(r.aportacionUsada).toBe(333.33);
      comprobarCuadre(r);
    });

    it('umbral: las operaciones pequeñas se descartan y el plan sigue cuadrando', () => {
      const r = calcular(CARTERA(), 'mixto', 1000, 300);
      r.filas.filter(f => f.movimiento !== 0).forEach(f => expect(Math.abs(f.movimiento)).toBeGreaterThanOrEqual(300));
      comprobarCuadre(r);
    });

    it('si no puede recibir dinero ninguna categoría lo explica y no mueve nada', () => {
      const entradas = CARTERA().map(e => ({ ...e, admiteAportaciones: false }));
      const r = calcular(entradas, 'mixto', 1000);
      expect(r.aportacionNoAsignada).toBe(1000);
      expect(r.explicacion).toContain('Ninguna categoría puede recibir dinero');
    });
  });

  // ------------------------------------------------------
  describe('Validaciones y propiedades', () => {
    it('sin categorías o con objetivos que no suman 100 % devuelve un plan vacío con explicación', () => {
      expect(calcular([], 'venta').explicacion).toContain('No hay categorías');
      const r = calcular([cat('A', 100, 60), cat('B', 100, 30)], 'mixto', 100);
      expect(r.explicacion).toContain('no suman el 100 %');
      expect(r.filas.every(f => f.movimiento === 0)).toBe(true);
    });

    it('patrimonio no positivo en los modos con ventas', () => {
      const r = calcular([cat('A', 0, 50), cat('B', 0, 50)], 'venta');
      expect(r.explicacion).toContain('no es positivo');
    });

    it('en cualquier configuración aleatoria el plan cuadra al céntimo', () => {
      let semilla = 12345;
      const azar = () => ((semilla = (semilla * 1664525 + 1013904223) % 4294967296) / 4294967296);
      const modos: ModoRebalanceo[] = ['aportaciones', 'venta', 'mixto'];

      for (let caso = 0; caso < 300; caso++) {
        const n = 2 + Math.floor(azar() * 5);
        const cortes = Array.from({ length: n - 1 }, () => Math.round(azar() * 10000)).sort((a, b) => a - b);
        const pesos = [...cortes, 10000].map((c, i) => c - (i ? cortes[i - 1] ?? 0 : 0));
        const entradas = pesos.map((p, i) => cat(`C${i}`, Math.round(azar() * 5_000_000) / 100, p / 100, {
          vehiculo: (['fondos', 'bolsa', 'cripto', 'liquidez'] as VehiculoInversion[])[Math.floor(azar() * 4)],
          admiteAportaciones: azar() > 0.2,
          admiteVentas: azar() > 0.2
        }));
        const modo = modos[caso % 3];
        const r = calcular(entradas, modo, Math.round(azar() * 200_000) / 100, azar() > 0.5 ? Math.round(azar() * 5000) / 100 : 0);

        expect(r.cuadra).toBe(true);
        expect(r.filas.every(f => Number.isFinite(f.movimiento) && Number.isFinite(f.porcentajeFinal))).toBe(true);
        if (modo === 'aportaciones') expect(r.totalSalidas).toBe(0);
        r.filas.forEach(f => {
          if (f.movimiento < 0) expect(f.puedeVender).toBe(true);
        });
      }
    });
  });
});
