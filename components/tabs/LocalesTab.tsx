"use client";
import { useEffect, useRef } from "react";

interface Local {
  id: string;
  nombre: string;
  mes_actual: { revenue: number; orders_count: number };
  historico_mensual: { year: number; month: number; revenue_bruto: number }[];
}

interface LocalConfig {
  id: string;
  nombre: string;
  es_estacional: boolean;
  meses_temporada_alta: number[];
}

interface PlanLocal {
  anual_usd: number;
  monthly_share: Record<string, number>;
}

interface LocalesTabProps {
  locales: Local[];
  localConfigs: LocalConfig[];
  planesLocales: Record<string, PlanLocal>;
  sinDatos: boolean;
}

declare global { interface Window { Chart: any; } }

function fmtUSD(n: number) {
  return new Intl.NumberFormat("es-UY", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function semClass(pct: number): string {
  if (pct >= 1) return "verde";
  if (pct >= 0.85) return "amarillo";
  return "rojo";
}

function getTargetYTD(plan: PlanLocal, upToMonth: number): number {
  let total = 0;
  for (let m = 1; m <= upToMonth; m++) {
    total += (plan.monthly_share[String(m)] || 0) * plan.anual_usd;
  }
  return total;
}

export default function LocalesTab({ locales, localConfigs, planesLocales, sinDatos }: LocalesTabProps) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInst = useRef<any>(null);
  const now = new Date();
  const currentMonth = now.getMonth() + 1;

  useEffect(() => {
    if (!chartRef.current || !window.Chart || sinDatos) return;
    if (chartInst.current) chartInst.current.destroy();

    const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const colors = ["#4f8ef7", "#22c55e", "#a855f7", "#eab308"];
    const currentYear = now.getFullYear();
    const prevYear = currentYear - 1;

    const datasets = locales.flatMap((l, i) => {
      const color = colors[i % colors.length];
      return [
        {
          label: `${l.nombre} ${prevYear}`,
          data: months.map((_, mi) => {
            const rec = l.historico_mensual.find((r) => r.year === prevYear && r.month === mi + 1);
            return rec?.revenue_bruto ?? null;
          }),
          borderColor: color + "77",
          backgroundColor: "transparent",
          borderDash: [5, 4],
          fill: false,
          tension: 0.3,
          pointRadius: 2,
        },
        {
          label: `${l.nombre} ${currentYear}`,
          data: months.map((_, mi) => {
            const rec = l.historico_mensual.find((r) => r.year === currentYear && r.month === mi + 1);
            return rec?.revenue_bruto ?? null;
          }),
          borderColor: color,
          backgroundColor: color + "22",
          fill: true,
          tension: 0.3,
          pointRadius: 3,
        },
      ];
    });

    chartInst.current = new window.Chart(chartRef.current, {
      type: "line",
      data: { labels: months, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: "#9ca3af", font: { size: 11 } } } },
        scales: {
          x: { ticks: { color: "#6b7280" }, grid: { color: "#1e2230" } },
          y: { ticks: { color: "#6b7280", callback: (v: any) => "$" + (v / 1000).toFixed(0) + "k" }, grid: { color: "#1e2230" } },
        },
      },
    });

    return () => { chartInst.current?.destroy(); };
  }, [locales, sinDatos]);

  if (sinDatos) {
    return (
      <div className="card">
        <div className="sin-datos">
          <div className="sin-datos-icon">🏪</div>
          <div className="sin-datos-titulo">Sin datos de locales físicos</div>
          <div className="sin-datos-desc">Conectá el sistema contable para ver facturación por local.</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="kpi-grid mb-16">
        {locales.map((local) => {
          const config = localConfigs.find((c) => c.id === local.id);
          const plan = planesLocales[local.id];
          const targetYTD = plan ? getTargetYTD(plan, currentMonth) : 0;
          const actualYTD = local.historico_mensual
            .filter((r) => r.year === now.getFullYear() && r.month <= currentMonth)
            .reduce((s, r) => s + r.revenue_bruto, 0);
          const cumplimiento = targetYTD > 0 ? actualYTD / targetYTD : 0;
          const isOffSeason = config?.es_estacional && !config.meses_temporada_alta.includes(currentMonth);

          return (
            <div key={local.id} className="card">
              <div className="flex-between mb-8">
                <div className="card-title">{local.nombre}</div>
                {isOffSeason ? (
                  <span className="badge gris">Off-season</span>
                ) : (
                  <span className={`semaforo ${semClass(cumplimiento)}`}>
                    {(cumplimiento * 100).toFixed(0)}% YTD
                  </span>
                )}
              </div>
              <div className="card-value-sm mono">{fmtUSD(local.mes_actual.revenue)}</div>
              <div className="card-sub">Este mes · {local.mes_actual.orders_count} órdenes</div>
              {targetYTD > 0 && !isOffSeason && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
                    <span>Real YTD: {fmtUSD(actualYTD)}</span>
                    <span>Target: {fmtUSD(targetYTD)}</span>
                  </div>
                  <div className="progress-wrap">
                    <div
                      className={`progress-fill ${semClass(cumplimiento)}`}
                      style={{ width: `${Math.min(cumplimiento * 100, 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="card section">
        <div className="card-title">Facturado mensual por local — {now.getFullYear() - 1} vs {now.getFullYear()}</div>
        <div className="chart-container" style={{ height: 280 }}>
          <canvas ref={chartRef} />
        </div>
      </div>
    </div>
  );
}
