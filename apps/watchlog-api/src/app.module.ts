import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { LoggerModule } from "nestjs-pino";
import { validateEnv } from "./config/env.schema";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthModule } from "./health/health.module";
import { CryptoModule } from "./crypto/crypto.module";
import { CacheModule } from "./redis/cache.module";
import { AuditModule } from "./audit/audit.module";
import { EmailModule } from "./email/email.module";
import { AuthzModule } from "./authz/authz.module";
import { AuthModule } from "./auth/auth.module";
import { StructureModule } from "./structure/structure.module";
import { EquipmentModule } from "./equipment/equipment.module";
import { TemplatesModule } from "./templates/templates.module";
import { WorkflowsModule } from "./workflows/workflows.module";
import { ReferenceListsModule } from "./reference-lists/reference-lists.module";
import { SecurityModule } from "./security/security.module";

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
    CryptoModule,
    CacheModule,
    AuditModule,
    EmailModule,
    AuthzModule,
    AuthModule,
    StructureModule,
    EquipmentModule,
    TemplatesModule,
    WorkflowsModule,
    ReferenceListsModule,
    SecurityModule,
    HealthModule,
  ],
})
export class AppModule {}
