-- Alcance por PLANTILLA (2.º eje ABAC, Fase 2.8). Tabla dedicada (NO extiende
-- Scope): eje ortogonal al de nodo, combina en AND. Sujeto polimórfico
-- (userId XOR roleId). Aditiva: no toca datos existentes.
-- CreateTable
CREATE TABLE "TemplateScope" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "roleId" TEXT,
    "templateId" TEXT NOT NULL,

    CONSTRAINT "TemplateScope_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TemplateScope_templateId_idx" ON "TemplateScope"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateScope_userId_templateId_key" ON "TemplateScope"("userId", "templateId");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateScope_roleId_templateId_key" ON "TemplateScope"("roleId", "templateId");

-- AddForeignKey
ALTER TABLE "TemplateScope" ADD CONSTRAINT "TemplateScope_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateScope" ADD CONSTRAINT "TemplateScope_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateScope" ADD CONSTRAINT "TemplateScope_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- TemplateScope tiene sujeto polimórfico: debe pertenecer a un usuario O a un
-- rol, nunca a ambos ni a ninguno. Lo garantiza la base, no solo la app.
ALTER TABLE "TemplateScope" ADD CONSTRAINT "TemplateScope_subject_exclusive_chk"
  CHECK (("userId" IS NOT NULL)::int + ("roleId" IS NOT NULL)::int = 1);
