export interface AssetEntry {
assetClass: string; // e.g. 'Renta Variable', 'Renta Fija', 'Inmuebles'
amount: number; // valor en la moneda local
}


export interface MonthlyRecord {
id: string; // id único (timestamp o uuid)
year: number;
month: number; // 1..12
entries: AssetEntry[]; // lista de clases con su valor ese mes
}