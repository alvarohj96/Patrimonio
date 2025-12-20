import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ObjetivosSuggest } from './objetivos.model';

@Injectable({ providedIn: 'root' })
export class ObjetivosService {

  private LS_KEY = 'objetivos_patrimonio';

  private objetivosSubject = new BehaviorSubject<ObjetivosSuggest>({
    total: 0,
    categorias: []
  });

  objetivos$ = this.objetivosSubject.asObservable();

  constructor() {
    const raw = localStorage.getItem(this.LS_KEY);
    if (raw) {
      this.objetivosSubject.next(JSON.parse(raw));
    }
  }

  getObjetivos(): ObjetivosSuggest {
    return structuredClone(this.objetivosSubject.value);
  }

  actualizar(obj: ObjetivosSuggest) {
    localStorage.setItem(this.LS_KEY, JSON.stringify(obj));
    this.objetivosSubject.next(structuredClone(obj));
  }

  setObjetivoTotal(valor: number) {
    const obj = this.getObjetivos();
    obj.total = valor;
    this.actualizar(obj);
  }

  setObjetivoCategoria(categoria: string, valor: number) {
    const obj = this.getObjetivos();
    const existente = obj.categorias.find(c => c.categoria === categoria);

    if (existente) {
      existente.objetivo = valor;
    } else {
      obj.categorias.push({ categoria, objetivo: valor });
    }

    this.actualizar(obj);
  }
}
