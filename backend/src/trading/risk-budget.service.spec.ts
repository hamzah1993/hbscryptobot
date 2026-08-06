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
});
