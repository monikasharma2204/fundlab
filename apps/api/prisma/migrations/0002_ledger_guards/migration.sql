-- Guards that Prisma's schema language can't express. These make the
-- database itself refuse bad financial rows, even if application code is wrong.

ALTER TABLE "Classroom" ADD CONSTRAINT "Classroom_startingCorpus_positive" CHECK ("startingCorpus" > 0);

ALTER TABLE "NavPrice" ADD CONSTRAINT "NavPrice_nav_positive" CHECK ("nav" > 0);

ALTER TABLE "Trade" ADD CONSTRAINT "Trade_units_positive"   CHECK ("units" > 0);
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_amount_positive"  CHECK ("amount" > 0);
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_navUsed_positive" CHECK ("navUsed" > 0);
ALTER TABLE "Trade" ADD CONSTRAINT "Trade_buy_has_reason"
  CHECK ("type" <> 'BUY' OR length(btrim(coalesce("reason", ''))) > 0);

-- The ledger is append-only. Corrections would be new compensating rows, never edits.
CREATE OR REPLACE FUNCTION fundlab_reject_trade_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Trade rows are immutable (attempted %)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Trade_immutable"
  BEFORE UPDATE OR DELETE ON "Trade"
  FOR EACH ROW EXECUTE FUNCTION fundlab_reject_trade_mutation();
