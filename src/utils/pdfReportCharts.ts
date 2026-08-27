export const PDF_CHART_COLORS = {
  income: '#059669',
  incomeTop: '#34d399',
  expense: '#e11d48',
  expenseTop: '#fb7185',
  grid: '#e2e8f0',
  axis: '#64748b',
  label: '#0f172a',
  muted: '#94a3b8',
  plotBg: '#f8fafc',
  card: '#ffffff'
};

export const CATEGORY_CHART_COLORS = [
  '#f59e0b',
  '#f97316',
  '#fb7185',
  '#8b5cf6',
  '#3b82f6',
  '#10b981',
  '#14b8a6',
  '#ec4899'
];

export interface ChartMonthBar {
  label: string;
  income: number;
  expense: number;
}

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

const niceMax = (value: number): number => {
  if (value <= 0) return 1;
  const padded = value * 1.12;
  const magnitude = 10 ** Math.floor(Math.log10(padded));
  const normalized = padded / magnitude;
  const nice =
    normalized <= 1 ? 1 :
    normalized <= 2 ? 2 :
    normalized <= 2.5 ? 2.5 :
    normalized <= 5 ? 5 :
    10;
  return nice * magnitude;
};

const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) => {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
};

const prepareCanvas = (
  canvas: HTMLCanvasElement,
  width: number,
  height: number
): CanvasRenderingContext2D | null => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  return ctx;
};

export function drawIncomeExpenseChart(
  canvas: HTMLCanvasElement,
  months: ChartMonthBar[],
  options: {
    width: number;
    height: number;
    incomeLabel: string;
    expenseLabel: string;
    formatValue: (n: number) => string;
    emptyLabel: string;
  }
): void {
  const { width, height, incomeLabel, expenseLabel, formatValue, emptyLabel } = options;
  const ctx = prepareCanvas(canvas, width, height);
  if (!ctx) return;

  ctx.fillStyle = PDF_CHART_COLORS.card;
  ctx.fillRect(0, 0, width, height);

  const padL = 72;
  const padR = 16;
  const padT = 36;
  const padB = 42;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  roundRect(ctx, padL, padT, plotW, plotH, 12);
  ctx.fillStyle = PDF_CHART_COLORS.plotBg;
  ctx.fill();

  ctx.font = '600 12px "Noto Sans", "Segoe UI", system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  const legendY = 16;
  const swatch = 10;
  ctx.fillStyle = PDF_CHART_COLORS.income;
  roundRect(ctx, padL, legendY - swatch / 2, swatch, swatch, 2);
  ctx.fill();
  ctx.fillStyle = PDF_CHART_COLORS.label;
  ctx.fillText(incomeLabel, padL + swatch + 6, legendY);
  const incomeWidth = ctx.measureText(incomeLabel).width;
  const expenseX = padL + swatch + 6 + incomeWidth + 18;
  ctx.fillStyle = PDF_CHART_COLORS.expense;
  roundRect(ctx, expenseX, legendY - swatch / 2, swatch, swatch, 2);
  ctx.fill();
  ctx.fillStyle = PDF_CHART_COLORS.label;
  ctx.fillText(expenseLabel, expenseX + swatch + 6, legendY);

  if (months.length === 0) {
    ctx.fillStyle = PDF_CHART_COLORS.axis;
    ctx.font = '13px "Noto Sans", "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(emptyLabel, padL + plotW / 2, padT + plotH / 2);
    ctx.textAlign = 'left';
    return;
  }

  const maxValue = niceMax(Math.max(...months.map((m) => Math.max(m.income, m.expense)), 0));
  const ticks = 4;
  ctx.font = '11px "Noto Sans", "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= ticks; i++) {
    const t = i / ticks;
    const y = padT + plotH - t * plotH;
    const value = maxValue * t;
    ctx.strokeStyle = PDF_CHART_COLORS.grid;
    ctx.lineWidth = i === 0 ? 1.25 : 1;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
    ctx.fillStyle = PDF_CHART_COLORS.axis;
    ctx.fillText(formatValue(value), padL - 8, y);
  }

  const groupW = plotW / months.length;
  const barGap = Math.min(8, groupW * 0.08);
  const barW = Math.max(6, Math.min(28, (groupW - barGap * 3) / 2));
  const pairW = barW * 2 + barGap;
  const showValues = months.length <= 6;

  months.forEach((month, index) => {
    const groupCenter = padL + groupW * index + groupW / 2;
    const pairLeft = groupCenter - pairW / 2;
    const incomeH = maxValue > 0 ? (month.income / maxValue) * plotH : 0;
    const expenseH = maxValue > 0 ? (month.expense / maxValue) * plotH : 0;

    const drawBar = (x: number, h: number, from: string, to: string) => {
      const y = padT + plotH - h;
      const gradient = ctx.createLinearGradient(x, y, x, padT + plotH);
      gradient.addColorStop(0, to);
      gradient.addColorStop(1, from);
      ctx.fillStyle = gradient;
      roundRect(ctx, x, y, barW, Math.max(h, 0), Math.min(6, barW / 2));
      ctx.fill();
    };

    drawBar(pairLeft, incomeH, PDF_CHART_COLORS.income, PDF_CHART_COLORS.incomeTop);
    drawBar(pairLeft + barW + barGap, expenseH, PDF_CHART_COLORS.expense, PDF_CHART_COLORS.expenseTop);

    if (showValues) {
      ctx.font = '600 10px "Noto Sans", "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      if (month.income > 0) {
        ctx.fillStyle = PDF_CHART_COLORS.income;
        ctx.fillText(
          formatValue(month.income),
          pairLeft + barW / 2,
          padT + plotH - incomeH - 8
        );
      }
      if (month.expense > 0) {
        ctx.fillStyle = PDF_CHART_COLORS.expense;
        ctx.fillText(
          formatValue(month.expense),
          pairLeft + barW + barGap + barW / 2,
          padT + plotH - expenseH - 8
        );
      }
    }

    ctx.fillStyle = PDF_CHART_COLORS.axis;
    ctx.font = '600 11px "Noto Sans", "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(month.label, groupCenter, padT + plotH + 10);
  });

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

export function drawCategoryDonut(
  canvas: HTMLCanvasElement,
  slices: DonutSlice[],
  options: {
    width: number;
    height: number;
    centerLabel: string;
    centerValue: string;
    emptyLabel: string;
  }
): void {
  const { width, height, centerLabel, centerValue, emptyLabel } = options;
  const ctx = prepareCanvas(canvas, width, height);
  if (!ctx) return;
  ctx.fillStyle = PDF_CHART_COLORS.card;
  ctx.fillRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2 + 4;
  const radius = Math.min(width, height) * 0.38;
  const inner = radius * 0.62;
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  if (total <= 0 || slices.length === 0) {
    ctx.strokeStyle = PDF_CHART_COLORS.grid;
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(cx, cy, (radius + inner) / 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = PDF_CHART_COLORS.axis;
    ctx.font = '13px "Noto Sans", "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emptyLabel, cx, cy);
    return;
  }

  let angle = -Math.PI / 2;
  slices.forEach((slice) => {
    const sweep = (slice.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, angle, angle + sweep);
    ctx.closePath();
    ctx.fillStyle = slice.color;
    ctx.fill();
    angle += sweep;
  });

  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(cx, cy, inner, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  ctx.fillStyle = PDF_CHART_COLORS.label;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 16px "Noto Sans", "Segoe UI", system-ui, sans-serif';
  ctx.fillText(centerValue, cx, cy - 8);
  ctx.fillStyle = PDF_CHART_COLORS.axis;
  ctx.font = '11px "Noto Sans", "Segoe UI", system-ui, sans-serif';
  ctx.fillText(centerLabel, cx, cy + 12);
}
