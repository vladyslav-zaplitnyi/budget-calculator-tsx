import React, { useLayoutEffect, useRef } from 'react';
import {
  drawCategoryDonut,
  drawIncomeExpenseChart,
  type ChartMonthBar,
  type DonutSlice
} from '../utils/pdfReportCharts';

interface IncomeExpenseChartProps {
  months: ChartMonthBar[];
  width: number;
  height: number;
  incomeLabel: string;
  expenseLabel: string;
  formatValue: (n: number) => string;
  emptyLabel: string;
  className?: string;
}

export const PdfIncomeExpenseChart: React.FC<IncomeExpenseChartProps> = ({
  months,
  width,
  height,
  incomeLabel,
  expenseLabel,
  formatValue,
  emptyLabel,
  className
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawIncomeExpenseChart(canvas, months, {
      width,
      height,
      incomeLabel,
      expenseLabel,
      formatValue,
      emptyLabel
    });
  }, [months, width, height, incomeLabel, expenseLabel, formatValue, emptyLabel]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      width={width}
      height={height}
      aria-hidden
    />
  );
};

interface CategoryDonutProps {
  slices: DonutSlice[];
  width: number;
  height: number;
  centerLabel: string;
  centerValue: string;
  emptyLabel: string;
}

export const PdfCategoryDonut: React.FC<CategoryDonutProps> = ({
  slices,
  width,
  height,
  centerLabel,
  centerValue,
  emptyLabel
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawCategoryDonut(canvas, slices, {
      width,
      height,
      centerLabel,
      centerValue,
      emptyLabel
    });
  }, [slices, width, height, centerLabel, centerValue, emptyLabel]);

  return <canvas ref={canvasRef} width={width} height={height} aria-hidden />;
};
