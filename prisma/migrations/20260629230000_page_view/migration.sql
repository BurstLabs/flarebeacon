-- First-party traffic counter for admin stats. One row per (day, path).
CREATE TABLE "PageView" (
    "id" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,
    "uniques" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PageView_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PageView_day_path_key" ON "PageView"("day", "path");
CREATE INDEX "PageView_day_idx" ON "PageView"("day");
