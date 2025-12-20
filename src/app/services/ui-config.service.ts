import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface UiConfig {
  mostrarObjetivos: boolean;
  mostrarBarras: boolean;
  mostrarLineas: boolean;
}

const DEFAULT_CONFIG: UiConfig = {
  mostrarObjetivos: true,
  mostrarBarras: true,
  mostrarLineas: true
};

@Injectable({ providedIn: 'root' })
export class UiConfigService {

  private LS_KEY = 'ui_config';

  private subject = new BehaviorSubject<UiConfig>(this.load());
  config$ = this.subject.asObservable();

  private load(): UiConfig {
    const raw = localStorage.getItem(this.LS_KEY);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : DEFAULT_CONFIG;
  }

  update(partial: Partial<UiConfig>) {
    const next : UiConfig = { ...this.subject.value, ...partial };
    localStorage.setItem(this.LS_KEY, JSON.stringify(next));
    this.subject.next(next);
  }

  get value(): UiConfig {
    return this.subject.value;
  }
}
