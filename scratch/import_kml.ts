import * as fs from 'fs';
import * as path from 'path';
import { DOMParser } from '@xmldom/xmldom';
import { kml } from '@tmcw/togeojson';
import { Client } from 'ssh2';
import { createServer } from 'net';
import { PrismaClient } from '@prisma/client';

const SSH_HOST = '65.109.146.153';
const SSH_USER = 'root';
const SSH_PASS = 'J8$wP3!nZ7#fL9';
const LOCAL_PORT = 5434;
const REMOTE_DB_PORT = 5432;
const LINEAS_DIR = path.resolve(__dirname, '../../LINEAS');

const conn = new Client();
const server = createServer((sock) => {
  conn.forwardOut(
    sock.remoteAddress || 'localhost',
    sock.remotePort || 0,
    'localhost',
    REMOTE_DB_PORT,
    (err, stream) => {
      if (err) {
        console.error('SSH Forward Error:', err);
        sock.end();
        return;
      }
      sock.pipe(stream);
      stream.pipe(sock);
    }
  );
});

async function main() {
  console.log('Iniciando script de importación...');
  
  // 1. Establecer Túnel SSH
  await new Promise<void>((resolve, reject) => {
    conn.on('ready', () => {
      console.log('✅ SSH Client ready');
      server.listen(LOCAL_PORT, 'localhost', () => {
        console.log(`✅ SSH Tunnel established on local port ${LOCAL_PORT}`);
        resolve();
      });
    }).on('error', (err) => {
      reject(err);
    }).connect({
      host: SSH_HOST,
      port: 22,
      username: SSH_USER,
      password: SSH_PASS
    });
  });

  // 2. Conectar Prisma a través del túnel
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: `postgresql://postgres:postgrespassword@localhost:${LOCAL_PORT}/jujuybus?schema=public`
      }
    }
  });

  // 3. Crear/Obtener Empresa "SANTA ANA"
  const empresa = await prisma.empresa.upsert({
    where: { nombre: 'SANTA ANA' },
    update: {},
    create: {
      nombre: 'SANTA ANA',
      color: '#6C63FF'
    }
  });
  console.log('🏢 Empresa SANTA ANA:', empresa.id);

  // 4. Leer y Procesar archivos KML
  const files = fs.readdirSync(LINEAS_DIR).filter(f => f.endsWith('.kml'));
  console.log(`📂 Encontrados ${files.length} archivos KML.`);

  for (const file of files) {
    const kmlPath = path.join(LINEAS_DIR, file);
    const kmlContent = fs.readFileSync(kmlPath, 'utf-8');
    
    // El nombre del archivo es por ejemplo "LINEA 10.kml" o "LINEA 2 x PERON.kml"
    let numeroStr = file.replace('.kml', '').replace('LINEA ', '').trim();
    console.log(`\n⏳ Procesando línea: ${numeroStr}`);

    const doc = new DOMParser().parseFromString(kmlContent, 'text/xml');
    const geojson = kml(doc) as any;

    let puntosIda: any[] = [];
    let puntosVuelta: any[] = [];
    let paradasIda: any[] = [];
    let paradasVuelta: any[] = [];

    // Recorrer features de GeoJSON
    for (const feature of geojson.features) {
      const name = feature.properties?.name?.toUpperCase() || '';
      const geomType = feature.geometry?.type;
      const coords = feature.geometry?.coordinates;

      if (geomType === 'LineString') {
        const linePts = coords.map((c: number[]) => ({ lng: c[0], lat: c[1] }));
        if (name.includes('VUELTA')) {
          puntosVuelta = linePts;
        } else {
          // Asumimos IDA si no dice VUELTA
          puntosIda = linePts;
        }
      } else if (geomType === 'Point') {
        const pt = { lng: coords[0], lat: coords[1], name };
        if (name.includes('VUELTA')) {
          paradasVuelta.push(pt);
        } else {
          paradasIda.push(pt);
        }
      }
    }

    // Upsert Línea
    const linea = await prisma.linea.upsert({
      where: {
        numero_empresaId: {
          numero: numeroStr,
          empresaId: empresa.id
        }
      },
      update: {},
      create: {
        numero: numeroStr,
        empresaId: empresa.id
      }
    });

    // Upsert RecorridoGPS
    await prisma.recorridoGPS.upsert({
      where: { lineaId: linea.id },
      update: {
        puntos: puntosIda,
        puntosVuelta: puntosVuelta,
        paradas: paradasIda,
        paradasVuelta: paradasVuelta
      },
      create: {
        lineaId: linea.id,
        puntos: puntosIda,
        puntosVuelta: puntosVuelta,
        paradas: paradasIda,
        paradasVuelta: paradasVuelta
      }
    });

    console.log(`✅ Guardado: Línea ${numeroStr} (${puntosIda.length} ptos ida, ${puntosVuelta.length} ptos vuelta)`);
  }

  // Cerrar todo
  await prisma.$disconnect();
  server.close();
  conn.end();
  console.log('\n🎉 ¡Importación completada!');
}

main().catch(console.error);
