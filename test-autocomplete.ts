import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function test() {
  const linea = await prisma.linea.findFirst();
  if (!linea) {
    console.log("No lineas found.");
    return;
  }
  console.log("Testing with linea:", linea.id);
  
  // Fake points in Jujuy
  const puntos = [
    { lat: -24.185786, lng: -65.299476 },
    { lat: -24.186786, lng: -65.298476 }
  ];
  
  const ciudades = new Set<string>();
  
  for (const p of puntos) {
    console.log("Fetching", p);
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${p.lat}&lon=${p.lng}&zoom=18&addressdetails=1`;
    const response = await fetch(url, { headers: { 'User-Agent': 'JujuyBusApp/1.0' } });
    const data = await response.json();
    console.log("Response:", data.address);
  }
}

test().catch(console.error).finally(() => prisma.$disconnect());
