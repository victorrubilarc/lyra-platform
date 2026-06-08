/**
 * Backfill de `reportOrder` para los nodos de estructura ya existentes.
 * Idempotente y NO destructivo: solo asigna orden a nodos con reportOrder = 0.
 *
 * Ejecutar: `pnpm --filter @lyra/watchlog-api run db:backfill-report-order`
 */
import { PrismaClient } from "@prisma/client";
import { assignReportOrderBySiblings } from "./report-order.js";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const updated = await assignReportOrderBySiblings(prisma);
  console.log(`✔ Backfill de orden en informes: ${updated} nodo(s) actualizado(s)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
