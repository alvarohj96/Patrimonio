import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import {
  AlertaPlan,
  FaseLiquidez,
  ParametrosPlan,
  SituacionInicial,
  TrayectoriaPlan
} from '../../../../models/plan-desinversion';
import { euros, porcentaje } from '../../../../shared/formato';
import { CategoriaVista } from '../agrupacion-liquidez/agrupacion-liquidez.component';

interface Dato {
  etiqueta: string;
  valor: string;
}

interface Paso {
  numero: number;
  fase: FaseLiquidez;
  titulo: string;
  icono: string;
  /** Importe de la fase hoy (neto) */
  importe: number;
  categorias: string[];
  parrafos: string[];
  datos: Dato[];
  /** Sin activos en esta fase: se atenúa */
  vacio: boolean;
}

const ICONO_ALERTA: Record<AlertaPlan['nivel'], string> = {
  critica: 'error',
  aviso: 'warning_amber',
  info: 'info',
  ok: 'check_circle'
};

/**
 * Bloque 2 · Orden de cascada de la desinversión, explicado con los datos reales del usuario,
 * más las alertas de iliquidez del plan elegido.
 */
@Component({
  selector: 'app-cascada-retirada',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './cascada-retirada.component.html',
  styleUrl: './cascada-retirada.component.scss'
})
export class CascadaRetiradaComponent {
  readonly situacion = input.required<SituacionInicial>();
  readonly categorias = input.required<readonly CategoriaVista[]>();
  readonly parametros = input.required<ParametrosPlan>();
  /** Trayectoria de la estrategia elegida para el inmueble */
  readonly activa = input.required<TrayectoriaPlan>();
  readonly alertas = input.required<readonly AlertaPlan[]>();
  readonly hayIndivisibles = input.required<boolean>();
  readonly anioActual = input.required<number>();

  protected readonly euros = euros;
  protected readonly icono = ICONO_ALERTA;

  protected readonly pasos = computed<Paso[]>(() => [this.paso1(), this.paso2(), this.paso3()]);

  // ------------------------------------------------------
  // Paso 1 · Colchón de liquidez
  // ------------------------------------------------------
  private paso1(): Paso {
    const s = this.situacion();
    const a = this.activa();
    const base = this.base(1, 'colchon', 'Colchón de liquidez', 'savings', s.colchon);

    if (s.colchon <= 0) {
      return {
        ...base,
        vacio: true,
        parrafos: [
          'No hay colchón de liquidez registrado, así que las retiradas empezarían directamente vendiendo activos del Paso 2.',
          'Tener entre uno y dos años de retiradas en liquidez evita vender fondos justo cuando el mercado cae.'
        ]
      };
    }

    return {
      ...base,
      parrafos: [
        'Es lo primero que se consume: cubre las retiradas sin vender nada, sin volatilidad y sin fricción fiscal relevante.'
      ],
      datos: [
        { etiqueta: 'Saldo hoy', valor: euros(s.colchon) },
        {
          etiqueta: 'Dura',
          valor: a.colchonAgotadoMes === null ? 'Todo el horizonte' : `≈ ${this.duracion(a.colchonAgotadoMes)}`
        }
      ]
    };
  }

  // ------------------------------------------------------
  // Paso 2 · Venta fraccionada de activos líquidos
  // ------------------------------------------------------
  private paso2(): Paso {
    const s = this.situacion();
    const a = this.activa();
    const p = this.parametros();
    const base = this.base(2, 'liquidos', 'Venta fraccionada de activos líquidos', 'show_chart', s.liquidos);

    if (s.liquidos <= 0) {
      return {
        ...base,
        vacio: true,
        parrafos: [
          'No hay activos líquidos fraccionables registrados: una vez agotado el colchón no habría de dónde seguir retirando.'
        ]
      };
    }

    const primerAnio = a.filas.find(f => f.anio > 0 && f.deCartera > 0);
    const ventasPrimerAnio = primerAnio
      ? primerAnio.deCartera / Math.pow(1 + p.inflacion / 100, primerAnio.anio - 1)
      : null;

    return {
      ...base,
      parrafos: [
        'Cuando el colchón se agota, cada mes se vende una parte de la cartera para cubrir lo que falta. '
        + 'Al ser fraccionable, solo vendes lo necesario y el resto sigue invertido y rindiendo.'
      ],
      datos: [
        { etiqueta: 'Saldo hoy', valor: euros(s.liquidos) },
        {
          etiqueta: 'Empiezas a vender',
          valor: a.carteraInicioMes === null
            ? 'No hace falta en el horizonte'
            : a.carteraInicioMes === 1 ? 'Desde el primer mes' : `Tras ≈ ${this.duracion(a.carteraInicioMes - 1)}`
        },
        ...(primerAnio && ventasPrimerAnio !== null
          ? [{ etiqueta: `Ventas en el año ${primerAnio.anio}`, valor: `${euros(ventasPrimerAnio)} (euros de hoy)` }]
          : []),
        {
          etiqueta: 'Se agota',
          valor: a.carteraAgotadaMes === null ? 'No se agota' : `≈ ${this.duracion(a.carteraAgotadaMes)}`
        }
      ]
    };
  }

  // ------------------------------------------------------
  // Paso 3 · Activos indivisibles
  // ------------------------------------------------------
  private paso3(): Paso {
    const s = this.situacion();
    const a = this.activa();
    const p = this.parametros();
    const anioActual = this.anioActual();
    const base = this.base(3, 'indivisibles', 'Gestión de activos indivisibles', 'home_work', s.netoIndivisible);

    if (!this.hayIndivisibles()) {
      return {
        ...base,
        vacio: true,
        importe: 0,
        parrafos: [
          'No tienes activos indivisibles (inmuebles u otros ilíquidos) en tu patrimonio, así que el plan solo usa los pasos 1 y 2.'
        ]
      };
    }

    const porQueNo =
      'Un inmueble no se puede vender «a trozos»: se mantiene entero o se vende entero. '
      + 'Por eso no entra en la retirada periódica: es una decisión de todo o nada.';
    const rentaAnual = p.rentaNetaMensual * 12;
    const cubreRenta = p.retiradaMensual > 0 ? Math.min(100, (p.rentaNetaMensual / p.retiradaMensual) * 100) : 0;

    if (a.venta) {
      const v = a.venta;
      const parrafos = [
        porQueNo,
        `En ${anioActual + v.anio} se vende en bloque: ${euros(v.bruto)} de valor estimado − ${euros(v.costes)} de costes de salida `
        + `(${this.pct(p.costesSalida)}) − ${euros(v.deuda)} de deuda pendiente = ${euros(v.neto)} netos `
        + 'que entran de golpe y pasan a engrosar el colchón (Paso 1). Importes en euros de ese año.'
      ];
      if (rentaAnual > 0) parrafos.push('Hasta la venta cobras la renta neta del inmueble; después desaparece.');
      if (a.anioDeficit !== null && a.anioDeficit <= v.anio) {
        parrafos.push('Ojo: la liquidez se agota antes de la venta (ver alertas).');
      }

      return {
        ...base,
        parrafos,
        datos: [
          { etiqueta: 'Año de la venta', valor: String(anioActual + v.anio) },
          { etiqueta: 'Liquidez neta que entra', valor: euros(v.neto) },
          { etiqueta: 'Costes de salida', valor: euros(v.costes) }
        ]
      };
    }

    const ultima = a.filas[a.filas.length - 1];
    const parrafos = [
      porQueNo,
      `En tu plan se mantiene intacto durante ${p.horizonte} años: no aporta liquidez, pero su valor neto estimado `
      + `(${euros(s.netoIndivisible)} hoy → ${euros(ultima.inmuebleNeto / ultima.deflactor)} al final, en euros de hoy) `
      + 'sigue formando parte de tu patrimonio como reserva de último recurso.'
    ];
    if (rentaAnual > 0) {
      parrafos.push(
        `Su renta neta (${euros(rentaAnual)} al año) cubre el ${porcentaje(cubreRenta, 0)} de tu retirada y reduce lo que hay que sacar de la cartera.`
      );
    }

    return {
      ...base,
      parrafos,
      datos: [
        { etiqueta: 'Valor bruto hoy', valor: euros(s.brutoIndivisible) },
        ...(s.deudaIndivisible > 0 ? [{ etiqueta: 'Deuda pendiente', valor: euros(s.deudaIndivisible) }] : []),
        { etiqueta: 'Valor neto hoy', valor: euros(s.netoIndivisible) },
        ...(rentaAnual > 0 ? [{ etiqueta: 'Renta neta anual', valor: euros(rentaAnual) }] : [])
      ]
    };
  }

  // ------------------------------------------------------
  // Utilidades
  // ------------------------------------------------------
  private base(numero: number, fase: FaseLiquidez, titulo: string, icono: string, importe: number): Paso {
    return {
      numero,
      fase,
      titulo,
      icono,
      importe: Math.max(0, importe),
      categorias: this.categorias().filter(c => c.fase === fase).map(c => c.nombre),
      parrafos: [],
      datos: [],
      vacio: false
    };
  }

  /** 7 → «7 %»; 7.5 → «7,5 %». */
  private pct(n: number): string {
    return porcentaje(n, Number.isInteger(n) ? 0 : 1);
  }

  /** 5 → «5 meses»; 14 → «1 año y 2 meses»; 24 → «2 años». */
  private duracion(meses: number): string {
    if (meses < 12) return meses === 1 ? '1 mes' : `${meses} meses`;
    const anios = Math.floor(meses / 12);
    const resto = meses % 12;
    const a = anios === 1 ? '1 año' : `${anios} años`;
    if (resto === 0) return a;
    return `${a} y ${resto === 1 ? '1 mes' : `${resto} meses`}`;
  }
}
