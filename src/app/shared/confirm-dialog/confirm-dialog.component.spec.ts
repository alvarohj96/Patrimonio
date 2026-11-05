import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { ConfirmDialogComponent } from './confirm-dialog.component';

describe('ConfirmDialogComponent', () => {
  function crear(data: any) {
    const close = vi.fn();
    TestBed.configureTestingModule({
      imports: [ConfirmDialogComponent],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close } }
      ]
    });
    const fixture = TestBed.createComponent(ConfirmDialogComponent);
    fixture.detectChanges();
    return { fixture, close, el: fixture.nativeElement as HTMLElement };
  }

  it('should create', () => {
    expect(crear({ mensaje: '¿Seguro?' }).fixture.componentInstance).toBeTruthy();
  });

  it('mantiene el texto de siempre cuando solo recibe el mensaje', () => {
    const { el } = crear({ mensaje: '¿Eliminar mes Oct 2026?' });
    expect(el.querySelector('.dialog-title')?.textContent).toContain('Confirmar eliminación');
    expect(el.querySelector('.btn-peligro')?.textContent).toContain('Eliminar');
    expect(el.querySelector('.dialog-message')?.textContent).toContain('¿Eliminar mes Oct 2026?');
  });

  it('admite título y texto de confirmación personalizados', () => {
    const { el } = crear({ mensaje: 'x', titulo: 'Eliminar categoría', confirmar: 'Sí, eliminar' });
    expect(el.querySelector('.dialog-title')?.textContent).toContain('Eliminar categoría');
    expect(el.querySelector('.btn-peligro')?.textContent).toContain('Sí, eliminar');
  });

  it('cierra con true al confirmar y con false al cancelar', () => {
    const { el, close } = crear({ mensaje: 'x' });
    (el.querySelector('.btn-peligro') as HTMLButtonElement).click();
    expect(close).toHaveBeenLastCalledWith(true);

    (el.querySelector('.dialog-actions button:first-child') as HTMLButtonElement).click();
    expect(close).toHaveBeenLastCalledWith(false);
  });
});
