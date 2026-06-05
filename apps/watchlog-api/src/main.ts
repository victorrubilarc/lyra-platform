import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import helmet from "@fastify/helmet";
import cookie from "@fastify/cookie";
import { Logger } from "nestjs-pino";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { bufferLogs: true },
  );

  // Logging estructurado (pino) como logger de la aplicación.
  app.useLogger(app.get(Logger));

  // Cabeceras de seguridad por defecto.
  await app.register(helmet);

  // Lectura/escritura de cookies (refresh token httpOnly + CSRF).
  await app.register(cookie);

  // CORS con credenciales en desarrollo (la web corre en otro puerto vía Vite).
  // En producción todo va same-origin detrás de Caddy, así que no se necesita.
  if (process.env.NODE_ENV !== "production") {
    app.enableCors({ origin: true, credentials: true });
  }

  // Todas las rutas bajo /api.
  app.setGlobalPrefix("api");

  // Cierre ordenado (libera conexiones de Prisma, etc.).
  app.enableShutdownHooks();

  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen({ port, host: "0.0.0.0" });

  app.get(Logger).log(`Lyra WatchLog API escuchando en http://0.0.0.0:${port}/api`);
}

void bootstrap();
