-- Identidad visual por estructura (L3 — UX premium cross-estructura).
-- Columnas ADITIVAS y nullable: cero pérdida. NULL = sin configurar ⇒ el front
-- deriva color/ícono determinísticamente de la `key`.
ALTER TABLE "OrgStructure" ADD COLUMN "color" TEXT;
ALTER TABLE "OrgStructure" ADD COLUMN "icon" TEXT;
