/**
 * Normaliza un string para comparaciones de deduplicación:
 * - Convierte a minúsculas
 * - Elimina tildes/acentos
 * - Elimina espacios extra
 * - Elimina caracteres especiales
 */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quitar tildes
    .replace(/[^a-z0-9\s]/g, '')     // solo alfanumérico y espacios
    .replace(/\s+/g, ' ')            // colapsar espacios múltiples
    .trim();
}

/**
 * Verifica si dos strings son "similares" para dedup
 */
export function sonSimilares(a: string, b: string): boolean {
  return normalizar(a) === normalizar(b);
}
