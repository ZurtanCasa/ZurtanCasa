"use client";
import { useState } from "react";

type Period = "today" | "yesterday" | "last_7d" | "last_30d";

const PERIOD_LABELS: Record<Period, string> = {
  today: "Hoy",
  yesterday: "Ayer",
  last_7d: "7 días",
  last_30d: "30 días",
};

interface MktPeriod {
  impressions: number;
  reach: number;
  cpm: number;
  spend: number;
  clicks?: number;
  profile_visits_ig?: number;
  profile_visits_fb?: number;
  new_followers_ig?: number;
  new_followers_fb?: number;
}

interface AdRow {
  id: string;
  nombre: string;
  periodos: Record<Period, { impressions: number; reach: number; cpm: number; spend: number } | undefined>;
}

interface Marketing {
  periodos: Record<Period, MktPeriod>;
  por_anuncio: AdRow[];
  _ig_ok: boolean;
  _fb_ok: boolean;
  ig_followers_total?: number | null;
}

function fmtUSD(n: number) {
  return new Intl.NumberFormat("es-UY", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}
function fmtNum(n: number) {
  return new Intl.NumberFormat("es-UY").format(n);
}

// ── Tarjeta de métrica ──────────────────────────────────────────────────────
function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "12px 14px" }}>
      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--text-muted)" }}>{label}</div>
      <div className="mono fw-600" style={{ fontSize: 20, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function MarketingTab({ meta, locales }: { meta: any; locales: any }) {
  const [period, setPeriod] = useState<Period>("last_30d");
  const mkt: Marketing | undefined = meta?.marketing;

  if (!mkt || meta?._status === "sin_datos") {
    return (
      <div className="card">
        <div className="sin-datos">
          <div className="sin-datos-icon">📣</div>
          <div className="sin-datos-titulo">Aún no hay métricas de marketing</div>
          <div className="sin-datos-desc">
            Se llenan solas cuando el workflow trae datos de Meta. Si recién lo configuraste,
            corré el workflow o esperá la próxima corrida.
          </div>
        </div>
      </div>
    );
  }

  const p = mkt.periodos[period] ?? ({} as MktPeriod);

  // ── CAC = inversión del mes / clientes del mes (orders_count de locales) ──
  const now = new Date();
  const monthEntry = (meta.historico_mensual || []).find(
    (r: any) => r.year === now.getFullYear() && r.month === now.getMonth() + 1
  );
  const monthSpend = monthEntry?.spend || 0;
  const clientesMes = (locales?.locales || []).reduce(
    (s: number, l: any) => s + (l.mes_actual?.orders_count || 0),
    0
  );
  const cac = clientesMes > 0 ? monthSpend / clientesMes : null;

  // ── Perfil y seguidores ──
  // Visitas al perfil: solo Instagram (Facebook eliminó esa métrica de páginas).
  const profileVisits = p.profile_visits_ig || 0;
  const newFollowers = (p.new_followers_ig || 0) + (p.new_followers_fb || 0);
  const organicPend = !mkt._ig_ok && !mkt._fb_ok;
  const followersSub = organicPend ? "IG/FB pendiente" : `IG ${p.new_followers_ig || 0} · FB ${p.new_followers_fb || 0} (brutos)`;
  const visitsSub = organicPend ? "IG/FB pendiente" : "Instagram";
  const igFollowersTotal = mkt.ig_followers_total ?? null;

  const ads = [...mkt.por_anuncio].sort(
    (a, b) => (b.periodos[period]?.impressions || 0) - (a.periodos[period]?.impressions || 0)
  );

  return (
    <div>
      {/* ── Contexto mensual: CAC ── */}
      <div className="kpi-grid mb-16">
        <div className="card">
          <div className="card-title">CAC (mes)</div>
          <div className="card-value mono">{cac !== null ? fmtUSD(cac) : "—"}</div>
          <div className="card-sub">Inversión ÷ clientes del mes</div>
        </div>
        <div className="card">
          <div className="card-title">Clientes del mes</div>
          <div className="card-value mono">{fmtNum(clientesMes)}</div>
          <div className="card-sub">Ventas en locales físicos</div>
        </div>
        <div className="card">
          <div className="card-title">Inversión del mes</div>
          <div className="card-value mono">{fmtUSD(monthSpend)}</div>
          <div className="card-sub">Gasto en Meta Ads</div>
        </div>
        <div className="card">
          <div className="card-title">Total seguidores IG</div>
          <div className="card-value mono">{igFollowersTotal !== null ? fmtNum(igFollowersTotal) : "—"}</div>
          <div className="card-sub">@zurtancasa · total actual</div>
        </div>
      </div>

      {/* ── Selector de período ── */}
      <div className="flex-between mb-16">
        <div className="card-title" style={{ margin: 0 }}>Rendimiento de anuncios</div>
        <div className="period-switcher">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((pk) => (
            <button key={pk} className={`period-btn${period === pk ? " active" : ""}`} onClick={() => setPeriod(pk)}>
              {PERIOD_LABELS[pk]}
            </button>
          ))}
        </div>
      </div>

      {/* ── General del período ── */}
      <div className="card mb-16">
        <div className="card-title mb-12">📊 General · {PERIOD_LABELS[period]}</div>
        <div className="kpi-grid-3">
          <MetricCard label="Impresiones" value={fmtNum(p.impressions || 0)} />
          <MetricCard label="Alcance" value={fmtNum(p.reach || 0)} />
          <MetricCard label="CPM" value={fmtUSD(p.cpm || 0)} sub="costo por mil impresiones" />
          <MetricCard label="Visitas al perfil" value={fmtNum(profileVisits)} sub={visitsSub} />
          <MetricCard label="Seguidores nuevos" value={fmtNum(newFollowers)} sub={followersSub} />
          <MetricCard label="Gasto" value={fmtUSD(p.spend || 0)} />
        </div>
        {organicPend && (
          <div className="banner info" style={{ marginTop: 12 }}>
            Visitas al perfil y seguidores nuevos van a aparecer cuando regeneres el token de Meta
            con permisos de páginas e Instagram (<span className="mono">pages_read_engagement</span>,{" "}
            <span className="mono">instagram_manage_insights</span>).
          </div>
        )}
      </div>

      {/* ── Por anuncio ── */}
      <div className="card">
        <div className="card-title mb-12">📣 Por anuncio · {PERIOD_LABELS[period]}</div>
        {ads.length === 0 ? (
          <div className="text-muted" style={{ padding: "12px 0", fontSize: 13 }}>
            No hay anuncios con datos en este período.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Anuncio</th>
                  <th>Impresiones</th>
                  <th>Alcance</th>
                  <th>CPM</th>
                  <th>Gasto</th>
                </tr>
              </thead>
              <tbody>
                {ads.map((a) => {
                  const ap = a.periodos[period];
                  return (
                    <tr key={a.id}>
                      <td>{a.nombre || a.id}</td>
                      <td className="td-mono">{fmtNum(ap?.impressions || 0)}</td>
                      <td className="td-mono">{fmtNum(ap?.reach || 0)}</td>
                      <td className="td-mono">{fmtUSD(ap?.cpm || 0)}</td>
                      <td className="td-mono">{fmtUSD(ap?.spend || 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
