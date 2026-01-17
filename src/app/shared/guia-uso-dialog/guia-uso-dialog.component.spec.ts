import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GuiaUsoDialogComponent } from './guia-uso-dialog.component';

describe('GuiaUsoDialogComponent', () => {
  let component: GuiaUsoDialogComponent;
  let fixture: ComponentFixture<GuiaUsoDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GuiaUsoDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GuiaUsoDialogComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
