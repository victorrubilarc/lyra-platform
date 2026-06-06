import { BadRequestException, Injectable } from "@nestjs/common";
import type { PasswordPolicy as PolicyRow } from "@prisma/client";
import type { UpdatePasswordPolicyRequest } from "@lyra/contracts";
import { PasswordService } from "../crypto/password.service";
import { PrismaService } from "../prisma/prisma.service";

const POLICY_ID = "singleton";

/** Valores por defecto si aún no se ha sembrado la política. */
const DEFAULT_POLICY = {
  minLength: 12,
  requireUppercase: true,
  requireNumber: true,
  requireSymbol: false,
  expiryDays: null as number | null,
  historyCount: 5,
  maxFailedAttempts: 5,
  lockoutMinutes: 15,
  mfaMode: "OPTIONAL" as const,
};

@Injectable()
export class PasswordPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  /** Lee la política singleton (o los valores por defecto si no existe). */
  async getPolicy(): Promise<PolicyRow | (typeof DEFAULT_POLICY & { id: string })> {
    const row = await this.prisma.passwordPolicy.findUnique({ where: { id: POLICY_ID } });
    return row ?? { id: POLICY_ID, ...DEFAULT_POLICY };
  }

  /** Actualiza (o crea) la política singleton. */
  async updatePolicy(
    dto: UpdatePasswordPolicyRequest,
    updatedById: string | null,
  ): Promise<PolicyRow> {
    return this.prisma.passwordPolicy.upsert({
      where: { id: POLICY_ID },
      create: { id: POLICY_ID, ...DEFAULT_POLICY, ...dto, updatedById },
      update: { ...dto, updatedById },
    });
  }

  /** Valida la complejidad de una contraseña contra la política. Lanza si falla. */
  async assertComplexity(plain: string): Promise<void> {
    const policy = await this.getPolicy();
    const errors: string[] = [];
    if (plain.length < policy.minLength) {
      errors.push(`mínimo ${policy.minLength} caracteres`);
    }
    if (policy.requireUppercase && !/[A-Z]/.test(plain)) errors.push("una mayúscula");
    if (policy.requireNumber && !/[0-9]/.test(plain)) errors.push("un número");
    if (policy.requireSymbol && !/[^A-Za-z0-9]/.test(plain)) errors.push("un símbolo");
    if (errors.length > 0) {
      throw new BadRequestException(`La contraseña no cumple la política: ${errors.join(", ")}.`);
    }
  }

  /** Verifica que la contraseña no reutilice las últimas `historyCount`. */
  async assertNotReused(userId: string, plain: string): Promise<void> {
    const policy = await this.getPolicy();
    if (policy.historyCount <= 0) return;
    const history = await this.prisma.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: policy.historyCount,
    });
    for (const entry of history) {
      if (await this.passwords.verify(entry.passwordHash, plain)) {
        throw new BadRequestException("No puedes reutilizar una contraseña reciente.");
      }
    }
  }

  /** Registra un hash en el historial (para el control de reutilización). */
  async recordHistory(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.passwordHistory.create({ data: { userId, passwordHash } });
  }
}
