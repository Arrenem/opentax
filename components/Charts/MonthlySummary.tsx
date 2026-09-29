'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { MonthlySummary as MonthlySummaryType } from '@/types';

interface MonthlySummaryChartProps {
  data: MonthlySummaryType[];
}

const SERIES = [
  { key: '収入', color: '#0071e3' },
  { key: '支出', color: '#ff6961' },
  { key: '利益', color: '#34c759' },
] as const;

function compactYen(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

export function MonthlySummaryChart({ data }: MonthlySummaryChartProps) {
  const chartData = data.map((d) => ({
    month: `${d.month}月`,
    収入: d.revenue,
    支出: d.expenses,
    利益: d.profit,
  }));

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-xs text-ink-2">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.key}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barGap={2} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="rgba(0,0,0,0.06)" />
          <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#8e8e93' }} interval="preserveStartEnd" />
          <YAxis tickFormatter={compactYen} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#8e8e93' }} width={52} />
          <Tooltip
            cursor={{ fill: 'rgba(0,0,0,0.04)' }}
            contentStyle={{
              borderRadius: 14,
              border: '1px solid rgba(0,0,0,0.06)',
              boxShadow: '0 12px 32px -12px rgba(0,0,0,0.25)',
              fontSize: 12,
            }}
            formatter={(value) => (typeof value === 'number' ? `¥${new Intl.NumberFormat('ja-JP').format(value)}` : String(value))}
            labelStyle={{ fontWeight: 600, marginBottom: 4 }}
          />
          {SERIES.map((s) => (
            <Bar key={s.key} dataKey={s.key} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={14} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
