import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();

// GET /system/update
// Retorna la última versión del APK disponible en la carpeta public/apks
router.get('/update', (req: Request, res: Response) => {
  try {
    const apksDir = path.join(__dirname, '../../public/apks');
    
    if (!fs.existsSync(apksDir)) {
      return res.json({ updateAvailable: false, message: 'Directorio no encontrado' });
    }

    const files = fs.readdirSync(apksDir).filter(f => f.endsWith('.apk'));
    if (files.length === 0) {
      return res.json({ updateAvailable: false, message: 'No hay APKs disponibles' });
    }

    // Convert to objects with mtime and version
    const apks = files.map(file => {
      const stat = fs.statSync(path.join(apksDir, file));
      // Try to extract version, e.g. jujuybus-1.0.2.apk -> 1.0.2
      const versionMatch = file.match(/(\d+\.\d+\.\d+)/);
      const version = versionMatch ? versionMatch[1] : '0.0.0';
      return {
        file,
        version,
        mtime: stat.mtimeMs
      };
    });

    // Sort by modified time descending (newest first)
    apks.sort((a, b) => b.mtime - a.mtime);

    const latest = apks[0];

    res.json({
      updateAvailable: true,
      version: latest.version,
      url: `/apks/${latest.file}`,
      filename: latest.file
    });
  } catch (error) {
    console.error('[API] Error al leer APKs:', error);
    res.status(500).json({ updateAvailable: false, message: 'Error interno del servidor' });
  }
});

export default router;
