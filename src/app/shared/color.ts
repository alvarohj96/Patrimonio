/**
 * Aclara u oscurece un color `#RRGGBB`.
 * @param brillo entre -100 (más oscuro) y 100 (más claro). Un color no válido se devuelve sin cambios.
 */
export function ajustarBrillo(color: string, brillo: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!m) return color;

  const factor = 1 + brillo / 100;
  return '#' + [m[1], m[2], m[3]]
    .map(hex => Math.max(0, Math.min(255, Math.round(parseInt(hex, 16) * factor))).toString(16).padStart(2, '0'))
    .join('');
}
