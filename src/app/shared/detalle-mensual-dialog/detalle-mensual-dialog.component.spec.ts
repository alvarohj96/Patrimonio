import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DetalleMensualDialogComponent } from './detalle-mensual-dialog.component';

describe('DetalleMensualDialogComponent', () => {
  let component: DetalleMensualDialogComponent;
  let fixture: ComponentFixture<DetalleMensualDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DetalleMensualDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DetalleMensualDialogComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
