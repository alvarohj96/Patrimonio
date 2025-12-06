import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GestionarSubcategoriasComponent } from './gestionar-subcategorias.component';

describe('GestionarSubcategoriasComponent', () => {
  let component: GestionarSubcategoriasComponent;
  let fixture: ComponentFixture<GestionarSubcategoriasComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GestionarSubcategoriasComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GestionarSubcategoriasComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
