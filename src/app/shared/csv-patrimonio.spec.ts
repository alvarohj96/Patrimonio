import { RegistroMensual } from '../services/patrimonio.service';
import { CABECERA_CSV_PATRIMONIO, nombresProblematicosCsv, serializarRegistrosCsv } from './csv-patrimonio';

/** Copia literal del código que había en `exportarCSV()` antes de centralizarlo (referencia de compatibilidad). */
function serializadorOriginal(registros: RegistroMensual[]): string {
  const lineas: string[] = [];
  lineas.push('Mes;Categoría;Subcategoría;Valor (€);Deuda (€);Cantidad');
  registros.forEach(reg => {
    const mes = reg.mes;
    Object.keys(reg.valores).forEach(cat => {
      const subs = reg.valores[cat];
      Object.keys(subs).forEach(sub => {
        const dato: any = subs[sub];
        if (typeof dato === 'number') {
          lineas.push(`${mes};${cat};${sub};${dato};0;`);
        } else {
          const cantidad = (dato.cantidad != null && dato.cantidad > 0) ? dato.cantidad : '';
          lineas.push(`${mes};${cat};${sub};${dato.valor};${dato.deuda || 0};${cantidad}`);
        }
      });
    });
  });
  return lineas.join('\n');
}

const REGISTROS: RegistroMensual[] = [
  {
    mes: '2026-10',
    valores: {
      Fondos: { 'Fondo ñandú': { valor: 1234.56 } },
      Inmuebles: { Piso: { valor: 300000, deuda: 100000, porcentaje: 50 } },
      Cripto: { BTC: { valor: 5000.5, cantidad: 0.0825 }, ETH: { valor: 10, cantidad: 0 } }
    }
  },
  { mes: '2026-11', valores: { Liquidez: { 'Cuenta Ç': { valor: 0.1 + 0.2 } } } }
];

describe('serializarRegistrosCsv', () => {
  it('genera exactamente el formato conocido (cabecera, «;», «\\n» sin salto final, sin comillas)', () => {
    expect(serializarRegistrosCsv(REGISTROS)).toBe([
      'Mes;Categoría;Subcategoría;Valor (€);Deuda (€);Cantidad',
      '2026-10;Fondos;Fondo ñandú;1234.56;0;',
      '2026-10;Inmuebles;Piso;300000;100000;',
      '2026-10;Cripto;BTC;5000.5;0;0.0825',
      '2026-10;Cripto;ETH;10;0;',
      '2026-11;Liquidez;Cuenta Ç;0.30000000000000004;0;'
    ].join('\n'));
  });

  it('es idéntico, byte a byte, al serializador que había en «Exportar CSV»', () => {
    expect(serializarRegistrosCsv(REGISTROS)).toBe(serializadorOriginal(REGISTROS));
    expect(serializarRegistrosCsv([])).toBe(serializadorOriginal([]));
    const antiguo: RegistroMensual[] = [{ mes: '2020-01', valores: { A: { B: 42 as any } } }];
    expect(serializarRegistrosCsv(antiguo)).toBe(serializadorOriginal(antiguo));
  });

  it('no añade BOM ni retornos de carro y conserva tildes y eñes en UTF-8', () => {
    const csv = serializarRegistrosCsv(REGISTROS);
    expect(csv.charCodeAt(0)).not.toBe(0xfeff);
    expect(csv.startsWith(CABECERA_CSV_PATRIMONIO)).toBe(true);
    expect(csv).not.toContain('\r');
    expect(new TextDecoder().decode(new TextEncoder().encode(csv))).toBe(csv);
  });

  it('detecta nombres con «;» o saltos de línea, que el formato heredado no escapa', () => {
    const malos: RegistroMensual[] = [{ mes: '2026-11', valores: { 'A;B': { 'x\ny': { valor: 1 }, ok: { valor: 2 } } } }];
    expect(nombresProblematicosCsv(malos)).toEqual(['A;B', 'x\ny']);
    expect(nombresProblematicosCsv(REGISTROS)).toEqual([]);
  });
});
