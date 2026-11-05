import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';

import { GestionarSubcategoriasComponent } from './gestionar-subcategorias.component';
import { PatrimonioService } from '../../services/patrimonio.service';

describe('GestionarSubcategoriasComponent', () => {
  function crear(data: { categoria?: string } | null = null, subs: { [c: string]: string[] } = {}) {
    localStorage.clear();
    // El snackbar simula que el usuario pulsa "Deshacer" al instante
    const snack = { open: vi.fn(() => ({ onAction: () => of(void 0) })) };
    TestBed.configureTestingModule({
      imports: [GestionarSubcategoriasComponent],
      providers: [
        { provide: MatDialogRef, useValue: { close: () => {} } },
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatSnackBar, useValue: snack }
      ]
    });
    const serv = TestBed.inject(PatrimonioService);
    Object.entries(subs).forEach(([c, lista]) => lista.forEach(s => serv.addSubcategoria(c, s)));
    const fixture = TestBed.createComponent(GestionarSubcategoriasComponent);
    return { fixture, component: fixture.componentInstance, serv, snack };
  }

  it('should create y arranca en la primera categoría', () => {
    const { component } = crear();
    expect(component).toBeTruthy();
    expect(component.categoria()).toBe(component.categorias()[0]);
  });

  it('abre la categoría recibida desde fuera', () => {
    const { component } = crear({ categoria: 'Fondos' });
    expect(component.categoria()).toBe('Fondos');
  });

  it('ignora una categoría recibida que ya no existe', () => {
    const { component } = crear({ categoria: 'Inexistente' });
    expect(component.categoria()).toBe(component.categorias()[0]);
  });

  it('añade varias subcategorías separadas por comas, sin repetidas ni vacías', () => {
    const { component, serv } = crear({ categoria: 'Cripto' });
    component.nuevaSub.set(' BTC , ETH,, btc ;SOL ');
    expect(component.puedeAnadir()).toBe(true);

    component.anyadir();

    expect(serv.getSubcategorias('Cripto')).toEqual(['BTC', 'ETH', 'SOL']);
    expect(component.nuevaSub()).toBe('');
  });

  it('detecta duplicados sin distinguir mayúsculas ni tildes', () => {
    const { component } = crear({ categoria: 'Fondos' }, { Fondos: ['Renta fija'] });
    component.nuevaSub.set('renta FIJA');
    expect(component.error()).toContain('Renta fija');
    expect(component.puedeAnadir()).toBe(false);
  });

  it('al eliminar avisa y "Deshacer" restaura la subcategoría en su posición', () => {
    const { component, serv, snack } = crear({ categoria: 'Fondos' }, { Fondos: ['A', 'B', 'C'] });

    component.eliminar('B');

    expect(snack.open).toHaveBeenCalled();
    expect(serv.getSubcategorias('Fondos')).toEqual(['A', 'B', 'C']);
  });

  it('indica cuántos meses tienen datos de cada subcategoría', () => {
    localStorage.clear();
    const { component, serv } = crear({ categoria: 'Fondos' }, { Fondos: ['A', 'B'] });
    serv.actualizarRegistros([
      { mes: '2026-01', valores: { Fondos: { A: { valor: 1 } } } },
      { mes: '2026-02', valores: { Fondos: { A: { valor: 2 } } } }
    ]);

    component.seleccionar('Fondos');

    expect(component.meses()['A']).toBe(2);
    expect(component.meses()['B']).toBeUndefined();
  });

  it('reordena y persiste el orden', () => {
    const { component, serv } = crear({ categoria: 'Fondos' }, { Fondos: ['A', 'B', 'C'] });
    component.mover(2, 0);
    expect(serv.getSubcategorias('Fondos')).toEqual(['C', 'A', 'B']);
  });
});
