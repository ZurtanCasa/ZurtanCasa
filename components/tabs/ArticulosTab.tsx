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
  top_articulos_por_anio: Record<string, Articulo[]>;
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

function isExpandable(cat: string): boolean {
  return /yute|lana|pet/i.test(cat);
}

function stripCode(name: string): string {
  const idx = name.lastIndexOf(" - ");
  return idx !== -1 ? name.substring(0, idx).trim() : name;
}

function parseArticle(name: string): { medida: string; color: string } {
  const clean = stripCode(name);
  const m = clean.match(/(\d+)\s*[xX]\s*(\d+)/);
  if (!m) return { medida: "", color: "" };
  const idx = clean.indexOf(m[0]);
  const medida = `${m[1]} x ${m[2]}`;
  const color = clean.substring(idx + m[0].length).trim();
  return { medida, color };
}

interface MedidaGroup {
  medida: string;
  total_usd: number;
  total_units: number;
  colores: { color: string; revenue_usd: number; units: number }[];
}

function buildDrilldown(catName: string, articles: Articulo[]): MedidaGroup[] {
  const filtered = articles.filter((a) => a.categoria === catName);
  const groups: Record<string, Record<string, { revenue_usd: number; units: number }>> = {};

  for (const a of filtered) {
    const { medida, color } = parseArticle(a.articulo);
    const m = medida || "(sin medida)";
    const c = color || "(sin color)";
    if (!groups[m]) groups[m] = {};
    if (!groups[m][c]) groups[m][c] = { revenue_usd: 0, units: 0 };
    groups[m][c].revenue_usd += a.revenue_usd;
    groups[m][c].units += a.units;
  }

  return Object.entries(groups)
    .map(([medida, cols]) => ({
      medida,
      total_usd: Object.values(cols).reduce((s, v) => s + v.revenue_usd, 0),
      total_units: Object.values(cols).reduce((s, v) => s + v.units, 0),
      colores: Object.entries(cols)
        .map(([color, v]) => ({ color, ...v }))
        .sort((a, b) => b.revenue_usd - a.revenue_usd),
    }))
    .sort((a, b) => b.total_usd - a.total_usd);
}

export default function ArticulosTab({ data }: Props) {
  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInst = useRef<any>(null);
  const [selectedYear, setSelectedYear] = useState<string>("todos");
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  // Artículos activos según el año seleccionado (para el drill-down)
  const articulosActivos: Articulo[] = selectedYear === "todos"
    ? data.top_articulos
    : (data.top_articulos_por_anio?.[selectedYear] ?? data.top_articulos);

  const years = Object.keys(data.por_anio_mes_categoria).sort();

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
          label: "Facturado USD",
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
          tooltip: { callbacks: { label: (ctx: any) => ` ${fmtUSD(ctx.raw)}` } },
        },
        scales: {
          x: { ticks: { color: "#6b7280", callback: (v: any) => "$" + (v / 1000).toFixed(0) + "k" }, grid: { color: "#1e2230" } },
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

  const tdMuted: React.CSSProperties = { padding: "8px 10px", color: "var(--text-muted)", fontSize: 13 };
  const tdVal: React.CSSProperties = { padding: "8px 10px", textAlign: "right", fontFamily: "monospace", fontSize: 13 };

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
              onClick={() => { setSelectedYear(y); setExpandedCat(null); }}
              style={{
                padding: "4px 12px", borderRadius: 6, border: "1px solid var(--border)",
                background: selectedYear === y ? "var(--accent)" : "var(--card-bg)",
                color: selectedYear === y ? "#fff" : "var(--text-muted)",
                cursor: "pointer", fontSize: 12, fontWeight: selectedYear === y ? 600 : 400,
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
          <div className="card-title">Facturado total</div>
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

      {/* Gráfico */}
      <div className="card section mb-16">
        <div className="card-title">Facturado por categoría</div>
        <div className="chart-container" style={{ height: Math.max(200, catData.length * 44) }}>
          <canvas ref={chartRef} />
        </div>
      </div>

      {/* Tabla de categorías con drill-down */}
      <div className="card section">
        <div className="flex-between mb-12">
          <div className="card-title" style={{ marginBottom: 0 }}>Detalle por categoría</div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "6px 10px", color: "var(--text-muted)", fontWeight: 500 }}>Categoría</th>
                <th style={{ textAlign: "right", padding: "6px 10px", color: "var(--text-muted)", fontWeight: 500 }}>Facturado</th>
                <th style={{ textAlign: "right", padding: "6px 10px", color: "var(--text-muted)", fontWeight: 500 }}>Unidades</th>
                <th style={{ textAlign: "right", padding: "6px 10px", color: "var(--text-muted)", fontWeight: 500 }}>Ticket</th>
                <th style={{ textAlign: "left", padding: "6px 10px", color: "var(--text-muted)", fontWeight: 500 }}>Participación</th>
              </tr>
            </thead>
            <tbody>
              {catData.map((cat, i) => {
                const color = catColor(cat.categoria, i);
                const pct = totalRev > 0 ? cat.revenue_usd / totalRev : 0;
                const ticket = cat.units > 0 ? cat.revenue_usd / cat.units : 0;
                const expandable = isExpandable(cat.categoria);
                const isOpen = expandedCat === cat.categoria;
                const drilldown = isOpen ? buildDrilldown(cat.categoria, articulosActivos) : [];

                return (
                  <>
                    <tr
                      key={cat.categoria}
                      onClick={() => expandable && setExpandedCat(isOpen ? null : cat.categoria)}
                      style={{
                        borderBottom: isOpen ? "none" : "1px solid #1e2230",
                        cursor: expandable ? "pointer" : "default",
                        background: isOpen ? "#1a1f2e" : "transparent",
                        transition: "background 0.15s",
                      }}
                    >
                      <td style={{ padding: "10px 10px", fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{
                          display: "inline-block", width: 10, height: 10, borderRadius: 2,
                          background: color, flexShrink: 0,
                        }} />
                        <span>{cat.categoria}</span>
                        {expandable && (
                          <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 2 }}>
                            {isOpen ? "▼" : "▶"}
                          </span>
                        )}
                      </td>
                      <td style={{ ...tdVal, fontWeight: 600 }}>{fmtUSD(cat.revenue_usd)}</td>
                      <td style={tdMuted}>{cat.units}</td>
                      <td style={tdMuted}>{fmtUSD(ticket)}</td>
                      <td style={{ padding: "10px 10px", minWidth: 130 }}>
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

                    {/* Drilldown por medida → color */}
                    {isOpen && (
                      <tr key={cat.categoria + "_drill"} style={{ borderBottom: "1px solid #1e2230" }}>
                        <td colSpan={5} style={{ padding: "0 0 4px 0", background: "#1a1f2e" }}>
                          {drilldown.length === 0 ? (
                            <div style={{ padding: "12px 24px", color: "var(--text-muted)", fontSize: 12 }}>
                              Sin datos de artículos para esta categoría en el histórico.
                            </div>
                          ) : (
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                              <thead>
                                <tr style={{ borderBottom: "1px solid #2a3040" }}>
                                  <th style={{ textAlign: "left", padding: "6px 10px 6px 32px", color: color, fontWeight: 600 }}>Medida</th>
                                  <th style={{ textAlign: "left", padding: "6px 10px", color: "var(--text-muted)", fontWeight: 500 }}>Color</th>
                                  <th style={{ textAlign: "right", padding: "6px 10px", color: "var(--text-muted)", fontWeight: 500 }}>Facturado</th>
                                  <th style={{ textAlign: "right", padding: "6px 10px", color: "var(--text-muted)", fontWeight: 500 }}>Unidades</th>
                                  <th style={{ textAlign: "right", padding: "6px 10px", color: "var(--text-muted)", fontWeight: 500 }}>Ticket</th>
                                </tr>
                              </thead>
                              <tbody>
                                {drilldown.map((grupo) =>
                                  grupo.colores.map((c, ci) => (
                                    <tr
                                      key={grupo.medida + c.color}
                                      style={{ borderBottom: "1px solid #232838" }}
                                    >
                                      <td style={{ padding: "7px 10px 7px 32px", fontWeight: ci === 0 ? 600 : 400, color: ci === 0 ? "#e5e7eb" : "transparent" }}>
                                        {ci === 0 ? grupo.medida : ""}
                                      </td>
                                      <td style={{ padding: "7px 10px", color: "var(--text-muted)" }}>{c.color || "—"}</td>
                                      <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: "monospace" }}>{fmtUSD(c.revenue_usd)}</td>
                                      <td style={{ padding: "7px 10px", textAlign: "right", color: "var(--text-muted)" }}>{c.units}</td>
                                      <td style={{ padding: "7px 10px", textAlign: "right", color: "var(--text-muted)", fontFamily: "monospace" }}>
                                        {c.units > 0 ? fmtUSD(c.revenue_usd / c.units) : "—"}
                                      </td>
                                    </tr>
                                  ))
                                )}
                                {/* Total del grupo */}
                                <tr style={{ borderTop: "1px solid #2a3040", background: "#151924" }}>
                                  <td style={{ padding: "7px 10px 7px 32px", fontWeight: 600, color: color }}>Total</td>
                                  <td />
                                  <td style={{ padding: "7px 10px", textAlign: "right", fontFamily: "monospace", fontWeight: 600, color: color }}>
                                    {fmtUSD(drilldown.reduce((s, g) => s + g.total_usd, 0))}
                                  </td>
                                  <td style={{ padding: "7px 10px", textAlign: "right", fontWeight: 600, color: color }}>
                                    {drilldown.reduce((s, g) => s + g.total_units, 0)}
                                  </td>
                                  <td />
                                </tr>
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
