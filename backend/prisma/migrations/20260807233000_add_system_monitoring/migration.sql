CREATE TABLE "SystemHealthIncident" (
    "id" TEXT NOT NULL,
    "component" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "severity" "NotificationSeverity" NOT NULL DEFAULT 'WARNING',
    "message" TEXT NOT NULL,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAlertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemHealthIncident_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SystemHealthIncident_component_key" ON "SystemHealthIncident"("component");
CREATE INDEX "SystemHealthIncident_active_openedAt_idx" ON "SystemHealthIncident"("active", "openedAt");
CREATE INDEX "SystemHealthIncident_updatedAt_idx" ON "SystemHealthIncident"("updatedAt");
