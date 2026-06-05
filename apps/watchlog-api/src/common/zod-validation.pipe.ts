import { BadRequestException, type PipeTransform } from "@nestjs/common";
import type { ZodSchema } from "zod";

/**
 * Valida (y normaliza) el payload con un esquema Zod de @lyra/contracts. La
 * validación de entrada vive SIEMPRE en el backend; el mismo esquema se reusa
 * en el frontend solo para feedback inmediato.
 *
 * Uso: `@Body(new ZodValidationPipe(loginRequestSchema)) dto: LoginRequest`.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const issues = result.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      }));
      throw new BadRequestException({ message: "Datos inválidos", issues });
    }
    return result.data;
  }
}
