import { Controller, Get } from "@nestjs/common";
import type { HealthStatus } from "@lyra/contracts";
import { Public } from "../authz/authz.decorators";
import { PrismaService } from "../prisma/prisma.service";

const SERVICE = "watchlog-api";
const VERSION = process.env.npm_package_version ?? "0.0.0";

/**
 * Endpoints de salud (PÚBLICOS: los usan los healthchecks de Docker y no deben
 * exigir token):
 *  - GET /api/health        → liveness (¿el proceso responde?)
 *  - GET /api/health/ready  → readiness (¿las dependencias están sanas?)
 */
@Public()
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  liveness(): HealthStatus {
    return {
      status: "ok",
      service: SERVICE,
      version: VERSION,
      timestamp: new Date().toISOString(),
    };
  }

  @Get("ready")
  async readiness(): Promise<HealthStatus> {
    let status: HealthStatus["status"] = "ok";
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      status = "down";
    }
    return {
      status,
      service: SERVICE,
      version: VERSION,
      timestamp: new Date().toISOString(),
    };
  }
}
