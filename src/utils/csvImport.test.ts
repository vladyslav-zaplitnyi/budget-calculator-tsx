import { filterExistingCsvTransactions, parseTransactionsCsv } from './csvImport';

const MONOBANK_CSV = `"Дата i час операції","Деталі операції",MCC,"Сума в валюті картки (USD)","Сума в валюті операції",Валюта,Курс,"Сума комісій (USD)","Сума кешбеку (USD)","Залишок після операції"
"22.07.2026 23:15:55","Wizz Air",3301,-64.67,-56.38,EUR,0.8718,—,—,506.13
"22.07.2026 16:19:07",Lidl,5411,-2.74,-2.39,EUR,0.8722,—,1.22,792.24
"07.07.2026 10:18:17","Від: PAYONEER INC",4829,1073.79,1073.79,USD,—,—,—,1165.13
"01.07.2026 12:57:08","Переказ на картку",4829,-98.48,-86.0,EUR,1.145001,—,—,110.48
`;

describe('parseTransactionsCsv', () => {
  it('парсить виписку Monobank: валюта картки із заголовка, тип за знаком суми', () => {
    const result = parseTransactionsCsv(MONOBANK_CSV, 'UAH');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.transactions).toHaveLength(4);
    expect(result.detected.currencyFromHeader).toBe('USD');

    // Відсортовано хронологічно
    const [first, income, , last] = result.transactions;
    expect(first.day).toBe(1);
    expect(first.type).toBe('expense');
    expect(first.amount).toBe(98.48);
    expect(first.currency).toBe('USD');
    expect(first.month).toBe(6); // липень (0-11)
    expect(first.year).toBe(2026);

    expect(income.type).toBe('income');
    expect(income.amount).toBe(1073.79);
    expect(income.description).toBe('Від: PAYONEER INC');

    expect(last.day).toBe(22);
    expect(last.description).toBe('Wizz Air');
  });

  it('парсить загальний CSV із роздільником ";" і окремою колонкою валюти', () => {
    const csv = `Date;Description;Amount;Currency
2026-07-05;Supermarket;-12,50;EUR
05.07.2026;Refund;3,00;EUR
`;
    const result = parseTransactionsCsv(csv, 'UAH');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0].currency).toBe('EUR');
    expect(result.transactions[0].amount).toBe(12.5);
    expect(result.transactions[0].type).toBe('expense');
    expect(result.transactions[1].type).toBe('income');
  });

  it('повертає помилку, якщо немає потрібних колонок', () => {
    const result = parseTransactionsCsv('a,b\n1,2\n', 'UAH');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('noColumns');
  });

  it('пропускає рядки без дати або суми', () => {
    const csv = `Дата,Опис,Сума
15.07.2026,Кава,-3.50
,Без дати,-1.00
16.07.2026,Нульова,0
`;
    const result = parseTransactionsCsv(csv, 'UAH');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.transactions).toHaveLength(1);
    expect(result.skippedRows).toBe(2);
    expect(result.transactions[0].currency).toBe('UAH');
  });
});

describe('filterExistingCsvTransactions', () => {
  const lidl = {
    day: 22,
    type: 'expense' as const,
    amount: 2.74,
    currency: 'USD',
    description: 'Lidl'
  };

  it('пропускає вже наявні транзакції і лишає лише нові', () => {
    const csv = [
      { ...lidl, rowIndex: 1 },
      { day: 23, type: 'expense' as const, amount: 10, currency: 'USD', description: 'Cafe', rowIndex: 2 }
    ];
    const { newTransactions, duplicateCount } = filterExistingCsvTransactions(csv, [lidl]);
    expect(duplicateCount).toBe(1);
    expect(newTransactions).toHaveLength(1);
    expect(newTransactions[0].description).toBe('Cafe');
  });

  it('при кількох однакових лишає «зайві» як нові', () => {
    const csv = [
      { ...lidl, rowIndex: 1 },
      { ...lidl, rowIndex: 2 },
      { ...lidl, rowIndex: 3 }
    ];
    const existing = [lidl, lidl];
    const { newTransactions, duplicateCount } = filterExistingCsvTransactions(csv, existing);
    expect(duplicateCount).toBe(2);
    expect(newTransactions).toHaveLength(1);
  });

  it('порівнює опис без урахування регістру і крайніх пробілів', () => {
    const csv = [{ ...lidl, description: '  lidl  ', rowIndex: 1 }];
    const { newTransactions, duplicateCount } = filterExistingCsvTransactions(csv, [lidl]);
    expect(duplicateCount).toBe(1);
    expect(newTransactions).toHaveLength(0);
  });

  it('розпізнає дублікати після авто-обʼєднання сум у бюджеті', () => {
    // Раніше імпорт злив 1.71+2.28 у одну Tegut 3.99; у CSV знову окремі рядки
    const existing = [
      { day: 22, type: 'expense' as const, amount: 3.99, currency: 'USD', description: 'Tegut Filiale 2084' },
      { day: 22, type: 'expense' as const, amount: 282.12, currency: 'USD', description: 'Wizz Air' },
      { day: 7, type: 'expense' as const, amount: 165.13, currency: 'USD', description: 'Переказ на картку' }
    ];
    const csv = [
      { day: 22, type: 'expense' as const, amount: 1.71, currency: 'USD', description: 'Tegut Filiale 2084', rowIndex: 1 },
      { day: 22, type: 'expense' as const, amount: 2.28, currency: 'USD', description: 'Tegut Filiale 2084', rowIndex: 2 },
      { day: 22, type: 'expense' as const, amount: 64.67, currency: 'USD', description: 'Wizz Air', rowIndex: 3 },
      { day: 22, type: 'expense' as const, amount: 217.45, currency: 'USD', description: 'Wizz Air', rowIndex: 4 },
      { day: 7, type: 'expense' as const, amount: 68.8, currency: 'USD', description: 'Переказ на картку', rowIndex: 5 },
      { day: 7, type: 'expense' as const, amount: 3.45, currency: 'USD', description: 'Переказ на картку', rowIndex: 6 },
      { day: 7, type: 'expense' as const, amount: 92.88, currency: 'USD', description: 'Переказ на картку', rowIndex: 7 }
    ];
    const { newTransactions, duplicateCount } = filterExistingCsvTransactions(csv, existing);
    expect(duplicateCount).toBe(7);
    expect(newTransactions).toHaveLength(0);
  });

  it('імпортує лише різницю, якщо в CSV зʼявилась додаткова сума з тією ж назвою', () => {
    const existing = [
      { day: 22, type: 'expense' as const, amount: 3.99, currency: 'USD', description: 'Tegut Filiale 2084' }
    ];
    const csv = [
      { day: 22, type: 'expense' as const, amount: 1.71, currency: 'USD', description: 'Tegut Filiale 2084', rowIndex: 1 },
      { day: 22, type: 'expense' as const, amount: 2.28, currency: 'USD', description: 'Tegut Filiale 2084', rowIndex: 2 },
      { day: 22, type: 'expense' as const, amount: 5, currency: 'USD', description: 'Tegut Filiale 2084', rowIndex: 3 }
    ];
    const { newTransactions, duplicateCount } = filterExistingCsvTransactions(csv, existing);
    expect(duplicateCount).toBe(2);
    expect(newTransactions).toHaveLength(1);
    expect(newTransactions[0].amount).toBe(5);
  });

  it('імпортує різницю з одного рядка, якщо він більший за вже наявну суму', () => {
    const existing = [
      { day: 22, type: 'expense' as const, amount: 3.99, currency: 'USD', description: 'Tegut Filiale 2084' }
    ];
    const csv = [
      { day: 22, type: 'expense' as const, amount: 8.99, currency: 'USD', description: 'Tegut Filiale 2084', rowIndex: 1 }
    ];
    const { newTransactions, duplicateCount } = filterExistingCsvTransactions(csv, existing);
    expect(duplicateCount).toBe(1);
    expect(newTransactions).toHaveLength(1);
    expect(newTransactions[0].amount).toBe(5);
  });
});
