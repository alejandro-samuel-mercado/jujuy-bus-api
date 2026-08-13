import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../prisma/client';
import { authMiddleware } from '../middlewares/auth';
import { normalizar, sonSimilares } from '../utils/normalizar';

const router = Router();

const empresaSchema = z.object({
  nombre: z.string().min(2, 'El nombre de la empresa debe tener al menos 2 caracteres').max(100),
  color: z.string().regex(/^#([0-9A-F]{3}){1,2}$/i, 'Color inválido').optional(),
});

// GET /empresas — listar todas
router.get('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const empresas = await prisma.empresa.findMany({
      include: {
        _count: {
          select: { lineas: true }
        }
      },
      orderBy: { nombre: 'asc' }
    });
    res.json(empresas);
  } catch (error) {
    console.error('Error al obtener empresas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /empresas — crear nueva empresa con dedup
router.post('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const data = empresaSchema.parse(req.body);
    const nombreNormalizado = normalizar(data.nombre);

    // Buscar empresas existentes para dedup
    const empresasExistentes = await prisma.empresa.findMany();
    const duplicada = empresasExistentes.find(e => sonSimilares(e.nombre, data.nombre));

    if (duplicada) {
      res.status(409).json({ 
        error: 'Ya existe una empresa con un nombre similar',
        empresaExistente: duplicada
      });
      return;
    }

    const nuevaEmpresa = await prisma.empresa.create({
      data: {
        nombre: data.nombre,
        color: data.color || '#6C63FF', // Default premium color
      }
    });

    res.status(201).json(nuevaEmpresa);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    console.error('Error al crear empresa:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

export default router;
