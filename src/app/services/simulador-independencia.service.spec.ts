import { ParametrosProyeccion } from '../models/independencia-financiera';
import { SimuladorIndependenciaService } from './simulador-independencia.service';

function params(extra: Partial<ParametrosProyeccion> = {}): ParametrosProyeccion {
  return {
    patrimonioInicial: 10000,
    aportacion: 100,
    periodicidad: 'mensual',
    crecimientoAportacion: 0,
    rentabilidad: 0,
    inflacion: 0,
    gastosMensuales: 0,
    tasaRetirada: 4,
    horizonte: 10,
    ...extra
  };
}

describe('SimuladorIndependenciaService', () => {
  const srv = new SimuladorIndependenciaService();

  describe('proyectar', () => {
    it('con rentabilidad 0 solo suma las aportaciones', () => {
      const f = srv.proyectar(params(), 10);
      expect(f.length).toBe(11);
      expect(f[0].patrimonio).toBe(10000);
      expect(f[10].patrimonio).toBeCloseTo(10000 + 100 * 120, 6);
      expect(f[10].aportado).toBeCloseTo(12000, 6);
      expect(f[10].rendimientos).toBeCloseTo(0, 6);
    });

    it('aplica la rentabilidad anual efectiva sin aportaciones', () => {
      const f = srv.proyectar(params({ patrimonioInicial: 1000, aportacion: 0, rentabilidad: 10 }), 2);
      expect(f[1].patrimonio).toBeCloseTo(1100, 6);
      expect(f[2].patrimonio).toBeCloseTo(1210, 6);
    });

    it('coincide con la fórmula cerrada del valor futuro con aportaciones mensuales', () => {
      const r = 0.06;
      const i = Math.pow(1 + r, 1 / 12) - 1;
      const n = 20 * 12;
      const esperado = 5000 * Math.pow(1 + i, n) + 300 * ((Math.pow(1 + i, n) - 1) / i);
      const f = srv.proyectar(params({ patrimonioInicial: 5000, aportacion: 300, rentabilidad: 6 }), 20);
      expect(f[20].patrimonio).toBeCloseTo(esperado, 4);
    });

    it('reparte la aportación anual entre los 12 meses', () => {
      const mensual = srv.proyectar(params({ aportacion: 100, periodicidad: 'mensual', rentabilidad: 5 }), 5);
      const anual = srv.proyectar(params({ aportacion: 1200, periodicidad: 'anual', rentabilidad: 5 }), 5);
      expect(anual[5].patrimonio).toBeCloseTo(mensual[5].patrimonio, 6);
    });

    it('incrementa la aportación cada año', () => {
      const f = srv.proyectar(params({ patrimonioInicial: 0, aportacion: 100, crecimientoAportacion: 10 }), 2);
      expect(f[1].aportado).toBeCloseTo(1200, 6);
      expect(f[2].aportado).toBeCloseTo(1200 + 1320, 6);
    });

    it('calcula el deflactor y el objetivo de libertad con la inflación', () => {
      const f = srv.proyectar(params({ inflacion: 2, gastosMensuales: 1000, tasaRetirada: 4 }), 10);
      expect(f[0].objetivoLibertad).toBeCloseTo(300000, 6);
      expect(f[10].deflactor).toBeCloseTo(Math.pow(1.02, 10), 10);
      expect(f[10].objetivoLibertad).toBeCloseTo(300000 * Math.pow(1.02, 10), 4);
      expect(srv.enModo(f[10].patrimonio, f[10], true)).toBeCloseTo(f[10].patrimonio / f[10].deflactor, 6);
      expect(srv.enModo(f[10].patrimonio, f[10], false)).toBe(f[10].patrimonio);
    });

    it('sin gastos o sin tasa de retirada no hay objetivo de libertad', () => {
      expect(srv.proyectar(params({ gastosMensuales: 0 }), 1)[1].objetivoLibertad).toBeNull();
      expect(srv.proyectar(params({ gastosMensuales: 1000, tasaRetirada: 0 }), 1)[1].objetivoLibertad).toBeNull();
    });

    it('admite rentabilidad negativa sin dar valores no finitos', () => {
      const f = srv.proyectar(params({ rentabilidad: -5, aportacion: 0 }), 5);
      expect(f.every(x => Number.isFinite(x.patrimonio))).toBe(true);
      expect(f[5].patrimonio).toBeLessThan(10000);
      expect(f[5].rendimientoAnual).toBe(0);
    });
  });

  describe('hitos y resumen', () => {
    it('detecta el año de libertad financiera y el resumen del escenario', () => {
      // Objetivo: 1.000 €/mes · 4 % → 300.000 €. Sin rentabilidad: 100 €/mes desde 10.000 → 290.000 tras 2.900 meses
      const p = params({ gastosMensuales: 1000, aportacion: 1000 });
      const f = srv.proyectar(p);
      // 10.000 + 12.000 · n ≥ 300.000 → n ≥ 24,17 → año 25
      expect(srv.anioLibertad(f)).toBe(25);

      const r = srv.resumir(f, 10, false);
      expect(r.patrimonioFinal).toBeCloseTo(130000, 4);
      expect(r.aportado).toBeCloseTo(130000, 4); // 10.000 iniciales + 120.000 aportados
      expect(r.rendimientos).toBeCloseTo(0, 4);
      expect(r.anioLibertad).toBe(25);
    });

    it('si ya se ha alcanzado la libertad financiera, el año es 0', () => {
      const f = srv.proyectar(params({ patrimonioInicial: 400000, gastosMensuales: 1000 }), 5);
      expect(srv.anioLibertad(f)).toBe(0);
    });

    it('devuelve null cuando no se alcanza en el periodo calculado', () => {
      const f = srv.proyectar(params({ aportacion: 0, gastosMensuales: 5000 }));
      expect(srv.anioLibertad(f)).toBeNull();
      const h = srv.hitos(f, false);
      expect(h.find(x => x.tipo === 'libertad')!.anio).toBeNull();
    });

    it('genera hitos de capital por encima del patrimonio actual y los ordena', () => {
      const f = srv.proyectar(params({ patrimonioInicial: 60000, aportacion: 3000, rentabilidad: 0, gastosMensuales: 1000 }));
      const h = srv.hitos(f, false);
      const capital = h.filter(x => x.tipo === 'capital');

      // 50.000 ya está superado → el primero es 100.000
      expect(capital[0].umbral).toBe(100000);
      expect(capital.length).toBe(SimuladorIndependenciaService.MAX_HITOS_CAPITAL);
      // 60.000 + 36.000 · n ≥ 100.000 → n = 2
      expect(capital[0].anio).toBe(2);
      const anios = h.map(x => x.anio ?? Infinity);
      expect(anios).toEqual([...anios].sort((a, b) => a - b));
    });

    it('el hito de rendimientos se alcanza cuando la rentabilidad del patrimonio cubre los gastos', () => {
      // 5 % de 480.000 = 24.000 = 2.000 · 12
      const f = srv.proyectar(params({
        patrimonioInicial: 480000, aportacion: 0, rentabilidad: 5, gastosMensuales: 2000
      }), 3);
      const h = srv.hitos(f, false).find(x => x.tipo === 'rendimientos')!;
      expect(h.anio).toBe(0);
    });

    it('sin gastos definidos solo hay hitos de capital', () => {
      const f = srv.proyectar(params({ gastosMensuales: 0, aportacion: 2000 }));
      expect(srv.hitos(f, false).every(h => h.tipo === 'capital')).toBe(true);
    });

    it('en euros reales los hitos de capital tardan más con inflación', () => {
      const f = srv.proyectar(params({ rentabilidad: 5, inflacion: 3, aportacion: 500 }));
      const nominal = srv.hitos(f, false).find(h => h.umbral === 100000)!;
      const real = srv.hitos(f, true).find(h => h.umbral === 100000)!;
      expect(real.anio!).toBeGreaterThan(nominal.anio!);
    });
  });

  describe('variacionMediaMensual', () => {
    it('calcula la media mensual con los meses transcurridos', () => {
      const v = srv.variacionMediaMensual([
        { mes: '2025-01', total: 10000 },
        { mes: '2025-04', total: 11500 }
      ]);
      expect(v!.meses).toBe(3);
      expect(v!.importe).toBeCloseTo(500, 6);
    });

    it('usa como máximo los últimos 12 meses', () => {
      const v = srv.variacionMediaMensual([
        { mes: '2023-01', total: 0 },
        { mes: '2024-01', total: 5000 },
        { mes: '2025-01', total: 11000 }
      ]);
      expect(v!.meses).toBe(12);
      expect(v!.importe).toBeCloseTo(500, 6);
    });

    it('devuelve null con menos de dos registros válidos', () => {
      expect(srv.variacionMediaMensual([])).toBeNull();
      expect(srv.variacionMediaMensual([{ mes: '2025-01', total: 1 }])).toBeNull();
    });
  });

  describe('saneamiento y persistencia', () => {
    beforeEach(() => localStorage.removeItem('simulador_independencia'));
    afterEach(() => localStorage.removeItem('simulador_independencia'));

    it('limita valores y sustituye los no numéricos', () => {
      expect(srv.limitar(150, 0, 100)).toBe(100);
      expect(srv.limitar(-3, 0, 100)).toBe(0);
      expect(srv.limitar(null, 0, 100, 7)).toBe(7);
      expect(srv.limitar(NaN, 0, 100, 7)).toBe(7);
      expect(srv.horizonteValido(0)).toBe(1);
      expect(srv.horizonteValido(999)).toBe(50);
      expect(srv.horizonteValido(12.6)).toBe(13);
    });

    it('guarda y recupera el estado', () => {
      const e = { ...srv.estadoPorDefecto(), aportacion: 750, escenario: 'optimista' as const, horizonte: 30 };
      srv.guardar(e);
      expect(srv.cargar()).toEqual(e);
    });

    it('ignora datos corruptos y devuelve los valores por defecto', () => {
      localStorage.setItem('simulador_independencia', '{no es json');
      expect(srv.cargar()).toEqual(srv.estadoPorDefecto());
    });

    it('descarta campos con tipos inválidos', () => {
      localStorage.setItem('simulador_independencia', JSON.stringify({
        aportacion: 'mucho', escenario: 'loco', horizonte: 500, periodicidad: 'semanal'
      }));
      const e = srv.cargar();
      expect(e.aportacion).toBe(500);
      expect(e.escenario).toBe('moderado');
      expect(e.horizonte).toBe(50);
      expect(e.periodicidad).toBe('mensual');
    });
  });
});
