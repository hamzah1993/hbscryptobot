import { SystemHeartbeatService } from './system-heartbeat.service';
import { SystemMonitoringService } from './system-monitoring.service';

describe('SystemMonitoringService', () => {
  const prisma = {
    systemHealthIncident: {
      findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn(), create: jest.fn(),
    },
    user: { findUnique: jest.fn(), findFirst: jest.fn() },
  } as any;
  const redis = { acquire: jest.fn(), release: jest.fn(), ping: jest.fn() } as any;
  const notifications = { publish: jest.fn() } as any;
  const service = new SystemMonitoringService(prisma, redis, notifications, new SystemHeartbeatService());

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ADMIN_EMAIL = 'admin@example.com';
    prisma.user.findUnique.mockResolvedValue({ id: 'admin-1' });
  });

  afterAll(() => { delete process.env.ADMIN_EMAIL; });

  it('alerts once while an incident remains open', async () => {
    const check = { component: 'REDIS', status: 'ERROR', severity: 'CRITICAL', message: 'Redis health check failed.' } as const;
    prisma.systemHealthIncident.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'incident-1', component: 'REDIS', active: true });
    prisma.systemHealthIncident.upsert.mockResolvedValue({ id: 'incident-1' });
    prisma.systemHealthIncident.update.mockResolvedValue({});

    await (service as any).reconcileIncident(check, new Date('2026-08-07T00:00:00Z'));
    await (service as any).reconcileIncident(check, new Date('2026-08-07T00:01:00Z'));

    expect(notifications.publish).toHaveBeenCalledTimes(1);
    expect(notifications.publish).toHaveBeenCalledWith(expect.objectContaining({
      event: 'SYSTEM_HEALTH_INCIDENT_OPENED', severity: 'CRITICAL', userId: 'admin-1', metadata: { component: 'REDIS' },
    }));
  });

  it('sends one recovery notification when an open incident resolves', async () => {
    const check = { component: 'REDIS', status: 'HEALTHY', severity: 'CRITICAL', message: 'Redis is reachable.' } as const;
    prisma.systemHealthIncident.findUnique.mockResolvedValue({ id: 'incident-1', component: 'REDIS', active: true });
    prisma.systemHealthIncident.update.mockResolvedValue({});

    await (service as any).reconcileIncident(check, new Date('2026-08-07T00:02:00Z'));

    expect(notifications.publish).toHaveBeenCalledTimes(1);
    expect(notifications.publish).toHaveBeenCalledWith(expect.objectContaining({
      event: 'SYSTEM_HEALTH_INCIDENT_RESOLVED', severity: 'WARNING', userId: 'admin-1', metadata: { component: 'REDIS' },
    }));
    expect(prisma.systemHealthIncident.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'incident-1' }, data: expect.objectContaining({ active: false, consecutiveFailures: 0 }),
    }));
  });
});
