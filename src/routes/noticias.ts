import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

import { authMiddleware } from '../middlewares/auth';

const prisma = new PrismaClient();
const router = Router();

// GET /noticias - Obtener todas las noticias (ordenadas por fecha descendente)
router.get('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    // @ts-ignore
    const usuarioId = req.usuario?.id;

    const noticias = await prisma.noticia.findMany({
      orderBy: { creadoEn: 'desc' },
      include: {
        usuario: { select: { id: true, nombre: true, foto: true } },
        _count: { select: { likes: true, comentarios: true } },
        // Incluir un boolean si el usuario actual le dio like
        likes: {
          where: { usuarioId: usuarioId || '' },
          select: { id: true }
        }
      }
    });

    // Formatear el resultado
    const noticiasFormateadas = noticias.map(n => ({
      ...n,
      likesCount: n._count.likes,
      comentariosCount: n._count.comentarios,
      isLiked: n.likes.length > 0,
      likes: undefined,
      _count: undefined
    }));

    res.json(noticiasFormateadas);
  } catch (error: any) {
    console.error('Error fetching noticias:', error);
    res.status(500).json({ error: 'Error al obtener noticias', details: error.message });
  }
});

// POST /noticias - Crear una noticia
router.post('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { contenido, imagenUrl, urlExterna } = req.body;
    // @ts-ignore
    const usuarioId = req.usuario?.id;
    
    if (!contenido) {
       res.status(400).json({ error: 'El contenido es obligatorio' });
       return;
    }

    const nuevaNoticia = await prisma.noticia.create({
      data: {
        contenido,
        imagenUrl,
        urlExterna,
        usuarioId
      },
      include: {
        usuario: { select: { nombre: true, foto: true } }
      }
    });

    res.status(201).json({
      ...nuevaNoticia,
      likesCount: 0,
      comentariosCount: 0,
      isLiked: false
    });
  } catch (error: any) {
    console.error('Error creating noticia:', error);
    res.status(500).json({ error: 'Error al crear noticia', details: error.message });
  }
});

// POST /noticias/:id/like - Dar o quitar me gusta
router.post('/:id/like', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    // @ts-ignore
    const usuarioId = req.usuario?.id;

    const likeExistente = await prisma.likeNoticia.findUnique({
      where: {
        usuarioId_noticiaId: {
          usuarioId,
          noticiaId: id
        }
      }
    });

    if (likeExistente) {
      await prisma.likeNoticia.delete({ where: { id: likeExistente.id } });
      res.json({ liked: false });
    } else {
      await prisma.likeNoticia.create({
        data: { usuarioId, noticiaId: id }
      });
      res.json({ liked: true });
    }
  } catch (error: any) {
    res.status(500).json({ error: 'Error al procesar el like' });
  }
});

// GET /noticias/:id/comentarios - Obtener comentarios de una noticia
router.get('/:id/comentarios', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const comentarios = await prisma.comentarioNoticia.findMany({
      where: { noticiaId: id },
      include: { usuario: { select: { nombre: true, foto: true } } },
      orderBy: { creadoEn: 'asc' }
    });
    res.json(comentarios);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al obtener comentarios' });
  }
});

// POST /noticias/:id/comentarios - Comentar una noticia
router.post('/:id/comentarios', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { contenido } = req.body;
    // @ts-ignore
    const usuarioId = req.usuario?.id;

    if (!contenido) {
      res.status(400).json({ error: 'Contenido vacío' });
      return;
    }

    const nuevoComentario = await prisma.comentarioNoticia.create({
      data: {
        contenido,
        usuarioId,
        noticiaId: id
      },
      include: { usuario: { select: { nombre: true, foto: true } } }
    });

    res.status(201).json(nuevoComentario);
  } catch (error: any) {
    res.status(500).json({ error: 'Error al crear comentario' });
  }
});

// POST /noticias/:id/reportar
router.post('/:id/reportar', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    // @ts-ignore
    const usuarioId = req.usuario?.id;

    if (!usuarioId) {
      res.status(401).json({ error: 'Usuario no autenticado' });
      return;
    }

    const noticia = await prisma.noticia.findUnique({ where: { id } });
    if (!noticia) {
      res.status(404).json({ error: 'Noticia no encontrada' });
      return;
    }

    await prisma.reporteNoticia.create({
      data: { usuarioId, noticiaId: id }
    });

    const reportesCount = await prisma.reporteNoticia.count({
      where: { noticiaId: id }
    });

    if (reportesCount >= 5) {
      await prisma.noticia.delete({ where: { id } });
      res.json({ message: 'Noticia eliminada automáticamente por múltiples reportes', deleted: true });
      return;
    }

    res.json({ message: 'Reporte enviado', deleted: false });
  } catch (error) {
    console.error('Error al reportar noticia:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /noticias/:id
router.delete('/:id', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    // @ts-ignore
    const usuarioId = req.usuario?.id;

    if (!usuarioId) {
      res.status(401).json({ error: 'Usuario no autenticado' });
      return;
    }

    const noticia = await prisma.noticia.findUnique({ where: { id } });
    if (!noticia) {
      res.status(404).json({ error: 'Noticia no encontrada' });
      return;
    }

    if (noticia.usuarioId !== usuarioId) {
      res.status(403).json({ error: 'No tienes permiso para eliminar esta publicación' });
      return;
    }

    await prisma.noticia.delete({ where: { id } });
    res.json({ message: 'Publicación eliminada correctamente' });
  } catch (error) {
    console.error('Error al eliminar noticia:', error);
    res.status(500).json({ error: 'Error al eliminar la publicación' });
  }
});

export default router;
