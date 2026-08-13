import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import prisma from '../prisma/client';
import { authMiddleware, AuthRequest } from '../middlewares/auth';

const router = Router();

const registerSchema = z.object({
  email: z.string().email('Email inválido'),
  nombre: z.string().min(2, 'El nombre debe tener al menos 2 caracteres').max(50),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Contraseña requerida'),
});

// POST /auth/register
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = registerSchema.parse(req.body);

    const existente = await prisma.usuario.findUnique({ where: { email: data.email } });
    if (existente) {
      res.status(409).json({ error: 'El email ya está registrado' });
      return;
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const usuario = await prisma.usuario.create({
      data: {
        email: data.email,
        nombre: data.nombre,
        password: hashedPassword,
      },
      select: { id: true, email: true, nombre: true, foto: true, creadoEn: true },
    });

    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, nombre: usuario.nombre },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    res.status(201).json({ token, usuario });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    console.error('Error en register:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /auth/login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const data = loginSchema.parse(req.body);

    const usuario = await prisma.usuario.findUnique({ where: { email: data.email } });
    if (!usuario) {
      res.status(401).json({ error: 'Credenciales inválidas' });
      return;
    }

    const passwordValida = await bcrypt.compare(data.password, usuario.password);
    if (!passwordValida) {
      res.status(401).json({ error: 'Credenciales inválidas' });
      return;
    }

    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, nombre: usuario.nombre },
      process.env.JWT_SECRET!,
      { expiresIn: '7d' }
    );

    const { password: _, ...usuarioSinPassword } = usuario;
    res.json({ token, usuario: usuarioSinPassword });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /auth/me — obtener perfil actual
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.usuario!.id },
      select: { id: true, email: true, nombre: true, foto: true, creadoEn: true },
    });

    if (!usuario) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    res.json({ usuario });
  } catch (error) {
    console.error('Error en me:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /auth/perfil — actualizar perfil
router.put('/perfil', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const schema = z.object({
      nombre: z.string().min(2).max(50).optional(),
      foto: z.string().url().optional().nullable(),
    });

    const data = schema.parse(req.body);
    const usuario = await prisma.usuario.update({
      where: { id: req.usuario!.id },
      data,
      select: { id: true, email: true, nombre: true, foto: true, creadoEn: true },
    });

    res.json({ usuario });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    console.error('Error en perfil:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
