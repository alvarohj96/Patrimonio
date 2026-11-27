import { RegistroMensual } from '../services/patrimonio.service';

/** Cabecera del CSV de «Entrada mensual» (exportación, importación y copias en Drive). */
export const CABECERA_CSV_PATRIMONIO = 'Mes;Categoría;Subcategoría;Valor (€);Deuda (€);Cantidad';

/** Tipo MIME con el que se descarga y se sube el CSV. */
export const MIME_CSV = 'text/csv';

/**
 * Serializa los registros mensuales al CSV de la aplicación. Es la única implementación: la usan
 * «Exportar CSV» y las copias de seguridad en Drive, de modo que ambos archivos son idénticos.
 *
 * Formato (heredado, no cambiar sin migrar la importación): separador `;`, saltos de línea `\n` sin salto
 * final, UTF-8 sin BOM, sin comillas ni escapado, números tal cual (punto decimal) y la columna
 * «Cantidad» vacía cuando no hay cantidad.
 */
export function serializarRegistrosCsv(registros: readonly RegistroMensual[]): string {
  const lineas: string[] = [CABECERA_CSV_PATRIMONIO];

  registros.forEach(reg => {
    const mes = reg.mes;

    Object.keys(reg.valores).forEach(cat => {
      const subs = reg.valores[cat];

      Object.keys(subs).forEach(sub => {
        const dato = subs[sub];
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

/**
 * Nombres de categoría/subcategoría que contienen `;` o saltos de línea. El formato CSV heredado no los
 * escapa, así que esas filas no se podrían volver a importar correctamente. Se avisa, pero no se altera el CSV.
 */
export function nombresProblematicosCsv(registros: readonly RegistroMensual[]): string[] {
  const problematicos = new Set<string>();
  const malo = (t: string) => /[;\r\n]/.test(t);

  registros.forEach(reg => {
    Object.keys(reg.valores).forEach(cat => {
      if (malo(cat)) problematicos.add(cat);
      Object.keys(reg.valores[cat]).forEach(sub => {
        if (malo(sub)) problematicos.add(sub);
      });
    });
  });

  return [...problematicos];
}
