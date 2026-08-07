import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { execFile } from 'child_process';
import { mkdir, readdir, readFile, stat } from 'fs/promises';
import { basename, join } from 'path';
import { promisify } from 'util';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { RedisLockService } from '../redis/redis-lock.service';
import { MaintenanceService } from './maintenance.service';

const execFileAsync = promisify(execFile);

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisLockService,
    private readonly maintenance: MaintenanceService,
  ) {}

  private backupDirectory() { return process.env.BACKUP_DIRECTORY ?? join(process.cwd(), 'backups'); }
  private databaseUrl() {
    if (!process.env.DATABASE_URL) throw new InternalServerErrorException('DATABASE_URL is not configured');
    return process.env.DATABASE_URL;
  }

  async audit(adminId: string, action: string, target?: string, metadata?: Record<string, unknown>) {
    await this.prisma.adminAuditEvent.create({ data: { adminId, action, target, metadata: metadata as Prisma.InputJsonValue | undefined } });
  }

  async health() {
    let database: 'HEALTHY' | 'ERROR' = 'HEALTHY';
    let redis: 'HEALTHY' | 'ERROR' = 'HEALTHY';
    try { await this.prisma.$queryRaw`SELECT 1`; } catch { database = 'ERROR'; }
    try { await this.redis.ping(); } catch { redis = 'ERROR'; }
    const runningStrategies = await this.prisma.tradingStrategy.count({ where: { status: 'RUNNING' } }).catch(() => -1);
    const maintenance = await this.maintenance.status().catch(() => null);
    let backupTools: 'AVAILABLE' | 'MISSING' = 'AVAILABLE';
    try {
      await Promise.all([
        execFileAsync('pg_dump', ['--version'], { timeout: 5_000 }),
        execFileAsync('pg_restore', ['--version'], { timeout: 5_000 }),
      ]);
    } catch { backupTools = 'MISSING'; }
    return {
      backend: 'HEALTHY', database, redis, scheduler: 'ENABLED', runningStrategies,
      backupTools, backupDirectory: this.backupDirectory(), persistentBackupDirectoryConfigured: Boolean(process.env.BACKUP_DIRECTORY),
      automaticBackupsEnabled: (process.env.AUTO_BACKUPS_ENABLED ?? 'false').toLowerCase() === 'true',
      maintenance: maintenance ?? { active: false }, timestamp: new Date().toISOString(),
    };
  }

  async createBackup(adminId: string, reason = 'MANUAL') {
    const directory = this.backupDirectory();
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const filename = `hbs-${timestamp}.dump`;
    const path = join(directory, filename);
    try {
      await execFileAsync('pg_dump', ['--format=custom', '--compress=9', '--no-owner', '--no-privileges', '--file', path, this.databaseUrl()], { timeout: 10 * 60_000, maxBuffer: 1024 * 1024 });
      await execFileAsync('pg_restore', ['--list', path], { timeout: 60_000, maxBuffer: 10 * 1024 * 1024 });
      const checksum = createHash('sha256').update(await readFile(path)).digest('hex');
      const info = await stat(path);
      await this.audit(adminId, 'DATABASE_BACKUP_CREATED', filename, { reason, checksum, sizeBytes: info.size });
      return { filename, sizeBytes: info.size, checksum, createdAt: info.mtime.toISOString(), verified: true };
    } catch (error) {
      throw new InternalServerErrorException(`Database backup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async listBackups() {
    const directory = this.backupDirectory();
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const names = (await readdir(directory)).filter((name) => /^hbs-\d{8}T\d{6}Z\.dump$/.test(name));
    const backups = await Promise.all(names.map(async (filename) => {
      const path = join(directory, filename);
      const info = await stat(path);
      return { filename, sizeBytes: info.size, createdAt: info.mtime.toISOString() };
    }));
    return backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async backupPath(filename: string) {
    const safe = basename(filename);
    if (safe !== filename || !/^hbs-\d{8}T\d{6}Z\.dump$/.test(safe)) throw new BadRequestException('Invalid backup filename');
    const path = join(this.backupDirectory(), safe);
    try { await stat(path); } catch { throw new NotFoundException('Backup not found'); }
    return path;
  }

  async restore(adminId: string, filename: string, confirmation: string) {
    const path = await this.backupPath(filename);
    if (confirmation !== `RESTORE ${filename}`) throw new BadRequestException(`Type RESTORE ${filename} to confirm`);
    await execFileAsync('pg_restore', ['--list', path], { timeout: 60_000, maxBuffer: 10 * 1024 * 1024 });
    await this.maintenance.enable(adminId, `Restoring ${filename}`);
    const safetyBackup = await this.createBackup(adminId, 'PRE_RESTORE_SAFETY');
    try {
      await execFileAsync('pg_restore', ['--clean', '--if-exists', '--no-owner', '--no-privileges', '--exit-on-error', '--single-transaction', '--dbname', this.databaseUrl(), path], { timeout: 15 * 60_000, maxBuffer: 10 * 1024 * 1024 });
      await this.prisma.tradingStrategy.updateMany({ where: { paperTrading: false }, data: { status: 'STOPPED' } });
      await this.maintenance.disable();
      await this.audit(adminId, 'DATABASE_RESTORED', filename, { safetyBackup: safetyBackup.filename });
      return { restored: true, filename, safetyBackup: safetyBackup.filename, tradingResumed: false };
    } catch (error) {
      throw new InternalServerErrorException(`Restore failed; maintenance mode remains active: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  listAudit(limit = 100) {
    return this.prisma.adminAuditEvent.findMany({ orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(limit, 1), 200), select: { id: true, action: true, target: true, metadata: true, createdAt: true, admin: { select: { id: true, email: true, fullName: true } } } });
  }
}
