import { Client } from 'ssh2';
import { createServer } from 'net';
import { PrismaClient } from '@prisma/client';

const SSH_HOST = '65.109.146.153';
const SSH_USER = 'root';
const SSH_PASS = 'J8$wP3!nZ7#fL9';
const LOCAL_PORT = 5440; // new port
const REMOTE_DB_PORT = 5432;

const conn = new Client();
const server = createServer((sock) => {
  conn.forwardOut(
    sock.remoteAddress || 'localhost',
    sock.remotePort || 0,
    'localhost',
    REMOTE_DB_PORT,
    (err, stream) => {
      if (err) { sock.end(); return; }
      sock.pipe(stream);
      stream.pipe(sock);
    }
  );
});

const CANTIDAD_MUESTRAS = 80;

const getCalle = async (lat: number, lng: number): Promise<string> => {
  const photonUrl = `https://photon.komoot.io/reverse?lon=${lng}&lat=${lat}`;
  const arcgisUrl = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?location=${lng},${lat}&f=pjson`;
  
  let calle = '';
  let ciudad = 'San Salvador de Jujuy';

  try {
    const resPho = await fetch(photonUrl, { signal: AbortSignal.timeout(3000) });
    if (resPho.ok) {
      const phoData: any = await resPho.json();
      calle = phoData?.features?.[0]?.properties?.street || phoData?.features?.[0]?.properties?.name || '';
      ciudad = phoData?.features?.[0]?.properties?.city || ciudad;
    }
  } catch(e) {}

  if (!calle) {
    try {
      const resArc = await fetch(arcgisUrl, { signal: AbortSignal.timeout(3000) });
      if (resArc.ok) {
        const arcData: any = await resArc.json();
        calle = arcData?.address?.Address || '';
        ciudad = arcData?.address?.City || ciudad;
      }
    } catch(e) {}
  }

  if (calle && calle.toLowerCase() !== ciudad.toLowerCase() && !calle.toLowerCase().includes('san salvador')) {
    return calle;
  }
  return 'Calle Desconocida';
};

const procesarTrayecto = async (puntosJson: any, cantidadMuestras: number, lineaNum: string, tipo: string): Promise<string[]> => {
  if (!puntosJson) return [];
  const ptos = typeof puntosJson === 'string' ? JSON.parse(puntosJson) : puntosJson;
  if (!Array.isArray(ptos) || ptos.length === 0) return [];
  
  const recorridoCalles: string[] = [];
  const muestras = Math.min(ptos.length, cantidadMuestras);
  const step = Math.max(1, Math.floor(ptos.length / muestras));

  for (let i = 0; i < ptos.length; i += step) {
    const p = ptos[i];
    if (p && p.lat && p.lng) {
      let calle = await getCalle(p.lat, p.lng);
      if (calle && calle !== 'Calle Desconocida') {
        if (calle.includes(',')) {
          calle = calle.split(',')[0].trim();
        }
        if (calle.match(/^RN[-\s]?/)) {
          calle = calle.replace(/RN[-\s]?/, 'Ruta Nacional ');
        }
        calle = calle.replace(/\sCasa$/i, '').trim();
        calle = calle.replace(/\s+\d+$/, '').trim();

        const lowerCalle = calle.toLowerCase();
        const isBad = lowerCalle.includes('manzana') || lowerCalle.includes(' mz') || lowerCalle.startsWith('mz') || lowerCalle.includes('lote') || lowerCalle.includes('ex. ap');
        
        if (!isBad) {
          if (recorridoCalles.length === 0) {
            recorridoCalles.push(calle);
          } else {
            const lastCalle = recorridoCalles[recorridoCalles.length - 1];
            const isSimilarToLast = lastCalle.toLowerCase().includes(lowerCalle) || lowerCalle.includes(lastCalle.toLowerCase());
            
            let isSimilarToPrev = false;
            if (recorridoCalles.length >= 2) {
              const prevCalle = recorridoCalles[recorridoCalles.length - 2];
              isSimilarToPrev = prevCalle.toLowerCase().includes(lowerCalle) || lowerCalle.includes(prevCalle.toLowerCase());
            }
            
            if (!isSimilarToLast && !isSimilarToPrev) {
              recorridoCalles.push(calle);
            }
          }
        }
      }
    }
    console.log(`[Línea ${lineaNum} - ${tipo}] Puntos: ${recorridoCalles.length}`);
    await new Promise(r => setTimeout(r, 400));
  }
  return recorridoCalles;
};

async function main() {
  await new Promise<void>((resolve, reject) => {
    conn.on('ready', () => {
      server.listen(LOCAL_PORT, 'localhost', () => resolve());
    }).on('error', reject).connect({ host: SSH_HOST, port: 22, username: SSH_USER, password: SSH_PASS });
  });

  const prisma = new PrismaClient({
    datasources: { db: { url: `postgresql://postgres:postgrespassword@localhost:${LOCAL_PORT}/jujuybus?schema=public` } }
  });

  const recorridos = await prisma.recorridoGPS.findMany({
    include: { linea: true }
  });

  console.log(`Encontrados ${recorridos.length} recorridos para auto-completar calles...`);

  for (const rec of recorridos) {
    if (!rec.linea) continue;

    console.log(`Línea ${rec.linea.numero}: Muestreando ${CANTIDAD_MUESTRAS} puntos...`);
    
    const callesIda = await procesarTrayecto(rec.puntos, CANTIDAD_MUESTRAS, rec.linea.numero, 'Ida');
    const callesVuelta = await procesarTrayecto(rec.puntosVuelta, CANTIDAD_MUESTRAS, rec.linea.numero, 'Vuelta');
    
    const finalCalles = [];
    if (callesIda.length > 0) {
      finalCalles.push('--- IDA ---');
      finalCalles.push(...callesIda);
    }
    if (callesVuelta.length > 0) {
      finalCalles.push('--- VUELTA ---');
      finalCalles.push(...callesVuelta);
    }

    if (finalCalles.length > 0) {
      await prisma.linea.update({
        where: { id: rec.lineaId },
        data: { recorridoPuntos: finalCalles }
      });
      console.log(`✅ Calles guardadas para línea ${rec.linea.numero}`);
    }
  }

  await prisma.$disconnect();
  server.close();
  conn.end();
}

main().catch(console.error);
