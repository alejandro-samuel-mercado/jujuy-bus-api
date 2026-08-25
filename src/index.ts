import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import empresasRoutes from './routes/empresas';
import lineasRoutes from './routes/lineas';
import usuariosRoutes from './routes/usuarios';
import uploadRoutes from './routes/upload';
import noticiasRoutes from './routes/noticias';
import systemRoutes from './routes/system';
import { setupChatSockets } from './sockets/chat';
import { setupGpsSockets } from './sockets/gps';
import path from 'path';

// Cargar variables de entorno
dotenv.config();

const app = express();
const server = http.createServer(app);

// Configurar Socket.io
const io = new Server(server, {
  cors: {
    origin: '*', // En producción, restringir al dominio de la app/web
    methods: ['GET', 'POST']
  }
});

// Middlewares
app.use(cors());
app.use(express.json());

// Rutas API
app.use('/auth', authRoutes);
app.use('/usuarios', usuariosRoutes);
app.use('/empresas', empresasRoutes);
app.use('/lineas', lineasRoutes);
app.use('/upload', uploadRoutes);
app.use('/noticias', noticiasRoutes);
app.use('/system', systemRoutes);

// Servir archivos estáticos de subidas
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));
app.use('/apks', express.static(path.join(__dirname, '../public/apks')));

// Configurar sockets
setupChatSockets(io);
setupGpsSockets(io);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Iniciar servidor
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5055;
if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor JUJUY BUS corriendo en http://0.0.0.0:${PORT}`);
  });
}

export { app, server, io };
