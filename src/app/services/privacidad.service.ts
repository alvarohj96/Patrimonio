import { Injectable, effect, signal } from '@angular/core';

/**
 * «Modo privacidad»: difumina los importes marcados con la clase `valor-sensible`
 * (estilo global en styles.scss). El estado se recuerda entre sesiones.
 */
@Injectable({ providedIn: 'root' })
export class PrivacidadService {

  private readonly LS_KEY = 'modo_privacidad';
  private readonly CLASE_BODY = 'modo-privacidad';

  readonly activo = signal(this.cargar());

  constructor() {
    effect(() => {
      const activo = this.activo();
      document.body.classList.toggle(this.CLASE_BODY, activo);
      try {
        localStorage.setItem(this.LS_KEY, JSON.stringify(activo));
      } catch {
        /* almacenamiento no disponible */
      }
    });
  }

  alternar() {
    this.activo.update(v => !v);
  }

  private cargar(): boolean {
    try {
      return localStorage.getItem(this.LS_KEY) === 'true';
    } catch {
      return false;
    }
  }
}
