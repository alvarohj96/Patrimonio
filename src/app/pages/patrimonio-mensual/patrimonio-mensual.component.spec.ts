import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PatrimonioMensualComponent } from './patrimonio-mensual.component';
import { PatrimonioService } from '../../services/patrimonio.service';

describe('PatrimonioMensualComponent', () => {
  beforeEach(() => localStorage.clear());

  let component: PatrimonioMensualComponent;
  let fixture: ComponentFixture<PatrimonioMensualComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PatrimonioMensualComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PatrimonioMensualComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('sigue mostrando la categoría eliminada que tiene histórico y la categoría eliminada no se pierde', async () => {
    const servicio = TestBed.inject(PatrimonioService);
    servicio.actualizarRegistros([{
      mes: '2026-09',
      valores: { Acciones: { General: { valor: 100 } }, Cripto: { General: { valor: 50 } } }
    }]);

    servicio.removeCategoria('Cripto');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.categorias).not.toContain('Cripto');
    expect(component.categoriasTabla).toContain('Cripto');
    expect(component.categoriasTabla.slice(0, component.categorias.length)).toEqual(component.categorias);
    expect(servicio.getRegistros()[0].valores['Cripto']['General'].valor).toBe(50);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Cripto');
  });
});
