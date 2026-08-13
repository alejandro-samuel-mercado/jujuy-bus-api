const fs = require('fs');
const file = '/home/ale/Documentos/PROYECTOS/JUJUY-BUS/backend/src/sockets/gps.ts';
let code = fs.readFileSync(file, 'utf8');

// Add imports
code = code.replace(/import jwt from 'jsonwebtoken';/, "import jwt from 'jsonwebtoken';\nimport { PrismaClient } from '@prisma/client';\nimport { getDistanciaARuta, getDistancia } from '../utils/geo';\n\nconst prisma = new PrismaClient();");

// Add cached routes
code = code.replace(/const usuariosABordo = new Map<string, UsuarioABordo\[\]>\(\);/, "const usuariosABordo = new Map<string, UsuarioABordo[]>();\nconst cacheRecorridos = new Map<string, { lat: number; lng: number }[]>();\n\nasync function getRuta(lineaId: string) {\n  if (cacheRecorridos.has(lineaId)) return cacheRecorridos.get(lineaId)!;\n  const r = await prisma.recorridoGPS.findUnique({ where: { lineaId } });\n  const pts = r && Array.isArray(r.puntos) ? r.puntos as any[] : [];\n  cacheRecorridos.set(lineaId, pts);\n  return pts;\n}");

// Update actualizar_ubicacion
const oldActualizar = `socket.on('actualizar_ubicacion', (data: { lineaId: string; lat: number; lng: number }) => {
      const { lineaId, lat, lng } = data;
      if (!lineaId || typeof lat !== 'number' || typeof lng !== 'number') return;

      const coordenada: Coordenada = { lat, lng, timestamp: Date.now() };

      // Actualizar o insertar en el mapa de usuarios a bordo
      const lista = usuariosABordo.get(lineaId) || [];
      const idx = lista.findIndex(u => u.usuarioId === usuario.id);
      const entrada: UsuarioABordo = {
        usuarioId: usuario.id,
        nombre: usuario.nombre,
        lineaId,
        coordenada,
        socketId: socket.id,
      };
      if (idx >= 0) {
        lista[idx] = entrada;
      } else {
        lista.push(entrada);
      }
      usuariosABordo.set(lineaId, lista);`;

const newActualizar = `socket.on('actualizar_ubicacion', async (data: { lineaId: string; lat: number; lng: number }) => {
      const { lineaId, lat, lng } = data;
      if (!lineaId || typeof lat !== 'number' || typeof lng !== 'number') return;

      const coordenada: Coordenada = { lat, lng, timestamp: Date.now() };

      // Validar distancia a la ruta
      const ruta = await getRuta(lineaId);
      if (ruta.length > 0) {
        const dist = getDistanciaARuta({ lat, lng }, ruta);
        if (dist > 400) {
          console.log(\`[GPS] Desconectando a \${usuario.nombre} por desvío de \${Math.round(dist)}m\`);
          socket.emit('error_gps', 'Te has alejado demasiado del recorrido de la línea.');
          _quitarUsuarioDeLinea(lineaId, usuario.id, io);
          socket.data.lineaActiva = null;
          return;
        }
      }

      const lista = usuariosABordo.get(lineaId) || [];
      const idx = lista.findIndex(u => u.usuarioId === usuario.id);
      
      // Validar inactividad (anti-troll / se olvidó el GPS encendido)
      if (idx >= 0) {
        const previo = lista[idx].coordenada;
        const tiempoInactivo = coordenada.timestamp - previo.timestamp;
        const movido = getDistancia(previo, coordenada);
        
        // Si han pasado más de 10 min y se movió menos de 20 metros -> desconectar
        if (tiempoInactivo > 10 * 60 * 1000 && movido < 20) {
          console.log(\`[GPS] Desconectando a \${usuario.nombre} por inactividad\`);
          socket.emit('error_gps', 'GPS inactivo. Compartición finalizada automáticamente.');
          _quitarUsuarioDeLinea(lineaId, usuario.id, io);
          socket.data.lineaActiva = null;
          return;
        }
      }

      const entrada: UsuarioABordo = {
        usuarioId: usuario.id,
        nombre: usuario.nombre,
        lineaId,
        coordenada,
        socketId: socket.id,
      };
      
      if (idx >= 0) {
        lista[idx] = entrada;
      } else {
        lista.push(entrada);
      }
      usuariosABordo.set(lineaId, lista);`;

code = code.replace(oldActualizar, newActualizar);

fs.writeFileSync(file, code);
