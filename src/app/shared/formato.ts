/** Utilidades de formato (es-ES) compartidas por el dashboard de patrimonio. */

const NBSP = '\u00A0';

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MESES_LARGOS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export interface OpcionesNumero {
  decimales?: number;
  /** Muestra «+» delante de los valores positivos. */
  signo?: boolean;
}

/** 1234567.8 → «1.234.567» (agrupa siempre los miles, también con 4 cifras). */
function agrupar(valorAbsoluto: number, decimales: number): string {
  const [entera, decimal] = valorAbsoluto.toFixed(decimales).split('.');
  const agrupada = entera.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decimal ? `${agrupada},${decimal}` : agrupada;
}

function signoDe(valor: number, decimales: number, mostrarMas: boolean): string {
  // Un valor que se redondea a 0 no lleva signo (evita «-0 €»)
  if (Number(Math.abs(valor).toFixed(decimales)) === 0) return '';
  if (valor < 0) return '-';
  return mostrarMas ? '+' : '';
}

/** 1234.5 → «1.235 €»; con `signo`: «+1.235 €». */
export function euros(valor: number, { decimales = 0, signo = false }: OpcionesNumero = {}): string {
  const n = Number.isFinite(valor) ? valor : 0;
  return `${signoDe(n, decimales, signo)}${agrupar(Math.abs(n), decimales)}${NBSP}€`;
}

/** 42.35 → «42,4 %»; con `signo`: «+42,4 %». */
export function porcentaje(valor: number, decimales = 1, signo = false): string {
  const n = Number.isFinite(valor) ? valor : 0;
  return `${signoDe(n, decimales, signo)}${agrupar(Math.abs(n), decimales)}${NBSP}%`;
}

/** Para ejes de gráficos: 154125 → «154k €», 1234567 → «1,2M €». */
export function eurosCompactos(valor: number, signo = false): string {
  const n = Number.isFinite(valor) ? valor : 0;
  const abs = Math.abs(n);
  const mas = signo && n > 0 ? '+' : '';
  const menos = n < 0 ? '-' : '';

  let cuerpo: string;
  if (abs >= 1_000_000) cuerpo = `${(abs / 1_000_000).toFixed(1).replace('.', ',')}M`;
  else if (abs >= 100_000) cuerpo = `${Math.round(abs / 1000)}k`;
  else if (abs >= 1000) cuerpo = `${(abs / 1000).toFixed(1).replace('.', ',').replace(/,0$/, '')}k`;
  else cuerpo = `${Math.round(abs)}`;

  return `${menos}${mas}${cuerpo}${NBSP}€`;
}

function partesMes(mes: string): { anio: number; mes: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!m) return null;
  const numero = Number(m[2]);
  return numero >= 1 && numero <= 12 ? { anio: Number(m[1]), mes: numero } : null;
}

/** «2026-11» → «Nov 2026» (o «Nov» sin año). */
export function etiquetaMes(mes: string, conAnio = true): string {
  const p = partesMes(mes);
  if (!p) return mes;
  return conAnio ? `${MESES_CORTOS[p.mes - 1]} ${p.anio}` : MESES_CORTOS[p.mes - 1];
}

/** «2026-11» → «Noviembre 2026». */
export function mesLargo(mes: string): string {
  const p = partesMes(mes);
  return p ? `${MESES_LARGOS[p.mes - 1]} ${p.anio}` : mes;
}

/** Suma `meses` a un mes `YYYY-MM` y devuelve otro `YYYY-MM`. */
export function sumarMeses(mes: string, meses: number): string {
  const p = partesMes(mes);
  if (!p) return mes;
  const indice = p.anio * 12 + (p.mes - 1) + meses;
  const anio = Math.floor(indice / 12);
  return `${anio}-${String((indice % 12) + 1).padStart(2, '0')}`;
}
