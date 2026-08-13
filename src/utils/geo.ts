export interface Punto { lat: number; lng: number; }

// Distancia de Haversine en metros
export function getDistancia(p1: Punto, p2: Punto): number {
  const R = 6371e3; // Metros
  const φ1 = p1.lat * Math.PI / 180;
  const φ2 = p2.lat * Math.PI / 180;
  const Δφ = (p2.lat - p1.lat) * Math.PI / 180;
  const Δλ = (p2.lng - p1.lng) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Distancia punto a segmento
function getDistanciaPuntoSegmento(p: Punto, v: Punto, w: Punto): number {
  const l2 = Math.pow(v.lat - w.lat, 2) + Math.pow(v.lng - w.lng, 2);
  if (l2 === 0) return getDistancia(p, v);
  
  let t = ((p.lat - v.lat) * (w.lat - v.lat) + (p.lng - v.lng) * (w.lng - v.lng)) / l2;
  t = Math.max(0, Math.min(1, t));
  
  const proyeccion = {
    lat: v.lat + t * (w.lat - v.lat),
    lng: v.lng + t * (w.lng - v.lng)
  };
  
  return getDistancia(p, proyeccion);
}

// Distancia mínima punto a polilínea (ruta)
export function getDistanciaARuta(punto: Punto, ruta: Punto[]): number {
  if (!ruta || ruta.length === 0) return 0; // Si no hay ruta, no podemos penalizar
  if (ruta.length === 1) return getDistancia(punto, ruta[0]);

  let minDist = Infinity;
  for (let i = 0; i < ruta.length - 1; i++) {
    const dist = getDistanciaPuntoSegmento(punto, ruta[i], ruta[i+1]);
    if (dist < minDist) minDist = dist;
  }
  return minDist;
}
