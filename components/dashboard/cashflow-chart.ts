import { businessDateString } from '../../lib/transactions/datetime.ts';

export function buildCashflowPoints(rows: Array<{ date: Date; type: string; amount: number }>) {
  if (!rows.some((row) => row.type === 'income' || row.type === 'expense')) return [];

  const days = new Map<string, { income: number; expense: number }>();
  for (const row of rows) {
    const date = businessDateString(row.date);
    const day = days.get(date) ?? { income: 0, expense: 0 };
    if (row.type === 'income') day.income += Math.abs(row.amount);
    if (row.type === 'expense') day.expense += Math.abs(row.amount);
    days.set(date, day);
  }

  const totals = [...days].sort(([a], [b]) => a.localeCompare(b));
  const maxAmount = Math.max(1, ...totals.flatMap(([, day]) => [day.income, day.expense]));
  return totals.map(([date, day], index) => ({
    date,
    ...day,
    x: totals.length === 1 ? 320 : 20 + index * (600 / (totals.length - 1)),
    incomeY: 150 - day.income / maxAmount * 112,
    expenseY: 150 - day.expense / maxAmount * 112,
  }));
}
