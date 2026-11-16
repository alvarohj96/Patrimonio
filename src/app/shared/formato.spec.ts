import { etiquetaMes, euros, eurosCompactos, mesLargo, porcentaje, sumarMeses } from './formato';

describe('formato', () => {
  it('formatea euros con miles siempre agrupados y signo opcional', () => {
    expect(euros(1234)).toBe('1.234\u00A0€');
    expect(euros(342500)).toBe('342.500\u00A0€');
    expect(euros(3120, { signo: true })).toBe('+3.120\u00A0€');
    expect(euros(-450)).toBe('-450\u00A0€');
    expect(euros(-0.3)).toBe('0\u00A0€');
    expect(euros(12.5, { decimales: 2 })).toBe('12,50\u00A0€');
    expect(euros(NaN)).toBe('0\u00A0€');
  });

  it('formatea porcentajes', () => {
    expect(porcentaje(0.923, 2, true)).toBe('+0,92\u00A0%');
    expect(porcentaje(68.5)).toBe('68,5\u00A0%');
  });

  it('abrevia importes de los ejes', () => {
    expect(eurosCompactos(154125)).toBe('154k\u00A0€');
    expect(eurosCompactos(1500)).toBe('1,5k\u00A0€');
    expect(eurosCompactos(2000)).toBe('2k\u00A0€');
    expect(eurosCompactos(1_234_567)).toBe('1,2M\u00A0€');
    expect(eurosCompactos(2400, true)).toBe('+2,4k\u00A0€');
    expect(eurosCompactos(-800, true)).toBe('-800\u00A0€');
  });

  it('formatea y suma meses', () => {
    expect(etiquetaMes('2026-11')).toBe('Nov 2026');
    expect(etiquetaMes('2026-11', false)).toBe('Nov');
    expect(mesLargo('2030-10')).toBe('Octubre 2030');
    expect(etiquetaMes('basura')).toBe('basura');
    expect(sumarMeses('2026-11', 2)).toBe('2027-01');
    expect(sumarMeses('2026-11', 0)).toBe('2026-11');
    expect(sumarMeses('2026-01', 24)).toBe('2028-01');
  });
});
