import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

interface RegistroMensual {
  mes: string;
  valores: { [categoria: string]: number };
}

@Injectable({
  providedIn: 'root'
})
export class PatrimonioService {

  private registrosSubject = new BehaviorSubject<RegistroMensual[]>([]);
  registros$ = this.registrosSubject.asObservable();

  constructor() {
    const guardado = localStorage.getItem('patrimonioMensual');
    if (guardado) {
      this.registrosSubject.next(JSON.parse(guardado));
    }
  }

  getRegistros(): RegistroMensual[] {
    return this.registrosSubject.value;
  }

  actualizarRegistros(registros: RegistroMensual[]) {
    this.registrosSubject.next(registros);
    localStorage.setItem('patrimonioMensual', JSON.stringify(registros));
  }

}
