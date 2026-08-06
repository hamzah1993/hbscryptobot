CREATE TABLE "LiveTradingSafetyProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "capitalCeilingQuote" DECIMAL(28,8),
  "confirmationVersion" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LiveTradingSafetyProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LiveTradingSafetyProfile_userId_key" ON "LiveTradingSafetyProfile"("userId");
CREATE INDEX "LiveTradingSafetyProfile_userId_idx" ON "LiveTradingSafetyProfile"("userId");

ALTER TABLE "LiveTradingSafetyProfile"
  ADD CONSTRAINT "LiveTradingSafetyProfile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
