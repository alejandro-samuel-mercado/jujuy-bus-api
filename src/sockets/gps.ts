import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { getDistanciaARuta, getDistancia } from '../utils/geo';

const prisma = new PrismaClient();

interface JwtPayload {
  id: string;
  email: string;
  nombre: string;
}

interface Coordenada {
  lat: number;
  lng: number;
  timestamp: number;
}

interface UsuarioABordo {
  usuarioId: string;
  nombre: string;
  lineaId: string;
  coordenada: Coordenada;
  socketId: string;
}

// Mapa en memoria: lineaId -> lista de usuarios a bordo
const usuariosABordo = new Map<string, UsuarioABordo[]>();
const cacheRecorridos = new Map<string, { lat: number; lng: number }[]>();

async function getRuta(lineaId: string) {
  if (cacheRecorridos.has(lineaId)) return cacheRecorridos.get(lineaId)!;
  const r = await prisma.recorridoGPS.findUnique({ where: { lineaId } });
  const pts = r && Array.isArray(r.puntos) ? r.puntos as any[] : [];
  cacheRecorridos.set(lineaId, pts);
  return pts;
}

// Calcula el centroide (promedio) de las coordenadas de todos los usuarios a bordo de una línea
function calcularCentroide(lineaId: string): Coordenada | null {
  const usuarios = usuariosABordo.get(lineaId);
  if (!usuarios || usuarios.length === 0) return null;

  const suma = usuarios.reduce(
    (acc, u) => ({ lat: acc.lat + u.coordenada.lat, lng: acc.lng + u.coordenada.lng }),
    { lat: 0, lng: 0 }
  );

  return {
    lat: suma.lat / usuarios.length,
    lng: suma.lng / usuarios.length,
    timestamp: Date.now(),
  };
}

// Limpia usuarios a bordo cuya última actualización fue hace más de 30 segundos (GPS muerto)
function limpiarStale(lineaId: string) {
  const ahora = Date.now();
  const usuarios = usuariosABordo.get(lineaId) || [];
  const activos = usuarios.filter(u => ahora - u.coordenada.timestamp < 30_000);
  if (activos.length === 0) {
    usuariosABordo.delete(lineaId);
  } else {
    usuariosABordo.set(lineaId, activos);
  }
}

export function setupGpsSockets(io: Server) {
  const gpsNamespace = io.of('/gps');

  // Middleware de autenticación para el namespace de GPS
  gpsNamespace.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Token de autenticación requerido'));
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
      socket.data.usuario = decoded;
      next();
    } catch (err) {
      next(new Error('Token inválido'));
    }
  });

  gpsNamespace.on('connection', (socket: Socket) => {
    const usuario = socket.data.usuario as JwtPayload;
    console.log(`[GPS] Usuario conectado: ${usuario.nombre} (${socket.id})`);

    // ─── Unirse a la sala de observación de una línea (sin transmitir GPS) ───
    socket.on('observar_linea', (lineaId: string) => {
      socket.join(`linea:${lineaId}`);
      console.log(`[GPS] ${usuario.nombre} observando línea ${lineaId}`);

      // Enviar inmediatamente la posición actual si hay alguien a bordo
      limpiarStale(lineaId);
      const centroide = calcularCentroide(lineaId);
      const abordo = usuariosABordo.get(lineaId)?.length ?? 0;
      socket.emit('estado_linea', { lineaId, centroide, abordo });
    });

    socket.on('dejar_observacion', (lineaId: string) => {
      socket.leave(`linea:${lineaId}`);
    });

    // ─── Activar modo "A Bordo" ───────────────────────────────────────────────
    socket.on('subir_al_colectivo', (lineaId: string) => {
      socket.data.lineaActiva = lineaId;
      socket.join(`linea:${lineaId}`);
      console.log(`[GPS] ${usuario.nombre} subió al colectivo ${lineaId}`);
      // Notificar a los observadores que hay un pasajero más
      const abordo = (usuariosABordo.get(lineaId)?.length ?? 0) + 1;
      gpsNamespace.to(`linea:${lineaId}`).emit('pasajeros_abordo', { lineaId, abordo });
    });

    // ─── Transmitir coordenada ────────────────────────────────────────────────
    socket.on('actualizar_ubicacion', async (data: { lineaId: string; lat: number; lng: number }) => {
      const { lineaId, lat, lng } = data;
      if (!lineaId || typeof lat !== 'number' || typeof lng !== 'number') return;

      const coordenada: Coordenada = { lat, lng, timestamp: Date.now() };

      // Validar distancia a la ruta
      const ruta = await getRuta(lineaId);
      if (ruta.length > 0) {
        const dist = getDistanciaARuta({ lat, lng }, ruta);
        if (dist > 400) {
          console.log(`[GPS] Desconectando a ${usuario.nombre} por desvío de ${Math.round(dist)}m`);
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
          console.log(`[GPS] Desconectando a ${usuario.nombre} por inactividad`);
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
      usuariosABordo.set(lineaId, lista);

      // Calcular el centroide y emitirlo a todos en la sala
      const centroide = calcularCentroide(lineaId);
      const abordo = lista.length;
      gpsNamespace.to(`linea:${lineaId}`).emit('ubicacion_colectivo', {
        lineaId,
        centroide,
        abordo,
      });
    });

    // ─── Bajar del colectivo ──────────────────────────────────────────────────
    socket.on('bajar_del_colectivo', (lineaId: string) => {
      _quitarUsuarioDeLinea(lineaId, usuario.id, io);
      socket.data.lineaActiva = null;
      console.log(`[GPS] ${usuario.nombre} bajó del colectivo ${lineaId}`);
    });

    // ─── Limpieza al desconectarse ────────────────────────────────────────────
    socket.on('disconnect', () => {
      const lineaActiva = socket.data.lineaActiva as string | null;
      if (lineaActiva) {
        _quitarUsuarioDeLinea(lineaActiva, usuario.id, io);
      }
      console.log(`[GPS] Usuario desconectado: ${usuario.nombre}`);
    });
  });
}

function _quitarUsuarioDeLinea(lineaId: string, usuarioId: string, io: Server) {
  const lista = usuariosABordo.get(lineaId) || [];
  const nueva = lista.filter(u => u.usuarioId !== usuarioId);
  if (nueva.length === 0) {
    usuariosABordo.delete(lineaId);
  } else {
    usuariosABordo.set(lineaId, nueva);
  }

  // Notificar a la sala del cambio
  const centroide = nueva.length > 0 ? calcularCentroide(lineaId) : null;
  io.of('/gps').to(`linea:${lineaId}`).emit('ubicacion_colectivo', {
    lineaId,
    centroide,
    abordo: nueva.length,
  });
}
