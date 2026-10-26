-- CreateEnum
CREATE TYPE "BalanceEntryType" AS ENUM ('DEPOSIT', 'MEMBERSHIP_FEE', 'PROFIT_FEE', 'REFERRAL_REWARD', 'ADMIN_ADJUSTMENT');

-- AlterTable
ALTER TABLE "TradingPosition" ADD COLUMN     "profitFeeSettledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "BillingAccount" (
    "userId" TEXT NOT NULL,
    "balanceQuote" DECIMAL(28,8) NOT NULL DEFAULT 0,
    "membershipExpiresAt" TIMESTAMP(3),
    "referralCode" TEXT NOT NULL,
    "referrerId" TEXT,
    "depositIndex" SERIAL NOT NULL,
    "depositAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingAccount_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "BalanceEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "BalanceEntryType" NOT NULL,
    "amountQuote" DECIMAL(28,8) NOT NULL,
    "balanceAfterQuote" DECIMAL(28,8) NOT NULL,
    "referenceId" TEXT NOT NULL,
    "sourceUserId" TEXT,
    "level" INTEGER,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CryptoDeposit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "amountQuote" DECIMAL(28,8) NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CryptoDeposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "membershipFeeQuote" DECIMAL(28,8) NOT NULL DEFAULT 100,
    "membershipDays" INTEGER NOT NULL DEFAULT 365,
    "profitFeePercent" DECIMAL(5,2) NOT NULL DEFAULT 20,
    "minBalanceQuote" DECIMAL(28,8) NOT NULL DEFAULT 20,
    "referralPercents" JSONB NOT NULL DEFAULT '[10,5,3]',
    "profitFeeStartAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DepositScanState" (
    "chain" TEXT NOT NULL,
    "lastScannedBlock" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepositScanState_pkey" PRIMARY KEY ("chain")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingAccount_referralCode_key" ON "BillingAccount"("referralCode");

-- CreateIndex
CREATE UNIQUE INDEX "BillingAccount_depositIndex_key" ON "BillingAccount"("depositIndex");

-- CreateIndex
CREATE UNIQUE INDEX "BillingAccount_depositAddress_key" ON "BillingAccount"("depositAddress");

-- CreateIndex
CREATE INDEX "BillingAccount_referrerId_idx" ON "BillingAccount"("referrerId");

-- CreateIndex
CREATE INDEX "BalanceEntry_userId_createdAt_idx" ON "BalanceEntry"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "BalanceEntry_type_createdAt_idx" ON "BalanceEntry"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BalanceEntry_userId_type_referenceId_key" ON "BalanceEntry"("userId", "type", "referenceId");

-- CreateIndex
CREATE INDEX "CryptoDeposit_userId_createdAt_idx" ON "CryptoDeposit"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CryptoDeposit_chain_txHash_logIndex_key" ON "CryptoDeposit"("chain", "txHash", "logIndex");

-- CreateIndex
CREATE INDEX "TradingPosition_status_profitFeeSettledAt_closedAt_idx" ON "TradingPosition"("status", "profitFeeSettledAt", "closedAt");

-- AddForeignKey
ALTER TABLE "BillingAccount" ADD CONSTRAINT "BillingAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAccount" ADD CONSTRAINT "BillingAccount_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "BillingAccount"("userId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceEntry" ADD CONSTRAINT "BalanceEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CryptoDeposit" ADD CONSTRAINT "CryptoDeposit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Billing starts now: positions closed before this deployment are never charged a profit fee.
INSERT INTO "BillingSettings" ("id", "updatedAt") VALUES (1, CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;
