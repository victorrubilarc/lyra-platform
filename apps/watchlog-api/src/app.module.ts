import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { validateEnv } from "./config/env.schema";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // En dev se lee el .env de la raíz del monorepo; en contenedor, del propio servicio.
      envFilePath: ["../../.env", ".env"],
      validate: validateEnv,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? "info",
        transport:
          process.env.NODE_ENV !== "production"
            ? { target: "pino-pretty", options: { singleLine: true } }
            : undefined,
        // Nunca registrar credenciales ni cookies en los logs.
        redact: ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]'],
      },
    }),
    PrismaModule,
    HealthModule,
  ],
})
export class AppModule {}
