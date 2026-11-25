import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { FaseLiquidez, SituacionInicial } from '../../../../models/plan-desinversion';
import { euros } from '../../../../shared/formato';
import { CategoriaVista } from '../agrupacion-liquidez/agrupacion-liquidez.component';

interface Factor {
  icono: string;
  titulo: string;
  texto: string;
}

interface TarjetaFriccion {
  fase: FaseLiquidez;
  titulo: string;
  icono: string;
  factores: Factor[];
}

/** Bloque 4 · Fricción práctica (fiscalidad, costes, liquidez, inflación) de cada bloque del patrimonio. */
@Component({
  selector: 'app-guia-friccion',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './guia-friccion.component.html',
  styleUrl: './guia-friccion.component.scss'
})
export class GuiaFriccionComponent {
  readonly situacion = input.required<SituacionInicial>();
  readonly categorias = input.required<readonly CategoriaVista[]>();
  /** Gastos e impuestos de salida del inmueble (%) usados en el plan */
  readonly costesSalida = input.required<number>();

  protected readonly euros = euros;

  protected readonly tarjetas = computed<TarjetaFriccion[]>(() => [
    {
      fase: 'colchon',
      titulo: 'Colchón de liquidez',
      icono: 'savings',
      factores: [
        {
          icono: 'bolt',
          titulo: 'Sin fricción de venta',
          texto: 'Está disponible de inmediato (o en pocos días en monetarios): es el mejor sitio del que sacar dinero sin vender nada.'
        },
        {
          icono: 'trending_down',
          titulo: 'Erosión por inflación',
          texto: 'Su rentabilidad suele quedar por debajo de la inflación y pierde poder adquisitivo cada año. Por eso conviene un colchón de uno a tres años de retiradas, no más.'
        },
        {
          icono: 'receipt_long',
          titulo: 'Fiscalidad',
          texto: 'Los intereses tributan cada año como rendimientos del ahorro (escala del 19 % al 30 %), aunque no retires nada.'
        }
      ]
    },
    {
      fase: 'liquidos',
      titulo: 'Fondos, ETFs, acciones y cripto',
      icono: 'show_chart',
      factores: [
        {
          icono: 'swap_vert',
          titulo: 'Riesgo de secuencia',
          texto: 'Vender en plena caída durante los primeros años de retirada daña la cartera de forma casi irreversible. Para eso existe el colchón: te permite esperar a que el mercado se recupere.'
        },
        {
          icono: 'receipt_long',
          titulo: 'Fiscalidad FIFO',
          texto: 'En España, al vender participaciones del mismo valor o fondo se consideran vendidas primero las más antiguas (FIFO), normalmente las de mayor plusvalía latente. Solo tributa la ganancia, en la base del ahorro (19 %–30 %). Los fondos retienen un 19 % de la ganancia como pago a cuenta.'
        },
        {
          icono: 'sync_alt',
          titulo: 'Traspasos entre fondos',
          texto: 'Los fondos de inversión permiten traspasar sin tributar mientras no se reembolsa; las acciones y los ETF, no: cada venta cuenta.'
        },
        {
          icono: 'currency_bitcoin',
          titulo: 'Cripto',
          texto: 'Cada venta o permuta genera una ganancia o pérdida tributable y su volatilidad es mayor: dimensiona su peso antes de depender de ella para vivir.'
        }
      ]
    },
    {
      fase: 'indivisibles',
      titulo: 'Inmuebles y activos ilíquidos',
      icono: 'home_work',
      factores: [
        {
          icono: 'block',
          titulo: 'Indivisible',
          texto: 'No se vende «a trozos»: o lo mantienes entero o lo vendes entero, de golpe. No sirve para cubrir gastos mes a mes.'
        },
        {
          icono: 'paid',
          titulo: 'Costes de compraventa',
          texto: `Agencia, notaría, registro, cancelación de la hipoteca, plusvalía municipal e IRPF por la ganancia (base del ahorro). Tu plan estima un ${this.pct(this.costesSalida())} sobre el valor de venta; el real depende de cada caso.`
        },
        {
          icono: 'hourglass_empty',
          titulo: 'Tiempo de venta',
          texto: 'Puede llevar meses y el precio final rara vez coincide con la tasación. No dependas de la venta para cubrir gastos inmediatos: ahí aparece el riesgo de iliquidez.'
        },
        {
          icono: 'verified_user',
          titulo: 'Posibles exenciones',
          texto: 'La ganancia por vender la vivienda habitual puede quedar exenta si reinviertes en otra vivienda habitual o si tienes más de 65 años. Consulta tu caso con un asesor fiscal.'
        }
      ]
    }
  ]);

  protected importe(fase: FaseLiquidez): number {
    const s = this.situacion();
    return Math.max(0, fase === 'colchon' ? s.colchon : fase === 'liquidos' ? s.liquidos : s.netoIndivisible);
  }

  protected nombres(fase: FaseLiquidez): string {
    return this.categorias().filter(c => c.fase === fase).map(c => c.nombre).join(' · ');
  }

  private pct(n: number): string {
    return `${(Math.round(n * 10) / 10).toString().replace('.', ',')} %`;
  }
}
