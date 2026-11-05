import { TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';

import { GestionarCategoriasComponent, normalizarNombre } from './gestionar-categorias.component';
import { PatrimonioService } from '../../services/patrimonio.service';

describe('GestionarCategoriasComponent', () => {
  function crear() {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [GestionarCategoriasComponent],
      providers: [{ provide: MatDialogRef, useValue: { close: () => {} } }]
    });
    const fixture = TestBed.createComponent(GestionarCategoriasComponent);
    return { fixture, component: fixture.componentInstance, serv: TestBed.inject(PatrimonioService) };
  }

  it('should create', () => {
    expect(crear().component).toBeTruthy();
  });

  it('normaliza sin mayúsculas, tildes ni espacios sobrantes', () => {
    expect(normalizarNombre('  Depósitos   A Plazo ')).toBe('depositos a plazo');
  });

  it('detecta duplicados sin distinguir mayúsculas ni tildes', () => {
    const { component } = crear();
    component.nuevaCat.set('ACCIONES');
    expect(component.error()).toContain('Acciones');
    expect(component.puedeAnadir()).toBe(false);

    component.nuevaCat.set('Oro');
    expect(component.error()).toBe('');
    expect(component.puedeAnadir()).toBe(true);
  });

  it('no permite añadir un nombre vacío', () => {
    const { component } = crear();
    component.nuevaCat.set('   ');
    expect(component.puedeAnadir()).toBe(false);
  });

  it('añade la categoría, la guarda y vacía el campo', () => {
    const { component, serv } = crear();
    component.nuevaCat.set('  Oro  ');
    component.addCat();

    expect(serv.getCategorias()).toContain('Oro');
    expect(component.categorias()).toContain('Oro');
    expect(component.nuevaCat()).toBe('');
  });

  it('reordena y persiste el orden', () => {
    const { component, serv } = crear();
    const [primera, segunda] = component.categorias();

    component.mover(0, 1);

    expect(component.categorias()[0]).toBe(segunda);
    expect(component.categorias()[1]).toBe(primera);
    expect(serv.getCategorias().slice(0, 2)).toEqual([segunda, primera]);
  });

  it('ignora movimientos fuera de rango', () => {
    const { component } = crear();
    const antes = [...component.categorias()];
    component.mover(0, -1);
    component.mover(antes.length - 1, antes.length);
    expect(component.categorias()).toEqual(antes);
  });
});
