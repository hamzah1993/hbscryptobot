import { RiskBudgetService } from './risk-budget.service';

describe('RiskBudgetService independent start level', () => {
  const service = new RiskBudgetService();
  const base = {
    riskBudgetQuote: 5000,
    baseOrderQuote: 100,
    maxDcaOrders: 6,
    dcaStepPercent: 2,
    dcaMultiplier: 1.5,
    takeProfitPercent: 1.5,
  };

  it.each([3, 5, 7])('marks only level %s and later as independent', (independentFromLevel) => {
    const plan = service.buildPlan({ ...base, independentFromLevel });

    expect(plan.map((level) => [level.level, level.independent])).toEqual(
      plan.map((level) => [level.level, level.level >= independentFromLevel]),
    );
  });

  it.each([1, 1.5, 9])('rejects invalid independent start level %s', (independentFromLevel) => {
    expect(() => service.buildPlan({ ...base, independentFromLevel })).toThrow(
      'Independent level must be an integer between 2 and maxDcaOrders + 2',
    );
  });

  it.each([-1, 1.5, 51])('rejects invalid maximum DCA order count %s', (maxDcaOrders) => {
    expect(() => service.buildPlan({ ...base, maxDcaOrders, independentFromLevel: 5 })).toThrow(
      'maxDcaOrders must be an integer between 0 and 50',
    );
  });

  it('uses the configured multiplier for each DCA level instead of geometric sizing', () => {
    const plan = service.buildPlan({
      ...base,
      maxDcaOrders: 5,
      dcaMultipliers: [1, 1.5, 2, 3, 5],
      independentFromLevel: 5,
    });
    expect(plan.map((level) => level.quoteAmount)).toEqual([100, 100, 150, 200, 300, 500]);
  });

  it('keeps every one of 100 crash simulations inside its pre-allocated quote budget', () => {
    for (let positionIndex = 0; positionIndex < 100; positionIndex += 1) {
      const riskBudgetQuote = 1000 + positionIndex;
      const plan = service.buildPlan({
        ...base,
        riskBudgetQuote,
        maxDcaOrders: 5,
        dcaMultipliers: [1, 1.5, 2, 3, 5],
        independentFromLevel: 5,
      });
      const crashPercent = (positionIndex / 99) * 50;
      const simulatedPrice = 100 * (1 - crashPercent / 100);
      expect(simulatedPrice).toBeGreaterThanOrEqual(50);
      expect(plan.reduce((sum, level) => sum + level.quoteAmount, 0)).toBeLessThanOrEqual(riskBudgetQuote + Number.EPSILON);
    }
  });
});
