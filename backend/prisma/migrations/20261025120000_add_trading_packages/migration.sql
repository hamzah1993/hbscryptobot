-- CreateEnum
CREATE TYPE "PackageSubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateTable
CREATE TABLE "TradingPackage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "amountQuote" DECIMAL(28,8) NOT NULL,
    "symbol" TEXT NOT NULL,
    "strategyTemplate" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "strategyId" TEXT,
    "status" "PackageSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "amountQuote" DECIMAL(28,8) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackageSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TradingPackage_name_key" ON "TradingPackage"("name");

-- CreateIndex
CREATE INDEX "TradingPackage_active_sortOrder_idx" ON "TradingPackage"("active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PackageSubscription_strategyId_key" ON "PackageSubscription"("strategyId");

-- CreateIndex
CREATE INDEX "PackageSubscription_userId_status_idx" ON "PackageSubscription"("userId", "status");

-- CreateIndex
CREATE INDEX "PackageSubscription_packageId_status_idx" ON "PackageSubscription"("packageId", "status");

-- AddForeignKey
ALTER TABLE "PackageSubscription" ADD CONSTRAINT "PackageSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageSubscription" ADD CONSTRAINT "PackageSubscription_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "TradingPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageSubscription" ADD CONSTRAINT "PackageSubscription_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "TradingStrategy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

