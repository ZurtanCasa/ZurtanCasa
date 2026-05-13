"use client";

interface MonthRow {
  mes: number;
  plan_fisico: number;
  real_fisico: number;
  plan_web: number;
  real_web: number;
  plan_ml: number;
  real_ml: number;
  plan_total: number;
  real_total: number;
}

interface PlanTabProps {
  rows: MonthRow[];
  targetAnual: number;
  realAnual: number;
  sinDatos: boolean;
}

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function fmtUSD(n: number) {
  if (n === 0) return "—";
  return new Intl.NumberFormat("es-UY", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function pctClass(real: number, plan: number): string {
  if (plan === 0 || real === 0) return "gris";
  const r = real / plan;
  if (r >= 1) return "verde";
  if (r >= 0.85) return "amarillo";
  return "rojo";
}

function pctFmt(real: number, plan: number): string {
  if (plan === 0 || real === 0) return "—";
  return (real / plan * 100).toFixed(0) + "%";
}

export default function PlanTab({ rows, targetAnual, realAnual, sinDatos }: PlanTabProps) {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;

  return (
    <div>
      <div className="kpi-grid-3 mb-16">
        <div className="card card-sm">
          <div className="card-title">Target Anual</div>
          <div className="card-value-sm mono">{fmtUSD(targetAnual)}</div>
        </div>
        <div className="card card-sm">
          <div className="card-title">Real Acumulado YTD</div>
          <div className="card-value-sm mono">{fmtUSD(realAnual)}</div>
        </div>
        <div className="card card-sm">
          <div className="card-title">Cumplimiento YTD</div>
          <div className={`card-value-sm mono text-${pctClass(realAnual, targetAnual / 12 * currentMonth) === "verde" ? "green" : pctClass(realAnual, targetAnual / 12 * currentMonth) === "amarillo" ? "yellow" : "red"}`}>
            {pctFmt(realAnual, targetAnual > 0 ? targetAnual / 12 * currentMonth : 0)}
          </div>
        </div>
      </div>

      {sinDatos && (
        <div className="banner info">ℹ️ Completá plan_anual.json con tus targets y conectá las integraciones para ver el comparativo real.</div>
      )}

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mes</th>
                <th>Plan Físico</th>
                <th>Real Físico</th>
                <th>%</th>
                <th>Plan Web</th>
                <th>Real Web</th>
                <th>%</th>
                <th>Plan ML</th>
                <th>Real ML</th>
                <th>%</th>
                <th>Plan Total</th>
                <th>Real Total</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isFuture = row.mes > currentMonth;
                return (
                  <tr key={row.mes} style={{ opacity: isFuture ? 0.4 : 1 }}>
                    <td style={{ fontWeight: row.mes === currentMonth ? 700 : 400 }}>{MESES[row.mes - 1]}</td>
                    <td className="td-mono">{fmtUSD(row.plan_fisico)}</td>
                    <td className="td-mono">{fmtUSD(row.real_fisico)}</td>
                    <td><span className={`badge ${pctClass(row.real_fisico, row.plan_fisico)}`}>{pctFmt(row.real_fisico, row.plan_fisico)}</span></td>
                    <td className="td-mono">{fmtUSD(row.plan_web)}</td>
                    <td className="td-mono">{fmtUSD(row.real_web)}</td>
                    <td><span className={`badge ${pctClass(row.real_web, row.plan_web)}`}>{pctFmt(row.real_web, row.plan_web)}</span></td>
                    <td className="td-mono">{fmtUSD(row.plan_ml)}</td>
                    <td className="td-mono">{fmtUSD(row.real_ml)}</td>
                    <td><span className={`badge ${pctClass(row.real_ml, row.plan_ml)}`}>{pctFmt(row.real_ml, row.plan_ml)}</span></td>
                    <td className="td-mono">{fmtUSD(row.plan_total)}</td>
                    <td className="td-mono" style={{ fontWeight: 600 }}>{fmtUSD(row.real_total)}</td>
                    <td><span className={`badge ${pctClass(row.real_total, row.plan_total)}`}>{pctFmt(row.real_total, row.plan_total)}</span></td>
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
