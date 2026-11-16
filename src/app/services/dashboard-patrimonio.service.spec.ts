import { TestBed } from '@angular/core/testing';
import { RegistroMensual } from './patrimonio.service';
import { DashboardPatrimonioService } from './dashboard-patrimonio.service';

const reg = (mes: string, valores: RegistroMensual['valores']): RegistroMensual => ({ mes, valores });

const REGISTROS: RegistroMensual[] = [
  reg('2026-10', {
    Fondos: { A: { valor: 1000 } },
    Inmuebles: { Piso: { valor: 200000, deuda: 150000 } },
    Cripto: { BTC: { valor: 500 } }
  }),
  reg('2026-09', {
    Fondos: { A: { valor: 900 } },
    Inmuebles: { Piso: { valor: 200000, deuda: 152000 } },
    Cripto: { BTC: { valor: 600 } }
  }),
  reg('2026-11', {
    Fondos: { A: { valor: 1300 } },
    Inmuebles: { Piso: { valor: 200000, deuda: 148000 } },
    Cripto: { BTC: { valor: 400 } }
  })
];

describe('DashboardPatrimonioService', () => {
  let service: DashboardPatrimonioService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DashboardPatrimonioService);
  });

  it('construye la serie ordenada con patrimonio neto (valor − deuda) y respeta el orden de categorías', () => {
    const serie = service.construirSerie(REGISTROS, ['Cripto', 'Fondos']);

    expect(serie.puntos.map(p => p.mes)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(serie.categorias.map(c => c.nombre)).toEqual(['Cripto', 'Fondos', 'Inmuebles']);
    expect(serie.puntos[2].valores['Inmuebles']).toBe(52000);
    expect(serie.puntos[2].total).toBe(400 + 1300 + 52000);
  });

  it('admite el formato antiguo (importe numérico) y datos incompletos', () => {
    const serie = service.construirSerie([
      reg('2026-01', { Fondos: { General: 500 } as unknown as RegistroMensual['valores'][string] }),
      reg('2026-02', { Fondos: {} })
    ]);
    expect(serie.puntos[0].total).toBe(500);
    expect(serie.puntos[1].total).toBe(0);
  });

  it('resume el último mes con variación y mayores movimientos', () => {
    const resumen = service.resumenMes(service.construirSerie(REGISTROS))!;

    expect(resumen.mes).toBe('2026-11');
    expect(resumen.mesAnterior).toBe('2026-10');
    expect(resumen.variacion).toBe(2000 + 300 - 100);
    expect(resumen.mayorSubida?.categoria).toBe('Inmuebles');
    expect(resumen.mayorBajada?.categoria).toBe('Cripto');
  });

  it('muestra una única categoría que cae solo como bajada, y devuelve null sin datos', () => {
    const una = service.construirSerie([reg('2026-01', { A: { x: { valor: 10 } } }), reg('2026-02', { A: { x: { valor: 5 } } })]);
    const r = service.resumenMes(una)!;
    expect(r.mayorSubida).toBeNull();
    expect(r.mayorBajada?.categoria).toBe('A');
    expect(service.resumenMes(service.construirSerie([]))).toBeNull();
  });

  it('calcula bruto, deuda, equity y LTV de los inmuebles', () => {
    const inm = service.resumenInmuebles(REGISTROS)!;
    expect(inm).toEqual({ bruto: 200000, deuda: 148000, equity: 52000, ltv: 74 });
    expect(service.resumenInmuebles([reg('2026-01', { Fondos: { A: { valor: 1 } } })])).toBeNull();
  });

  it('cruza el valor de cada categoría con su meta y limita el progreso a 100', () => {
    const serie = service.construirSerie(REGISTROS);
    const filas = service.filasCategorias(serie, {
      total: 0,
      categorias: [{ categoria: 'Fondos', objetivo: 2600 }, { categoria: 'Cripto', objetivo: 100 }]
    });
    const fondos = filas.find(f => f.nombre === 'Fondos')!;
    const cripto = filas.find(f => f.nombre === 'Cripto')!;
    const inmuebles = filas.find(f => f.nombre === 'Inmuebles')!;

    expect(fondos.progreso).toBe(50);
    expect(fondos.variacion).toBe(300);
    expect(cripto.progreso).toBe(100);
    expect(inmuebles.progreso).toBeNull();
    expect(filas.reduce((s, f) => s + f.porcentaje, 0)).toBeCloseTo(100);
  });

  it('recorta la serie por rango', () => {
    const base = service.construirSerie(
      Array.from({ length: 14 }, (_, i) => reg(i < 12 ? `2025-${String(i + 1).padStart(2, '0')}` : `2026-0${i - 11}`, { A: { x: { valor: i } } }))
    );
    expect(service.recortar(base, '6M').length).toBe(6);
    expect(service.recortar(base, '1A').length).toBe(12);
    expect(service.recortar(base, 'ALL').length).toBe(14);
  });

  it('mide la consistencia con las variaciones mensuales', () => {
    const c = service.consistencia(service.construirSerie(REGISTROS));
    expect(c.puntos.length).toBe(2);
    expect(c.puntos[0].variacion).toBe(2000 - 100 + 100); // sep → oct: +100 fondos, −100 cripto, +2.000 inmuebles
    expect(c.puntos[1].variacion).toBe(2200);
    expect(c.positivos).toBe(c.puntos.filter(p => p.variacion >= 0).length);
  });

  it('compara dos fechas con peso y diferencia por categoría', () => {
    const serie = service.construirSerie(REGISTROS);
    const c = service.comparar(serie, '2026-09', '2026-11')!;
    expect(c.diferencia).toBe(c.totalFin - c.totalInicio);
    expect(c.filas.reduce((s, f) => s + f.pesoFin, 0)).toBeCloseTo(100);
    expect(service.comparar(serie, '2020-01', '2026-11')).toBeNull();
  });

  describe('proyectarObjetivo', () => {
    const base = { actual: 100000, ahorroMensual: 1000, mesBase: '2026-11' };

    it('distingue sin meta, meta alcanzada y en progreso', () => {
      expect(service.proyectarObjetivo({ ...base, objetivo: 0 }).estado).toBe('sin-objetivo');
      expect(service.proyectarObjetivo({ ...base, objetivo: 50000 }).estado).toBe('alcanzado');
      const p = service.proyectarObjetivo({ ...base, objetivo: 200000 });
      expect(p.estado).toBe('en-progreso');
      expect(p.meses).toBeGreaterThan(0);
      expect(p.fecha).toMatch(/^\d{4}-\d{2}$/);
    });

    it('más ahorro adelanta la fecha', () => {
      const lento = service.proyectarObjetivo({ ...base, objetivo: 300000, ahorroMensual: 500 });
      const rapido = service.proyectarObjetivo({ ...base, objetivo: 300000, ahorroMensual: 3000 });
      expect(rapido.meses!).toBeLessThan(lento.meses!);
    });

    it('marca como lejana una meta inalcanzable en 50 años', () => {
      const p = service.proyectarObjetivo({ actual: 0, objetivo: 1e12, ahorroMensual: 0, mesBase: '2026-11' });
      expect(p.estado).toBe('lejano');
      expect(p.fecha).toBeNull();
    });
  });

  describe('retiroSostenible', () => {
    it('aplica la tasa y calcula la cobertura sin tope', () => {
      const r = service.retiroSostenible({ capitalBase: 600000, tasaRetiro: 4, gastoMensual: 1000 });
      expect(r.anual).toBe(24000);
      expect(r.mensual).toBe(2000);
      expect(r.cobertura).toBe(200);
    });

    it('sin gasto indicado no hay cobertura y un capital negativo cuenta como 0', () => {
      expect(service.retiroSostenible({ capitalBase: 1000, tasaRetiro: 4, gastoMensual: null }).cobertura).toBeNull();
      expect(service.retiroSostenible({ capitalBase: -5, tasaRetiro: 4, gastoMensual: 1 }).capitalBase).toBe(0);
    });
  });

  it('detecta categorías inmobiliarias sin distinguir tildes ni mayúsculas', () => {
    expect(service.esCategoriaInmobiliaria('Inmuebles')).toBe(true);
    expect(service.esCategoriaInmobiliaria('INMUEBLE alquiler')).toBe(true);
    expect(service.esCategoriaInmobiliaria('Fondos')).toBe(false);
  });
});
