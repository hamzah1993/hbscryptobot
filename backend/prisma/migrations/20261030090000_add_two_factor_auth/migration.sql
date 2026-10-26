ALTER TABLE "User"
  ADD COLUMN "totpSecretCipher" TEXT,
  ADD COLUMN "totpSecretIv" TEXT,
  ADD COLUMN "totpSecretTag" TEXT,
  ADD COLUMN "totpEnabledAt" TIMESTAMP(3),
  ADD COLUMN "totpLastStep" INTEGER;
