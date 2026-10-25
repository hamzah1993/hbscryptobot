import { BadRequestException, HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ExchangeName } from '@prisma/client';
import type { BinanceKlineInterval } from '../exchange/binance/binance.service';
import type { BacktestSimulationResult } from '../trading/backtest-buy-hold-simulator.service';
import { BacktestDcaSimulatorService } from '../trading/backtest-dca-simulator.service';
import { BinanceHistoricalCandleImporterService } from '../trading/binance-historical-candle-importer.service';
import { timeframeMinutes, type ConfirmTimeframe } from '../trading/entry-signal';
import { EntrySignalService } from '../trading/entry-signal.service';
import { HistoricalCandleQueryService } from '../trading/historical-candle-query.service';
import { StrategyService } from '../trading/strategy.service';
import { sanitizePackageTemplate } from './package-template';

const MAX_BACKTEST_CANDLES = 60_000;
const PAGE_SIZE = 5000;
/** Binance spot taker fee per side, applied to every simulated buy and sell. */
const FEE_PERCENT = 0.1;

export type StrategyBacktestRequest = { symbol: string; strategyTemplate: unknown; days: number; capitalQuote: number };

/**
 * Backtests admin strategy settings (saved or still being edited) on Binance
 * history, side by side with the same settings without the dip and DCA
 * confirmation rules, so an admin can see whether the rules help.
 */
@Injectable()
export class StrategyBacktestService {
  constructor(
    private readonly strategies: StrategyService,
    private readonly candles: HistoricalCandleQueryService,
    private readonly importer: BinanceHistoricalCandleImporterService,
    private readonly simulator: BacktestDcaSimulatorService,
    private readonly entrySignal: EntrySignalService,
  ) {}

  async run(request: StrategyBacktestRequest) {
    const symbol = request.symbol.replace(/[^a-z0-9]/gi, '').toUpperCase();
    if (!(request.capitalQuote >= 10)) throw new BadRequestException('Backtest capital must be at least 10 USDT');
    const settings = this.strategies.validateInput({
      ...sanitizePackageTemplate(request.strategyTemplate),
      name: 'backtest', symbol, paperTrading: true,
      riskBudgetQuote: request.capitalQuote, maxStrategyExposureQuote: request.capitalQuote,
    });

    const interval = settings.confirmTimeframe as ConfirmTimeframe;
    const minutes = timeframeMinutes(interval);
    const maxDays = Math.floor((MAX_BACKTEST_CANDLES * minutes) / 1440);
    if (!Number.isInteger(request.days) || request.days < 1 || request.days > maxDays) {
      throw new BadRequestException(`Backtest length must be 1 to ${maxDays} days on ${interval} candles`);
    }

    const endTime = new Date(Math.floor(Date.now() / (minutes * 60_000)) * minutes * 60_000);
    const startTime = new Date(endTime.getTime() - request.days * 86_400_000);
    const candles = await this.loadCandles(symbol, interval, startTime, endTime);
    if (candles.length < 50) throw new BadRequestException(`Not enough ${interval} history for ${symbol}`);

    const usesRules = settings.entryMode === 'DIP_CONFIRMATION' || settings.dcaRequiresConfirmation;
    const common = {
      initialCapital: request.capitalQuote,
      candles,
      maxEntries: settings.maxDcaOrders + 1,
      priceDeviationPercent: settings.dcaStepPercent,
      volumeMultiplier: settings.dcaMultiplier,
      volumeMultipliers: settings.dcaMultipliers,
      takeProfitPercent: settings.takeProfitPercent,
      subPositionTriggerPercent: settings.subPositionTriggerPercent,
      subPositionTakeProfitPercent: settings.subPositionTakeProfitPercent,
      independentFromLevel: settings.independentFromLevel,
      riskBudgetQuote: request.capitalQuote,
      baseOrderQuote: settings.baseOrderQuote,
      recoveryEnabled: settings.recoveryEnabled,
      recoveryMaxOrders: settings.recoveryMaxOrders,
      recoveryStepPercents: settings.recoveryStepPercents,
      recoveryMultipliers: settings.recoveryMultipliers,
      recoveryTakeProfitPercent: settings.recoveryTakeProfitPercent,
      feePercent: FEE_PERCENT,
      continuousCycles: true,
      stopLossPercent: settings.stopLossPercent,
    };
    const withRules = this.simulator.simulate({
      ...common,
      signalConfig: this.entrySignal.configFrom(settings),
      dipEntry: settings.entryMode === 'DIP_CONFIRMATION',
      dcaRequiresConfirmation: settings.dcaRequiresConfirmation,
    });
    const withoutRules = usesRules ? this.simulator.simulate(common) : null;
    const first = Number(candles[0].close);
    const last = Number(candles[candles.length - 1].close);

    return {
      symbol, interval, from: candles[0].openTime, to: candles[candles.length - 1].openTime, candles: candles.length,
      capitalQuote: request.capitalQuote, feePercent: FEE_PERCENT,
      marketChangePercent: ((last - first) / first) * 100,
      strategy: this.summary(withRules),
      withoutEntryRules: withoutRules ? this.summary(withoutRules) : null,
    };
  }

  private summary(result: BacktestSimulationResult) {
    const exits = (result.trades ?? []).filter((trade) => trade.realizedPnlQuote !== undefined);
    const wins = exits.filter((trade) => Number(trade.realizedPnlQuote) > 0).length;
    return {
      returnPercent: Number(result.returnPercent),
      profitQuote: Number(result.realizedPnlQuote),
      maxDrawdownPercent: Number(result.maxDrawdownPercent),
      cycles: result.cycleCount ?? 0,
      stopLosses: result.stopLossCount ?? 0,
      trades: result.tradeCount,
      profitableExitPercent: exits.length ? (wins / exits.length) * 100 : 0,
    };
  }

  /** Uses stored candles, importing from Binance first when the range is incomplete. */
  private async loadCandles(symbol: string, interval: ConfirmTimeframe, startTime: Date, endTime: Date) {
    const expected = Math.floor((endTime.getTime() - startTime.getTime()) / (timeframeMinutes(interval) * 60_000));
    let candles = await this.readCandles(symbol, interval, startTime, endTime);
    if (candles.length < expected * 0.98) {
      try {
        await this.importer.import({
          symbol, interval: interval as BinanceKlineInterval, limit: 1000,
          startTime: startTime.getTime(), endTime: endTime.getTime(), maxPages: Math.ceil(expected / 1000) + 2,
        });
      } catch (error) {
        if (error instanceof HttpException) throw error;
        throw new ServiceUnavailableException(
          `Could not download ${symbol} ${interval} history from Binance (${error instanceof Error ? error.message : String(error)}). Try again shortly.`,
        );
      }
      candles = await this.readCandles(symbol, interval, startTime, endTime);
    }
    return candles;
  }

  private async readCandles(symbol: string, interval: string, startTime: Date, endTime: Date) {
    const all = [];
    let cursor = startTime;
    while (cursor <= endTime) {
      const page = await this.candles.list({ exchange: ExchangeName.BINANCE, symbol, interval, startTime: cursor, endTime, limit: PAGE_SIZE });
      all.push(...page);
      if (page.length < PAGE_SIZE) break;
      cursor = new Date(page[page.length - 1].openTime.getTime() + 1);
    }
    return all;
  }
}
