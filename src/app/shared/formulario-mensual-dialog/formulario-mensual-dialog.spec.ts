import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FormularioMensualDialog } from './formulario-mensual-dialog';

describe('FormularioMensualDialog', () => {
  let component: FormularioMensualDialog;
  let fixture: ComponentFixture<FormularioMensualDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormularioMensualDialog]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FormularioMensualDialog);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
