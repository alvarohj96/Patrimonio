import { Injectable } from '@angular/core';
import { MovimientoMensual, PatrimonioGeneral } from '../models/patrimonio';
import { BehaviorSubject } from 'rxjs';
import { MonthlyRecord } from '../models';


const STORAGE_KEY = 'patrimonio_records_v1';


@Injectable({ providedIn: 'root' })
export class PatrimonioService {
  
  private STORAGE_MOVIMIENTOS = 'movimientos';
  
  constructor() {}

  // === Obtener movimientos mensuales ===
  getMovimientos(): MovimientoMensual[] {
    const data = localStorage.getItem(this.STORAGE_MOVIMIENTOS);
    return data ? JSON.parse(data) : [];
  }

  // === Añadir movimiento mensual ===
  addMovimiento(mov: MovimientoMensual) {
    const movs = this.getMovimientos();
    movs.push(mov);
    localStorage.setItem(this.STORAGE_MOVIMIENTOS, JSON.stringify(movs));
  }

  // === Calcular patrimonio general ===
  getPatrimonioGeneral(): PatrimonioGeneral[] {
    const movs = this.getMovimientos();
    const agregados: { [key: string]: number } = {};

    movs.forEach(m => {
      agregados[m.categoria] = (agregados[m.categoria] || 0) + m.valor;
    });

    return Object.keys(agregados).map(cat => ({
      categoria: cat,
      total: agregados[cat]
    }));
  }
}