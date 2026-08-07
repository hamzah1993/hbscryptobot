import { Module } from '@nestjs/common';
import { AdminBackupScheduler } from './admin-backup.scheduler';
import { AdminAccessController } from './admin-access.controller';
import { AdminAccessService } from './admin-access.service';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { AdminSessionGuard } from './admin-session.guard';
import { AdminService } from './admin.service';
import { MaintenanceService } from './maintenance.service';

@Module({
  controllers: [AdminAccessController, AdminController],
  providers: [AdminAccessService, AdminBootstrapService, AdminGuard, AdminSessionGuard, AdminService, AdminBackupScheduler, MaintenanceService],
  exports: [MaintenanceService],
})
export class AdminModule {}
