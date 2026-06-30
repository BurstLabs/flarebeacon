-- Per-validator (P-chain node) stats from platform.getCurrentValidators, joined to providers by nodeId.
CREATE TABLE "ProviderValidator" (
    "id" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "feePercent" DOUBLE PRECISION,
    "uptimePercent" DOUBLE PRECISION,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "weight" TEXT,
    "delegatorCount" INTEGER,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProviderValidator_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProviderValidator_network_nodeId_key" ON "ProviderValidator"("network", "nodeId");
CREATE INDEX "ProviderValidator_nodeId_idx" ON "ProviderValidator"("nodeId");
