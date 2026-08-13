import prisma from './client';
import bcrypt from 'bcryptjs';

async function main() {
  console.log('🌱 Seeding database...');

  // Crear usuario demo
  const hashedPassword = await bcrypt.hash('password123', 10);
  const usuario = await prisma.usuario.upsert({
    where: { email: 'demo@jujuybus.com' },
    update: {},
    create: {
      email: 'demo@jujuybus.com',
      nombre: 'Usuario Demo',
      password: hashedPassword,
    },
  });

  // Crear empresas
  const empresa1 = await prisma.empresa.upsert({
    where: { nombre: 'El Rápido Argentino' },
    update: {},
    create: {
      nombre: 'El Rápido Argentino',
      color: '#6C63FF',
    },
  });

  const empresa2 = await prisma.empresa.upsert({
    where: { nombre: 'Subur Cochabramba' },
    update: {},
    create: {
      nombre: 'Subur Cochabramba',
      color: '#00D4AA',
    },
  });

  const empresa3 = await prisma.empresa.upsert({
    where: { nombre: 'Panamericano' },
    update: {},
    create: {
      nombre: 'Panamericano',
      color: '#F59E0B',
    },
  });

  // Crear líneas
  const lineas = [
    { numero: '1', nombre: 'Terminal - Alto Comedero', empresaId: empresa1.id },
    { numero: '5', nombre: 'Centro - Gorriti', empresaId: empresa1.id },
    { numero: '11', nombre: 'San Pedrito - Centro', empresaId: empresa2.id },
    { numero: '23', nombre: 'Cuyaya - Terminal', empresaId: empresa2.id },
    { numero: '7', nombre: 'Alto La Viña - Centro', empresaId: empresa3.id },
  ];

  for (const lineaData of lineas) {
    const linea = await prisma.linea.upsert({
      where: { numero_empresaId: { numero: lineaData.numero, empresaId: lineaData.empresaId } },
      update: {},
      create: lineaData,
    });

    // Crear chat grupo para cada línea
    await prisma.chatGrupo.upsert({
      where: { lineaId: linea.id },
      update: {},
      create: { lineaId: linea.id },
    });
  }

  console.log('✅ Seed completado!');
  console.log(`   👤 Usuario demo: demo@jujuybus.com / password123`);
  console.log(`   🏢 ${await prisma.empresa.count()} empresas`);
  console.log(`   🚌 ${await prisma.linea.count()} líneas`);
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
