-- Bind a SIWE challenge to its chain and (optionally) an action, checked at verify time (S5/S6).
ALTER TABLE "AuthChallenge" ADD COLUMN "chainId" INTEGER;
ALTER TABLE "AuthChallenge" ADD COLUMN "action" TEXT;
