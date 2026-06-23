// src/utils/dateHelpers.ts

// Gets short weekday label (e.g., "Пн", "Вт" / "Mon", "Tue") using Intl.
export const getWeekdayShortName = (
  year: number,
  monthIndex: number,
  day: number,
  locale: string
) => {
  const date = new Date(year, monthIndex, day);
  // Some locales include a trailing dot (e.g., "Mon."). Strip it for UI consistency.
  return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date).replace(/\.$/, '');
};

export const getDaysInMonth = (year: number, monthIndex: number) => {
  return new Date(year, monthIndex + 1, 0).getDate();
};

export const capitalizeFirstLetter = (value: string) => {
  if (!value) return value;
  return value[0].toUpperCase() + value.slice(1);
};

// Converts JS getDay() result (0=Sun..6=Sat) to Monday-based index (0=Mon..6=Sun)
const toMondayBasedWeekdayIndex = (jsDay: number) => {
  return (jsDay + 6) % 7;
};

export const getMonthYearLabel = (locale: string, year: number, monthIndex: number) => {
  const formatter = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric'
  });
  return capitalizeFirstLetter(formatter.format(new Date(year, monthIndex, 1)));
};

export const formatBudgetTransactionDate = (
  locale: string,
  year: number,
  monthIndex: number,
  day: number
) => {
  return capitalizeFirstLetter(
    new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(new Date(year, monthIndex, day))
  );
};

export const getWeekdayLabelsMondayFirst = (locale: string) => {
  // 2021-11-01 is a Monday. Use UTC to avoid DST edge cases.
  const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  const mondayUtc = new Date(Date.UTC(2021, 10, 1));
  return Array.from({ length: 7 }, (_, i) => {
    const label = formatter.format(new Date(mondayUtc.getTime() + i * 24 * 60 * 60 * 1000));
    return label.replace(/\.$/, '');
  });
};

export const buildCalendarCellsForMonthMondayFirst = (year: number, monthIndex: number) => {
  const daysInMonth = getDaysInMonth(year, monthIndex);
  const jsFirstDay = new Date(year, monthIndex, 1).getDay(); // 0=Sun..6=Sat
  const leadingEmptyCells = toMondayBasedWeekdayIndex(jsFirstDay); // 0=Mon..6=Sun

  const cells: Array<number | null> = [];
  for (let i = 0; i < leadingEmptyCells; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);

  // Fill the last week so the grid looks like a system calendar.
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
};


