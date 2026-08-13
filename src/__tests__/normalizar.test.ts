import { normalizar, sonSimilares } from '../utils/normalizar';

describe('Normalizador Utility', () => {
  it('debe convertir a minúsculas', () => {
    expect(normalizar('EMPRESA')).toBe('empresa');
  });

  it('debe quitar tildes y acentos', () => {
    expect(normalizar('Línea Rápida')).toBe('linea rapida');
    expect(normalizar('CÓRDOBA')).toBe('cordoba');
  });

  it('debe colapsar espacios múltiples y limpiar extremos', () => {
    expect(normalizar('  Línea   Norte  ')).toBe('linea norte');
  });

  it('debe eliminar caracteres especiales', () => {
    expect(normalizar('Empresa-123!')).toBe('empresa123');
  });

  describe('sonSimilares', () => {
    it('debe identificar strings similares a pesar de diferencias de formato', () => {
      expect(sonSimilares('El Rápido', 'el rapido')).toBe(true);
      expect(sonSimilares('Transportes X', '  TRANSPORTES   X  ')).toBe(true);
      expect(sonSimilares('Línea 5 (Norte)', 'linea 5 norte')).toBe(true);
    });

    it('debe devolver false para strings diferentes', () => {
      expect(sonSimilares('Línea 5', 'Línea 6')).toBe(false);
      expect(sonSimilares('Empresa A', 'Empresa B')).toBe(false);
    });
  });
});
