import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { authenticator } from "otplib";
import { EncryptionService } from "../crypto/encryption.service";
import { PrismaService } from "../prisma/prisma.service";

const RECOVERY_CODE_COUNT = 10;
const ISSUER = "Lyra WatchLog";

/**
 * MFA TOTP. El secreto se guarda cifrado en reposo (AES-256-GCM). El segundo
 * factor se puede satisfacer con un código TOTP o con un código de recuperación
 * de un solo uso. El enrolamiento es en dos pasos: setup (genera) + verify
 * (confirma con un código del autenticador y entrega los recovery codes).
 */
@Injectable()
export class MfaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly enc: EncryptionService,
  ) {}

  /** Paso 1: genera y guarda (sin confirmar) un secreto TOTP para el usuario. */
  async setup(userId: string, email: string): Promise<{ secret: string; otpauthUrl: string }> {
    const secret = authenticator.generateSecret();
    await this.prisma.mfaSecret.upsert({
      where: { userId },
      create: { userId, secret: this.enc.encrypt(secret) },
      update: { secret: this.enc.encrypt(secret), confirmedAt: null },
    });
    // Si existía MFA, al re-enrolar limpiamos códigos de recuperación viejos.
    await this.prisma.mfaRecoveryCode.deleteMany({
      where: { mfaSecret: { userId } },
    });
    const otpauthUrl = authenticator.keyuri(email, ISSUER, secret);
    return { secret, otpauthUrl };
  }

  /** Paso 2: confirma el enrolamiento y devuelve los códigos de recuperación. */
  async verifyAndActivate(userId: string, totp: string): Promise<string[]> {
    const record = await this.prisma.mfaSecret.findUnique({ where: { userId } });
    if (!record) throw new BadRequestException("No hay un enrolamiento MFA en curso");

    const secret = this.enc.decrypt(record.secret);
    if (!authenticator.verify({ token: totp, secret })) {
      throw new BadRequestException("Código TOTP inválido");
    }

    const codes = this.generateRecoveryCodes();
    await this.prisma.$transaction([
      this.prisma.mfaSecret.update({
        where: { userId },
        data: { confirmedAt: new Date() },
      }),
      this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } }),
      this.prisma.mfaRecoveryCode.deleteMany({ where: { mfaSecret: { userId } } }),
      this.prisma.mfaRecoveryCode.createMany({
        data: codes.map((c) => ({ mfaSecretId: record.id, codeHash: this.enc.sha256(c) })),
      }),
    ]);
    return codes;
  }

  /** Desactiva MFA (la verificación de contraseña la hace el orquestador). */
  async disable(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.mfaSecret.deleteMany({ where: { userId } }),
      this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: false } }),
    ]);
  }

  /**
   * Verifica el segundo factor en el login: acepta un TOTP válido o consume un
   * código de recuperación. Lanza si no es válido.
   */
  async assertSecondFactor(userId: string, code: string): Promise<void> {
    const record = await this.prisma.mfaSecret.findUnique({ where: { userId } });
    if (!record?.confirmedAt) throw new UnauthorizedException("MFA no configurado");

    const secret = this.enc.decrypt(record.secret);
    if (authenticator.verify({ token: code, secret })) return;

    // No es un TOTP válido: intentar consumir un código de recuperación.
    const codeHash = this.enc.sha256(code.trim());
    const recovery = await this.prisma.mfaRecoveryCode.findFirst({
      where: { mfaSecretId: record.id, codeHash, usedAt: null },
    });
    if (!recovery) throw new UnauthorizedException("Segundo factor inválido");

    await this.prisma.mfaRecoveryCode.update({
      where: { id: recovery.id },
      data: { usedAt: new Date() },
    });
  }

  private generateRecoveryCodes(): string[] {
    return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
      const raw = randomBytes(5).toString("hex").toUpperCase(); // 10 hex chars
      return `${raw.slice(0, 5)}-${raw.slice(5)}`;
    });
  }
}
