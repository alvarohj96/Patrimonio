import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ObjetivosInversionComponent } from './objetivos-inversion.component';

const REGISTROS = [{
  mes: '2026-10',
  valores: {
    Acciones: { General: { valor: 6000 } },
    Fondos: { General: { valor: 3000 } },
    Inmuebles: { General: { valor: 200000, deuda: 150000 } },
    Liquidez: { General: { valor: 1000 } },
    Cripto: {}
  }
}];

describe('ObjetivosInversionComponent', () => {
  let fixture: ComponentFixture<ObjetivosInversionComponent>;
  let component: ObjetivosInversionComponent;

  const el = () => fixture.nativeElement as HTMLElement;
  const texto = () => el().textContent!.replace(/\s+/g, ' ');

  async function crear() {
    await TestBed.configureTestingModule({
      imports: [ObjetivosInversionComponent],
      providers: [provideRouter([])]
    }).compileComponents();
    fixture = TestBed.createComponent(ObjetivosInversionComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  }

  async function escribirPorcentaje(fila: number, valor: string) {
    const input = el().querySelectorAll<HTMLInputElement>('.tabla--config tbody tr')[fila]
      .querySelector<HTMLInputElement>('input[type="number"]')!;
    input.value = valor;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('patrimonioMensual', JSON.stringify(REGISTROS));
  });

  it('muestra todas las categorías y el patrimonio total neto (incluidos los inmuebles)', async () => {
    await crear();
    expect(el().querySelectorAll('.tabla--config tbody tr').length).toBe(5);
    expect(texto()).toContain('60.000,00 €');
  });

  it('no permite guardar si los porcentajes no suman 100 y avisa del motivo', async () => {
    await crear();
    await escribirPorcentaje(0, '50');

    const guardar = el().querySelector<HTMLButtonElement>('.btn--prim')!;
    expect(guardar.disabled).toBe(true);
    expect(texto()).toContain('deben sumar exactamente el 100 %');
    expect(localStorage.getItem('objetivos_inversion')).toBeNull();
  });

  it('guarda objetivos válidos asociados al id de la categoría y activa el simulador', async () => {
    await crear();
    expect(texto()).toContain('Guarda unos objetivos que sumen el 100 %');

    ['40', '30', '20', '10', '0'].forEach((v, i) => component.editarNumero(component.categorias()[i].id, 'porcentajeObjetivo', v));
    await fixture.whenStable();

    const guardar = el().querySelector<HTMLButtonElement>('.btn--prim')!;
    expect(guardar.disabled).toBe(false);
    guardar.click();
    await fixture.whenStable();

    const guardado = JSON.parse(localStorage.getItem('objetivos_inversion')!);
    const ids = component.categorias().map(c => c.id);
    expect(guardado.categorias.map((c: any) => c.categoriaId)).toEqual(ids);
    expect(JSON.stringify(guardado)).not.toContain('Acciones');

    expect(el().querySelectorAll('.tabla--comparacion tbody tr').length).toBe(5);
    expect(el().querySelectorAll('.tabla--simulador tbody tr').length).toBe(5);
    expect(texto()).toContain('Objetivos guardados');
  });

  it('el simulador reparte la cantidad, no aporta a inmuebles y mantiene su valor en el patrimonio proyectado', async () => {
    await crear();
    ['40', '30', '10', '10', '10'].forEach((v, i) => component.editarNumero(component.categorias()[i].id, 'porcentajeObjetivo', v));
    component.guardar();
    await fixture.whenStable();

    component.fijarImporte(2000);
    await fixture.whenStable();

    const sim = component.simulacion()!;
    expect(sim.asignado).toBe(2000);
    expect(sim.noAsignado).toBe(0);
    expect(sim.filas.find(f => f.nombre === 'Inmuebles')!.aportacion).toBe(0);
    expect(sim.filas.find(f => f.nombre === 'Inmuebles')!.valorProyectado).toBe(50000);
    expect(sim.patrimonioProyectado).toBe(62000);
    expect(texto()).toContain('Importe asignado');
    expect(texto()).toContain('Sin asignar');
  });

  it('se actualiza al cambiar la cantidad y muestra lo no asignado cuando las restricciones lo impiden', async () => {
    await crear();
    const [a, b, c, d, e] = component.categorias();
    component.editarNumero(a.id, 'porcentajeObjetivo', '50');
    component.editarNumero(b.id, 'porcentajeObjetivo', '50');
    [c, d, e].forEach(x => component.editarNumero(x.id, 'porcentajeObjetivo', '0'));
    component.editarNumero(a.id, 'incrementoMinimo', '500');
    component.editarNumero(b.id, 'incrementoMinimo', '500');
    component.guardar();

    component.editarImporte('700');
    await fixture.whenStable();

    const sim = component.simulacion()!;
    expect(sim.asignado).toBe(500);
    expect(sim.noAsignado).toBe(200);
    expect(el().querySelector('.nota--aviso')).toBeTruthy();
    expect(texto()).toContain('No se han podido asignar');

    component.editarImporte('1000');
    await fixture.whenStable();
    expect(component.simulacion()!.noAsignado).toBe(0);
  });

  it('descartar elimina los cambios sin guardar', async () => {
    await crear();
    await escribirPorcentaje(0, '25');
    expect(component.hayCambios()).toBe(true);
    component.descartar();
    await fixture.whenStable();
    expect(component.hayCambios()).toBe(false);
    expect(el().querySelectorAll<HTMLInputElement>('.tabla--config tbody tr')[0]
      .querySelector<HTMLInputElement>('input[type="number"]')!.value).toBe('0');
  });

  it('si se elimina una categoría con objetivo, avisa y bloquea el simulador hasta guardar de nuevo', async () => {
    await crear();
    ['40', '30', '10', '10', '10'].forEach((v, i) => component.editarNumero(component.categorias()[i].id, 'porcentajeObjetivo', v));
    component.guardar();
    await fixture.whenStable();
    expect(component.configUtilizable()).toBe(true);

    const patrimonio = TestBed.inject((await import('../../services/patrimonio.service')).PatrimonioService);
    patrimonio.removeCategoria('Cripto');
    await fixture.whenStable();

    expect(component.categorias().length).toBe(4);
    expect(component.configUtilizable()).toBe(false);
    expect(component.simulacion()).toBeNull();
    expect(texto()).toContain('ya no suman el 100 %');
  });

  it('sin datos mensuales la cartera está vacía y el simulador reparte según los objetivos', async () => {
    localStorage.removeItem('patrimonioMensual');
    await crear();
    const cats = component.categorias();
    ['50', '50', '0', '0', '0'].forEach((v, i) => component.editarNumero(cats[i].id, 'porcentajeObjetivo', v));
    component.guardar();
    component.fijarImporte(1000);
    await fixture.whenStable();

    expect(component.distribucion().patrimonioTotal).toBe(0);
    const sim = component.simulacion()!;
    expect(sim.filas[0].aportacion).toBe(500);
    expect(sim.filas[1].aportacion).toBe(500);
  });
});
