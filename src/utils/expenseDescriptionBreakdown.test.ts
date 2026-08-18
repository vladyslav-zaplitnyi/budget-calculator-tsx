import {
  EXPENSE_REMAINDER_KEY,
  UNCATEGORIZED_KEY,
  buildExpenseCategoryBreakdown,
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

test('merges different descriptions that share one category', () => {
  const expenses = [
    { description: 'Заселення', category: 'other', convertedAmount: 2000 },
    { description: 'Житло', category: 'other', convertedAmount: 1000 },
    { description: 'Житло', category: 'other', convertedAmount: 500 },
    { description: 'Житло', category: 'other', convertedAmount: 240 },
    { description: 'Продукти', category: 'groceries', convertedAmount: 2594 }
  ];

  const groups = buildExpenseCategoryBreakdown(expenses);
  const other = groups.find((group) => group.id === 'other');
  const groceries = groups.find((group) => group.id === 'groceries');

  expect(groups).toHaveLength(2);
  expect(other?.count).toBe(4);
  expect(other?.totalAmount).toBeCloseTo(3740, 5);
  expect(other?.percentage).toBeCloseTo((3740 / 6334) * 100, 5);
  expect(groceries?.count).toBe(1);
  expect(groceries?.totalAmount).toBeCloseTo(2594, 5);
});

test('puts untagged expenses into one uncategorized group', () => {
  const expenses = [
    { description: 'Таксі', convertedAmount: 20 },
    { description: 'Кава', category: '  ', convertedAmount: 5 },
    { description: 'Обід', category: 'cafe', convertedAmount: 15 }
  ];

  const groups = buildExpenseCategoryBreakdown(expenses);

  expect(groups.map((group) => group.id)).toEqual([UNCATEGORIZED_KEY, 'cafe']);
  expect(groups[0].count).toBe(2);
  expect(groups[0].totalAmount).toBeCloseTo(25, 5);
});
