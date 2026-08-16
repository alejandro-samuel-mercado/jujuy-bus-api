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

  const recorrido = await prisma.recorridoGPS.findFirst({
    include: { linea: true }
  });

  console.log('Línea:', recorrido?.linea?.numero);
  console.log('Puntos (tipo):', typeof recorrido?.puntos);
  console.log('Puntos (muestra):', JSON.stringify(recorrido?.puntos).substring(0, 100));

  await prisma.$disconnect();
  server.close();
  conn.end();
}

main().catch(console.error);
