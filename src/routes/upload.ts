import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authMiddleware } from '../middlewares/auth';

const router = Router();

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../../public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

router.post('/', authMiddleware, upload.single('image'), (req: Request, res: Response): void => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No se subió ninguna imagen' });
      return;
    }
    
    // Construir la URL completa (ej: http://192.168.0.x:3001/uploads/123.jpg)
    const host = req.get('host');
    const protocol = req.protocol;
    const imageUrl = `${protocol}://${host}/uploads/${req.file.filename}`;
    
    res.json({ url: imageUrl });
  } catch (error) {
    console.error('Error al subir imagen', error);
    res.status(500).json({ error: 'Error al subir imagen' });
  }
});

export default router;
