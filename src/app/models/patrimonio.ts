export interface MovimientoMensual {
  mes: string;              // "2025-01"
  categoria: string;        // "Acciones", "Cripto", "Liquidez", etc.
  valor: number;
}

export interface PatrimonioGeneral {
  categoria: string;
  total: number;
}