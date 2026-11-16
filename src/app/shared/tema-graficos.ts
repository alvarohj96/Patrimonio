import { Signal, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ThemeService } from '../services/theme/theme.service';

export interface ColoresGrafico {
  texto: string;
  rejilla: string;
  /** Color de fondo de las tarjetas (separa los sectores de un donut). */
  superficie: string;
}

/** Tooltip común a todos los gráficos del dashboard. */
export const TOOLTIP_GRAFICO = {
  backgroundColor: 'rgba(15, 23, 42, 0.92)',
  titleColor: 'rgba(255, 255, 255, 0.65)',
  bodyColor: '#ffffff',
  padding: 12,
  cornerRadius: 10,
  boxPadding: 6,
  usePointStyle: true
};

/**
 * Colores de ejes y rejilla según el tema activo. Se actualiza solo cuando cambia el tema.
 * Hay que llamarla en un contexto de inyección (inicializador de campo o constructor).
 */
export function coloresGrafico(): Signal<ColoresGrafico> {
  const tema = toSignal(inject(ThemeService).theme$, { requireSync: true });
  return computed(() =>
    tema() === 'dark'
      ? { texto: '#94a3b8', rejilla: 'rgba(148, 163, 184, 0.16)', superficie: '#1e1e1e' }
      : { texto: '#64748b', rejilla: 'rgba(148, 163, 184, 0.28)', superficie: '#ffffff' }
  );
}
