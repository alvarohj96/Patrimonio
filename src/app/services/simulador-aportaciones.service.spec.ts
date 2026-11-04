import { EntradaCategoria } from '../models/objetivos-inversion';
import { SimuladorAportacionesService } from './simulador-aportaciones.service';

function cat(
  nombre: string, valorActual: number, porcentajeObjetivo: number, extra: Partial<EntradaCategoria> = {}
): EntradaCategoria {
  return {
    categoriaId: 'id-' + nombre,
    nombre,
    valorActual,
    porcentajeObjetivo,
    admiteAportaciones: true,
    importeMinimo: null,
    incrementoMinimo: null,
    ...extra
  };
}

const aportacion = (r: { filas: { nombre: string; aportacion: number }[] }, nombre: string) =>
  r.filas.find(f => f.nombre === nombre)!.aportacion;

describe('SimuladorAportacionesService', () => {
  const srv = new SimuladorAportacionesService();

  describe('calcularDistribucion', () => {
    it('calcula porcentajes, importe ideal, diferencia y estado', () => {
      const d = srv.calcularDistribucion([cat('A', 6000, 50), cat('B', 3000, 30), cat('C', 1000, 20)]);
      expect(d.patrimonioTotal).toBe(10000);
      const [a, b, c] = d.filas;
      expect(a.porcentajeActual).toBeCloseTo(60);
      expect(a.desviacionPuntos).toBeCloseTo(10);
      expect(a.importeIdeal).toBe(5000);
      expect(a.diferencia).toBe(1000);
      expect(a.estado).toBe('sobreponderada');
      expect(b.estado).toBe('equilibrada');
      expect(c.estado).toBe('infraponderada');
      expect(c.diferencia).toBe(-1000);
    });

    it('mantiene en el total las categorías que no admiten aportaciones', () => {
      const d = srv.calcularDistribucion([cat('Inm', 9000, 50, { admiteAportaciones: false }), cat('B', 1000, 50)]);
      expect(d.patrimonioTotal).toBe(10000);
      expect(d.filas[0].porcentajeActual).toBeCloseTo(90);
      expect(d.filas[0].admiteAportaciones).toBe(false);
    });

    it('con patrimonio cero no divide por cero', () => {
      const d = srv.calcularDistribucion([cat('A', 0, 60), cat('B', 0, 40)]);
      expect(d.patrimonioTotal).toBe(0);
      expect(d.filas.every(f => f.porcentajeActual === 0 && f.importeIdeal === 0)).toBe(true);
    });
  });

  describe('simularAportacion · sin restricciones', () => {
    it('reparte para alcanzar el objetivo cuando es posible', () => {
      const r = srv.simularAportacion([cat('A', 1000, 50), cat('B', 500, 30), cat('C', 0, 20)], 1000);
      expect(aportacion(r, 'A')).toBe(250);
      expect(aportacion(r, 'B')).toBe(250);
      expect(aportacion(r, 'C')).toBe(500);
      expect(r.asignado).toBe(1000);
      expect(r.noAsignado).toBe(0);
      expect(r.alcanzaObjetivos).toBe(true);
      expect(r.explicacion).toBeNull();
    });

    it('no aporta a las sobreponderadas mientras haya alternativas', () => {
      const r = srv.simularAportacion([cat('A', 800, 50), cat('B', 200, 50)], 100);
      expect(aportacion(r, 'A')).toBe(0);
      expect(aportacion(r, 'B')).toBe(100);
    });

    it('nunca aporta a categorías con objetivo 0 %', () => {
      const r = srv.simularAportacion([cat('A', 100, 100), cat('B', 0, 0)], 500);
      expect(aportacion(r, 'B')).toBe(0);
      expect(aportacion(r, 'A')).toBe(500);
    });

    it('categorías que no admiten aportaciones reciben 0 € pero cuentan en el patrimonio proyectado', () => {
      const r = srv.simularAportacion(
        [cat('Inm', 10000, 40, { admiteAportaciones: false }), cat('Fondos', 2000, 30), cat('Acc', 0, 30)], 1000);
      expect(aportacion(r, 'Inm')).toBe(0);
      expect(r.asignado).toBe(1000);
      expect(r.patrimonioProyectado).toBe(13000);
      const inm = r.filas.find(f => f.nombre === 'Inm')!;
      expect(inm.valorProyectado).toBe(10000);
      expect(inm.porcentajeProyectado).toBeCloseTo((10000 / 13000) * 100);
      expect(r.alcanzaObjetivos).toBe(false);
      expect(r.explicacion).toContain('no admiten aportaciones');
    });

    it('cartera vacía: reparte proporcionalmente a los objetivos', () => {
      const r = srv.simularAportacion([cat('A', 0, 60), cat('B', 0, 40)], 1000);
      expect(aportacion(r, 'A')).toBe(600);
      expect(aportacion(r, 'B')).toBe(400);
    });

    it('aportación de 0 € no asigna nada ni explica nada', () => {
      const r = srv.simularAportacion([cat('A', 100, 50), cat('B', 100, 50)], 0);
      expect(r.asignado).toBe(0);
      expect(r.noAsignado).toBe(0);
      expect(r.explicacion).toBeNull();
    });

    it('importes negativos o no numéricos se tratan como 0', () => {
      expect(srv.simularAportacion([cat('A', 1, 100)], -50).asignado).toBe(0);
      expect(srv.simularAportacion([cat('A', 1, 100)], NaN).asignado).toBe(0);
    });

    it('sin categorías aptas deja todo el importe sin asignar y lo explica', () => {
      const r = srv.simularAportacion(
        [cat('A', 100, 50, { admiteAportaciones: false }), cat('B', 100, 50, { admiteAportaciones: false })], 300);
      expect(r.asignado).toBe(0);
      expect(r.noAsignado).toBe(300);
      expect(r.explicacion).toContain('Ninguna categoría admite');
    });

    it('si solo admiten aportaciones categorías con objetivo 0 % no asigna nada', () => {
      const r = srv.simularAportacion([cat('A', 100, 100, { admiteAportaciones: false }), cat('B', 0, 0)], 300);
      expect(r.noAsignado).toBe(300);
      expect(r.explicacion).toContain('0 %');
    });

    it('redondea a céntimos y la suma coincide exactamente con el importe', () => {
      const r = srv.simularAportacion([cat('A', 0, 33.33), cat('B', 0, 33.33), cat('C', 0, 33.34)], 100);
      const suma = Math.round(r.filas.reduce((s, f) => s + f.aportacion * 100, 0));
      expect(suma).toBe(10000);
      expect(r.noAsignado).toBe(0);
    });

    it('rechaza una configuración que no suma 100 %', () => {
      const r = srv.simularAportacion([cat('A', 100, 50), cat('B', 100, 40)], 100);
      expect(r.asignado).toBe(0);
      expect(r.noAsignado).toBe(100);
      expect(r.explicacion).toContain('100 %');
    });

    it('con categorías sin datos (lista vacía) no falla', () => {
      const r = srv.simularAportacion([], 100);
      expect(r.filas.length).toBe(0);
      expect(r.explicacion).toBeTruthy();
    });
  });

  describe('simularAportacion · importes mínimos e incrementos', () => {
    it('respeta el incremento mínimo y deja sin asignar lo que no encaja', () => {
      const cats = [
        cat('A', 0, 50, { incrementoMinimo: 500 }),
        cat('B', 0, 50, { incrementoMinimo: 500 })
      ];
      const r = srv.simularAportacion(cats, 700);
      expect(r.asignado).toBe(500);
      expect(r.noAsignado).toBe(200);
      expect(r.explicacion).toContain('200');
      r.filas.forEach(f => expect(f.aportacion % 500).toBe(0));
    });

    it('reparte todo el importe cuando existe una combinación válida', () => {
      const cats = [
        cat('A', 0, 50, { incrementoMinimo: 500 }),
        cat('B', 0, 50, { incrementoMinimo: 300 })
      ];
      // 1000 = 500 + 500 es la única combinación exacta (300·k no encaja)
      const r = srv.simularAportacion(cats, 1000);
      expect(r.asignado).toBe(1000);
      expect(r.noAsignado).toBe(0);
    });

    it('si el importe es inferior a la menor aportación permitida no asigna nada y lo explica', () => {
      const r = srv.simularAportacion([cat('A', 0, 100, { importeMinimo: 1000 })], 400);
      expect(r.asignado).toBe(0);
      expect(r.noAsignado).toBe(400);
      expect(r.explicacion).toContain('menor aportación permitida');
    });

    it('una categoría con mínimo nunca recibe menos que su mínimo', () => {
      const cats = [cat('A', 0, 90), cat('B', 1000, 10, { importeMinimo: 300 })];
      const r = srv.simularAportacion(cats, 200);
      expect(aportacion(r, 'B')).toBe(0);
      expect(r.asignado).toBe(200);
    });

    it('una categoría con mínimo puede recibir más que su mínimo', () => {
      const cats = [cat('A', 5000, 30), cat('B', 0, 70, { importeMinimo: 300 })];
      const r = srv.simularAportacion(cats, 2000);
      expect(aportacion(r, 'B')).toBeGreaterThanOrEqual(300);
      expect(r.asignado).toBe(2000);
    });

    it('una categoría fluida absorbe el resto cuando otra tiene incremento', () => {
      const cats = [cat('Fondos', 0, 50, { incrementoMinimo: 500 }), cat('ETF', 0, 50)];
      const r = srv.simularAportacion(cats, 1100);
      expect(r.asignado).toBe(1100);
      expect(aportacion(r, 'Fondos') % 500).toBe(0);
    });

    it('con muchas combinaciones posibles termina y respeta las restricciones', () => {
      const cats = [
        cat('A', 0, 25, { incrementoMinimo: 0.01 }),
        cat('B', 0, 25, { incrementoMinimo: 0.01 }),
        cat('C', 0, 25, { importeMinimo: 10, incrementoMinimo: 0.01 }),
        cat('D', 0, 25, { importeMinimo: 10 })
      ];
      const r = srv.simularAportacion(cats, 100000);
      expect(r.asignado).toBeLessThanOrEqual(100000);
      expect(r.noAsignado).toBeCloseTo(100000 - r.asignado, 2);
    });
  });

  describe('invariantes (casos aleatorios)', () => {
    let semilla = 12345;
    const rnd = () => (semilla = (semilla * 1664525 + 1013904223) % 4294967296) / 4294967296;

    it('cumple las reglas del simulador en 300 escenarios', () => {
      for (let t = 0; t < 300; t++) {
        const n = 2 + Math.floor(rnd() * 5);
        const pesos: number[] = Array.from({ length: n }, () => (rnd() < 0.15 ? 0 : Math.floor(rnd() * 100)));
        if (pesos.reduce((s, p) => s + p, 0) === 0) pesos[0] = 1;
        const suma = pesos.reduce((s, p) => s + p, 0);
        const cent = pesos.map(p => Math.floor((p / suma) * 10000));
        cent[0] += 10000 - cent.reduce((s, c) => s + c, 0);

        const entradas = cent.map((c, i) => {
          const tipo = rnd();
          return cat('C' + i, Math.round(rnd() * 20000) / 100 * (rnd() < 0.2 ? 0 : 50), c / 100, {
            admiteAportaciones: rnd() > 0.25,
            importeMinimo: tipo < 0.25 ? Math.floor(rnd() * 5) * 100 || null : null,
            incrementoMinimo: tipo > 0.7 ? [50, 100, 500][Math.floor(rnd() * 3)] : null
          });
        });
        const importe = Math.round(rnd() * 500000) / 100;
        const r = srv.simularAportacion(entradas, importe);

        const centimos = r.filas.reduce((s, f) => s + Math.round(f.aportacion * 100), 0);
        expect(centimos).toBe(Math.round(r.asignado * 100));
        expect(r.asignado + r.noAsignado).toBeCloseTo(importe, 2);
        expect(r.asignado).toBeLessThanOrEqual(importe + 1e-9);

        r.filas.forEach((f, i) => {
          const e = entradas[i];
          expect(f.aportacion).toBeGreaterThanOrEqual(0);
          if (!e.admiteAportaciones || e.porcentajeObjetivo === 0) expect(f.aportacion).toBe(0);
          if (f.aportacion > 0 && e.importeMinimo) expect(f.aportacion + 1e-9).toBeGreaterThanOrEqual(e.importeMinimo);
          if (f.aportacion > 0 && e.incrementoMinimo) {
            const m = Math.round(f.aportacion * 100) % Math.round(e.incrementoMinimo * 100);
            expect(m).toBe(0);
          }
          expect(f.valorProyectado).toBeCloseTo(e.valorActual + f.aportacion, 2);
        });
        expect(r.patrimonioProyectado).toBeCloseTo(entradas.reduce((s, e) => s + e.valorActual, 0) + r.asignado, 2);

        // Con alguna categoría apta sin restricciones se reparte siempre todo el importe
        const hayFluida = entradas.some(e =>
          e.admiteAportaciones && e.porcentajeObjetivo > 0 && !e.importeMinimo && !e.incrementoMinimo);
        if (hayFluida) expect(r.noAsignado).toBeCloseTo(0, 2);
      }
    });
  });
});
