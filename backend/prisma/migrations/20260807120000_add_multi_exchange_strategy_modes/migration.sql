ALTER TYPE "TradingMode" ADD VALUE IF NOT EXISTS 'BYBIT_TESTNET';
ALTER TYPE "TradingMode" ADD VALUE IF NOT EXISTS 'BYBIT_LIVE';
ALTER TYPE "TradingMode" ADD VALUE IF NOT EXISTS 'OKX_TESTNET';
ALTER TYPE "TradingMode" ADD VALUE IF NOT EXISTS 'OKX_LIVE';

-- PR #9 introduced these fields in Prisma, but its migration only covered
-- ExchangeCredential. Keep this migration idempotent so deployed databases
-- are brought into line without disturbing existing strategies.
ALTER TABLE "TradingStrategy" ADD COLUMN IF NOT EXISTS "exchange" "ExchangeName" NOT NULL DEFAULT 'BINANCE';
ALTER TABLE "TradingStrategy" ADD COLUMN IF NOT EXISTS "maxStrategyExposureQuote" DECIMAL(28,8);
ALTER TABLE "TradingStrategy" ADD COLUMN IF NOT EXISTS "maxOrderQuote" DECIMAL(28,8);
ALTER TABLE "TradingStrategy" ADD COLUMN IF NOT EXISTS "maxDailyRealizedLossQuote" DECIMAL(28,8);
ALTER TABLE "TradingStrategy" ADD COLUMN IF NOT EXISTS "maxOpenParentPositions" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "TradingStrategy" ADD COLUMN IF NOT EXISTS "maxOpenIndependentPositions" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "TradingStrategy" ADD COLUMN IF NOT EXISTS "maxIndependentExposureQuote" DECIMAL(28,8);
