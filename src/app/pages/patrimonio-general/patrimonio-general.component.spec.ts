import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PatrimonioGeneralComponent } from './patrimonio-general.component';

describe('PatrimonioGeneralComponent', () => {
  let component: PatrimonioGeneralComponent;
  let fixture: ComponentFixture<PatrimonioGeneralComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PatrimonioGeneralComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PatrimonioGeneralComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
