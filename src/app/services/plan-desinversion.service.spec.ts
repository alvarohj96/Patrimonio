import { TestBed } from '@angular/core/testing';

import { ParametrosPlan } from '../models/plan-desinversion';
import { PlanDesinversionService } from './plan-desinversion.service';

const BASE: ParametrosPlan = {
  colchonInicial: 24_000,
  carteraInicial: 200_000,
  brutoIndivisible: 300_000,
  deudaIndivisible: 100_000,
  retiradaMensual: 2000,
  horizonte: 30,
  rentabilidadCartera: 4,
  rentabilidadColchon: 0,
  inflacion: 0,
  rentaNetaMensual: 0,
  revalorizacion: 0,
  amortizacionAnualDeuda: 0,
  costesSalida: 10,
  anioVenta: 5
};

describe('PlanDesinversionService', () => {
  let service: PlanDesinversionService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(PlanDesinversionService);
  });

  describe('clasificación', () => {
    it('sugiere la fase según el nombre de la categoría', () => {
      expect(service.faseSugerida('Liquidez')).toBe('colchon');
      expect(service.faseSugerida('Cuenta remunerada')).toBe('colchon');
      expect(service.faseSugerida('Fondos monetarios')).toBe('colchon');
      expect(service.faseSugerida('Inmuebles')).toBe('indivisibles');
      expect(service.faseSugerida('Vivienda habitual')).toBe('indivisibles');
      expect(service.faseSugerida('Acciones')).toBe('liquidos');
      expect(service.faseSugerida('Cripto')).toBe('liquidos');
      expect(service.faseSugerida('Cuenta de valores')).toBe('liquidos');
    });

    it('la elección del usuario manda sobre la sugerida y se marca como personalizada', () => {
      const cats = service.clasificar(
        [{ id: 'a', nombre: 'Inmuebles' }, { id: 'b', nombre: 'Fondos' }],
        { Inmuebles: { valor: 300_000, deuda: 100_000 }, Fondos: { valor: 50_000, deuda: 0 } },
        { b: 'colchon' }
      );
      expect(cats[0].fase).toBe('indivisibles');
      expect(cats[0].personalizada).toBe(false);
      expect(cats[1].fase).toBe('colchon');
      expect(cats[1].personalizada).toBe(true);
    });

    it('el inmueble entra en bruto y con su deuda; el resto en neto', () => {
      const cats = service.clasificar(
        [{ id: 'a', nombre: 'Inmuebles' }, { id: 'b', nombre: 'Liquidez' }, { id: 'c', nombre: 'Fondos' }],
        { Inmuebles: { valor: 300_000, deuda: 100_000 }, Liquidez: { valor: 10_000, deuda: 0 }, Fondos: { valor: 50_000, deuda: 5_000 } },
        {}
      );
      const s = service.situacionInicial(cats);
      expect(s.colchon).toBe(10_000);
      expect(s.liquidos).toBe(45_000);
      expect(s.brutoIndivisible).toBe(300_000);
      expect(s.deudaIndivisible).toBe(100_000);
      expect(s.netoIndivisible).toBe(200_000);
      expect(s.total).toBe(255_000);
    });
  });

  describe('simulación', () => {
    it('cascada: consume primero el colchón y solo después vende cartera', () => {
      const t = service.simular({ ...BASE, rentabilidadCartera: 0 }, 'mantener');
      // 24.000 € de colchón = 12 meses de 2.000 €
      expect(t.colchonAgotadoMes).toBe(12);
      expect(t.carteraInicioMes).toBe(13);
      expect(t.filas[1].deColchon).toBeCloseTo(24_000, 2);
      expect(t.filas[1].deCartera).toBeCloseTo(0, 2);
      expect(t.filas[2].deCartera).toBeCloseTo(24_000, 2);
    });

    it('sin rentabilidad, la liquidez dura exactamente colchón + cartera', () => {
      const t = service.simular({ ...BASE, rentabilidadCartera: 0, horizonte: 35 }, 'mantener');
      // 224.000 / 2.000 = 112 meses → el déficit llega en el año 10 (meses 109-120)
      expect(t.anioDeficit).toBe(10);
      expect(t.carteraAgotadaMes).toBe(112);
    });

    it('mantener: el inmueble no aporta liquidez y se conserva', () => {
      const t = service.simular({ ...BASE, horizonte: 5 }, 'mantener');
      expect(t.venta).toBeNull();
      expect(t.filas[5].inmuebleNeto).toBeCloseTo(200_000, 2);
      expect(t.filas[5].total).toBeCloseTo(t.filas[5].liquido + 200_000, 2);
    });

    it('vender: salto discreto de liquidez en el año elegido y el inmueble desaparece', () => {
      const t = service.simular({ ...BASE, horizonte: 8, anioVenta: 5 }, 'vender');
      const v = t.venta!;
      expect(v.anio).toBe(5);
      expect(v.bruto).toBeCloseTo(300_000, 2);
      expect(v.costes).toBeCloseTo(30_000, 2);
      expect(v.deuda).toBe(100_000);
      expect(v.neto).toBeCloseTo(170_000, 2);

      // El salto de liquidez de ese año ≈ neto de la venta (menos lo retirado en el año)
      const salto = t.filas[5].liquido - t.filas[4].liquido;
      expect(salto).toBeGreaterThan(100_000);
      expect(t.filas[4].inmuebleNeto).toBeCloseTo(200_000, 2);
      expect(t.filas[5].inmuebleNeto).toBe(0);
      // El total baja justo lo que cuestan los gastos de salida
      expect(t.filas[4].total - t.filas[5].total).toBeGreaterThan(0);
    });

    it('detecta el riesgo de iliquidez antes de la venta', () => {
      const p: ParametrosPlan = { ...BASE, carteraInicial: 0, colchonInicial: 12_000, anioVenta: 5 };
      const t = service.simular(p, 'vender');
      expect(t.anioDeficit).toBe(1);
      const alertas = service.alertas(p, t, service.simular(p, 'mantener'), 2026);
      expect(alertas[0].id).toBe('iliquidez-antes-venta');
      expect(alertas[0].nivel).toBe('critica');
    });

    it('plan sostenible: alerta «ok» y sin déficit', () => {
      const p: ParametrosPlan = { ...BASE, carteraInicial: 2_000_000, horizonte: 20 };
      const t = service.simular(p, 'mantener');
      expect(t.anioDeficit).toBeNull();
      const alertas = service.alertas(p, t, service.simular(p, 'vender'), 2026);
      expect(alertas.some(a => a.id === 'plan-sostenible')).toBe(true);
    });

    it('la renta neta del inmueble reduce la necesidad y deja de cobrarse tras vender', () => {
      const p: ParametrosPlan = { ...BASE, rentaNetaMensual: 500, rentabilidadCartera: 0, horizonte: 8, anioVenta: 3 };
      const t = service.simular(p, 'vender');
      expect(t.filas[3].rentaCobrada).toBeCloseTo(6000, 2);
      expect(t.filas[4].rentaCobrada).toBe(0);
      expect(t.filas[1].deColchon + t.filas[1].deCartera).toBeCloseTo(18_000, 2);
    });

    it('una venta con saldo negativo genera aviso crítico', () => {
      const p: ParametrosPlan = { ...BASE, deudaIndivisible: 400_000, anioVenta: 2, horizonte: 5 };
      const t = service.simular(p, 'vender');
      expect(t.venta!.neto).toBeLessThan(0);
      expect(service.alertas(p, t, null, 2026).some(a => a.id === 'venta-negativa')).toBe(true);
    });

    it('el año de venta se acota al horizonte', () => {
      expect(service.anioVentaValido(99, 10)).toBe(10);
      expect(service.anioVentaValido(-3, 10)).toBe(1);
      expect(service.simular({ ...BASE, horizonte: 6, anioVenta: 40 }, 'vender').venta!.anio).toBe(6);
    });
  });

  describe('persistencia', () => {
    it('devuelve los valores por defecto si no hay nada guardado o está corrupto', () => {
      expect(service.cargar(2026).horizonte).toBe(30);
      localStorage.setItem('plan_desinversion', '{no json');
      expect(service.cargar(2026).estrategia).toBe('mantener');
    });

    it('guarda y recupera el estado, saneando valores no válidos', () => {
      const e = service.estadoPorDefecto(2026);
      service.guardar({ ...e, estrategia: 'vender', horizonte: 99, asignaciones: { x: 'liquidos' } });
      const c = service.cargar(2026);
      expect(c.estrategia).toBe('vender');
      expect(c.horizonte).toBe(35);
      expect(c.asignaciones).toEqual({ x: 'liquidos' });

      localStorage.setItem('plan_desinversion', JSON.stringify({ asignaciones: { y: 'otra' }, periodicidad: 'raro' }));
      const s = service.cargar(2026);
      expect(s.asignaciones).toEqual({});
      expect(s.periodicidad).toBe('mensual');
    });
  });
});
