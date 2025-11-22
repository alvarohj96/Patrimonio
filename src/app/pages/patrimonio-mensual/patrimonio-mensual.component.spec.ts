import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PatrimonioMensualComponent } from './patrimonio-mensual.component';

describe('PatrimonioMensualComponent', () => {
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
});
