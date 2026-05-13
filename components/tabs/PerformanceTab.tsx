"use client";
import { useEffect, useRef } from "react";

interface MonthlyRecord {
  year: number;
  month: number;
  revenue_bruto: number;
}

interface PerformanceData {
  shopify: { mes_actual: { revenue_bruto: number; orders_count: number; aov: number }; historico_mensual: MonthlyRecord[]; _status: string };
  mercadolibre: { mes_actual: { revenue_bruto: number; revenue_neto_post_comision: number; orders_count: number }; historico_mensual: MonthlyRecord[]; _status: string };
  locales: { locales: { nombre: string; mes_actual: { revenue: number } }[]; _status: string };
  plan: { anio: number; target_anual_usd: number; targets_por_canal: { fisico: number; web: number; marketplace: number } };
  contexto: { breakeven_mensual: { usd: number }; margen_neto_pct: number };
}

declare global {
  interface Window {
    Chart: any;
  }
}

function fmtUSD(n: number) {
  return new Intl.NumberFormat("es-UY", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function fmtPct(n: number) {
  return (n >= 0 ? "+" : "") + (n * 100).toFixed(1) + "%";
}

function semClass(pct: number): string {
  if (pct >= 1) return "verde";
  if (pct >= 0.85) return "amarillo";
  return "rojo";
}

function forecastLineal(mtd: number, dayOfMonth: number, daysInMonth: number): number {
  return dayOfMonth > 0 ? (mtd / dayOfMonth) * daysInMonth : 0;
}

export default function PerformanceTab({ data }: { data: PerformanceData }) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<InstanceType<typeof window.Chart> | null>(null);

  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const webRevenue = data.shopify.mes_actual.revenue_bruto;
  const mlRevenue = data.mercadolibre.mes_actual.revenue_bruto;
  const localesRevenue = data.locales.locales.reduce((s, l) => s + l.mes_actual.revenue, 0);
  const totalMTD = webRevenue + mlRevenue + localesRevenue;
  const totalNeto = totalMTD * data.contexto.margen_neto_pct;
  const breakeven = data.contexto.breakeven_mensual.usd;

  const fLineal = forecastLineal(totalMTD, dayOfMonth, daysInMonth);
  const fRealista = fLineal * 0.92;
  const beAlcanzable = fLineal >= breakeven;

  const sinDatos = data.shopify._status === "sin_datos" && data.mercadolibre._status === "sin_datos";

  useEffect(() => {
    if (!chartRef.current || !window.Chart) return;
    if (chartInstance.current) chartInstance.current.destroy();

    const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const years = [2024, 2025, 2026];
    const colors = ["#374151", "#6b7280", "#4f8ef7"];

    const datasets = years.map((yr, yi) => ({
      label: String(yr),
      data: months.map((_, mi) => {
        const rec = [
          ...data.shopify.historico_mensual,
          ...data.mercadolibre.historico_mensual,
        ].filter((r) => r.year === yr && r.month === mi + 1)
          .reduce((s, r) => s + r.revenue_bruto, 0);
        return rec || null;
      }),
      backgroundColor: colors[yi] + "99",
      borderColor: colors[yi],
      borderWidth: 1,
      type: "bar" as const,
    }));

    const targetLine = {
      label: "Target",
      data: months.map((_, mi) => {
        const share = data.plan.targets_por_canal;
        const total = share.fisico + share.web + share.marketplace;
        return total > 0 ? total / 12 : null;
      }),
      borderColor: "#22c55e",
      borderDash: [4, 4],
      pointRadius: 0,
      type: "line" as const,
      fill: false,
    };

    const beeLine = {
      label: "Breakeven",
      data: months.map(() => breakeven),
      borderColor: "#ef4444",
      borderDash: [6, 3],
      pointRadius: 0,
      type: "line" as const,
      fill: false,
    };

    chartInstance.current = new window.Chart(chartRef.current, {
      type: "bar",
      data: { labels: months, datasets: [...datasets, targetLine as any, beeLine as any] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: "#9ca3af", font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: (ctx: any) => `${ctx.dataset.label}: ${fmtUSD(ctx.parsed.y || 0)}`,
            },
          },
        },
        scales: {
          x: { ticks: { color: "#6b7280" }, grid: { color: "#1e2230" } },
          y: { ticks: { color: "#6b7280", callback: (v: any) => "$" + (v / 1000).toFixed(0) + "k" }, grid: { color: "#1e2230" } },
        },
      },
    });

    return () => { chartInstance.current?.destroy(); };
  }, [data]);

  if (sinDatos) {
    return (
      <div>
        <div className="banner info">ℹ️ Conectá Shopify y MercadoLibre para ver datos reales de performance.</div>
        <div className="breakeven-block">
          <div className="breakeven-title">KPI #1 — Breakeven Mensual</div>
          <div className="breakeven-main">
            <span className="breakeven-val mono">{fmtUSD(breakeven)}</span>
            <span className="breakeven-meta">objetivo mínimo mensual</span>
          </div>
          <div className="sin-datos">
            <div className="sin-datos-icon">📊</div>
            <div className="sin-datos-titulo">Sin datos de ventas</div>
            <div className="sin-datos-desc">Conectá las integraciones para ver el forecast del mes.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {!beAlcanzable && (
        <div className="banner danger">🚨 Forecast lineal {fmtUSD(fLineal)} — NO cubre el breakeven de {fmtUSD(breakeven)}</div>
      )}

      <div className="breakeven-block">
        <div className="breakeven-title">KPI #1 — Breakeven Mensual</div>
        <div className="breakeven-main">
          <span className={`breakeven-val mono text-${semClass(totalMTD / breakeven) === "verde" ? "green" : semClass(totalMTD / breakeven) === "amarillo" ? "yellow" : "red"}`}>
            {fmtUSD(totalMTD)}
          </span>
          <span className="breakeven-meta">MTD de {fmtUSD(breakeven)} objetivo</span>
          <span className={`semaforo ${semClass(totalMTD / breakeven)}`}>
            {semClass(totalMTD / breakeven) === "verde" ? "En camino" : semClass(totalMTD / breakeven) === "amarillo" ? "Cuidado" : "Por debajo"}
          </span>
        </div>
        <div className="forecast-grid">
          {[
            { label: "Lineal", value: fLineal },
            { label: "Realista (−8%)", value: fRealista },
            { label: "Breakeven", value: breakeven },
            { label: "Neto real MTD", value: totalNeto },
          ].map(({ label, value }, i) => (
            <div key={i} className="forecast-item">
              <div className="forecast-label">{label}</div>
              <div className={`forecast-value mono ${i === 2 ? "text-red" : i === 3 ? "text-green" : ""}`}>{fmtUSD(value)}</div>
              {i < 2 && (
                <div className={`forecast-pct ${semClass(value / breakeven) === "verde" ? "text-green" : semClass(value / breakeven) === "amarillo" ? "text-yellow" : "text-red"}`}>
                  {fmtPct(value / breakeven - 1)} vs BE
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="kpi-grid mb-16">
        {[
          { title: "Web (Shopify) MTD", value: fmtUSD(webRevenue), sub: `${data.shopify.mes_actual.orders_count} órdenes` },
          { title: "Marketplace (ML) MTD", value: fmtUSD(mlRevenue), sub: `Neto: ${fmtUSD(data.mercadolibre.mes_actual.revenue_neto_post_comision)}` },
          { title: "Locales MTD", value: fmtUSD(localesRevenue), sub: "Facturación física" },
          { title: "Total NETO MTD", value: fmtUSD(totalNeto), sub: `Margen ${(data.contexto.margen_neto_pct * 100).toFixed(0)}%` },
        ].map(({ title, value, sub }, i) => (
          <div key={i} className="card card-sm">
            <div className="card-title">{title}</div>
            <div className="card-value-sm mono">{value}</div>
            <div className="card-sub">{sub}</div>
          </div>
        ))}
      </div>

      <div className="card section">
        <div className="card-title">Revenue mensual — 2024 / 2025 / 2026</div>
        <div className="chart-container" style={{ height: 300 }}>
          <canvas ref={chartRef} />
        </div>
      </div>
    </div>
  );
}
