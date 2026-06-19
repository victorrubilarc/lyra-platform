-- Fase 5 · Slice 2 — IA administrable desde la app (config en BD cifrada/write-only)
-- Migración ADITIVA: 2 tablas nuevas (config singleton + registro de generaciones).

-- Config de IA (singleton, dedicada). API key CIFRADA + write-only (apiKeyEnc).
CREATE TABLE "AiSettings" (
    "id" TEXT NOT NULL DEFAULT 'system',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT NOT NULL DEFAULT 'none',
    "model" TEXT,
    "baseUrl" TEXT,
    "apiKeyEnc" TEXT,
    "configuredAt" TIMESTAMP(3),
    "configuredById" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AiSettings_pkey" PRIMARY KEY ("id")
);

-- Registro de generaciones (gobernanza de costo). Append-only.
CREATE TABLE "AiGenerationLog" (
    "id" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "latencyMs" INTEGER NOT NULL,
    "error" TEXT,
    "handoverId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiGenerationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiGenerationLog_createdAt_idx" ON "AiGenerationLog"("createdAt");
CREATE INDEX "AiGenerationLog_provider_createdAt_idx" ON "AiGenerationLog"("provider", "createdAt");
