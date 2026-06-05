import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import helmet from "@fastify/helmet";
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

  // Todas las rutas bajo /api.
  app.setGlobalPrefix("api");

  // Cierre ordenado (libera conexiones de Prisma, etc.).
  app.enableShutdownHooks();

  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen({ port, host: "0.0.0.0" });

  app.get(Logger).log(`Lyra WatchLog API escuchando en http://0.0.0.0:${port}/api`);
}

void bootstrap();
