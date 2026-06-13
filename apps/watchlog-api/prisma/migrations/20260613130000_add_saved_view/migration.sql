-- Vistas guardadas de PLATAFORMA (Fase 2.8.1b). Entidad genérica reusable por
-- cualquier módulo de listado vía el discriminador `module`. Es DATO PERSONAL del
-- usuario (autorización por ownership, no por RBAC). Aditiva: no toca datos.
-- CreateTable
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedView_userId_module_idx" ON "SavedView"("userId", "module");

-- UNA vista default por (usuario, módulo). Índice único PARCIAL (Prisma no lo
-- expresa en el esquema): solo aplica a las filas con isDefault = true.
CREATE UNIQUE INDEX "SavedView_user_module_default_key"
  ON "SavedView"("userId", "module") WHERE "isDefault";

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
