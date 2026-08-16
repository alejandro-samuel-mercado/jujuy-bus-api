import { Client } from 'ssh2';
import { createServer } from 'net';
import { PrismaClient } from '@prisma/client';

const SSH_HOST = '65.109.146.153';
const SSH_USER = 'root';
const SSH_PASS = 'J8$wP3!nZ7#fL9';
const LOCAL_PORT = 5435;
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

  console.log(`Encontrados ${recorridos.length} recorridos para sincronizar...`);

  for (const rec of recorridos) {
    if (!rec.paradas) continue;
    
    // Parse paradas if it's a string, otherwise it's already an array of objects
    const paradasArr = typeof rec.paradas === 'string' ? JSON.parse(rec.paradas) : rec.paradas;
    
    // Extract names from paradas
    const nombresParadas = paradasArr
      .map((p: any) => p.name)
      .filter((n: string) => n && n.trim() !== '');

    if (nombresParadas.length > 0) {
      await prisma.linea.update({
        where: { id: rec.lineaId },
        data: { recorridoPuntos: nombresParadas }
      });
      console.log(`✅ Sincronizados ${nombresParadas.length} puntos visuales para la línea ${rec.linea?.numero}`);
    } else {
      console.log(`⚠️ Sin paradas con nombre para la línea ${rec.linea?.numero}`);
    }
  }

  await prisma.$disconnect();
  server.close();
  conn.end();
}

main().catch(console.error);
