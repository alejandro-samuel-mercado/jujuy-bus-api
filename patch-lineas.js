const fs = require('fs');
const file = '/home/ale/Documentos/PROYECTOS/JUJUY-BUS/jujuy-bus-api/src/routes/lineas.ts';
let code = fs.readFileSync(file, 'utf8');

const oldCode = `    // Upsert del recorrido GPS (coordenadas)
    const recorrido = await prisma.recorridoGPS.upsert({
      where: { lineaId: id },
      create: { lineaId: id, puntos, paradas: paradasSeguras, actualizadoPor: usuarioId },
      update: { puntos, paradas: paradasSeguras, actualizadoPor: usuarioId },
    });

    // Guardar una instantánea en el historial
    await prisma.historialRecorrido.create({
      data: {
        lineaId: id,
        puntos,
        paradas: paradasSeguras,
        actualizadoPor: usuarioId,
      }
    });

    // Limpiar instantáneamente el perfil de la línea para reflejar que se está recalculando
    await prisma.linea.update({
      where: { id },
      data: {
        ciudades: [],
        barrios: [],
        recorridoPuntos: []
      }
    });

    // Ejecutar autocompletado en background
    autoCompletarZonasLinea(id, puntos).catch(err => console.error(err));`;

const newCode = `    // Consultar el recorrido actual para ver si los puntos cambiaron
    const recorridoActual = await prisma.recorridoGPS.findUnique({ where: { lineaId: id } });
    const puntosCambiaron = !recorridoActual || JSON.stringify(recorridoActual.puntos) !== JSON.stringify(puntos);

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
      console.log(\`[Rutas] Solo se actualizaron las paradas de la línea \${id}, omitiendo autocompletado.\`);
    }`;

code = code.replace(oldCode, newCode);
fs.writeFileSync(file, code);
