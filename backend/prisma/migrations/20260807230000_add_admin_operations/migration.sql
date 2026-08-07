CREATE TABLE "AdminAuditEvent" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "target" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SystemMaintenanceState" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "active" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT,
  "startedBy" TEXT,
  "startedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SystemMaintenanceState_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminAuditEvent_adminId_createdAt_idx" ON "AdminAuditEvent"("adminId", "createdAt");
CREATE INDEX "AdminAuditEvent_action_createdAt_idx" ON "AdminAuditEvent"("action", "createdAt");
ALTER TABLE "AdminAuditEvent" ADD CONSTRAINT "AdminAuditEvent_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
