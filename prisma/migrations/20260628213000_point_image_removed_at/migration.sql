-- Removing an image now keeps the row (discarding the file bytes) so the public record shows an
-- image was attached then removed. removedAt is set on removal; null means still attached.
ALTER TABLE "ProviderFlagPointImage" ADD COLUMN "removedAt" TIMESTAMP(3);
