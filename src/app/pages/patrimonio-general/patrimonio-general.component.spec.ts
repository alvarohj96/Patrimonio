import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RegistroMensual } from '../../services/patrimonio.service';
import { PatrimonioGeneralComponent } from './patrimonio-general.component';

function sembrar(registros: RegistroMensual[]) {
  localStorage.setItem('patrimonioMensual', JSON.stringify(registros));
  localStorage.setItem('patrimonioSubcategorias', JSON.stringify({ Fondos: ['A'], Inmuebles: ['Piso'] }));
  localStorage.setItem('categorias_patrimonio', JSON.stringify(['Fondos', 'Inmuebles']));
  localStorage.setItem('objetivos_patrimonio', JSON.stringify({ total: 500000, categorias: [{ categoria: 'Fondos', objetivo: 2000 }] }));
}

describe('PatrimonioGeneralComponent', () => {
  let fixture: ComponentFixture<PatrimonioGeneralComponent>;

  beforeEach(() => {
    localStorage.clear();
    // jsdom no implementa canvas ni ResizeObserver: contexto 2D falso para que Chart.js pueda montarse
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
      return new Proxy({ canvas: this }, {
        get: (destino, clave) => (clave in destino ? (destino as Record<PropertyKey, unknown>)[clave]
          : clave === 'measureText' ? () => ({ width: 0 }) : () => undefined)
      }) as unknown as CanvasRenderingContext2D;
    });
    vi.stubGlobal('ResizeObserver', class { observe() { /* sin efecto */ } unobserve() { /* sin efecto */ } disconnect() { /* sin efecto */ } });
  });
  afterEach(() => {
    fixture?.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.classList.remove('modo-privacidad');
  });

  async function crear() {
    await TestBed.configureTestingModule({ imports: [PatrimonioGeneralComponent] }).compileComponents();
    fixture = TestBed.createComponent(PatrimonioGeneralComponent);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('muestra el estado vacío cuando no hay registros', async () => {
    const el = await crear();
    expect(el.textContent).toContain('Aún no hay datos de patrimonio');
    expect(el.querySelector('app-kpi-patrimonio-neto')).toBeNull();
  });

  it('pinta las cinco filas con los datos reales', async () => {
    sembrar([
      { mes: '2026-10', valores: { Fondos: { A: { valor: 1000 } }, Inmuebles: { Piso: { valor: 200000, deuda: 150000 } } } },
      { mes: '2026-11', valores: { Fondos: { A: { valor: 1500 } }, Inmuebles: { Piso: { valor: 200000, deuda: 148000 } } } }
    ]);
    const el = await crear();

    ['app-kpi-patrimonio-neto', 'app-kpi-objetivo-global', 'app-kpi-inmuebles-deuda', 'app-distribucion-doughnut',
      'app-desglose-categorias', 'app-evolucion-historica', 'app-consistencia-ahorro', 'app-comparador-fechas',
      'app-simulador-regla-4'
    ].forEach(selector => expect(el.querySelector(selector)).not.toBeNull());

    // 1.500 + (200.000 − 148.000) = 53.500 de patrimonio neto
    expect(el.querySelector('app-kpi-patrimonio-neto')?.textContent).toContain('53.500');
    expect(el.querySelector('app-kpi-inmuebles-deuda')?.textContent).toContain('52.000');
    expect(el.querySelector('app-kpi-inmuebles-deuda')?.textContent).toContain('74,0');
  });

  it('el botón de privacidad activa el difuminado global y lo recuerda', async () => {
    const el = await crear();

    el.querySelector<HTMLButtonElement>('.btn-privacidad')!.click();
    await fixture.whenStable();

    expect(document.body.classList.contains('modo-privacidad')).toBe(true);
    expect(localStorage.getItem('modo_privacidad')).toBe('true');
  });
});
