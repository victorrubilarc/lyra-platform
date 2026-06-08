/**
 * Backfill de `description` para los nodos de estructura ya existentes en la BD.
 * Idempotente y NO destructivo: solo rellena nodos cuya descripción está vacía
 * (description IS NULL), así no pisa textos editados a mano.
 *
 * Ejecutar: `pnpm --filter @lyra/watchlog-api run db:backfill-descriptions`
 */
import { PrismaClient } from "@prisma/client";
import { NODE_DESCRIPTIONS } from "./structure-descriptions.js";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  let updated = 0;
  for (const [id, description] of Object.entries(NODE_DESCRIPTIONS)) {
    const res = await prisma.orgNode.updateMany({
      where: { id, description: null },
      data: { description },
    });
    updated += res.count;
  }
  console.log(`✔ Backfill de descripciones: ${updated} nodo(s) actualizado(s)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
