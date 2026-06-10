-- CreateEnum
CREATE TYPE "SignatureContext" AS ENUM ('TRANSITION', 'SECTION_COMPLETION');

-- CreateEnum
CREATE TYPE "SignatureMethod" AS ENUM ('PASSWORD', 'PASSWORD_MFA');

-- CreateTable
CREATE TABLE "LogEntryTransition" (
    "id" TEXT NOT NULL,
    "logEntryId" TEXT NOT NULL,
    "workflowDefinitionVersionId" TEXT NOT NULL,
    "transitionKey" TEXT NOT NULL,
    "fromStateKey" TEXT NOT NULL,
    "toStateKey" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "reason" TEXT,
    "signatureId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogEntryTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogEntrySignature" (
    "id" TEXT NOT NULL,
    "logEntryId" TEXT NOT NULL,
    "context" "SignatureContext" NOT NULL,
    "transitionKey" TEXT,
    "sectionKey" TEXT,
    "signerId" TEXT,
    "signerName" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "method" "SignatureMethod" NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogEntrySignature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LogEntryTransition_logEntryId_occurredAt_idx" ON "LogEntryTransition"("logEntryId", "occurredAt");

-- CreateIndex
CREATE INDEX "LogEntrySignature_logEntryId_idx" ON "LogEntrySignature"("logEntryId");

-- CreateIndex
CREATE INDEX "LogEntrySignature_signerId_idx" ON "LogEntrySignature"("signerId");

-- AddForeignKey
ALTER TABLE "LogEntryTransition" ADD CONSTRAINT "LogEntryTransition_logEntryId_fkey" FOREIGN KEY ("logEntryId") REFERENCES "LogEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LogEntrySignature" ADD CONSTRAINT "LogEntrySignature_logEntryId_fkey" FOREIGN KEY ("logEntryId") REFERENCES "LogEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Dueño polimórfico exclusivo según el contexto de la firma (mismo patrón que
-- Scope/ExternalReference): una firma de transición porta transitionKey y no
-- sectionKey, y viceversa para la firma de completitud de sección.
ALTER TABLE "LogEntrySignature" ADD CONSTRAINT "LogEntrySignature_context_chk"
  CHECK (
    ("context" = 'TRANSITION' AND "transitionKey" IS NOT NULL AND "sectionKey" IS NULL)
    OR
    ("context" = 'SECTION_COMPLETION' AND "sectionKey" IS NOT NULL AND "transitionKey" IS NULL)
  );
