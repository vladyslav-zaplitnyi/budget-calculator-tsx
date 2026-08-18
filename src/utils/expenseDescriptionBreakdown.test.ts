import {
  EXPENSE_REMAINDER_KEY,
  buildExpenseDescriptionBreakdown
} from './expenseDescriptionBreakdown';

test('keeps all groups when there are at most 7 names', () => {
  const expenses = [
    { description: 'A', convertedAmount: 70 },
    { description: 'B', convertedAmount: 60 },
    { description: 'C', convertedAmount: 50 },
    { description: 'D', convertedAmount: 40 },
    { description: 'E', convertedAmount: 30 },
    { description: 'F', convertedAmount: 20 },
    { description: 'G', convertedAmount: 10 }
  ];

  const { groups, remainderGroups } = buildExpenseDescriptionBreakdown(expenses);

  expect(groups).toHaveLength(7);
  expect(remainderGroups).toHaveLength(0);
  expect(groups.some((group) => group.name === EXPENSE_REMAINDER_KEY)).toBe(false);
});

test('remainder bucket equals the hidden description groups, not a category named Other', () => {
  const expenses = [
    { description: 'Rent', convertedAmount: 2000 },
    { description: 'Housing', convertedAmount: 1740 },
    { description: 'Food', convertedAmount: 750 },
    { description: 'Insurance', convertedAmount: 350 },
    { description: 'Utilities', convertedAmount: 314 },
    { description: 'Cursor', convertedAmount: 265 },
    { description: 'Natalia', convertedAmount: 100 },
    { description: 'Yakaboo', convertedAmount: 20 },
    { description: 'Yakaboo', convertedAmount: 15.62 },
    { description: 'Gift', convertedAmount: 19.62 }
  ];

  const { groups, remainderGroups } = buildExpenseDescriptionBreakdown(expenses);
  const remainder = groups.find((group) => group.name === EXPENSE_REMAINDER_KEY);

  expect(remainder).toBeDefined();
  expect(remainderGroups.map((group) => group.name)).toEqual(['Natalia', 'Yakaboo', 'Gift']);
  expect(remainder?.count).toBe(4);
  expect(remainder?.totalAmount).toBeCloseTo(155.24, 5);
  expect(remainderGroups.reduce((sum, group) => sum + group.totalAmount, 0)).toBeCloseTo(
    remainder!.totalAmount,
    5
  );
  expect(remainderGroups.reduce((sum, group) => sum + group.count, 0)).toBe(remainder?.count);
});

test('does not collapse when collapseAfter is 0', () => {
  const expenses = Array.from({ length: 10 }, (_, index) => ({
    description: `Item ${index}`,
    convertedAmount: 10 - index
  }));

  const { groups, remainderGroups } = buildExpenseDescriptionBreakdown(expenses, {
    collapseAfter: 0
  });

  expect(groups).toHaveLength(10);
  expect(remainderGroups).toHaveLength(0);
});
