"use client";
import { useEffect, useRef, useState } from "react";

interface Categoria {
  categoria: string;
  revenue_usd: number;
  units: number;
}

interface Articulo {
  articulo: string;
  categoria: string;
  revenue_usd: number;
  units: number;
}

interface ArticulosData {
  _status: string;
  _ultima_actualizacion?: string;
  _rango?: string;
  _nota?: string;
  top_categorias: Categoria[];
  top_articulos: Articulo[];
  por_anio_mes_categoria: Record<string, Record<string, Record<string, { revenue_usd: number; units: number }>>>;
  por_categoria_total: Record<string, { revenue_usd: number; units: number }>;
}

interface Props { data: ArticulosData; }

declare global { interface Window { Chart: any; } }

function fmtUSD(n: number) {
  return new Intl.NumberFormat("es-UY", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

const CAT_COLORS: Record<string, string> = {
  "Alfombra persa": "#4f8ef7",
  "Yute y Lana Nuevas": "#22c55e",
  "Pura Lana": "#a855f7",
  "Muebles": "#eab308",
  "Yute y Lana": "#f97316",
  "Exterior Pet": "#06b6d4",
  "Yute y Lana Diseño": "#ec4899",
  "Sin categoría": "#6b7280",
};

function catColor(cat: string, idx: number) {
  return CAT_COLORS[cat] ?? `hsl(${(idx * 53) % 360},70%,55%)`;
}

export default function ArticulosTab({ data }: Props) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInst = useRef<any>(null);
  const [selectedYear, setSelectedYear] = useState<string>("todos");

  const years = Object.keys(data.por_anio_mes_categoria).sort();

  // Calcular categorías filtradas por año
  const catData: Categoria[] = (() => {
    if (selectedYear === "todos") return data.top_categorias;
    const yearData = data.por_anio_mes_categoria[selectedYear] || {};
    const acc: Record<string, { revenue_usd: number; units: number }> = {};
    for (const mes of Object.values(yearData)) {
      for (const [cat, vals] of Object.entries(mes)) {
        if (!acc[cat]) acc[cat] = { revenue_usd: 0, units: 0 };
        acc[cat].revenue_usd = Math.round((acc[cat].revenue_usd + vals.revenue_usd) * 100) / 100;
        acc[cat].units += vals.units;
      }
    }
    return Object.entries(acc)
      .map(([categoria, v]) => ({ categoria, ...v }))
      .sort((a, b) => b.revenue_usd - a.revenue_usd);
  })();

  // Artículos filtrados por año
  const artData: Articulo[] = (() => {
    if (selectedYear === "todos") return data.top_articulos;
    const yearData = data.por_anio_mes_categoria[selectedYear] || {};
    const acc: Record<string, { revenue_usd: number; units: number; categoria: string }> = {};
    for (const mes of Object.values(yearData)) {
      for (const [cat, vals] of Object.entries(mes)) {
        // We only have category-level data per period, not article-level per year
        // Fall back to top_articulos filtered heuristically
      }
    }
    // Can't filter top_articulos by year from current data structure — show all
    return data.top_articulos;
  })();

  const totalRev = catData.reduce((s, c) => s + c.revenue_usd, 0);
  const totalUnits = catData.reduce((s, c) => s + c.units, 0);

  useEffect(() => {
    if (!chartRef.current || !window.Chart) return;
    if (chartInst.current) chartInst.current.destroy();

    const sorted = [...catData].sort((a, b) => b.revenue_usd - a.revenue_usd);

    chartInst.current = new window.Chart(chartRef.current, {
      type: "bar",
      data: {
        labels: sorted.map((c) => c.categoria),
        datasets: [{
          label: "Revenue USD",
          data: sorted.map((c) => c.revenue_usd),
          backgroundColor: sorted.map((c, i) => catColor(c.categoria, i) + "cc"),
          borderColor: sorted.map((c, i) => catColor(c.categoria, i)),
          borderWidth: 1,
          borderRadius: 4,
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx: any) => ` ${fmtUSD(ctx.raw)}`,
            },
          },
        },
        scales: {
          x: {
            ticks: { color: "#6b7280", callback: (v: any) => "$" + (v / 1000).toFixed(0) + "k" },
            grid: { color: "#1e2230" },
          },
          y: { ticks: { color: "#e5e7eb", font: { size: 12 } }, grid: { color: "#1e2230" } },
        },
      },
    });

    return () => { chartInst.current?.destroy(); };
  }, [catData]);

  if (data._status !== "ok") {
    return (
      <div className="card">
        <div className="sin-datos">
          <div className="sin-datos-icon">📦</div>
          <div className="sin-datos-titulo">Sin datos de artículos</div>
          <div className="sin-datos-desc">El scraper de ventas por artículo aún no corrió.</div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Filtro de año */}
      <div className="flex-between mb-16" style={{ alignItems: "center" }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {data._rango && `Rango: ${data._rango}`}
          {data._nota && <span style={{ marginLeft: 12 }}>· {data._nota}</span>}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {["todos", ...years].map((y) => (
            <button
              key={y}
              onClick={() => setSelectedYear(y)}
              style={{
                padding: "4px 12px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: selectedYear === y ? "var(--accent)" : "var(--card-bg)",
                color: selectedYear === y ? "#fff" : "var(--text-muted)",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: selectedYear === y ? 600 : 400,
              }}
            >
              {y === "todos" ? "Todo" : y}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="kpi-grid mb-16">
        <div className="card">
          <div className="card-title">Revenue total</div>
          <div className="card-value mono">{fmtUSD(totalRev)}</div>
          <div className="card-sub">{selectedYear === "todos" ? "Histórico" : selectedYear}</div>
        </div>
        <div className="card">
          <div className="card-title">Unidades vendidas</div>
          <div className="card-value mono">{totalUnits.toLocaleString("es-UY")}</div>
          <div className="card-sub">{catData.length} categorías activas</div>
        </div>
        <div className="card">
          <div className="card-title">Top categoría</div>
          <div className="card-value-sm mono">{catData[0]?.categoria ?? "—"}</div>
          <div className="card-sub">{catData[0] ? fmtUSD(catData[0].revenue_usd) + " · " + catData[0].units + " u" : ""}</div>
        </div>
        <div className="card">
          <div className="card-title">Ticket promedio</div>
          <div className="card-value mono">{totalUnits > 0 ? fmtUSD(totalRev / totalUnits) : "—"}</div>
          <div className="card-sub">por unidad</div>
        </div>
      </div>

      {/* Gráfico de categorías */}
      <div className="card section mb-16">
        <div className="card-title">Revenue por categoría</div>
        <div className="chart-container" style={{ height: Math.max(200, catData.length * 44) }}>
          <canvas ref={chartRef} />
        </div>
      </div>

      {/* Tabla de top artículos */}
      <div className="card section">
        <div className="card-title mb-12">Top artículos (histórico)</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-muted)", fontWeight: 500 }}>#</th>
                <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-muted)", fontWeight: 500 }}>Artículo</th>
                <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-muted)", fontWeight: 500 }}>Categoría</th>
                <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-muted)", fontWeight: 500 }}>Revenue</th>
                <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-muted)", fontWeight: 500 }}>Unidades</th>
                <th style={{ textAlign: "right", padding: "6px 8px", color: "var(--text-muted)", fontWeight: 500 }}>Ticket</th>
                <th style={{ textAlign: "left", padding: "6px 8px", color: "var(--text-muted)", fontWeight: 500 }}>Participación</th>
              </tr>
            </thead>
            <tbody>
              {data.top_articulos.slice(0, 20).map((art, i) => {
                const pct = totalRev > 0 ? art.revenue_usd / totalRev : 0;
                const ticket = art.units > 0 ? art.revenue_usd / art.units : 0;
                const color = catColor(art.categoria, Object.keys(CAT_COLORS).indexOf(art.categoria));
                return (
                  <tr key={art.articulo} style={{ borderBottom: "1px solid #1e2230" }}>
                    <td style={{ padding: "8px 8px", color: "var(--text-muted)" }}>{i + 1}</td>
                    <td style={{ padding: "8px 8px", fontWeight: 500 }}>{art.articulo}</td>
                    <td style={{ padding: "8px 8px" }}>
                      <span style={{
                        background: color + "22",
                        color,
                        border: `1px solid ${color}44`,
                        borderRadius: 4,
                        padding: "2px 7px",
                        fontSize: 11,
                        fontWeight: 500,
                      }}>
                        {art.categoria}
                      </span>
                    </td>
                    <td style={{ padding: "8px 8px", textAlign: "right", fontFamily: "monospace" }}>{fmtUSD(art.revenue_usd)}</td>
                    <td style={{ padding: "8px 8px", textAlign: "right", color: "var(--text-muted)" }}>{art.units}</td>
                    <td style={{ padding: "8px 8px", textAlign: "right", color: "var(--text-muted)", fontFamily: "monospace" }}>{fmtUSD(ticket)}</td>
                    <td style={{ padding: "8px 8px", minWidth: 120 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, background: "#1e2230", borderRadius: 3, height: 6 }}>
                          <div style={{ width: `${Math.min(pct * 100, 100)}%`, height: 6, borderRadius: 3, background: color }} />
                        </div>
                        <span style={{ fontSize: 11, color: "var(--text-muted)", width: 36, textAlign: "right" }}>
                          {(pct * 100).toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
