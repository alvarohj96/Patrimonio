import { Directive, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BaseChartDirective } from 'ng2-charts';
import { FilaCategoria, SubcategoriasPorCategoria } from '../../../../models/dashboard-patrimonio';
import { DistribucionDoughnutComponent } from './distribucion-doughnut.component';

const fila = (nombre: string, valor: number, porcentaje: number): FilaCategoria => ({
  nombre, color: '#4f46e5', valor, porcentaje, variacion: 0, variacionPct: null, objetivo: 0, progreso: null
});

const SUBCATEGORIAS: SubcategoriasPorCategoria = {
  Fondos: [
    { nombre: 'Indexado', color: '#4f46e5', valor: 600, porcentaje: 75 },
    { nombre: 'Renta fija', color: '#6a63ea', valor: 200, porcentaje: 25 }
  ],
  Cripto: []
};

/** Sustituye a ng2-charts: jsdom no tiene canvas y aquí solo se comprueba el drill-down. */
@Directive({ selector: 'canvas[baseChart]', standalone: true })
class GraficoFalso {
  readonly data = input<unknown>();
  readonly options = input<unknown>();
  readonly type = input<string>();
}

describe('DistribucionDoughnutComponent', () => {
  it('ofrece Global y solo las categorías con detalle, y al elegir una muestra sus subcategorías', async () => {
    await TestBed.configureTestingModule({ imports: [DistribucionDoughnutComponent] })
      .overrideComponent(DistribucionDoughnutComponent, {
        remove: { imports: [BaseChartDirective] },
        add: { imports: [GraficoFalso] }
      })
      .compileComponents();
    const fixture = TestBed.createComponent(DistribucionDoughnutComponent);
    fixture.componentRef.setInput('filas', [fila('Fondos', 800, 80), fila('Cripto', 200, 20)]);
    fixture.componentRef.setInput('total', 1000);
    fixture.componentRef.setInput('subcategorias', SUBCATEGORIAS);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    const chips = () => Array.from(el.querySelectorAll<HTMLButtonElement>('.chip'));
    expect(chips().map(c => c.textContent?.trim())).toEqual(['Global', 'Fondos']);
    expect(el.querySelector('.leyenda')?.textContent).toContain('Cripto');

    chips()[1].click();
    await fixture.whenStable();
    const leyenda = el.querySelector('.leyenda')?.textContent ?? '';
    expect(leyenda).toContain('Indexado');
    expect(leyenda).not.toContain('Cripto');
    expect(el.textContent).toContain('Subcategorías de Fondos');

    chips()[0].click();
    await fixture.whenStable();
    expect(el.querySelector('.leyenda')?.textContent).toContain('Cripto');

    fixture.destroy();
  });
});
