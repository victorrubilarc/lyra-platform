-- Apariencia / Temas administrables (EST-TEMAS).
-- Paletas de color de marca (override parcial de tokens temáticos por variante
-- clara/oscura), publicables, con una por defecto a nivel de instalación y una
-- preferencia portable por usuario. Todo ADITIVO y nullable: cero pérdida.

-- CreateTable
CREATE TABLE "ThemePalette" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tokensDark" JSONB NOT NULL DEFAULT '{}',
    "tokensLight" JSONB NOT NULL DEFAULT '{}',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThemePalette_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ThemePalette_isPublished_idx" ON "ThemePalette"("isPublished");

-- Preferencia de paleta por usuario (portable). SetNull al borrar la paleta.
-- AlterTable
ALTER TABLE "User" ADD COLUMN "themePaletteId" TEXT;

-- Paleta por defecto de la instalación (ref blanda, sin FK).
-- AlterTable
ALTER TABLE "SystemSettings" ADD COLUMN "defaultPaletteId" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_themePaletteId_fkey" FOREIGN KEY ("themePaletteId") REFERENCES "ThemePalette"("id") ON DELETE SET NULL ON UPDATE CASCADE;
