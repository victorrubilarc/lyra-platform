-- Administración DELEGADA por estructura organizacional (L2b, 2026-06-24).
-- Migración ADITIVA y NO-DESTRUCTIVA: introduce `StructureAdmin`, que delega la
-- ADMINISTRACIÓN de una estructura concreta (árbol/niveles/ciclo de vida) a un rol
-- O un usuario, SIN convertirlo en super-admin de toda la instalación. No toca datos
-- existentes: sin filas, el comportamiento previo se conserva (el super-admin —quien
-- tiene `module:structure:manage`— administra todas; nadie más administra ninguna).
-- Es un eje DISTINTO del ABAC de datos (`Scope`): administrar la estructura ≠ ver los
-- datos de sus nodos. Por eso no se deriva de los nodos (cierra la deuda "(b)").

CREATE TABLE "StructureAdmin" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "roleId" TEXT,
    "structureId" TEXT NOT NULL,
    CONSTRAINT "StructureAdmin_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StructureAdmin_structureId_idx" ON "StructureAdmin"("structureId");
CREATE UNIQUE INDEX "StructureAdmin_userId_structureId_key" ON "StructureAdmin"("userId", "structureId");
CREATE UNIQUE INDEX "StructureAdmin_roleId_structureId_key" ON "StructureAdmin"("roleId", "structureId");

-- Sujeto polimórfico: la delegación pertenece a un usuario O a un rol, nunca a ambos
-- ni a ninguno (espejo del check de `Scope`).
ALTER TABLE "StructureAdmin" ADD CONSTRAINT "StructureAdmin_subject_exclusive_chk"
  CHECK (("userId" IS NOT NULL)::int + ("roleId" IS NOT NULL)::int = 1);

-- Claves foráneas (onDelete: Cascade, como el schema): borrar el usuario/rol/estructura
-- limpia sus delegaciones.
ALTER TABLE "StructureAdmin" ADD CONSTRAINT "StructureAdmin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StructureAdmin" ADD CONSTRAINT "StructureAdmin_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StructureAdmin" ADD CONSTRAINT "StructureAdmin_structureId_fkey" FOREIGN KEY ("structureId") REFERENCES "OrgStructure"("id") ON DELETE CASCADE ON UPDATE CASCADE;
