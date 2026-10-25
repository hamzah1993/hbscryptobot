import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LIVE_CONFIRMATION_VERSION } from '../trading/live-trading-safety.service';
import { StrategyService } from '../trading/strategy.service';
import {
  CreatePackageStrategyTemplateDto, CreateTradingPackageDto, PackageStrategyAllocationDto,
  UpdatePackageStrategyTemplateDto, UpdateTradingPackageDto,
} from './dto/trading-package.dto';
import {
  MIN_PACKAGE_BASE_ORDER_QUOTE, allocatedBudget, packageStrategyInput, sanitizePackageTemplate,
} from './package-template';

type TemplateRecord = { id: string; name: string; symbol: string; strategyTemplate: unknown; active: boolean };
type Allocation = { template: TemplateRecord; allocationPercent: number };

const packageWithStrategies = {
  strategies: { include: { template: true }, orderBy: { allocationPercent: 'desc' } },
} satisfies Prisma.TradingPackageInclude;

/**
 * Managed trading packages. An admin assigns weighted strategies from an
 * admin-only library to each package. Subscribing creates one Binance LIVE bot
 * per strategy on the subscriber's own exchange account; the platform never
 * holds user funds, so each user's profit and loss is their own bots' result.
 * Users only ever see the package and its combined results, never its strategies.
 */
@Injectable()
export class PackagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly strategies: StrategyService,
  ) {}

  // ---- Users -------------------------------------------------------------

  async listAvailable() {
    const packages = await this.prisma.tradingPackage.findMany({
      where: { active: true, strategies: { some: {} } },
      select: { id: true, name: true, description: true, amountQuote: true },
      orderBy: [{ sortOrder: 'asc' }, { amountQuote: 'asc' }],
    });
    return packages.map((pkg) => ({ ...pkg, amountQuote: Number(pkg.amountQuote) }));
  }

  async listMine(userId: string) {
    const subscriptions = await this.prisma.packageSubscription.findMany({
      where: { userId },
      include: {
        package: { select: { id: true, name: true } },
        strategies: { select: { id: true, status: true } },
      },
      orderBy: { startedAt: 'desc' },
    });
    const strategyIds = subscriptions.flatMap((item) => item.strategies.map((strategy) => strategy.id));
    const positions = strategyIds.length
      ? await this.prisma.tradingPosition.findMany({
          where: { userId, strategyId: { in: strategyIds } },
          select: { strategyId: true, status: true, realizedPnlQuote: true, totalCostQuote: true },
        })
      : [];

    return subscriptions.map(({ strategies, ...subscription }) => {
      const ids = new Set(strategies.map((strategy) => strategy.id));
      const own = positions.filter((position) => ids.has(position.strategyId));
      const open = own.filter((position) => position.status === 'OPEN');
      const realizedPnlQuote = own.reduce((sum, position) => sum + Number(position.realizedPnlQuote), 0);
      const amountQuote = Number(subscription.amountQuote);
      return {
        ...subscription,
        amountQuote,
        botStatus: this.combinedStatus(strategies.map((strategy) => strategy.status)),
        performance: {
          realizedPnlQuote,
          realizedReturnPercent: amountQuote > 0 ? (realizedPnlQuote / amountQuote) * 100 : 0,
          openPositions: open.length,
          openPositionCostQuote: open.reduce((sum, position) => sum + Number(position.totalCostQuote), 0),
          closedPositions: own.length - open.length,
        },
      };
    });
  }

  async subscribe(userId: string, packageId: string) {
    const pkg = await this.prisma.tradingPackage.findUnique({ where: { id: packageId }, include: packageWithStrategies });
    if (!pkg || !pkg.active || !pkg.strategies.length) throw new NotFoundException('Package not found');
    if (pkg.strategies.some((item) => !item.template.active)) {
      throw new ConflictException('This package is temporarily unavailable');
    }

    const credential = await this.prisma.exchangeCredential.findUnique({
      where: { userId_exchange_environment: { userId, exchange: 'BINANCE', environment: 'LIVE' } },
      select: { id: true },
    });
    if (!credential) {
      throw new BadRequestException('Connect your Binance LIVE API key (trading enabled, withdrawals disabled) before subscribing');
    }

    const amountQuote = Number(pkg.amountQuote);
    // Bot names are generic so the package's strategies stay private.
    const nameStem = `${pkg.name} package ${randomUUID().slice(0, 8)}`;
    const inputs = pkg.strategies.map((item, index) => packageStrategyInput(
      item.template,
      allocatedBudget(amountQuote, Number(item.allocationPercent)),
      pkg.strategies.length > 1 ? `${nameStem} #${index + 1}` : nameStem,
    ));

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.packageSubscription.findFirst({
          where: { userId, packageId, status: 'ACTIVE' },
          select: { id: true },
        });
        if (existing) throw new ConflictException('You already have an active subscription to this package');

        const subscription = await tx.packageSubscription.create({
          data: { userId, packageId, amountQuote: pkg.amountQuote },
        });
        for (const input of inputs) {
          await this.strategies.createWithClient(tx, userId, input, { packageSubscriptionId: subscription.id });
        }

        // The user-wide LIVE capital ceiling must cover every active package.
        // Raising it clears the LIVE confirmation, so the user explicitly
        // re-acknowledges the larger real-money exposure before any entry.
        const total = await tx.packageSubscription.aggregate({
          where: { userId, status: 'ACTIVE' },
          _sum: { amountQuote: true },
        });
        const requiredCeiling = Number(total._sum.amountQuote ?? 0);
        const profile = await tx.liveTradingSafetyProfile.findUnique({ where: { userId } });
        const currentCeiling = Number(profile?.capitalCeilingQuote ?? 0);
        let confirmationRequired = !profile?.confirmedAt || profile.confirmationVersion !== LIVE_CONFIRMATION_VERSION;
        if (currentCeiling < requiredCeiling) {
          await tx.liveTradingSafetyProfile.upsert({
            where: { userId },
            create: { userId, capitalCeilingQuote: requiredCeiling },
            update: { capitalCeilingQuote: requiredCeiling, confirmedAt: null, confirmationVersion: null },
          });
          confirmationRequired = true;
        }

        return {
          subscription: { ...subscription, amountQuote: Number(subscription.amountQuote) },
          botStatus: 'STOPPED' as const,
          capitalCeilingQuote: Math.max(currentCeiling, requiredCeiling),
          confirmationRequired,
        };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException('Another subscription change is in progress; please try again');
      }
      throw error;
    }
  }

  /** Starts or stops every bot of an active subscription together. */
  async setBotStatus(userId: string, subscriptionId: string, status: 'RUNNING' | 'STOPPED') {
    const subscription = await this.prisma.packageSubscription.findFirst({
      where: { id: subscriptionId, userId },
      select: { id: true, status: true },
    });
    if (!subscription) throw new NotFoundException('Subscription not found');
    if (subscription.status !== 'ACTIVE') throw new BadRequestException('This subscription has been cancelled');

    await this.prisma.tradingStrategy.updateMany({
      where: { userId, packageSubscriptionId: subscription.id },
      data: { status },
    });
    return { id: subscription.id, botStatus: status };
  }

  async cancel(userId: string, subscriptionId: string) {
    const subscription = await this.prisma.packageSubscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { strategies: { select: { id: true, status: true } } },
    });
    if (!subscription) throw new NotFoundException('Subscription not found');
    const { strategies, ...rest } = subscription;
    if (subscription.status === 'CANCELLED') return { ...rest, amountQuote: Number(rest.amountQuote) };

    if (strategies.some((strategy) => strategy.status === 'RUNNING')) {
      throw new BadRequestException('Stop the package before cancelling the subscription');
    }
    const openPositions = strategies.length
      ? await this.prisma.tradingPosition.count({
          where: { userId, strategyId: { in: strategies.map((strategy) => strategy.id) }, status: 'OPEN' },
        })
      : 0;
    if (openPositions) {
      throw new BadRequestException('Close the package\'s open positions (or use emergency exit) before cancelling');
    }

    // The capital ceiling is left unchanged: lowering it would only force a
    // needless re-confirmation, and the user can lower it themselves.
    return this.prisma.$transaction(async (tx) => {
      await tx.tradingStrategy.updateMany({ where: { userId, packageSubscriptionId: subscription.id }, data: { status: 'STOPPED' } });
      const cancelled = await tx.packageSubscription.update({
        where: { id: subscription.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      return { ...cancelled, amountQuote: Number(cancelled.amountQuote) };
    });
  }

  // ---- Admin: strategy library --------------------------------------------

  async adminListTemplates() {
    const templates = await this.prisma.packageStrategyTemplate.findMany({
      include: { packages: { select: { package: { select: { id: true, name: true } } } } },
      orderBy: { name: 'asc' },
    });
    return templates.map(({ packages, ...template }) => ({ ...template, packages: packages.map((item) => item.package) }));
  }

  async adminCreateTemplate(adminId: string, dto: CreatePackageStrategyTemplateDto) {
    const data = {
      name: dto.name.trim(),
      symbol: this.normalizeSymbol(dto.symbol),
      strategyTemplate: sanitizePackageTemplate(dto.strategyTemplate),
      active: dto.active ?? true,
    };
    this.assertBaseOrderMinimum(data.strategyTemplate.baseOrderQuote);
    const created = await this.writeUniquely('strategy', () => this.prisma.packageStrategyTemplate.create({ data }));
    await this.audit(adminId, 'PACKAGE_STRATEGY_CREATED', created.id, { name: created.name, symbol: created.symbol });
    return created;
  }

  /** Changes apply to future subscriptions only; existing bots keep the settings they were created with. */
  async adminUpdateTemplate(adminId: string, templateId: string, dto: UpdatePackageStrategyTemplateDto) {
    const existing = await this.prisma.packageStrategyTemplate.findUnique({
      where: { id: templateId },
      include: { packages: { include: { package: { include: packageWithStrategies } } } },
    });
    if (!existing) throw new NotFoundException('Strategy not found');

    const data = {
      name: dto.name?.trim() ?? existing.name,
      symbol: dto.symbol ? this.normalizeSymbol(dto.symbol) : existing.symbol,
      strategyTemplate: sanitizePackageTemplate(dto.strategyTemplate ?? existing.strategyTemplate),
      active: dto.active ?? existing.active,
    };
    this.assertBaseOrderMinimum(data.strategyTemplate.baseOrderQuote);

    const usedByActivePackage = existing.packages.filter((item) => item.package.active);
    if (!data.active && usedByActivePackage.length) {
      throw new BadRequestException(
        `Remove this strategy from active package(s) first: ${usedByActivePackage.map((item) => item.package.name).join(', ')}`,
      );
    }
    // Every package using this strategy must still be fundable with the new settings.
    for (const { package: pkg } of existing.packages) {
      this.validateAllocations(pkg.name, Number(pkg.amountQuote), pkg.strategies.map((item) => ({
        template: item.templateId === templateId ? { ...existing, ...data } : item.template,
        allocationPercent: Number(item.allocationPercent),
      })));
    }

    const updated = await this.writeUniquely('strategy', () => this.prisma.packageStrategyTemplate.update({ where: { id: templateId }, data }));
    await this.audit(adminId, 'PACKAGE_STRATEGY_UPDATED', templateId, { changed: Object.keys(dto) });
    return updated;
  }

  // ---- Admin: packages ----------------------------------------------------

  async adminList() {
    const packages = await this.prisma.tradingPackage.findMany({
      include: packageWithStrategies,
      orderBy: [{ sortOrder: 'asc' }, { amountQuote: 'asc' }],
    });
    const counts = await this.prisma.packageSubscription.groupBy({
      by: ['packageId'],
      where: { status: 'ACTIVE' },
      _count: { _all: true },
      _sum: { amountQuote: true },
    });
    return packages.map((pkg) => {
      const count = counts.find((item) => item.packageId === pkg.id);
      return {
        ...this.adminPackageView(pkg),
        activeSubscriptions: count?._count._all ?? 0,
        activeCapitalQuote: Number(count?._sum.amountQuote ?? 0),
      };
    });
  }

  async adminCreate(adminId: string, dto: CreateTradingPackageDto) {
    const name = dto.name.trim();
    const allocations = await this.resolveAllocations(dto.strategies);
    this.validateAllocations(name, dto.amountQuote, allocations);

    const created = await this.writeUniquely('package', () => this.prisma.tradingPackage.create({
      data: {
        name,
        description: dto.description?.trim() || null,
        amountQuote: dto.amountQuote,
        active: dto.active ?? true,
        sortOrder: dto.sortOrder ?? 0,
        strategies: { create: dto.strategies.map((item) => ({ templateId: item.templateId, allocationPercent: item.allocationPercent })) },
      },
      include: packageWithStrategies,
    }));
    await this.audit(adminId, 'TRADING_PACKAGE_CREATED', created.id, { name: created.name, amountQuote: dto.amountQuote, strategies: dto.strategies });
    return this.adminPackageView(created);
  }

  /** Edits apply to future subscriptions only; existing package bots keep the settings they were created with. */
  async adminUpdate(adminId: string, packageId: string, dto: UpdateTradingPackageDto) {
    const existing = await this.prisma.tradingPackage.findUnique({ where: { id: packageId }, include: packageWithStrategies });
    if (!existing) throw new NotFoundException('Package not found');

    const name = dto.name?.trim() ?? existing.name;
    const amountQuote = dto.amountQuote ?? Number(existing.amountQuote);
    const allocations = dto.strategies
      ? await this.resolveAllocations(dto.strategies)
      : existing.strategies.map((item) => ({ template: item.template, allocationPercent: Number(item.allocationPercent) }));
    this.validateAllocations(name, amountQuote, allocations);
    const inactive = allocations.find((item) => !item.template.active);
    if ((dto.active ?? existing.active) && inactive) {
      throw new BadRequestException(`Strategy "${inactive.template.name}" is inactive; reactivate or replace it first`);
    }

    const updated = await this.writeUniquely('package', () => this.prisma.$transaction(async (tx) => {
      if (dto.strategies) {
        await tx.tradingPackageStrategy.deleteMany({ where: { packageId } });
        await tx.tradingPackageStrategy.createMany({
          data: dto.strategies.map((item) => ({ packageId, templateId: item.templateId, allocationPercent: item.allocationPercent })),
        });
      }
      return tx.tradingPackage.update({
        where: { id: packageId },
        data: {
          name,
          description: dto.description !== undefined ? dto.description.trim() || null : existing.description,
          amountQuote,
          active: dto.active ?? existing.active,
          sortOrder: dto.sortOrder ?? existing.sortOrder,
        },
        include: packageWithStrategies,
      });
    }));
    await this.audit(adminId, 'TRADING_PACKAGE_UPDATED', packageId, { changed: Object.keys(dto), strategies: dto.strategies });
    return this.adminPackageView(updated);
  }

  // ---- Helpers ------------------------------------------------------------

  private async resolveAllocations(items: PackageStrategyAllocationDto[]): Promise<Allocation[]> {
    const ids = items.map((item) => item.templateId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Each strategy can be assigned to a package only once');
    const templates = await this.prisma.packageStrategyTemplate.findMany({ where: { id: { in: ids } } });
    return items.map((item) => {
      const template = templates.find((candidate) => candidate.id === item.templateId);
      if (!template) throw new BadRequestException('Unknown strategy assigned to the package');
      if (!template.active) throw new BadRequestException(`Strategy "${template.name}" is inactive`);
      return { template, allocationPercent: item.allocationPercent };
    });
  }

  /**
   * Allocations must add up to 100% and every strategy must be able to fund
   * its base order from its share. Strategy validation alone would clip a plan
   * to its budget, which is wrong for a fixed-amount product.
   */
  private validateAllocations(packageName: string, amountQuote: number, allocations: Allocation[]) {
    if (!allocations.length) throw new BadRequestException('Assign at least one strategy to the package');
    const totalPercent = allocations.reduce((sum, item) => sum + item.allocationPercent, 0);
    if (Math.abs(totalPercent - 100) > 0.001) {
      throw new BadRequestException(`Strategy allocations must add up to 100% (currently ${Number(totalPercent.toFixed(2))}%)`);
    }
    for (const { template, allocationPercent } of allocations) {
      const budget = allocatedBudget(amountQuote, allocationPercent);
      const input = packageStrategyInput(template, budget, `${packageName} package`);
      this.assertBaseOrderMinimum(input.baseOrderQuote);
      if (input.baseOrderQuote > budget) {
        throw new BadRequestException(
          `Strategy "${template.name}" needs at least ${input.baseOrderQuote} USDT but its ${allocationPercent}% share of "${packageName}" is ${budget} USDT`,
        );
      }
      this.strategies.validateInput(input);
    }
  }

  private assertBaseOrderMinimum(baseOrderQuote: number) {
    if (baseOrderQuote < MIN_PACKAGE_BASE_ORDER_QUOTE) {
      throw new BadRequestException(`Strategy base order must be at least ${MIN_PACKAGE_BASE_ORDER_QUOTE} USDT to meet Binance's minimum order value`);
    }
  }

  private combinedStatus(statuses: string[]) {
    if (!statuses.length) return 'STOPPED';
    if (statuses.every((status) => status === 'RUNNING')) return 'RUNNING';
    if (statuses.some((status) => status === 'RUNNING')) return 'PARTIAL';
    return 'STOPPED';
  }

  private adminPackageView(pkg: Prisma.TradingPackageGetPayload<{ include: typeof packageWithStrategies }>) {
    const amountQuote = Number(pkg.amountQuote);
    return {
      id: pkg.id,
      name: pkg.name,
      description: pkg.description,
      amountQuote,
      active: pkg.active,
      sortOrder: pkg.sortOrder,
      createdAt: pkg.createdAt,
      updatedAt: pkg.updatedAt,
      strategies: pkg.strategies.map((item) => ({
        templateId: item.templateId,
        name: item.template.name,
        symbol: item.template.symbol,
        active: item.template.active,
        allocationPercent: Number(item.allocationPercent),
        budgetQuote: allocatedBudget(amountQuote, Number(item.allocationPercent)),
      })),
    };
  }

  private normalizeSymbol(symbol: string) {
    return symbol.replace(/[^a-z0-9]/gi, '').toUpperCase();
  }

  private async writeUniquely<T>(kind: 'package' | 'strategy', write: () => Promise<T>) {
    try {
      return await write();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(`A ${kind} with this name already exists`);
      }
      throw error;
    }
  }

  private async audit(adminId: string, action: string, target: string, metadata: Record<string, unknown>) {
    await this.prisma.adminAuditEvent.create({
      data: { adminId, action, target, metadata: metadata as Prisma.InputJsonValue },
    });
  }
}
