"use client";

import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, PieChart, Pie, Cell,
} from "recharts";

const BLUE = "#1d4ed8";
const EMERALD = "#10b981";
const AMBER = "#f59e0b";
const RED = "#dc2626";
const PALETTE = [BLUE, EMERALD, AMBER, RED, "#a855f7", "#0ea5e9", "#f43f5e", "#84cc16"];

const tooltipStyle = {
  backgroundColor: "#fff",
  border: "1px solid #e2e8f0",
  borderRadius: 6,
  fontSize: 12,
  padding: "6px 10px",
};

interface SeriesPoint { [key: string]: string | number }

function chartValue(value: string | number | undefined) {
  const numberValue = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function chartData(data: SeriesPoint[], seriesKeys: string[]) {
  return data.map((point) => ({
    ...point,
    ...Object.fromEntries(seriesKeys.map((key) => [key, chartValue(point[key])])),
  }));
}

function ChartFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full min-h-72" style={{ height: 320, minHeight: 288 }}>
      {children}
    </div>
  );
}

export function TrendChart({
  data, xKey, series,
}: {
  data: SeriesPoint[];
  xKey: string;
  series: Array<{ key: string; name: string; color?: string }>;
}) {
  const safeData = chartData(data, series.map((item) => item.key));
  return (
    <ChartFrame>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={safeData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: "#64748b" }} />
          <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v) => `$${(v as number).toLocaleString()}`} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `$${v.toLocaleString()}`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color ?? PALETTE[i % PALETTE.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function BarSeriesChart({
  data, xKey, series, horizontal = false,
}: {
  data: SeriesPoint[];
  xKey: string;
  series: Array<{ key: string; name: string; color?: string }>;
  horizontal?: boolean;
}) {
  const safeData = chartData(data, series.map((item) => item.key));
  return (
    <ChartFrame>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={safeData}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{ top: 8, right: 24, bottom: 8, left: horizontal ? 16 : 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          {horizontal ? (
            <>
              <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v) => `$${(v as number).toLocaleString()}`} />
              <YAxis type="category" dataKey={xKey} tick={{ fontSize: 11, fill: "#64748b" }} width={170} interval={0} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} tick={{ fontSize: 11, fill: "#64748b" }} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickFormatter={(v) => `$${(v as number).toLocaleString()}`} />
            </>
          )}
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `$${v.toLocaleString()}`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              fill={s.color ?? PALETTE[i % PALETTE.length]}
              minPointSize={2}
              radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function DonutChart({
  data,
}: {
  data: Array<{ name: string; value: number; color?: string }>;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="w-full min-h-72 relative" style={{ height: 320, minHeight: 288 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="55%"
            outerRadius="80%"
            paddingAngle={2}
            stroke="#fff"
            strokeWidth={2}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.color ?? PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => `$${v.toLocaleString()}`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <div className="text-[11px] uppercase tracking-wide text-slate-500">Total</div>
        <div className="text-xl font-semibold text-slate-900 tabular-nums">
          ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>
    </div>
  );
}
