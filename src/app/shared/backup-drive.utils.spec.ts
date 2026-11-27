import {
  construirMultipart,
  formatearRuta,
  hayCopiaPendiente,
  necesitaCopiaMensual,
  nombreArchivoManual,
  nombreArchivoMensual,
  periodoDe
} from './backup-drive.utils';

describe('backup-drive.utils', () => {
  describe('periodo y nombres de archivo', () => {
    it('periodoDe usa el mes natural local con dos dígitos', () => {
      expect(periodoDe(new Date(2026, 0, 31, 23, 59))).toBe('2026-01');
      expect(periodoDe(new Date(2026, 10, 1, 0, 0))).toBe('2026-11');
      expect(periodoDe(new Date(2026, 11, 31))).toBe('2026-12');
    });

    it('nombra la copia mensual y las manuales', () => {
      expect(nombreArchivoMensual('2026-11')).toBe('patrimonio-backup-2026-11.csv');
      expect(nombreArchivoManual(new Date(2026, 10, 5, 9, 7))).toBe('patrimonio-backup-2026-11-05_0907.csv');
      expect(nombreArchivoManual(new Date(2027, 0, 20, 23, 45))).toBe('patrimonio-backup-2027-01-20_2345.csv');
    });
  });

  describe('formatearRuta', () => {
    it('une los tramos y descarta los vacíos', () => {
      expect(formatearRuta(['Mi unidad', 'Finanzas', 'Patrimonio'])).toBe('Mi unidad / Finanzas / Patrimonio');
      expect(formatearRuta(['Mi unidad', ' ', 'X'])).toBe('Mi unidad / X');
      expect(formatearRuta(['…', 'Patrimonio'])).toBe('… / Patrimonio');
    });
  });

  describe('necesitaCopiaMensual', () => {
    it('toca si no hay ninguna copia', () => {
      expect(necesitaCopiaMensual(null, new Date(2026, 10, 26))).toBe(true);
    });

    it('no toca si ya hay una copia del mes en curso (aunque sea de otro día)', () => {
      expect(necesitaCopiaMensual({ lastBackupPeriod: '2026-11' }, new Date(2026, 10, 30))).toBe(false);
    });

    it('toca cuando cambia el mes calendario, aunque no haya pasado un mes completo', () => {
      expect(necesitaCopiaMensual({ lastBackupPeriod: '2026-10' }, new Date(2026, 10, 1, 0, 5))).toBe(true);
    });

    it('toca cuando cambia el año', () => {
      expect(necesitaCopiaMensual({ lastBackupPeriod: '2026-12' }, new Date(2027, 0, 2))).toBe(true);
    });

    it('si pasaron varios meses sin abrir la app, basta una copia', () => {
      expect(necesitaCopiaMensual({ lastBackupPeriod: '2026-03' }, new Date(2026, 10, 26))).toBe(true);
    });

    it('no repite la copia si el reloj está atrasado respecto a la última', () => {
      expect(necesitaCopiaMensual({ lastBackupPeriod: '2027-02' }, new Date(2026, 10, 26))).toBe(false);
    });
  });

  it('hayCopiaPendiente exige un CSV no vacío', () => {
    expect(hayCopiaPendiente(null)).toBe(false);
    expect(hayCopiaPendiente({ periodo: '2026-11', nombreArchivo: 'a.csv', csv: '', creadoEn: '', tipo: 'manual' })).toBe(false);
    expect(hayCopiaPendiente({ periodo: '2026-11', nombreArchivo: 'a.csv', csv: 'x', creadoEn: '', tipo: 'manual' })).toBe(true);
  });

  describe('construirMultipart', () => {
    it('incluye metadatos JSON y el CSV literal (tildes, «;» y saltos de línea intactos)', () => {
      const csv = 'Mes;Categoría\n2026-11;Año ñ';
      const cuerpo = construirMultipart({ name: 'a.csv', parents: ['root'] }, csv, 'text/csv', 'LIM');
      expect(cuerpo).toBe([
        '--LIM',
        'Content-Type: application/json; charset=UTF-8',
        '',
        '{"name":"a.csv","parents":["root"]}',
        '--LIM',
        'Content-Type: text/csv; charset=UTF-8',
        '',
        csv,
        '--LIM--',
        ''
      ].join('\r\n'));
      expect(cuerpo).toContain(csv);
    });
  });
});
