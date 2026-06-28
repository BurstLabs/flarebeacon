-- Votes are now changeable, and the FULL history of every cast/change is kept on the public record.
-- The current vote stays on "ProviderFlagVote" (one row per member, what the tally counts); every
-- cast/change is also appended to "ProviderFlagVoteRevision". Mirrors the grounds/defense pattern.

-- 1) Track when a vote was last changed. Existing votes were never changed, so updatedAt = createdAt.
ALTER TABLE "ProviderFlagVote" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "ProviderFlagVote" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
ALTER TABLE "ProviderFlagVote" ALTER COLUMN "updatedAt" SET NOT NULL;
ALTER TABLE "ProviderFlagVote" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- 2) Append-only revision trail.
CREATE TABLE "ProviderFlagVoteRevision" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "memberEntityVoter" TEXT NOT NULL,
    "signerAddress" TEXT NOT NULL,
    "vote" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderFlagVoteRevision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProviderFlagVoteRevision_caseId_memberEntityVoter_idx"
    ON "ProviderFlagVoteRevision"("caseId", "memberEntityVoter");

ALTER TABLE "ProviderFlagVoteRevision"
    ADD CONSTRAINT "ProviderFlagVoteRevision_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "ProviderFlagCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) Seed a revision for every vote already on record, so pre-existing votes have a visible history.
INSERT INTO "ProviderFlagVoteRevision" ("id", "caseId", "memberEntityVoter", "signerAddress", "vote", "comment", "createdAt")
SELECT "id", "caseId", "memberEntityVoter", "signerAddress", "vote", "comment", "createdAt"
FROM "ProviderFlagVote";
