/**
 * Універсальний імпорт транзакцій з CSV-виписок.
 *
 * Працює за евристиками для будь-якого банку, який експортує CSV з колонками
 * "дата / опис / сума" (гарантовано підтримується виписка Monobank).
 * Колонки визначаються за назвами в заголовку, роздільник (`,` `;` таб)
 * визначається автоматично, лапки та BOM обробляються.
 */

import { roundToDecimals } from './rounding';

export interface ParsedCsvTransaction {
  /** Порядковий номер рядка у файлі (для стабільних ключів у UI). */
  rowIndex: number;
  date: Date;
  year: number;
  /** 0-11 */
  month: number;
  /** 1-31 */
  day: number;
  type: 'income' | 'expense';
  /** Завжди додатне значення. */
  amount: number;
  currency: string;
  description: string;
}

export interface CsvDetectedColumns {
  dateHeader: string;
  descriptionHeader: string;
  amountHeader: string;
  /** Валюта, зчитана із заголовка колонки суми, напр. "Сума в валюті картки (USD)". */
  currencyFromHeader: string | null;
  /** Назва окремої колонки валюти (якщо використовується). */
  currencyHeader: string | null;
}

export type CsvParseResult =
  | {
      ok: true;
      transactions: ParsedCsvTransaction[];
      detected: CsvDetectedColumns;
      skippedRows: number;
    }
  | { ok: false; error: 'empty' | 'noColumns' };

/* ------------------------------------------------------------------ */
/* Токенізація                                                         */
/* ------------------------------------------------------------------ */

function detectDelimiter(headerLine: string): string {
  const candidates = [',', ';', '\t'];
  let best = ',';
  let bestCount = -1;
  for (const d of candidates) {
    let count = 0;
    let inQuotes = false;
    for (const ch of headerLine) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === d && !inQuotes) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

/** RFC4180-подібний парсер: лапки, екрановані лапки (""), переноси рядків усередині лапок. */
function tokenizeCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    // Пропускаємо повністю порожні рядки
    if (row.some((f) => f.trim() !== '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      pushField();
    } else if (ch === '\n') {
      pushRow();
    } else if (ch === '\r') {
      // ігноруємо, \n обробить перенос
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) pushRow();

  return rows;
}

/* ------------------------------------------------------------------ */
/* Визначення колонок                                                  */
/* ------------------------------------------------------------------ */

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    // кирилична "і" та латинська "i" зустрічаються впереміш (Monobank: "Дата i час")
    .replace(/і/g, 'i')
    .replace(/['’ʼ]/g, '')
    .trim();
}

const DATE_HINTS = ['дата', 'date', 'час', 'time'];
const DESCRIPTION_HINTS = ['деталi', 'опис', 'description', 'details', 'merchant', 'призначення', 'назва', 'payee', 'memo', 'transaction'];
const AMOUNT_PRIORITY_HINTS = ['сума в валютi картки', 'card currency amount', 'amount in card currency'];
const AMOUNT_HINTS = ['сума', 'amount', 'sum'];
const AMOUNT_EXCLUDE_HINTS = ['комiсiй', 'кешбеку', 'fee', 'cashback', 'залишок', 'balance', 'валютi операцiї', 'operation currency'];
const CURRENCY_HINTS = ['валюта', 'currency'];

function findColumn(headers: string[], hints: string[], exclude: string[] = []): number {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (exclude.some((e) => h.includes(e))) continue;
    if (hints.some((hint) => h.includes(hint))) return i;
  }
  return -1;
}

function extractCurrencyFromHeader(header: string): string | null {
  const match = header.match(/\(([A-Za-z]{3})\)/);
  return match ? match[1].toUpperCase() : null;
}

/* ------------------------------------------------------------------ */
/* Парсинг значень                                                     */
/* ------------------------------------------------------------------ */

function parseCsvDate(raw: string): Date | null {
  const value = raw.trim();
  if (!value) return null;

  // dd.mm.yyyy [hh:mm[:ss]] або dd/mm/yyyy
  let m = value.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const [, d, mo, y, hh, mm, ss] = m;
    const date = new Date(
      Number(y), Number(mo) - 1, Number(d),
      hh !== undefined ? Number(hh) : 12,
      mm !== undefined ? Number(mm) : 0,
      ss !== undefined ? Number(ss) : 0
    );
    return isValidDateParts(date, Number(y), Number(mo) - 1, Number(d)) ? date : null;
  }

  // yyyy-mm-dd [hh:mm[:ss]]
  m = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const [, y, mo, d, hh, mm, ss] = m;
    const date = new Date(
      Number(y), Number(mo) - 1, Number(d),
      hh !== undefined ? Number(hh) : 12,
      mm !== undefined ? Number(mm) : 0,
      ss !== undefined ? Number(ss) : 0
    );
    return isValidDateParts(date, Number(y), Number(mo) - 1, Number(d)) ? date : null;
  }

  return null;
}

function isValidDateParts(date: Date, year: number, monthIndex: number, day: number): boolean {
  return (
    !isNaN(date.getTime()) &&
    date.getFullYear() === year &&
    date.getMonth() === monthIndex &&
    date.getDate() === day
  );
}

function parseCsvAmount(raw: string): number | null {
  let value = raw.trim();
  if (!value || value === '—' || value === '-') return null;
  // прибираємо звичайні та нерозривні пробіли (роздільники тисяч)
  value = value.replace(/[\s\u00a0\u202f]/g, '');
  // 1.234,56 → 1234.56 ; 1,234.56 → 1234.56 ; 12,5 → 12.5
  const lastComma = value.lastIndexOf(',');
  const lastDot = value.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      value = value.replace(/\./g, '').replace(',', '.');
    } else {
      value = value.replace(/,/g, '');
    }
  } else if (lastComma > -1) {
    value = value.replace(',', '.');
  }
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}

/* ------------------------------------------------------------------ */
/* Головна функція                                                     */
/* ------------------------------------------------------------------ */

/**
 * @param fallbackCurrency валюта, яка використовується, якщо її не вдалося
 *   визначити ні із заголовка колонки суми, ні з окремої колонки валюти.
 */
export function parseTransactionsCsv(text: string, fallbackCurrency: string): CsvParseResult {
  const cleaned = text.replace(/^\ufeff/, '');
  const firstLineEnd = cleaned.indexOf('\n');
  const headerLine = firstLineEnd === -1 ? cleaned : cleaned.slice(0, firstLineEnd);
  const delimiter = detectDelimiter(headerLine);
  const rows = tokenizeCsv(cleaned, delimiter);

  if (rows.length < 2) {
    return { ok: false, error: 'empty' };
  }

  const rawHeaders = rows[0];
  const headers = rawHeaders.map(normalizeHeader);

  const dateIdx = findColumn(headers, DATE_HINTS);
  const descriptionIdx = findColumn(headers, DESCRIPTION_HINTS);
  // Спершу шукаємо "суму в валюті картки" (Monobank), інакше — будь-яку "суму",
  // крім комісій/кешбеку/залишку/суми у валюті операції.
  let amountIdx = findColumn(headers, AMOUNT_PRIORITY_HINTS);
  if (amountIdx === -1) {
    amountIdx = findColumn(headers, AMOUNT_HINTS, AMOUNT_EXCLUDE_HINTS);
  }
  if (amountIdx === -1) {
    amountIdx = findColumn(headers, AMOUNT_HINTS);
  }

  if (dateIdx === -1 || amountIdx === -1) {
    return { ok: false, error: 'noColumns' };
  }

  const currencyFromHeader = extractCurrencyFromHeader(rawHeaders[amountIdx]);
  let currencyIdx = -1;
  if (!currencyFromHeader) {
    currencyIdx = findColumn(headers, CURRENCY_HINTS, AMOUNT_HINTS);
  }

  const transactions: ParsedCsvTransaction[] = [];
  let skippedRows = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const date = parseCsvDate(String(row[dateIdx] ?? ''));
    const amount = parseCsvAmount(String(row[amountIdx] ?? ''));
    if (!date || amount === null || amount === 0) {
      skippedRows++;
      continue;
    }

    const rawCurrency =
      currencyFromHeader ||
      (currencyIdx !== -1 ? String(row[currencyIdx] ?? '').trim().toUpperCase() : '') ||
      fallbackCurrency;

    const description =
      (descriptionIdx !== -1 ? String(row[descriptionIdx] ?? '').trim() : '') ||
      `CSV #${r}`;

    transactions.push({
      rowIndex: r,
      date,
      year: date.getFullYear(),
      month: date.getMonth(),
      day: date.getDate(),
      type: amount < 0 ? 'expense' : 'income',
      amount: Math.abs(amount),
      currency: rawCurrency,
      description: description.slice(0, 100)
    });
  }

  if (transactions.length === 0) {
    return { ok: false, error: 'empty' };
  }

  // Хронологічний порядок (виписки зазвичай від нових до старих)
  transactions.sort((a, b) => a.date.getTime() - b.date.getTime());

  return {
    ok: true,
    transactions,
    detected: {
      dateHeader: rawHeaders[dateIdx],
      descriptionHeader: descriptionIdx !== -1 ? rawHeaders[descriptionIdx] : '',
      amountHeader: rawHeaders[amountIdx],
      currencyFromHeader,
      currencyHeader: currencyIdx !== -1 ? rawHeaders[currencyIdx] : null
    },
    skippedRows
  };
}

/* ------------------------------------------------------------------ */
/* Дедуплікація відносно вже наявних транзакцій                        */
/* ------------------------------------------------------------------ */

export interface CsvDuplicateMatchFields {
  day: number;
  type: 'income' | 'expense';
  amount: number;
  currency: string;
  description: string;
}

/**
 * Ідентичність без суми: день + тип + валюта + опис.
 * Суми порівнюємо окремо (з урахуванням попереднього авто-об'єднання в бюджеті).
 */
export function csvTransactionIdentityKey(
  tx: Pick<CsvDuplicateMatchFields, 'day' | 'type' | 'currency' | 'description'>
): string {
  return [
    tx.day,
    tx.type,
    tx.currency.trim().toUpperCase(),
    tx.description.trim().toLowerCase()
  ].join('|');
}

/**
 * Залишає лише ту частину CSV, якої ще немає в бюджеті.
 *
 * Порівнює за день/тип/валюта/опис і «з’їдає» суму вже наявних записів.
 * Це покриває випадок, коли при попередньому імпорті кілька однакових назв
 * у дні були об'єднані в одну транзакцію (1.71+2.28 → 3.99).
 *
 * Якщо в CSV сума більша за вже наявну — імпортується лише різниця.
 */
export function filterExistingCsvTransactions<T extends CsvDuplicateMatchFields>(
  csvTransactions: T[],
  existingTransactions: CsvDuplicateMatchFields[]
): { newTransactions: T[]; duplicateCount: number } {
  const remainingAmount = new Map<string, number>();
  for (const tx of existingTransactions) {
    const key = csvTransactionIdentityKey(tx);
    remainingAmount.set(
      key,
      roundToDecimals((remainingAmount.get(key) || 0) + Number(tx.amount), 2)
    );
  }

  const newTransactions: T[] = [];
  let duplicateCount = 0;

  for (const tx of csvTransactions) {
    const key = csvTransactionIdentityKey(tx);
    const left = remainingAmount.get(key) || 0;
    const amount = roundToDecimals(Number(tx.amount), 2);

    if (left <= 0) {
      newTransactions.push(tx);
      continue;
    }

    if (left >= amount) {
      remainingAmount.set(key, roundToDecimals(left - amount, 2));
      duplicateCount++;
      continue;
    }

    // Частковий збіг: у бюджеті вже є частина суми цієї групи
    const newAmount = roundToDecimals(amount - left, 2);
    remainingAmount.set(key, 0);
    duplicateCount++;
    newTransactions.push({ ...tx, amount: newAmount });
  }

  return { newTransactions, duplicateCount };
}
