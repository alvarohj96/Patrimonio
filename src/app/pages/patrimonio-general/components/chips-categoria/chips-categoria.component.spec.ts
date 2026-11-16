import { TestBed } from '@angular/core/testing';
import { ChipsCategoriaComponent } from './chips-categoria.component';

describe('ChipsCategoriaComponent', () => {
  it('marca los chips activos y emite el id pulsado', async () => {
    await TestBed.configureTestingModule({ imports: [ChipsCategoriaComponent] }).compileComponents();
    const fixture = TestBed.createComponent(ChipsCategoriaComponent);
    fixture.componentRef.setInput('opciones', [
      { id: 'a', etiqueta: 'Fondos', color: '#4f46e5' },
      { id: 'b', etiqueta: 'Cripto', color: '#f59e0b' }
    ]);
    fixture.componentRef.setInput('activos', new Set(['a']));

    const emitidos: string[] = [];
    fixture.componentInstance.seleccion.subscribe(id => emitidos.push(id));
    await fixture.whenStable();

    const botones = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.chip'));
    expect(botones.map(b => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);

    botones[1].click();
    expect(emitidos).toEqual(['b']);
  });
});
