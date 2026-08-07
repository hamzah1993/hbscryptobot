import { Body, Controller, Get, Param, Post, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { createReadStream } from 'fs';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { AdminSessionGuard } from './admin-session.guard';
import { AdminService } from './admin.service';
import { SystemMonitoringService } from './system-monitoring.service';

type AdminRequest = Request & { user: { sub: string } };

@Controller('super/admin/control')
@UseGuards(JwtAuthGuard, AdminGuard, AdminSessionGuard)
export class AdminController {
  constructor(private readonly admin: AdminService, private readonly monitoring: SystemMonitoringService) {}

  @Get('health') health() { return this.admin.health(); }
  @Get('backups') backups() { return this.admin.listBackups(); }
  @Get('audit') audit(@Query('limit') limit?: string) { return this.admin.listAudit(Number(limit) || 100); }
  @Get('monitoring') monitoringStatus() { return this.monitoring.status(); }

  @Post('monitoring/check')
  async runMonitoringCheck(@Req() req: AdminRequest) {
    const result = await this.monitoring.runCheck();
    await this.admin.audit(req.user.sub, 'SYSTEM_HEALTH_CHECK_RUN', undefined, { status: result.status });
    return result;
  }

  @Post('backups')
  createBackup(@Req() req: AdminRequest) { return this.admin.createBackup(req.user.sub); }

  @Get('backups/:filename/download')
  async download(@Param('filename') filename: string, @Res({ passthrough: true }) response: Response) {
    const path = await this.admin.backupPath(filename);
    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return new StreamableFile(createReadStream(path));
  }

  @Post('restore')
  restore(@Req() req: AdminRequest, @Body() body: { filename?: string; confirmation?: string }) {
    return this.admin.restore(req.user.sub, body.filename ?? '', body.confirmation ?? '');
  }
}
