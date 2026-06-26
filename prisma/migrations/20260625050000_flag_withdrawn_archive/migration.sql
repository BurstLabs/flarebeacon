-- Withdrawing the last flag now archives the case as WITHDRAWN (state preserved + readable) instead
-- of deleting it. Record when a co-initiator withdrew.
ALTER TABLE "ProviderFlagInitiation" ADD COLUMN "withdrawnAt" TIMESTAMP(3);
