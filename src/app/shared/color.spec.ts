import { ajustarBrillo } from './color';

describe('ajustarBrillo', () => {
  it('oscurece y aclara un color hexadecimal', () => {
    expect(ajustarBrillo('#808080', -50)).toBe('#404040');
    expect(ajustarBrillo('#808080', 50)).toBe('#c0c0c0');
    expect(ajustarBrillo('#f0f0f0', 100)).toBe('#ffffff');
  });

  it('devuelve sin cambios un color que no es #RRGGBB', () => {
    expect(ajustarBrillo('var(--x)', 20)).toBe('var(--x)');
  });
});
