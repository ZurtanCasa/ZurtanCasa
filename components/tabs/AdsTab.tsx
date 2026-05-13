"use client";
import { useState } from "react";

type Period = "today" | "yesterday" | "last_7d" | "last_30d";

interface PeriodStats {
  spend: number;
  revenue_reportado: number;
  roas: number;
  conversiones: number;
  impressions: number;
  clicks: number;
}

interface Campaign {
  id: string;
  nombre: string;
  tipo: "performance" | "alcance";
  spend: number;
  revenue: number;
  roas: number;
  conversiones: number;
}

interface AdsData {
  periodos: Record<Period, PeriodStats>;
  campanas: Campaign[];
  _status: string;
}

function fmtUSD(n: number) {
  return new Intl.NumberFormat("es-UY", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function roasClass(roas: number, tipo: string): string {
  if (tipo === "alcance") return "gris";
  if (roas >= 5) return "verde";
  if (roas >= 2) return "amarillo";
  return "rojo";
}

interface ProviderBlockProps {
  name: string;
  icon: string;
  data: AdsData;
  period: Period;
}

function ProviderBlock({ name, icon, data, period }: ProviderBlockProps) {
  if (data._status === "sin_datos") {
    return (
      <div className="card">
        <div className="card-title">{icon} {name}</div>
        <div className="sin-datos" style={{ padding: "24px 0" }}>
          <div className="sin-datos-icon">{icon}</div>
          <div className="sin-datos-titulo">Sin datos</div>
          <div className="sin-datos-desc">Conectá {name} para ver métricas.</div>
        </div>
      </div>
    );
  }

  const s = data.periodos[period];
  const ctr = s.impressions > 0 ? ((s.clicks / s.impressions) * 100).toFixed(2) + "%" : "—";

  return (
    <div className="card">
      <div className="flex-between mb-12">
        <div className="card-title">{icon} {name}</div>
        <span className={`semaforo ${roasClass(s.roas, "performance")}`}>ROAS {s.roas.toFixed(1)}x</span>
      </div>

      <div className="kpi-grid-3" style={{ marginBottom: 16 }}>
        {[
          { label: "Spend", val: fmtUSD(s.spend) },
          { label: "Revenue reportado", val: fmtUSD(s.revenue_reportado) },
          { label: "Conversiones", val: s.conversiones.toString() },
          { label: "Impresiones", val: s.impressions.toLocaleString("es-UY") },
          { label: "Clicks", val: s.clicks.toLocaleString("es-UY") },
          { label: "CTR", val: ctr },
        ].map(({ label, val }) => (
          <div key={label} style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "8px 12px" }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--text-muted)" }}>{label}</div>
            <div className="mono fw-600" style={{ fontSize: 14, marginTop: 2 }}>{val}</div>
          </div>
        ))}
      </div>

      {data.campanas.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--text-muted)", marginBottom: 8 }}>
            Campañas
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Campaña</th>
                  <th>Tipo</th>
                  <th>Spend</th>
                  <th>Revenue</th>
                  <th>ROAS</th>
                </tr>
              </thead>
              <tbody>
                {data.campanas.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nombre}</td>
                    <td><span className={`badge ${c.tipo === "alcance" ? "gris" : "azul"}`}>{c.tipo}</span></td>
                    <td className="td-mono">{fmtUSD(c.spend)}</td>
                    <td className="td-mono">{c.tipo === "alcance" ? <span className="text-muted">N/A</span> : fmtUSD(c.revenue)}</td>
                    <td>
                      {c.tipo === "alcance" ? (
                        <span className="badge gris">Alcance</span>
                      ) : (
                        <span className={`badge ${roasClass(c.roas, c.tipo)}`}>{c.roas.toFixed(1)}x</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

interface AdsTabProps {
  metaData: AdsData;
  googleData: AdsData;
}

const PERIOD_LABELS: Record<Period, string> = {
  today: "Hoy",
  yesterday: "Ayer",
  last_7d: "7 días",
  last_30d: "30 días",
};

export default function AdsTab({ metaData, googleData }: AdsTabProps) {
  const [period, setPeriod] = useState<Period>("yesterday");

  return (
    <div>
      <div className="flex-between mb-16">
        <div />
        <div className="period-switcher">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button key={p} className={`period-btn${period === p ? " active" : ""}`} onClick={() => setPeriod(p)}>
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid-2">
        <ProviderBlock name="Meta Ads" icon="📘" data={metaData} period={period} />
        <ProviderBlock name="Google Ads" icon="🔍" data={googleData} period={period} />
      </div>
    </div>
  );
}
