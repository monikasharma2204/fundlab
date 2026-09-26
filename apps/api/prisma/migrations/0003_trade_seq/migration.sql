-- Deterministic replay order for the ledger (createdAt can tie within a millisecond).
ALTER TABLE "Trade" ADD COLUMN "seq" BIGSERIAL NOT NULL;
CREATE UNIQUE INDEX "Trade_seq_key" ON "Trade"("seq");
DROP INDEX "Trade_studentId_createdAt_idx";
CREATE INDEX "Trade_studentId_seq_idx" ON "Trade"("studentId", "seq");
