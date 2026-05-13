"use client";
import { useEffect, useRef } from "react";

interface MonthlyRoas {
  year: number;
  month: number;
  roas_plataforma: number;
  roas_shopify: number;
  roas_ga4: number;
}

interface RoasTabProps {
  metaHistorico: MonthlyRoas[];
  googleHistorico: MonthlyRoas[];
  totalSpendMeta: number;
  totalSpendGoogle: number;
  sinDatos: boolean;
}

declare global {
  interface Window { Chart: any; }
}

function fmtUSD(n: number) {
  return new Intl.NumberFormat("es-UY", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export default function RoasTab({ metaHistorico, googleHistorico, totalSpendMeta, totalSpendGoogle, sinDatos }: RoasTabProps) {
  const metaChartRef = useRef<HTMLCanvasElement>(null);
  const googleChartRef = useRef<HTMLCanvasElement>(null);
  const metaChart = useRef<any>(null);
  const googleChart = useRef<any>(null);

  function buildChart(canvas: HTMLCanvasElement | null, data: MonthlyRoas[], instance: React.MutableRefObject<any>) {
    if (!canvas || !window.Chart) return;
    if (instance.current) instance.current.destroy();

    const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const current = new Date().getFullYear();
    const filtered = data.filter((r) => r.year === current);

    instance.current = new window.Chart(canvas, {
      type: "line",
      data: {
        labels: months,
        datasets: [
          {
            label: "Plataforma reportado",
            data: months.map((_, mi) => filtered.find((r) => r.month === mi + 1)?.roas_plataforma ?? null),
            borderColor: "#ef4444",
            tension: 0.3,
            pointRadius: 3,
          },
          {
            label: "Shopify last-click",
            data: months.map((_, mi) => filtered.find((r) => r.month === mi + 1)?.roas_shopify ?? null),
            borderColor: "#4f8ef7",
            tension: 0.3,
            pointRadius: 3,
          },
          {
            label: "GA4 cross-device",
            data: months.map((_, mi) => filtered.find((r) => r.month === mi + 1)?.roas_ga4 ?? null),
            borderColor: "#a855f7",
            tension: 0.3,
            pointRadius: 3,
          },
          {
            label: "Intermedio (Shopify+GA4)/2",
            data: months.map((_, mi) => {
              const r = filtered.find((f) => f.month === mi + 1);
              if (!r) return null;
              return r.roas_shopify && r.roas_ga4 ? (r.roas_shopify + r.roas_ga4) / 2 : null;
            }),
            borderColor: "#22c55e",
            borderDash: [4, 4],
            tension: 0.3,
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: "#9ca3af", font: { size: 11 } } },
          tooltip: { callbacks: { label: (ctx: any) => `${ctx.dataset.label}: ${ctx.parsed.y?.toFixed(2)}x` } },
        },
        scales: {
          x: { ticks: { color: "#6b7280" }, grid: { color: "#1e2230" } },
          y: { ticks: { color: "#6b7280", callback: (v: any) => v + "x" }, grid: { color: "#1e2230" } },
        },
      },
    });
  }

  useEffect(() => {
    buildChart(metaChartRef.current, metaHistorico, metaChart);
    return () => { metaChart.current?.destroy(); };
  }, [metaHistorico]);

  useEffect(() => {
    buildChart(googleChartRef.current, googleHistorico, googleChart);
    return () => { googleChart.current?.destroy(); };
  }, [googleHistorico]);

  if (sinDatos) {
    return (
      <div>
        <div className="banner info">ℹ️ Conectá Meta Ads, Google Ads, Shopify y GA4 para ver el ROAS triangulado.</div>
        <div className="card mt-16">
          <div className="card-title">¿Qué es el ROAS Triangulado?</div>
          <div style={{ fontSize: 13, lineHeight: 1.8, color: "var(--text-dim)", marginTop: 8 }}>
            <p style={{ marginBottom: 8 }}>Las plataformas publicitarias <strong>sobreestiman</strong> el revenue atribuido. Por eso triangulamos 4 fuentes:</p>
            <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
              <li><span style={{ color: "var(--red)" }}>Plataforma reportado</span> — Meta/Google sobreestiman 180-400% y 25-56% respectivamente</li>
              <li><span style={{ color: "var(--accent)" }}>Shopify last-click</span> — subestima (ignora view-through y asistidos)</li>
              <li><span style={{ color: "var(--purple)" }}>GA4 cross-device</span> — triangulación más completa</li>
              <li><span style={{ color: "var(--green)" }}>Intermedio</span> — (Shopify + GA4) / 2 — la métrica más confiable</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="banner info">
        📌 Meta sobreestima ROAS típicamente 180-400% | Google sobreestima 25-56% | Usá el <strong>Intermedio</strong> como métrica principal
      </div>

      <div className="grid-2 mb-16">
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { label: "Plataforma", color: "var(--red)", desc: "Sobreestimado" },
            { label: "Shopify", color: "var(--accent)", desc: "Subestimado" },
            { label: "GA4", color: "var(--purple)", desc: "Cross-device" },
            { label: "Intermedio", color: "var(--green)", desc: "Más confiable" },
          ].map(({ label, color, desc }) => (
            <div key={label} style={{ flex: 1, background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "8px", textAlign: "center" }}>
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: color, margin: "0 auto 4px" }} />
              <div style={{ fontSize: 11, fontWeight: 600 }}>{label}</div>
              <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{desc}</div>
            </div>
          ))}
        </div>
        <div className="card card-sm">
          <div className="flex-between">
            <div>
              <div className="card-title">Spend Meta</div>
              <div className="card-value-sm mono">{fmtUSD(totalSpendMeta)}</div>
            </div>
            <div>
              <div className="card-title">Spend Google</div>
              <div className="card-value-sm mono">{fmtUSD(totalSpendGoogle)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-title">📘 Meta Ads — ROAS Triangulado 2026</div>
        <div className="card">
          <div className="chart-container" style={{ height: 260 }}>
            <canvas ref={metaChartRef} />
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-title">🔍 Google Ads — ROAS Triangulado 2026</div>
        <div className="card">
          <div className="chart-container" style={{ height: 260 }}>
            <canvas ref={googleChartRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
