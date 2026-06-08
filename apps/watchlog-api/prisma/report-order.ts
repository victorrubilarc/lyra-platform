import type { PrismaClient } from "@prisma/client";

/**
 * Asigna `reportOrder` escalonado (10, 20, 30…) a los nodos cuyo orden está sin
 * definir (reportOrder = 0), agrupando por padre y ordenando alfabéticamente.
 * No destructivo: respeta los nodos que ya tienen un orden asignado a mano.
 *
 * Fuente de verdad ÚNICA del orden inicial: la usa el seed (nodos nuevos) y el
 * backfill (BD existente). Devuelve cuántos nodos actualizó.
 */
export async function assignReportOrderBySiblings(prisma: PrismaClient): Promise<number> {
  const nodes = await prisma.orgNode.findMany({
    where: { deletedAt: null },
    select: { id: true, parentId: true, name: true, reportOrder: true },
  });

  const byParent = new Map<string, typeof nodes>();
  for (const n of nodes) {
    const key = n.parentId ?? "__root__";
    const group = byParent.get(key) ?? [];
    group.push(n);
    byParent.set(key, group);
  }

  let updated = 0;
  for (const group of byParent.values()) {
    group.sort((a, b) => a.name.localeCompare(b.name));
    for (let i = 0; i < group.length; i++) {
      const n = group[i]!;
      if (n.reportOrder === 0) {
        await prisma.orgNode.update({ where: { id: n.id }, data: { reportOrder: (i + 1) * 10 } });
        updated++;
      }
    }
  }
  return updated;
}
