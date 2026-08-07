-- One Telegram private chat may belong to only one HBS user.
CREATE UNIQUE INDEX "NotificationPreference_telegramChatId_key"
ON "NotificationPreference"("telegramChatId");

CREATE TABLE "TelegramConnectionToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelegramConnectionToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramConnectionToken_tokenHash_key"
ON "TelegramConnectionToken"("tokenHash");

CREATE INDEX "TelegramConnectionToken_userId_expiresAt_idx"
ON "TelegramConnectionToken"("userId", "expiresAt");

ALTER TABLE "TelegramConnectionToken"
ADD CONSTRAINT "TelegramConnectionToken_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
