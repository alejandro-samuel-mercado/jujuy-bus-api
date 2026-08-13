import request from 'supertest';
import { app } from '../index';
import prisma from '../prisma/client';

describe('Integración API', () => {
  let token = '';
  const testEmail = `test${Date.now()}@test.com`;

  beforeAll(async () => {
    // Asegurarse de que la base de datos de pruebas esté limpia o lista
    // Para simplificar, usamos un email único para no chocar con datos existentes
  });

  afterAll(async () => {
    // Limpiar el usuario de prueba
    await prisma.usuario.deleteMany({
      where: { email: testEmail }
    });
    await prisma.$disconnect();
  });

  describe('Autenticación (auth.ts)', () => {
    it('Debe registrar un nuevo usuario y devolver un token', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({
          nombre: 'Test User',
          email: testEmail,
          password: 'password123'
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('token');
      expect(res.body.usuario).toHaveProperty('email', testEmail);
    });

    it('No debe permitir registrar un usuario duplicado', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({
          nombre: 'Test User 2',
          email: testEmail,
          password: 'password123'
        });

      expect(res.status).toBe(409);
      expect(res.body).toHaveProperty('error');
    });

    it('Debe loguear al usuario y devolver un token', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({
          email: testEmail,
          password: 'password123'
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      token = res.body.token; // Guardamos el token para otras pruebas
    });
  });

  describe('Líneas (lineas.ts)', () => {
    it('Debe devolver 401 si no hay token al consultar líneas', async () => {
      const res = await request(app).get('/lineas');
      expect(res.status).toBe(401);
    });

    it('Debe devolver la lista de líneas si el usuario está autenticado', async () => {
      const res = await request(app)
        .get('/lineas')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      // Las líneas de la base de datos (sembradas) deberían retornar al menos el objeto empresa
      if (res.body.length > 0) {
        expect(res.body[0]).toHaveProperty('numero');
        expect(res.body[0]).toHaveProperty('empresa');
        expect(res.body[0]).toHaveProperty('chatGrupo');
      }
    });
  });
});
