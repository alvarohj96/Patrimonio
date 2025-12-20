export interface ObjetivoCategoria {
  categoria: string;
  objetivo: number;
}

export interface ObjetivosSuggest {
  total: number;
  categorias: ObjetivoCategoria[];
}
