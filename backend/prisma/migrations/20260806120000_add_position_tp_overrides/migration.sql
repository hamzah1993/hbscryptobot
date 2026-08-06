ALTER TABLE "TradingPosition"
ADD COLUMN "takeProfitManual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "recoveryTakeProfitManual" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "TradingSubPosition"
ADD COLUMN "takeProfitManual" BOOLEAN NOT NULL DEFAULT false;
