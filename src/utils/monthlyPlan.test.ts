import { isCalendarMonthStrictlyPast } from './monthlyPlan';

describe('isCalendarMonthStrictlyPast', () => {
  it('treats November 2026 as future when today is 10 March 2026', () => {
    const ref = new Date(2026, 2, 10); // March 10, 2026
    expect(isCalendarMonthStrictlyPast(2026, 10, ref)).toBe(false); // November
  });

  it('treats February 2026 as past when today is March 2026', () => {
    const ref = new Date(2026, 2, 10);
    expect(isCalendarMonthStrictlyPast(2026, 1, ref)).toBe(true);
  });

  it('treats same calendar month as not past', () => {
    const ref = new Date(2026, 2, 28);
    expect(isCalendarMonthStrictlyPast(2026, 2, ref)).toBe(false);
  });
});
