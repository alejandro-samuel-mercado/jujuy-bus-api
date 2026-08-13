import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../prisma/client';
import { authMiddleware } from '../middlewares/auth';
import { normalizar, sonSimilares } from '../utils/normalizar';

const router = Router();

const lineaSchema = z.object({
  numero: z.string().min(1, 'El número de línea es requerido'),
  nombre: z.string().optional(),
  empresaId: z.string().uuid('ID de empresa inválido'),
  fotoPortada: z.string().optional(),
  ciudades: z.array(z.string()).optional().default([]),
  barrios: z.array(z.string()).optional().default([]),
  recorridoPuntos: z.array(z.string()).optional().default([]),
});

// GET /lineas — listar todas con su empresa y grupo de chat
router.get('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const lineas = await prisma.linea.findMany({
      include: {
        empresa: true,
        chatGrupo: {
          select: { id: true }
        }
      },
      orderBy: [
        { empresa: { nombre: 'asc' } },
        { numero: 'asc' }
      ]
    });
    res.json(lineas);
  } catch (error) {
    console.error('Error al obtener líneas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /lineas — crear nueva línea
router.post('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const data = lineaSchema.parse(req.body);

    // Verificar si la empresa existe
    const empresa = await prisma.empresa.findUnique({ where: { id: data.empresaId } });
    if (!empresa) {
      res.status(404).json({ error: 'La empresa especificada no existe' });
      return;
    }

    // Buscar si ya existe una línea con el mismo número para esta empresa
    const lineasExistentes = await prisma.linea.findMany({
      where: { empresaId: data.empresaId }
    });
    
    const duplicada = lineasExistentes.find(l => normalizar(l.numero) === normalizar(data.numero));
    if (duplicada) {
      res.status(409).json({ 
        error: 'Esta empresa ya tiene una línea con ese número',
        lineaExistente: duplicada
      });
      return;
    }

    // Crear línea en transacción para asegurar que siempre tenga su chatGrupo
    const nuevaLinea = await prisma.$transaction(async (tx) => {
      const linea = await tx.linea.create({
        data: {
          numero: data.numero,
          nombre: data.nombre,
          empresaId: data.empresaId,
          fotoPortada: data.fotoPortada,
          ciudades: data.ciudades,
          barrios: data.barrios,
          recorridoPuntos: data.recorridoPuntos
        },
        include: { empresa: true }
      });

      const chat = await tx.chatGrupo.create({
        data: { lineaId: linea.id }
      });

      return { ...linea, chatGrupo: { id: chat.id } };
    });

    res.status(201).json(nuevaLinea);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    console.error('Error al crear línea:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /lineas/:id — obtener detalles de la línea (perfil, chat, reseñas, horarios)
router.get('/:id', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const linea = await prisma.linea.findUnique({
      where: { id },
      include: {
        empresa: true,
        chatGrupo: {
          include: {
            mensajes: {
              include: { 
                usuario: { select: { id: true, nombre: true, foto: true } },
                replyTo: { select: { id: true, texto: true, usuario: { select: { nombre: true } } } }
              },
              orderBy: { creadoEn: 'asc' }
            }
          }
        },
        resenas: {
          include: { usuario: { select: { id: true, nombre: true, foto: true } } },
          orderBy: { creadoEn: 'desc' }
        },
        imagenes: {
          include: { usuario: { select: { id: true, nombre: true, foto: true } } },
          orderBy: { creadoEn: 'desc' }
        },
        horarios: {
          include: { usuario: { select: { id: true, nombre: true } } }
        },
        paradas: {
          include: { horarios: true }
        }
      }
    });

    if (!linea) {
      res.status(404).json({ error: 'Línea no encontrada' });
      return;
    }

    res.json(linea);
  } catch (error) {
    console.error('Error al obtener línea:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /lineas/:id/mensajes — enviar un mensaje al chat
router.post('/:id/mensajes', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { texto, replyToId } = req.body;
    // @ts-ignore
    const usuarioId = req.usuario?.id; // Asumiendo que el middleware inyecta req.user

    if (!texto || texto.trim().length === 0) {
      res.status(400).json({ error: 'El mensaje no puede estar vacío' });
      return;
    }

    const linea = await prisma.linea.findUnique({
      where: { id },
      include: { chatGrupo: true }
    });

    if (!linea || !linea.chatGrupo) {
      res.status(404).json({ error: 'Chat no encontrado para esta línea' });
      return;
    }

    const nuevoMensaje = await prisma.mensaje.create({
      data: {
        texto: texto.trim(),
        usuarioId,
        chatGrupoId: linea.chatGrupo.id,
        replyToId: replyToId || null
      },
      include: {
        usuario: { select: { id: true, nombre: true, foto: true } },
        replyTo: { select: { id: true, texto: true, usuario: { select: { nombre: true } } } }
      }
    });

    res.status(201).json(nuevoMensaje);
  } catch (error: any) {
    console.error('Error al enviar mensaje:', error);
    res.status(500).json({ error: 'Error interno del servidor', details: error.message });
  }
});

// DELETE /lineas/:id/mensajes/:mensajeId
router.delete('/:id/mensajes/:mensajeId', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { mensajeId } = req.params;
    // @ts-ignore
    const usuarioId = req.usuario?.id;
    // @ts-ignore
    const esAdmin = req.usuario?.rol === 'ADMIN';

    const mensaje = await prisma.mensaje.findUnique({
      where: { id: mensajeId }
    });

    if (!mensaje) {
      res.status(404).json({ error: 'Mensaje no encontrado' });
      return;
    }

    if (mensaje.usuarioId !== usuarioId && !esAdmin) {
      res.status(403).json({ error: 'No tienes permiso para borrar este mensaje' });
      return;
    }

    await prisma.mensaje.delete({
      where: { id: mensajeId }
    });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error al borrar mensaje:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /lineas/:id/mensajes/:mensajeId/reportar
router.post('/:id/mensajes/:mensajeId/reportar', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, mensajeId } = req.params;
    // @ts-ignore
    const usuarioId = req.usuario?.id;

    // Verificar que el mensaje existe y pertenece a la línea
    const mensaje = await prisma.mensaje.findUnique({
      where: { id: mensajeId },
      include: { chatGrupo: true }
    });

    if (!mensaje || mensaje.chatGrupo.lineaId !== id) {
      res.status(404).json({ error: 'Mensaje no encontrado' });
      return;
    }

    // Remover comprobación de si ya reportó a petición del usuario

    // Crear el reporte
    await prisma.reporteMensaje.create({
      data: {
        mensajeId,
        usuarioId
      }
    });

    // Contar reportes
    const conteo = await prisma.reporteMensaje.count({
      where: { mensajeId }
    });

    if (conteo >= 5) {
      // Borrar mensaje si llega a 5
      await prisma.mensaje.delete({ where: { id: mensajeId } });
      res.json({ success: true, message: 'Mensaje borrado por múltiples reportes' });
      return;
    }

    res.json({ success: true, message: 'Mensaje reportado exitosamente' });
  } catch (error) {
    console.error('Error al reportar mensaje:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /lineas/:id/resenas — añadir una reseña
router.post('/:id/resenas', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { rating, comentario } = req.body;
    // @ts-ignore
    const usuarioId = req.usuario?.id;

    const resena = await prisma.resena.create({
      data: {
        rating,
        comentario,
        lineaId: id,
        usuarioId,
      },
      include: { usuario: { select: { id: true, nombre: true, foto: true } } }
    });

    res.status(201).json(resena);
  } catch (error) {
    console.error('Error al crear reseña:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /lineas/:id/imagenes — subir una foto a la galería
router.post('/:id/imagenes', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { url } = req.body;
    // @ts-ignore
    const usuarioId = req.usuario?.id;

    if (!url) {
      res.status(400).json({ error: 'URL de imagen requerida' });
      return;
    }

    const imagen = await prisma.imagenLinea.create({
      data: {
        url,
        lineaId: id,
        usuarioId,
      },
      include: { usuario: { select: { id: true, nombre: true, foto: true } } }
    });

    res.status(201).json(imagen);
  } catch (error) {
    console.error('Error al guardar imagen:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /lineas/:id/imagenes/:imageId - Eliminar una foto de la galería
router.delete('/:id/imagenes/:imageId', async (req: Request, res: Response): Promise<void> => {
  const { id, imageId } = req.params;
  try {
    const imagen = await prisma.imagenLinea.findUnique({ where: { id: imageId } });
    if (!imagen) {
      res.status(404).json({ error: 'Imagen no encontrada' });
      return;
    }
    
    // Cualquiera puede borrar, según los requisitos
    await prisma.imagenLinea.delete({ where: { id: imageId } });
    res.json({ message: 'Imagen eliminada correctamente' });
  } catch (error) {
    console.error('Error al eliminar imagen:', error);
    res.status(500).json({ error: 'Error al eliminar imagen' });
  }
});

// PUT /lineas/:id — editar línea
router.put('/:id', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const data = lineaSchema.parse(req.body);

    const empresa = await prisma.empresa.findUnique({ where: { id: data.empresaId } });
    if (!empresa) {
      res.status(404).json({ error: 'La empresa especificada no existe' });
      return;
    }

    // Verificar si existe otra línea con mismo numero y empresa pero que no sea esta misma
    const duplicada = await prisma.linea.findFirst({
      where: {
        empresaId: data.empresaId,
        numero: data.numero,
        id: { not: id } // no verificar consigo misma
      }
    });

    if (duplicada) {
      res.status(409).json({ error: 'La empresa ya tiene otra línea con ese número' });
      return;
    }

    const lineaActualizada = await prisma.linea.update({
      where: { id },
      data: {
        numero: data.numero,
        nombre: data.nombre,
        empresaId: data.empresaId,
        fotoPortada: data.fotoPortada,
        ciudades: data.ciudades,
        barrios: data.barrios,
        recorridoPuntos: data.recorridoPuntos
      },
      include: { empresa: true }
    });

    res.json(lineaActualizada);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0].message });
      return;
    }
    console.error('Error al actualizar línea:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /lineas/:id/recorrido — obtener el recorrido GPS trazado en el mapa
router.get('/:id/recorrido', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const recorrido = await prisma.recorridoGPS.findUnique({
      where: { lineaId: id }
    });

    const linea = await prisma.linea.findUnique({
      where: { id },
      include: { paradas: true }
    });

    if (!recorrido && !linea) {
      res.json({ puntos: [], paradas: [] });
      return;
    }

    let parsedPuntos = [];
    if (recorrido && recorrido.puntos) {
      parsedPuntos = typeof recorrido.puntos === 'string' ? JSON.parse(recorrido.puntos as string) : recorrido.puntos;
    }

    res.json({ 
      puntos: parsedPuntos, 
      paradas: linea ? linea.paradas : [],
      actualizadoEn: recorrido?.actualizadoEn ?? null 
    });
  } catch (error) {
    console.error('Error al obtener recorrido GPS:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /lineas/:id/recorrido/historial — obtener el historial de versiones del recorrido
router.get('/:id/recorrido/historial', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const historial = await prisma.historialRecorrido.findMany({
      where: { lineaId: id },
      orderBy: { creadoEn: 'desc' },
      take: 10, // Obtener solo las últimas 10 versiones
    });
    res.json(historial);
  } catch (error) {
    console.error('Error al obtener historial GPS:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /lineas/:id/recorrido — guardar/actualizar el recorrido GPS
router.put('/:id/recorrido', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { puntos, paradas } = req.body;
    // @ts-ignore
    const usuarioId = req.usuario?.id;

    if (!Array.isArray(puntos)) {
      res.status(400).json({ error: 'El campo "puntos" debe ser un array de { lat, lng }' });
      return;
    }

    const paradasSeguras = Array.isArray(paradas) ? paradas : [];

    // Validar que todos los puntos tengan lat y lng numéricos
    for (const p of puntos) {
      if (typeof p.lat !== 'number' || typeof p.lng !== 'number') {
        res.status(400).json({ error: 'Cada punto debe tener lat y lng numéricos' });
        return;
      }
    }

    // Verificar que la línea exista
    const linea = await prisma.linea.findUnique({ where: { id } });
    if (!linea) {
      res.status(404).json({ error: 'Línea no encontrada' });
      return;
    }

    // Consultar el recorrido actual para ver si los puntos cambiaron
    const recorridoActual = await prisma.recorridoGPS.findUnique({ where: { lineaId: id } });
    const puntosCambiaron = !recorridoActual || JSON.stringify(recorridoActual.puntos) !== JSON.stringify(puntos);

    // --- Sincronizar paradas con la tabla Parada ---
    // Obtener paradas existentes en DB
    const paradasDB = await prisma.parada.findMany({ where: { lineaId: id } });
    
    // Convertir a mapa para búsqueda rápida
    const paradasDBMap = new Map(paradasDB.map(p => [p.id, p]));
    const paradasMantenidas = new Set<string>();

    for (let i = 0; i < paradasSeguras.length; i++) {
      const p = paradasSeguras[i];
      if (p.id && paradasDBMap.has(p.id)) {
        // Actualizar parada existente
        await prisma.parada.update({
          where: { id: p.id },
          data: { lat: p.lat, lng: p.lng, nombre: p.nombre || `Parada ${i + 1}` }
        });
        paradasMantenidas.add(p.id);
      } else {
        // Crear nueva parada
        const nuevaParada = await prisma.parada.create({
          data: {
            lat: p.lat,
            lng: p.lng,
            nombre: p.nombre || `Parada ${i + 1}`,
            lineaId: id
          }
        });
        // Asignar el nuevo ID generado a la estructura JSON que se guardará
        paradasSeguras[i].id = nuevaParada.id;
        paradasMantenidas.add(nuevaParada.id);
      }
    }

    // Borrar las paradas que ya no están
    for (const p of paradasDB) {
      if (!paradasMantenidas.has(p.id)) {
        await prisma.parada.delete({ where: { id: p.id } });
      }
    }
    // --- Fin de sincronización ---

    // Upsert del recorrido GPS (coordenadas)
    const recorrido = await prisma.recorridoGPS.upsert({
      where: { lineaId: id },
      create: { lineaId: id, puntos, paradas: paradasSeguras, actualizadoPor: usuarioId },
      update: { puntos, paradas: paradasSeguras, actualizadoPor: usuarioId },
    });

    // Guardar una instantánea en el historial solo si cambió algo de los puntos o paradas
    // Aquí siempre guardamos para tener versión, pero podríamos optimizar
    await prisma.historialRecorrido.create({
      data: {
        lineaId: id,
        puntos,
        paradas: paradasSeguras,
        actualizadoPor: usuarioId,
      }
    });

    if (puntosCambiaron) {
      // Limpiar instantáneamente el perfil de la línea para reflejar que se está recalculando
      await prisma.linea.update({
        where: { id },
        data: {
          ciudades: [],
          barrios: [],
          recorridoPuntos: []
        }
      });

      // Ejecutar autocompletado en background solo si la ruta cambió
      autoCompletarZonasLinea(id, puntos).catch(err => console.error(err));
    } else {
      console.log(`[Rutas] Solo se actualizaron las paradas de la línea ${id}, omitiendo autocompletado.`);
    }

    res.json(recorrido);
  } catch (error) {
    console.error('Error al guardar recorrido GPS:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /lineas/:id/paradas/:paradaId/horarios
router.get('/:id/paradas/:paradaId/horarios', async (req: Request, res: Response): Promise<void> => {
  try {
    const { paradaId } = req.params;
    const horarios = await prisma.horarioRecorrido.findMany({
      where: { paradaId },
      include: { usuario: { select: { nombre: true } } },
      orderBy: { hora: 'asc' }
    });
    res.json(horarios);
  } catch (error) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /lineas/:id/paradas/:paradaId/horarios
router.post('/:id/paradas/:paradaId/horarios', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, paradaId } = req.params;
    const { hora } = req.body;
    // @ts-ignore
    const usuarioId = req.usuario?.id;

    if (!hora) {
      res.status(400).json({ error: 'Hora requerida' });
      return;
    }

    const horario = await prisma.horarioRecorrido.create({
      data: {
        hora,
        usuarioId,
        paradaId,
        lineaId: id
      },
      include: { usuario: { select: { nombre: true } } }
    });
    res.json(horario);
  } catch (error) {
    res.status(500).json({ error: 'Error interno' });
  }
});

// DELETE /lineas/:id/paradas/:paradaId/horarios/:horarioId
router.delete('/:id/paradas/:paradaId/horarios/:horarioId', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { horarioId } = req.params;
    await prisma.horarioRecorrido.delete({ where: { id: horarioId } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Error interno' });
  }
});

const autoCompletarZonasLinea = async (lineaId: string, puntos: {lat: number, lng: number}[]) => {
  if (!puntos || puntos.length === 0) return;
  
  const distance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3;
    const p1 = lat1 * Math.PI/180;
    const p2 = lat2 * Math.PI/180;
    const dp = (lat2-lat1) * Math.PI/180;
    const dl = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(dp/2) * Math.sin(dp/2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2) * Math.sin(dl/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Metros
  };

  // Calcular la distancia total de la ruta
  let totalDist = 0;
  const segments = [];
  for (let i = 0; i < puntos.length - 1; i++) {
    const d = distance(puntos[i].lat, puntos[i].lng, puntos[i+1].lat, puntos[i+1].lng);
    totalDist += d;
    segments.push({ p1: puntos[i], p2: puntos[i+1], dist: d });
  }

  // Máximo de puntos a consultar en la API para no ser bloqueados.
  // 100 puntos es el balance ideal para no saturar y no tomar demasiadas calles perpendiculares cruzadas.
  const MAX_SAMPLES = 100;
  
  // Calcular cada cuántos metros debemos tomar una muestra
  // Si la ruta es corta, tomamos cada 100 metros. Si es de 30km, tomará cada ~600 metros.
  const stepDist = Math.max(100, totalDist / MAX_SAMPLES);

  const puntosMuestra = [];
  if (puntos.length > 0) {
    puntosMuestra.push(puntos[0]); // Siempre incluir el inicio
    
    let currentSegment = 0;
    let distCoveredInSegment = 0;

    for (let targetDist = stepDist; targetDist < totalDist; targetDist += stepDist) {
      // Encontrar en qué segmento cae la targetDist
      let accumulatedDist = 0;
      for (let i = 0; i < segments.length; i++) {
        if (accumulatedDist + segments[i].dist >= targetDist) {
          // El punto cae en este segmento. Interpolar.
          const overshoot = targetDist - accumulatedDist;
          const fraction = segments[i].dist > 0 ? overshoot / segments[i].dist : 0;
          const p1 = segments[i].p1;
          const p2 = segments[i].p2;
          
          const lat = p1.lat + (p2.lat - p1.lat) * fraction;
          const lng = p1.lng + (p2.lng - p1.lng) * fraction;
          
          puntosMuestra.push({ lat, lng });
          break;
        }
        accumulatedDist += segments[i].dist;
      }
      
      if (puntosMuestra.length >= MAX_SAMPLES - 1) break;
    }

    // Asegurar el último punto
    if (puntosMuestra.length === 0 || puntosMuestra[puntosMuestra.length - 1] !== puntos[puntos.length - 1]) {
      puntosMuestra.push(puntos[puntos.length - 1]);
    }
  }

  console.log(`[Autocompletado] Iniciando para línea ${lineaId}...`);
  console.log(`[Autocompletado] Ruta de ${totalDist.toFixed(0)} metros. Puntos originales: ${puntos.length}. Puntos interpolados a extraer: ${puntosMuestra.length}`);
  
  const ciudades = new Set<string>();
  const barrios = new Set<string>();
  const recorrido: string[] = [];

  let progreso = 0;
  for (const p of puntosMuestra) {
    progreso++;
    try {
      const arcgisUrl = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?location=${p.lng},${p.lat}&f=pjson`;
      const photonUrl = `https://photon.komoot.io/reverse?lon=${p.lng}&lat=${p.lat}`;

      // Envolvemos en try-catch individual para que si una API falla, la otra siga funcionando
      const fetchArcgis = async (): Promise<any> => {
        try {
          const res = await fetch(arcgisUrl);
          if (res.ok) return await res.json();
        } catch (e) {
          // Ignorar error de red silenciosamente
        }
        return null;
      };

      const fetchPhoton = async (): Promise<any> => {
        try {
          const res = await fetch(photonUrl);
          if (res.ok) return await res.json();
        } catch (e) {
          // Ignorar error de red (como ECONNREFUSED) silenciosamente
        }
        return null;
      };

      const [arcData, phoData] = await Promise.all([
        fetchArcgis(),
        fetchPhoton()
      ]);

      let calle = '';
      let barrio = '';
      let ciudad = '';

      if (arcData) {
        const address = arcData.address || {};
        ciudad = address.City || address.District || '';
        
        let arcCalle = address.Address || address.Match_addr;
        if (arcCalle) {
          calle = arcCalle.replace(/\d+/g, '').split(',')[0].trim();
        }
      }

      if (phoData) {
        if (phoData.features && phoData.features.length > 0) {
          const props = phoData.features[0].properties;
          barrio = props.district || props.locality || props.neighbourhood || '';
          if (!ciudad) ciudad = props.city || props.county || '';
        }
      }

      if (ciudad) ciudades.add(ciudad);
      if (barrio) barrios.add(barrio);
      
      // Filtrar calles inválidas que realmente son el nombre de la provincia o ciudad
      const calleLower = calle.toLowerCase();
      if (calle && calleLower !== ciudad.toLowerCase() && !calleLower.includes('san salvador de jujuy') && calleLower !== 'jujuy') {
        
        // Normalizar RN- y similares
        if (calle.startsWith('RN-') || calle.startsWith('RN ')) {
          calle = calle.replace(/RN[-\s]?/, 'Ruta Nacional ');
        }
        
        // Limpiar sufijos inútiles como "Casa" si existen
        calle = calle.replace(/\sCasa$/i, '').trim();

        // Solo agregar si es diferente a la ÚLTIMA calle agregada (deduplicación consecutiva)
        // Además, evitar agregar si la calle actual está contenida en la anterior o viceversa (para evitar "Avenida Carahuasi" vs "Avenida Carahuasi Casa")
        if (recorrido.length === 0) {
          recorrido.push(calle);
        } else {
          const lastCalle = recorrido[recorrido.length - 1];
          const isSimilar = lastCalle.includes(calle) || calle.includes(lastCalle);
          if (lastCalle !== calle && !isSimilar) {
            recorrido.push(calle);
          } else if (calle.length > lastCalle.length && isSimilar) {
            // Preferir el nombre más largo si son similares (por si acaso)
            recorrido[recorrido.length - 1] = calle;
          }
        }
      } else {
        calle = ''; // Lo limpiamos para el log
      }
        
      console.log(`[Autocompletado] (${progreso}/${puntosMuestra.length}) Obtenido: ${calle || 'Ignorado/Sin calle'}, ${barrio || 'Sin barrio'}`);

      // Delay de 300ms porque ambas APIs son bastante permisivas
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (e) {
      console.error(`[Autocompletado] (${progreso}/${puntosMuestra.length}) Error reverse geocoding combinado:`, e);
    }
  }

  // Actualizar línea
  try {
    const lineaActual = await prisma.linea.findUnique({ where: { id: lineaId } });
    if (!lineaActual) return;
    
    const nuevasCiudades = Array.from(ciudades);
    const nuevosBarrios = Array.from(barrios);
    const nuevoRecorrido = recorrido;

    // POST-PROCESAMIENTO: Filtro "Sándwich"
    // Elimina calles cruzadas (perpendiculares) erróneas.
    // Si el array tiene ["Av. Savio", "Calle Perpendicular", "Av. Savio"], borra la del medio.
    let limpio = false;
    while (!limpio) {
      limpio = true;
      for (let i = 1; i < nuevoRecorrido.length - 1; i++) {
        if (nuevoRecorrido[i - 1] === nuevoRecorrido[i + 1]) {
          // Encontramos un sándwich [A, B, A]. Borramos B y el segundo A.
          nuevoRecorrido.splice(i, 2);
          limpio = false;
          break;
        }
      }
    }

    console.log(`[Autocompletado] Guardando resultados en la BD. Calles limpias en orden: ${nuevoRecorrido.length}`);

    await prisma.linea.update({
      where: { id: lineaId },
      data: {
        ciudades: nuevasCiudades,
        barrios: nuevosBarrios,
        recorridoPuntos: nuevoRecorrido
      }
    });
    console.log(`[Autocompletado] ¡Éxito! Línea ${lineaId} zonas y recorridos sobrescritos en la base de datos.`);
  } catch (error) {
    console.error('Error actualizando línea tras autocompletado:', error);
  }
};

// --- RUTAS DE PARADAS ---

// POST /lineas/:id/paradas - Crear parada con nombre por defecto
router.post('/:id/paradas', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { lat, lng, nombre } = req.body;
    
    // Contar cuántas hay para el nombre por defecto
    const count = await prisma.parada.count({ where: { lineaId: id } });
    const nombreFinal = nombre || `Parada ${count + 1}`;

    const parada = await prisma.parada.create({
      data: {
        lineaId: id,
        lat,
        lng,
        nombre: nombreFinal
      }
    });
    res.status(201).json(parada);
  } catch (error: any) {
    console.error('Error creando parada:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

// PUT /lineas/:id/paradas/:paradaId - Editar parada (ej. nombre)
router.put('/:id/paradas/:paradaId', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { paradaId } = req.params;
    const { nombre, lat, lng } = req.body;
    
    const parada = await prisma.parada.update({
      where: { id: paradaId },
      data: { nombre, lat, lng }
    });
    res.json(parada);
  } catch (error: any) {
    console.error('Error editando parada:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

// DELETE /lineas/:id/paradas/:paradaId
router.delete('/:id/paradas/:paradaId', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { paradaId } = req.params;
    await prisma.parada.delete({ where: { id: paradaId } });
    res.json({ message: 'Parada eliminada' });
  } catch (error: any) {
    console.error('Error borrando parada:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

// --- RUTAS DE HORARIOS ---

// GET /lineas/:id/paradas/:paradaId/horarios
router.get('/:id/paradas/:paradaId/horarios', async (req: Request, res: Response): Promise<void> => {
  try {
    const { paradaId } = req.params;
    const horarios = await prisma.horarioRecorrido.findMany({
      where: { paradaId },
      include: { usuario: { select: { nombre: true, foto: true } } },
      orderBy: { hora: 'asc' }
    });
    res.json(horarios);
  } catch (error: any) {
    console.error('Error obteniendo horarios:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

// POST /lineas/:id/paradas/:paradaId/horarios
router.post('/:id/paradas/:paradaId/horarios', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, paradaId } = req.params;
    const { hora } = req.body;
    // @ts-ignore
    const usuarioId = req.usuario?.id;

    if (!usuarioId) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }

    const horario = await prisma.horarioRecorrido.create({
      data: {
        hora,
        usuarioId,
        paradaId,
        lineaId: id
      },
      include: { usuario: { select: { nombre: true, foto: true } } }
    });
    res.status(201).json(horario);
  } catch (error: any) {
    console.error('Error creando horario:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

// DELETE /lineas/:id/horarios/:horarioId
router.delete('/:id/horarios/:horarioId', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { horarioId } = req.params;
    // @ts-ignore
    const usuarioId = req.usuario?.id;
    // @ts-ignore
    const esAdmin = req.usuario?.rol === 'ADMIN';

    const horario = await prisma.horarioRecorrido.findUnique({ where: { id: horarioId } });
    if (!horario) {
      res.status(404).json({ error: 'Horario no encontrado' });
      return;
    }

    if (horario.usuarioId !== usuarioId && !esAdmin) {
      res.status(403).json({ error: 'No autorizado' });
      return;
    }

    await prisma.horarioRecorrido.delete({ where: { id: horarioId } });
    res.json({ message: 'Horario borrado' });
  } catch (error: any) {
    console.error('Error borrando horario:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

export default router;

