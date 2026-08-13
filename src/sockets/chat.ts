import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import prisma from '../prisma/client';

interface JwtPayload {
  id: string;
  email: string;
  nombre: string;
}

export function setupChatSockets(io: Server) {
  // Middleware de autenticación para sockets
  io.use((socket, next) => {
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

  io.on('connection', (socket: Socket) => {
    const usuario = socket.data.usuario as JwtPayload;
    console.log(`Usuario conectado: ${usuario.nombre} (${socket.id})`);

    // Unirse a una sala de chat de una línea (usando el chatGrupoId)
    socket.on('join_room', async (chatGrupoId: string) => {
      // Salir de salas anteriores si es necesario (opcional, dependiendo del caso de uso)
      for (const room of socket.rooms) {
        if (room !== socket.id) {
          socket.leave(room);
        }
      }

      socket.join(chatGrupoId);
      console.log(`Usuario ${usuario.nombre} se unió al chat: ${chatGrupoId}`);

      // Emitir conteo de usuarios en la sala
      const usersInRoom = io.sockets.adapter.rooms.get(chatGrupoId)?.size || 0;
      io.to(chatGrupoId).emit('room_users_count', usersInRoom);

      // Cargar últimos 50 mensajes y enviárselos solo al usuario que se conecta
      try {
        const mensajes = await prisma.mensaje.findMany({
          where: { chatGrupoId },
          orderBy: { creadoEn: 'desc' },
          take: 50,
          include: {
            usuario: { select: { id: true, nombre: true, foto: true } }
          }
        });
        
        // Enviar en orden cronológico (los más viejos primero)
        socket.emit('historial_mensajes', mensajes.reverse());
      } catch (error) {
        console.error('Error al cargar historial:', error);
      }
    });

    // Salir de una sala
    socket.on('leave_room', (chatGrupoId: string) => {
      socket.leave(chatGrupoId);
      console.log(`Usuario ${usuario.nombre} salió del chat: ${chatGrupoId}`);
      
      const usersInRoom = io.sockets.adapter.rooms.get(chatGrupoId)?.size || 0;
      io.to(chatGrupoId).emit('room_users_count', usersInRoom);
    });

    // Enviar mensaje a la sala
    socket.on('send_message', async (data: { chatGrupoId: string; texto: string }) => {
      try {
        if (!data.texto || data.texto.trim().length === 0) return;

        // Guardar en la base de datos
        const nuevoMensaje = await prisma.mensaje.create({
          data: {
            texto: data.texto.trim(),
            usuarioId: usuario.id,
            chatGrupoId: data.chatGrupoId,
          },
          include: {
            usuario: { select: { id: true, nombre: true, foto: true } }
          }
        });

        // Emitir a todos en la sala (incluyendo al remitente)
        io.to(data.chatGrupoId).emit('new_message', nuevoMensaje);
      } catch (error) {
        console.error('Error al guardar/enviar mensaje:', error);
        socket.emit('error', 'No se pudo enviar el mensaje');
      }
    });

    // Reportar un mensaje
    socket.on('report_message', async (mensajeId: string) => {
      try {
        await prisma.mensaje.update({
          where: { id: mensajeId },
          data: { reportado: true }
        });
        // Podríamos emitir un evento a admins si los hubiera
        socket.emit('message_reported', { mensajeId, success: true });
      } catch (error) {
        console.error('Error al reportar mensaje:', error);
      }
    });

    // Desconexión o salida de la sala
    socket.on('disconnecting', () => {
      for (const room of socket.rooms) {
        if (room !== socket.id) {
          const usersInRoom = (io.sockets.adapter.rooms.get(room)?.size || 1) - 1;
          io.to(room).emit('room_users_count', usersInRoom);
        }
      }
    });

    socket.on('disconnect', () => {
      console.log(`Usuario desconectado: ${usuario.nombre}`);
    });
  });
}
