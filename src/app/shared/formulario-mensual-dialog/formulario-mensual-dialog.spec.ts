import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { FormularioMensualDialogComponent } from './formulario-mensual-dialog';
import { PatrimonioService } from '../../services/patrimonio.service';

describe('FormularioMensualDialogComponent', () => {
  function crear(preparar: (s: PatrimonioService) => void = () => {}) {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [FormularioMensualDialogComponent],
      providers: [
        { provide: MatDialogRef, useValue: { close: () => {} } },
        { provide: MAT_DIALOG_DATA, useValue: {} }
      ]
    });
    const serv = TestBed.inject(PatrimonioService);
    preparar(serv);
    const fixture = TestBed.createComponent(FormularioMensualDialogComponent);
    return { fixture, component: fixture.componentInstance, serv };
  }

  const mesActual = () => {
    const h = new Date();
    return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}`;
  };

  it('should create y arranca en el mes en curso', () => {
    const { component } = crear();
    expect(component).toBeTruthy();
    expect(component.mes).toBe(mesActual());
  });

  it('empieza en la primera categoría con subcategorías pendientes', () => {
    const { component } = crear(s => {
      s.addSubcategoria('Fondos', 'Indexado');
      s.addSubcategoria('Fondos', 'Renta fija');
    });
    expect(component.categoria).toBe('Fondos');
    expect(component.subcategoria).toBe('');
  });

  it('preselecciona la subcategoría si solo queda una pendiente', () => {
    const { component } = crear(s => s.addSubcategoria('Liquidez', 'Cuenta'));
    expect(component.categoria).toBe('Liquidez');
    expect(component.subcategoria).toBe('Cuenta');
  });

  it('cambiarMes mueve el mes seleccionado, también entre años', () => {
    const { component } = crear();
    component.mesSeleccionado = new Date(2026, 0, 1);
    component.cambiarMes(-1);
    expect(component.mes).toBe('2025-12');
    component.cambiarMes(1);
    expect(component.mes).toBe('2026-01');
  });

  describe('importe', () => {
    it('vacío no se puede guardar, pero 0 € sí', () => {
      const { component } = crear(s => s.addSubcategoria('Liquidez', 'Cuenta'));
      expect(component.valor).toBeNull();
      expect(component.puedeGuardar()).toBe(false);

      component.valor = 0;
      expect(component.puedeGuardar()).toBe(true);
    });

    it('no admite importes negativos', () => {
      const { component } = crear(s => s.addSubcategoria('Liquidez', 'Cuenta'));
      component.valor = -5;
      expect(component.puedeGuardar()).toBe(false);
    });

    it('guarda un 0 € y la subcategoría queda marcada como introducida', () => {
      const { component, serv } = crear(s => s.addSubcategoria('Liquidez', 'Cuenta'));
      component.valor = 0;

      component.guardarYAnadirOtro();

      const reg = serv.getRegistros().find(r => r.mes === component.mes)!;
      expect(reg.valores['Liquidez']['Cuenta'].valor).toBe(0);
      expect(component.tieneValor('Liquidez', 'Cuenta')).toBe(true);
    });
  });

  it('calcula la parte neta de un inmueble según el % de propiedad', () => {
    const { component } = crear();
    component.valor = 200000;
    component.deuda = 100000;
    component.porcentajePropiedad = 50;
    expect(component.netoInmueble()).toBe(50000);
  });
});
