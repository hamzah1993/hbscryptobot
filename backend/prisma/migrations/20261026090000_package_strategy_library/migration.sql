-- Packages move from one inline strategy to an admin strategy library, with
-- several weighted strategies per package and several bots per subscription.
-- Existing data is converted before the old columns are dropped.

-- CreateTable
CREATE TABLE "PackageStrategyTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "strategyTemplate" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackageStrategyTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingPackageStrategy" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "allocationPercent" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "TradingPackageStrategy_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "TradingStrategy" ADD COLUMN     "packageSubscriptionId" TEXT;

-- Convert each existing package's inline strategy into a library template
-- assigned to that package at 100%.
INSERT INTO "PackageStrategyTemplate" ("id", "name", "symbol", "strategyTemplate", "active", "updatedAt")
SELECT "id", "name" || ' strategy', "symbol", "strategyTemplate", true, CURRENT_TIMESTAMP
FROM "TradingPackage";

INSERT INTO "TradingPackageStrategy" ("id", "packageId", "templateId", "allocationPercent")
SELECT gen_random_uuid()::text, "id", "id", 100
FROM "TradingPackage";

-- Point existing package bots at their subscription.
UPDATE "TradingStrategy" AS s
SET "packageSubscriptionId" = ps."id"
FROM "PackageSubscription" AS ps
WHERE ps."strategyId" = s."id";

-- DropForeignKey
ALTER TABLE "PackageSubscription" DROP CONSTRAINT "PackageSubscription_strategyId_fkey";

-- DropIndex
DROP INDEX "PackageSubscription_strategyId_key";

-- AlterTable
ALTER TABLE "TradingPackage" DROP COLUMN "strategyTemplate",
DROP COLUMN "symbol";

-- AlterTable
ALTER TABLE "PackageSubscription" DROP COLUMN "strategyId";

-- CreateIndex
CREATE UNIQUE INDEX "PackageStrategyTemplate_name_key" ON "PackageStrategyTemplate"("name");

-- CreateIndex
CREATE INDEX "TradingPackageStrategy_templateId_idx" ON "TradingPackageStrategy"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "TradingPackageStrategy_packageId_templateId_key" ON "TradingPackageStrategy"("packageId", "templateId");

-- CreateIndex
CREATE INDEX "TradingStrategy_packageSubscriptionId_idx" ON "TradingStrategy"("packageSubscriptionId");

-- AddForeignKey
ALTER TABLE "TradingPackageStrategy" ADD CONSTRAINT "TradingPackageStrategy_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "TradingPackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingPackageStrategy" ADD CONSTRAINT "TradingPackageStrategy_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PackageStrategyTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradingStrategy" ADD CONSTRAINT "TradingStrategy_packageSubscriptionId_fkey" FOREIGN KEY ("packageSubscriptionId") REFERENCES "PackageSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
