import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middlewares/auth';

const prisma = new PrismaClient();
const router = Router();

// GET /usuarios/me/paradas - Obtener paradas favoritas del usuario
router.get('/me/paradas', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // @ts-ignore
    const usuarioId = req.usuario?.id;
    
    if (!usuarioId) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }

    const favoritas = await prisma.paradaFavorita.findMany({
      where: { usuarioId },
      include: {
        parada: {
          include: {
            linea: {
              select: { numero: true, empresa: { select: { nombre: true, color: true } } }
            },
            horarios: {
              orderBy: { hora: 'asc' }
            }
          }
        }
      },
      orderBy: { creadoEn: 'desc' }
    });

    res.json(favoritas.map(fav => fav.parada));
  } catch (error: any) {
    console.error('Error fetching paradas favoritas:', error);
    res.status(500).json({ error: 'Error al obtener paradas favoritas', details: error.message });
  }
});

// POST /usuarios/me/paradas/:paradaId - Guardar parada en favoritos
router.post('/me/paradas/:paradaId', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { paradaId } = req.params;
    // @ts-ignore
    const usuarioId = req.usuario?.id;

    if (!usuarioId) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }

    const parada = await prisma.parada.findUnique({ where: { id: paradaId } });
    if (!parada) {
      res.status(404).json({ error: 'Parada no encontrada' });
      return;
    }

    // Upsert to ignore if already exists
    const favorita = await prisma.paradaFavorita.upsert({
      where: {
        usuarioId_paradaId: { usuarioId, paradaId }
      },
      update: {},
      create: {
        usuarioId,
        paradaId
      }
    });

    res.status(201).json(favorita);
  } catch (error: any) {
    console.error('Error saving parada favorita:', error);
    res.status(500).json({ error: 'Error al guardar parada', details: error.message });
  }
});

// DELETE /usuarios/me/paradas/:paradaId - Quitar parada de favoritos
router.delete('/me/paradas/:paradaId', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { paradaId } = req.params;
    // @ts-ignore
    const usuarioId = req.usuario?.id;

    if (!usuarioId) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }

    await prisma.paradaFavorita.delete({
      where: {
        usuarioId_paradaId: { usuarioId, paradaId }
      }
    });

    res.json({ message: 'Parada eliminada de favoritos' });
  } catch (error: any) {
    if (error.code === 'P2025') {
       res.status(404).json({ error: 'La parada no estaba en favoritos' });
       return;
    }
    console.error('Error deleting parada favorita:', error);
    res.status(500).json({ error: 'Error al eliminar parada', details: error.message });
  }
});

export default router;
