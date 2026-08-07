import { Module } from '@nestjs/common';
import { AdminBackupScheduler } from './admin-backup.scheduler';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { MaintenanceService } from './maintenance.service';

@Module({
  controllers: [AdminController],
  providers: [AdminGuard, AdminService, AdminBackupScheduler, MaintenanceService],
  exports: [MaintenanceService],
})
export class AdminModule {}
