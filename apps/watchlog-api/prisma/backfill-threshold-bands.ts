/**
 * Backfill de `LogEntryValue.thresholdBand` para valores guardados ANTES de la
 * Fase 2.6 (desde 2.6 la banda se estampa al guardar). Evalúa cada valor NUMÉRICO
 * contra el config de su campo en la versión CONGELADA usando la FUENTE ÚNICA
 * `thresholdBandFor` de @lyra/contracts (no se duplica la regla en SQL).
 * Idempotente y NO destructivo: solo actualiza filas cuya banda difiere.
 *
 * Ejecutar: `pnpm --filter @lyra/watchlog-api run db:backfill-threshold-bands`
 */
import { PrismaClient } from "@prisma/client";
import { thresholdBandFor, upgradeFieldConfig } from "@lyra/contracts";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const values = await prisma.logEntryValue.findMany({
    where: { dataType: "NUMBER" },
    select: { id: true, fieldKey: true, value: true, thresholdBand: true, logEntry: { select: { templateVersionId: true } } },
  });
  if (values.length === 0) {
    console.log("✔ Sin valores numéricos que evaluar");
    return;
  }

  const versionIds = [...new Set(values.map((v) => v.logEntry.templateVersionId))];
  const fields = await prisma.templateField.findMany({
    where: { section: { templateVersionId: { in: versionIds } } },
    select: { key: true, type: true, dataType: true, label: true, config: true, section: { select: { templateVersionId: true } } },
  });
  const fieldByVersionAndKey = new Map(fields.map((f) => [`${f.section.templateVersionId}:${f.key}`, f]));

  let updated = 0;
  for (const row of values) {
    const def = fieldByVersionAndKey.get(`${row.logEntry.templateVersionId}:${row.fieldKey}`);
    if (!def) continue;
    const band = thresholdBandFor(
      {
        key: def.key,
        type: def.type,
        dataType: def.dataType,
        label: def.label,
        config: upgradeFieldConfig(def.type, (def.config ?? {}) as Record<string, unknown>),
      },
      row.value as unknown,
    );
    if (band !== row.thresholdBand) {
      await prisma.logEntryValue.update({ where: { id: row.id }, data: { thresholdBand: band } });
      updated += 1;
    }
  }
  console.log(`✔ Backfill de bandas de umbral: ${updated} de ${values.length} valor(es) numérico(s) actualizado(s)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
