import { TestBed } from '@angular/core/testing';

import { Objetivos } from './objetivos';

describe('Objetivos', () => {
  let service: Objetivos;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Objetivos);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
