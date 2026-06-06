/**
 * Seed idempotente de la Fase 1. Inserta el catálogo de permisos, el rol de
 * sistema "Administrador" (con todos los permisos), la política de contraseñas
 * por defecto y, si se configura, un usuario administrador de arranque que
 * deberá cambiar su contraseña en el primer login.
 *
 * Ejecutar: `pnpm --filter @lyra/watchlog-api run db:seed`
 */
import { PERMISSION_CATALOG } from "@lyra/contracts";
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

const ADMIN_ROLE_KEY = "admin";

async function seedPermissions(): Promise<void> {
  for (const def of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { key: def.key },
      create: { key: def.key, dimension: def.dimension, group: def.group, description: def.description },
      update: { dimension: def.dimension, group: def.group, description: def.description },
    });
  }
  console.log(`✔ Permisos sincronizados: ${PERMISSION_CATALOG.length}`);
}

async function seedAdminRole(): Promise<void> {
  const role = await prisma.role.upsert({
    where: { key: ADMIN_ROLE_KEY },
    create: { key: ADMIN_ROLE_KEY, name: "Administrador", description: "Acceso total al sistema", isSystem: true },
    update: { isSystem: true },
  });
  const permissions = await prisma.permission.findMany({ select: { id: true } });
  await prisma.rolePermission.createMany({
    data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
    skipDuplicates: true,
  });
  console.log(`✔ Rol "${ADMIN_ROLE_KEY}" con ${permissions.length} permisos`);
}

async function seedPasswordPolicy(): Promise<void> {
  await prisma.passwordPolicy.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {},
  });
  console.log("✔ Política de contraseñas por defecto");
}

async function seedBootstrapAdmin(): Promise<void> {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password) {
    console.log("• Sin BOOTSTRAP_ADMIN_EMAIL/PASSWORD: no se crea admin de arranque");
    return;
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`• El usuario ${email} ya existe: no se recrea`);
    return;
  }
  const role = await prisma.role.findUniqueOrThrow({ where: { key: ADMIN_ROLE_KEY } });
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  const user = await prisma.user.create({
    data: {
      email,
      displayName: "Administrador",
      passwordHash,
      forcePasswordChange: true,
      roles: { create: { roleId: role.id } },
    },
  });
  await prisma.passwordHistory.create({ data: { userId: user.id, passwordHash } });
  console.log(`✔ Admin de arranque creado: ${email} (debe cambiar la contraseña al ingresar)`);
}

/**
 * Usuario de prueba (SOLO fuera de producción) para ejercitar flujos como la
 * recuperación de contraseña sin tocar el admin de arranque. Idempotente.
 * Su contraseña cumple la política por defecto (≥12, mayúscula, número).
 */
async function seedDemoUser(): Promise<void> {
  if (process.env.NODE_ENV === "production") return;
  const email = "demo@watchlog.local";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`• Usuario de prueba ${email} ya existe: no se recrea`);
    return;
  }
  const role = await prisma.role.findUniqueOrThrow({ where: { key: ADMIN_ROLE_KEY } });
  const password = "Demo!Pass2026";
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  const user = await prisma.user.create({
    data: {
      email,
      displayName: "Usuario Demo",
      passwordHash,
      forcePasswordChange: false,
      roles: { create: { roleId: role.id } },
    },
  });
  await prisma.passwordHistory.create({ data: { userId: user.id, passwordHash } });
  console.log(`✔ Usuario de prueba (dev) creado: ${email} / ${password}`);
}

async function main(): Promise<void> {
  await seedPermissions();
  await seedAdminRole();
  await seedPasswordPolicy();
  await seedBootstrapAdmin();
  await seedDemoUser();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
