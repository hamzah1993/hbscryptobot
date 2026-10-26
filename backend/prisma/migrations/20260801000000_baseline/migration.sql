-- Baseline: the schema as it was before the first committed migration
-- (20260806070000). Lets `prisma migrate deploy` build a brand-new database
-- (staging, disaster-recovery restore). Every statement is idempotent, so on
-- an existing database (production was created with `db push`) it changes
-- nothing.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ExchangeName" AS ENUM ('BINANCE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ExchangeEnvironment" AS ENUM ('TESTNET', 'LIVE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "TradingMode" AS ENUM ('PAPER', 'BINANCE_TESTNET', 'BINANCE_LIVE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "StrategyStatus" AS ENUM ('STOPPED', 'RUNNING', 'PAUSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PositionStatus" AS ENUM ('OPEN', 'CLOSING', 'CLOSED', 'ERROR');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "SubPositionStatus" AS ENUM ('OPEN', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "OrderSide" AS ENUM ('BUY', 'SELL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "OrderType" AS ENUM ('MARKET', 'LIMIT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'FILLED', 'PARTIALLY_FILLED', 'CANCELLED', 'REJECTED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "StrategyActionType" AS ENUM ('INITIAL_ENTRY', 'DCA_ENTRY', 'INDEPENDENT_ENTRY', 'PARENT_EXIT', 'INDEPENDENT_EXIT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "StrategyActionStatus" AS ENUM ('PENDING', 'SUBMITTED', 'COMPLETED', 'FAILED', 'PERMANENTLY_FAILED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "StrategyActionFailureCategory" AS ENUM ('NETWORK', 'TIMEOUT', 'RATE_LIMIT', 'EXCHANGE_TEMPORARY', 'VALIDATION', 'AUTHENTICATION', 'INSUFFICIENT_BALANCE', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "NotificationSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "BacktestRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "BacktestTradeType" AS ENUM ('PARENT_ENTRY', 'INDEPENDENT_ENTRY', 'PARENT_EXIT', 'INDEPENDENT_EXIT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ExchangeCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exchange" "ExchangeName" NOT NULL,
    "environment" "ExchangeEnvironment" NOT NULL DEFAULT 'TESTNET',
    "apiKeyCipher" TEXT NOT NULL,
    "secretCipher" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TradingStrategy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "exchange" "ExchangeName" NOT NULL DEFAULT 'BINANCE',
    "environment" "ExchangeEnvironment" NOT NULL DEFAULT 'TESTNET',
    "mode" "TradingMode" NOT NULL DEFAULT 'PAPER',
    "status" "StrategyStatus" NOT NULL DEFAULT 'STOPPED',
    "paperTrading" BOOLEAN NOT NULL DEFAULT true,
    "riskBudgetQuote" DECIMAL(28,8) NOT NULL,
    "baseOrderQuote" DECIMAL(28,8) NOT NULL,
    "maxDcaOrders" INTEGER NOT NULL DEFAULT 8,
    "dcaStepPercent" DECIMAL(10,4) NOT NULL,
    "dcaMultiplier" DECIMAL(10,4) NOT NULL DEFAULT 1,
    "takeProfitPercent" DECIMAL(10,4) NOT NULL,
    "independentFromLevel" INTEGER NOT NULL DEFAULT 5,
    "maxStrategyExposureQuote" DECIMAL(28,8),
    "maxOrderQuote" DECIMAL(28,8),
    "maxDailyRealizedLossQuote" DECIMAL(28,8),
    "maxOpenParentPositions" INTEGER NOT NULL DEFAULT 1,
    "maxOpenIndependentPositions" INTEGER NOT NULL DEFAULT 20,
    "maxIndependentExposureQuote" DECIMAL(28,8),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingStrategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TradingPosition" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "status" "PositionStatus" NOT NULL DEFAULT 'OPEN',
    "totalQuantity" DECIMAL(28,12) NOT NULL DEFAULT 0,
    "totalCostQuote" DECIMAL(28,8) NOT NULL DEFAULT 0,
    "averageEntryPrice" DECIMAL(28,12) NOT NULL DEFAULT 0,
    "realizedPnlQuote" DECIMAL(28,8) NOT NULL DEFAULT 0,
    "dcaCount" INTEGER NOT NULL DEFAULT 0,
    "nextDcaPrice" DECIMAL(28,12),
    "takeProfitPrice" DECIMAL(28,12),
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TradingSubPosition" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "status" "SubPositionStatus" NOT NULL DEFAULT 'OPEN',
    "quantity" DECIMAL(28,12) NOT NULL,
    "costQuote" DECIMAL(28,8) NOT NULL,
    "entryPrice" DECIMAL(28,12) NOT NULL,
    "takeProfitPrice" DECIMAL(28,12) NOT NULL,
    "realizedPnlQuote" DECIMAL(28,8) NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "TradingSubPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TradingOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "subPositionId" TEXT,
    "exchangeOrderId" TEXT,
    "clientOrderId" TEXT NOT NULL,
    "side" "OrderSide" NOT NULL,
    "type" "OrderType" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "level" INTEGER NOT NULL DEFAULT 1,
    "independent" BOOLEAN NOT NULL DEFAULT false,
    "quantity" DECIMAL(28,12) NOT NULL,
    "price" DECIMAL(28,12),
    "filledQuantity" DECIMAL(28,12) NOT NULL DEFAULT 0,
    "quoteAmount" DECIMAL(28,8) NOT NULL DEFAULT 0,
    "averageFillPrice" DECIMAL(28,12),
    "accountedFilledQuantity" DECIMAL(28,12) NOT NULL DEFAULT 0,
    "accountedQuoteAmount" DECIMAL(28,8) NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StrategyAction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "positionId" TEXT,
    "subPositionId" TEXT,
    "orderId" TEXT,
    "actionKey" TEXT NOT NULL,
    "type" "StrategyActionType" NOT NULL,
    "status" "StrategyActionStatus" NOT NULL DEFAULT 'PENDING',
    "failureCategory" "StrategyActionFailureCategory",
    "retryable" BOOLEAN NOT NULL DEFAULT false,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lastAttemptedAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "level" INTEGER,
    "independent" BOOLEAN NOT NULL DEFAULT false,
    "side" "OrderSide" NOT NULL,
    "quantity" DECIMAL(28,12),
    "quoteAmount" DECIMAL(28,8),
    "triggerPrice" DECIMAL(28,12),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "StrategyAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "HistoricalCandle" (
    "id" TEXT NOT NULL,
    "exchange" "ExchangeName" NOT NULL DEFAULT 'BINANCE',
    "symbol" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "openTime" TIMESTAMP(3) NOT NULL,
    "closeTime" TIMESTAMP(3) NOT NULL,
    "open" DECIMAL(28,12) NOT NULL,
    "high" DECIMAL(28,12) NOT NULL,
    "low" DECIMAL(28,12) NOT NULL,
    "close" DECIMAL(28,12) NOT NULL,
    "volume" DECIMAL(36,12) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricalCandle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BacktestRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "exchange" "ExchangeName" NOT NULL DEFAULT 'BINANCE',
    "symbol" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "status" "BacktestRunStatus" NOT NULL DEFAULT 'PENDING',
    "initialCapital" DECIMAL(28,8) NOT NULL,
    "endingCapital" DECIMAL(28,8),
    "realizedPnlQuote" DECIMAL(28,8),
    "returnPercent" DECIMAL(12,6),
    "maxDrawdownPercent" DECIMAL(12,6),
    "tradeCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BacktestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BacktestTrade" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "type" "BacktestTradeType" NOT NULL,
    "level" INTEGER NOT NULL,
    "independent" BOOLEAN NOT NULL DEFAULT false,
    "executedAt" TIMESTAMP(3) NOT NULL,
    "price" DECIMAL(28,12) NOT NULL,
    "quantity" DECIMAL(28,12) NOT NULL,
    "quoteAmount" DECIMAL(28,8) NOT NULL,
    "feeQuote" DECIMAL(28,8) NOT NULL DEFAULT 0,
    "realizedPnlQuote" DECIMAL(28,8),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BacktestTrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BacktestEquityPoint" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,
    "equityQuote" DECIMAL(28,8) NOT NULL,
    "drawdownPercent" DECIMAL(12,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BacktestEquityPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "OperationalNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" "NotificationSeverity" NOT NULL,
    "strategyId" TEXT,
    "positionId" TEXT,
    "orderId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "NotificationWebhookMetricsSnapshot" (
    "id" TEXT NOT NULL,
    "attempted" INTEGER NOT NULL DEFAULT 0,
    "delivered" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "retried" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastFailureAt" TIMESTAMP(3),
    "lastStatusCode" INTEGER,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationWebhookMetricsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ExchangeCredential_userId_idx" ON "ExchangeCredential"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ExchangeCredential_userId_exchange_environment_key" ON "ExchangeCredential"("userId", "exchange", "environment");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TradingStrategy_userId_status_idx" ON "TradingStrategy"("userId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TradingStrategy_userId_mode_status_idx" ON "TradingStrategy"("userId", "mode", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TradingStrategy_userId_name_key" ON "TradingStrategy"("userId", "name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TradingPosition_strategyId_status_idx" ON "TradingPosition"("strategyId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TradingPosition_userId_status_idx" ON "TradingPosition"("userId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TradingSubPosition_positionId_status_idx" ON "TradingSubPosition"("positionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TradingSubPosition_positionId_level_key" ON "TradingSubPosition"("positionId", "level");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TradingOrder_clientOrderId_key" ON "TradingOrder"("clientOrderId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TradingOrder_positionId_status_idx" ON "TradingOrder"("positionId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TradingOrder_subPositionId_status_idx" ON "TradingOrder"("subPositionId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TradingOrder_userId_createdAt_idx" ON "TradingOrder"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "StrategyAction_orderId_key" ON "StrategyAction"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "StrategyAction_actionKey_key" ON "StrategyAction"("actionKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StrategyAction_strategyId_status_idx" ON "StrategyAction"("strategyId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StrategyAction_status_nextRetryAt_idx" ON "StrategyAction"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StrategyAction_userId_createdAt_idx" ON "StrategyAction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StrategyAction_positionId_status_idx" ON "StrategyAction"("positionId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StrategyAction_subPositionId_status_idx" ON "StrategyAction"("subPositionId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "HistoricalCandle_symbol_interval_openTime_idx" ON "HistoricalCandle"("symbol", "interval", "openTime");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "HistoricalCandle_exchange_symbol_interval_openTime_key" ON "HistoricalCandle"("exchange", "symbol", "interval", "openTime");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BacktestRun_userId_createdAt_idx" ON "BacktestRun"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BacktestRun_strategyId_createdAt_idx" ON "BacktestRun"("strategyId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BacktestRun_status_createdAt_idx" ON "BacktestRun"("status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BacktestTrade_runId_executedAt_idx" ON "BacktestTrade"("runId", "executedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BacktestTrade_runId_type_idx" ON "BacktestTrade"("runId", "type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BacktestEquityPoint_runId_recordedAt_idx" ON "BacktestEquityPoint"("runId", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "BacktestEquityPoint_runId_recordedAt_key" ON "BacktestEquityPoint"("runId", "recordedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OperationalNotification_userId_createdAt_idx" ON "OperationalNotification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OperationalNotification_severity_createdAt_idx" ON "OperationalNotification"("severity", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "NotificationWebhookMetricsSnapshot_recordedAt_idx" ON "NotificationWebhookMetricsSnapshot"("recordedAt");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "ExchangeCredential" ADD CONSTRAINT "ExchangeCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "TradingStrategy" ADD CONSTRAINT "TradingStrategy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "TradingPosition" ADD CONSTRAINT "TradingPosition_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "TradingStrategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "TradingPosition" ADD CONSTRAINT "TradingPosition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "TradingSubPosition" ADD CONSTRAINT "TradingSubPosition_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "TradingPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "TradingOrder" ADD CONSTRAINT "TradingOrder_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "TradingPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "TradingOrder" ADD CONSTRAINT "TradingOrder_subPositionId_fkey" FOREIGN KEY ("subPositionId") REFERENCES "TradingSubPosition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "TradingOrder" ADD CONSTRAINT "TradingOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "StrategyAction" ADD CONSTRAINT "StrategyAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "StrategyAction" ADD CONSTRAINT "StrategyAction_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "TradingStrategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "StrategyAction" ADD CONSTRAINT "StrategyAction_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "TradingPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "StrategyAction" ADD CONSTRAINT "StrategyAction_subPositionId_fkey" FOREIGN KEY ("subPositionId") REFERENCES "TradingSubPosition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "StrategyAction" ADD CONSTRAINT "StrategyAction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TradingOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "BacktestRun" ADD CONSTRAINT "BacktestRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "BacktestRun" ADD CONSTRAINT "BacktestRun_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "TradingStrategy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "BacktestTrade" ADD CONSTRAINT "BacktestTrade_runId_fkey" FOREIGN KEY ("runId") REFERENCES "BacktestRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "BacktestEquityPoint" ADD CONSTRAINT "BacktestEquityPoint_runId_fkey" FOREIGN KEY ("runId") REFERENCES "BacktestRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "OperationalNotification" ADD CONSTRAINT "OperationalNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
