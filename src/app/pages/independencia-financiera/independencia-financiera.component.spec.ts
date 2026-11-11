import { ComponentFixture, TestBed } from '@angular/core/testing';

import { IndependenciaFinancieraComponent } from './independencia-financiera.component';

describe('IndependenciaFinancieraComponent', () => {
  let component: IndependenciaFinancieraComponent;
  let fixture: ComponentFixture<IndependenciaFinancieraComponent>;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [IndependenciaFinancieraComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(IndependenciaFinancieraComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => localStorage.clear());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('proyecta con los valores por defecto y el escenario moderado', () => {
    expect(component.escenarioActivo().id).toBe('moderado');
    expect(component.resumenActivo().patrimonioFinal).toBeGreaterThan(0);
    expect(component.tabla().length).toBe(component.horizonte() + 1);
  });

  it('al cambiar el horizonte se ajusta la tabla y se limita al rango permitido', () => {
    component.fijarHorizonte(30);
    expect(component.tabla().length).toBe(31);
    component.fijarHorizonte(999);
    expect(component.horizonte()).toBe(50);
    component.fijarHorizonte(0);
    expect(component.horizonte()).toBe(1);
  });

  it('editar la rentabilidad personalizada selecciona ese escenario', () => {
    component.editarRentabilidadPersonalizada('9,5');
    expect(component.escenario()).toBe('personalizado');
    expect(component.escenarioActivo().rentabilidad).toBe(9.5);
  });

  it('con patrimonio manual usa ese valor como punto de partida', () => {
    component.fijarUsarRegistrado(false);
    component.editarPatrimonioManual('25000');
    expect(component.patrimonioInicial()).toBe(25000);
    expect(component.escenarioActivo().filas[0].patrimonio).toBe(25000);
  });

  it('sin gastos no hay hitos de independencia ni capital objetivo', () => {
    component.editarGastos('');
    expect(component.hayObjetivo()).toBe(false);
    expect(component.hitos().every(h => h.tipo === 'capital')).toBe(true);
  });

  it('el modo euros de hoy reduce el patrimonio final cuando hay inflación', () => {
    component.fijarReales(false);
    const nominal = component.resumenActivo().patrimonioFinal;
    component.fijarReales(true);
    expect(component.resumenActivo().patrimonioFinal).toBeLessThan(nominal);
  });
});
