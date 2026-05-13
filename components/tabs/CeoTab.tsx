"use client";

interface AccionPriorizada {
  accion: string;
  responsable: string;
  impacto: string;
  severidad: "alta" | "media" | "baja";
}

interface QueCorregir {
  descripcion: string;
  severidad: "alta" | "media" | "baja";
}

interface CeoAnalysis {
  _ultima_actualizacion: string | null;
  estado_general: string;
  headline: string;
  carta_ceo: string[];
  insight_del_dia: string;
  que_viene_bien: string[];
  que_hay_que_corregir: QueCorregir[];
  acciones_priorizadas: AccionPriorizada[];
  preguntas_para_pensar: string[];
  outlook_proximo_mes: string;
}

interface CeoTabProps {
  data: CeoAnalysis;
}

const SEVERIDAD_CLASS = { alta: "rojo", media: "amarillo", baja: "verde" };

export default function CeoTab({ data }: CeoTabProps) {
  const ts = data._ultima_actualizacion
    ? new Date(data._ultima_actualizacion).toLocaleString("es-UY", { timeZone: "America/Montevideo" })
    : null;

  return (
    <div>
      <div className="flex-between mb-16" style={{ flexWrap: "wrap", gap: 8 }}>
        <div className="flex gap-8 flex-center">
          <span style={{ fontSize: 28 }}>{data.estado_general}</span>
          <h2 style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3, maxWidth: 600 }}>{data.headline}</h2>
        </div>
        {ts && <span className="text-muted fs-12 mono">{ts}</span>}
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-title">Carta CEO</div>
          {data.carta_ceo.map((p, i) => (
            <p key={i} style={{ fontSize: 13, lineHeight: 1.7, marginBottom: i < data.carta_ceo.length - 1 ? 10 : 0, color: "var(--text-dim)" }}>
              {p}
            </p>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="card card-sm" style={{ borderLeft: "3px solid var(--purple)" }}>
            <div className="card-title" style={{ color: "var(--purple)" }}>💡 Insight del día</div>
            <p style={{ fontSize: 13, lineHeight: 1.6 }}>{data.insight_del_dia}</p>
          </div>

          <div className="card card-sm" style={{ borderLeft: "3px solid var(--green)" }}>
            <div className="card-title">✅ Qué viene bien</div>
            {data.que_viene_bien.length === 0 ? (
              <p className="text-muted fs-12">Sin datos suficientes</p>
            ) : (
              <ul style={{ paddingLeft: 16, fontSize: 13, lineHeight: 1.8 }}>
                {data.que_viene_bien.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            )}
          </div>

          <div className="card card-sm" style={{ borderLeft: "3px solid var(--red)" }}>
            <div className="card-title">⚠️ Qué hay que corregir</div>
            {data.que_hay_que_corregir.length === 0 ? (
              <p className="text-muted fs-12">Sin alertas activas</p>
            ) : (
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
                {data.que_hay_que_corregir.map((item, i) => (
                  <li key={i} className="flex gap-8 flex-center">
                    <span className={`badge ${SEVERIDAD_CLASS[item.severidad]}`}>{item.severidad}</span>
                    <span style={{ fontSize: 13 }}>{item.descripcion}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-title">🎯 Acciones priorizadas</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {data.acciones_priorizadas.map((a, i) => (
            <div key={i} className="card card-sm flex-between" style={{ flexWrap: "wrap", gap: 8 }}>
              <div className="flex gap-12 flex-center" style={{ flex: 1 }}>
                <span className="mono fw-600 text-muted" style={{ fontSize: 18, width: 24, textAlign: "center" }}>
                  {i + 1}
                </span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{a.accion}</div>
                  <div className="text-muted fs-12">{a.impacto}</div>
                </div>
              </div>
              <div className="flex gap-8 flex-center">
                <span className="badge azul">{a.responsable}</span>
                <span className={`badge ${SEVERIDAD_CLASS[a.severidad]}`}>{a.severidad}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid-2">
        <div className="card card-sm">
          <div className="card-title">❓ Preguntas para pensar</div>
          <ul style={{ paddingLeft: 16, fontSize: 13, lineHeight: 2 }}>
            {data.preguntas_para_pensar.map((q, i) => <li key={i}>{q}</li>)}
          </ul>
        </div>
        <div className="card card-sm" style={{ borderLeft: "3px solid var(--accent)" }}>
          <div className="card-title">🔭 Outlook próximo mes</div>
          <p style={{ fontSize: 13, lineHeight: 1.7 }}>{data.outlook_proximo_mes}</p>
        </div>
      </div>
    </div>
  );
}
