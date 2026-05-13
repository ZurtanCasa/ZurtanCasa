"use client";
import { useState } from "react";

const SECCIONES = [
  {
    id: "empezar",
    titulo: "🚀 Cómo empezar",
    contenido: `El dashboard se actualiza solo 3 veces por día (mañana, mediodía y noche, hora Uruguay).
Cuando entrás, el tab CEO ya tiene el análisis del último refresh listo.

Flujo recomendado:
1. Abrí CEO → leé el headline y el estado general (🟢/🟡/🔴)
2. Revisá las acciones priorizadas — tienen responsable y severidad
3. Si algo te llama la atención, pasá al tab correspondiente
4. Para datos en tiempo real, usá el tab Chat

El dashboard nunca muestra datos inventados. Si una integración falla, esa sección dice "sin datos".`,
  },
  {
    id: "glosario",
    titulo: "📖 Glosario de métricas",
    contenido: `**Revenue Bruto** — Ventas totales con IVA incluido.
**Revenue Neto** — Revenue × margen neto (${28}%). Lo que queda después de TODO.
**MTD** — Month To Date: acumulado del mes hasta hoy.
**YTD** — Year To Date: acumulado del año hasta hoy.
**YoY** — Year over Year: comparación con el mismo período del año anterior.
**AOV** — Average Order Value: ticket promedio por orden.
**ROAS** — Return On Ad Spend: revenue / gasto en ads. Ej: ROAS 3x = $3 por cada $1 invertido.
**Breakeven** — USD 13.000/mes. Por debajo = pérdida operativa.
**Forecast lineal** — Proyección asumiendo mismo ritmo hasta fin de mes.
**Forecast realista** — Lineal × 0.92 (ajuste conservador).`,
  },
  {
    id: "tabs",
    titulo: "📋 Qué muestra cada tab",
    contenido: `🧠 **CEO** — Análisis ejecutivo generado por Claude 3 veces/día. Headline + carta + acciones priorizadas con responsable.

💬 **Chat** — Conversación directa con el CEO IA. Puede consultar datos en tiempo real de todas las plataformas.

📊 **Performance** — KPI #1: breakeven. Revenue total MTD con forecast. Chart histórico 3 años.

📈 **Ads Daily** — Meta y Google con switcher today/ayer/7d/30d. Campañas con semáforos ROAS. Las campañas de alcance no se juzgan por ROAS.

🎯 **ROAS Triangulado** — 4 fuentes comparadas: plataforma / Shopify / GA4 / intermedio. El intermedio es el más confiable.

🛒 **Funnel & ML** — KPIs Shopify + MercadoLibre con bruto vs neto post-comisión 17%.

🏪 **Locales** — Card por local con cumplimiento YTD según su propia curva mensual (no lineal).

📅 **Plan vs Real** — Tabla mes a mes con semáforos: verde ≥100%, amarillo 85-100%, rojo <85%.

📚 **Tutorial** — Esta guía.`,
  },
  {
    id: "roas",
    titulo: "🎯 Entendiendo el ROAS Triangulado",
    contenido: `Las plataformas de ads sobreestiman el revenue que generaron porque:
- Cuentan conversiones que hubieran pasado igual (orgánicas)
- Atribuyen a múltiples canales la misma venta
- Incluyen view-through (alguien vio un banner pero compró por otro lado)

**Inflación típica:**
- Meta Ads: sobreestima 180-400% (conversiones de 28 días por defecto)
- Google Ads: sobreestima 25-56% (mejor modelo de atribución, pero igual infla)

**Las 4 fuentes:**
- Plataforma: el número que te muestra Meta/Google — siempre el más alto
- Shopify last-click: solo cuenta cuando el último click fue el ad — el más bajo
- GA4 cross-device: más completo, considera múltiples sesiones
- Intermedio: (Shopify + GA4) / 2 — la métrica más balanceada

**Regla práctica:** si el ROAS de plataforma dice 8x pero el intermedio dice 3x, usá 3x para tomar decisiones de budget.`,
  },
  {
    id: "plan",
    titulo: "📅 Plan anual y targets",
    contenido: `El archivo data/plan_anual.json tiene los targets anuales por canal.

**Monthly share:** cada local tiene una distribución mensual basada en su histórico real. Esto significa que en meses de menor venta el target también es menor — no se exige igual en todos los meses.

Para actualizar el plan:
1. Pedile a Gerardo los targets anuales
2. Editá data/plan_anual.json directamente
3. El dashboard los toma en el próximo refresh

**Importate:** el plan NO es una distribución lineal. Mayo y Noviembre son meses especiales con tracking adicional.`,
  },
  {
    id: "semaforos",
    titulo: "🚦 Sistema de semáforos",
    contenido: `**Verde** — ≥100% del target. Todo bien.
**Amarillo** — 85-99% del target. Atención pero no emergencia.
**Rojo** — <85% del target. Acción requerida.
**Gris** — Sin datos o contexto especial (off-season, campaña de alcance, etc.)

**Reglas especiales:**
- Locales estacionales en off-season: se muestran en gris, no se alertan
- Campañas de alcance: nunca se juzgan por ROAS (su objetivo es brand awareness y footfall)
- Meses con promo activa: AOV bajo es esperado, no es alerta
- Febrero: mes corto, el forecast lineal puede ser engañoso`,
  },
  {
    id: "acciones",
    titulo: "🎯 Cómo priorizar acciones",
    contenido: `El CEO IA genera 5-7 acciones priorizadas en cada refresh.

**Estructura de cada acción:**
- Qué hacer (concreto, no vago)
- Responsable: Gerardo / Ignacio / Clara / María / Nicolás
- Impacto esperado
- Severidad: alta / media / baja

**Regla de priorización:**
1. Todo lo que ponga en riesgo el breakeven mensual — ALTA
2. Caídas YoY significativas (>15%) — ALTA
3. Campañas con ROAS extremo (<1x) activas — ALTA
4. Cumplimiento de locales con desvío sostenido — MEDIA
5. Oportunidades de optimización — MEDIA/BAJA

**Qué hacer:** revisá las de severidad ALTA primero. Las de BAJA pueden esperar hasta la semana siguiente.`,
  },
  {
    id: "faq",
    titulo: "❓ FAQ",
    contenido: `**¿Cada cuánto se actualiza el dashboard?**
3 veces por día: ~8am, ~13h y ~20h hora Uruguay. GitHub Actions ejecuta los scripts y commitea los JSON, lo que dispara un redeploy en Vercel.

**¿Los datos son en tiempo real?**
Los JSONs tienen hasta 4-8hs de antigüedad. Para datos en tiempo real, usá el tab Chat que consulta las APIs directamente.

**¿Qué pasa si falla una integración?**
La sección dice "sin datos" en lugar de mostrar números falsos. El resto del dashboard funciona normal.

**¿Cómo agrego un nuevo local?**
Editá data/contexto_negocio.json agregando el local en el array "locales", y data/plan_anual.json con su target y monthly_share.

**¿Cómo cambio el breakeven?**
Editá data/contexto_negocio.json → breakeven_mensual.usd.

**¿Puedo ver datos históricos?**
Sí. El tab Performance muestra 3 años en el chart. El Chat puede consultar cualquier período del histórico.

**¿Cómo recibo alertas?**
El sistema envía WhatsApp 2 veces por día (9am y 6pm) con lo más importante del dashboard. Las alertas se deduplicann con 24h de cooldown para no spamear.`,
  },
];

export default function TutorialTab() {
  const [active, setActive] = useState("empezar");
  const current = SECCIONES.find((s) => s.id === active)!;

  function renderContent(text: string) {
    return text.split("\n").map((line, i) => {
      const bold = line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      return (
        <p key={i} style={{ marginBottom: line === "" ? 0 : 6, minHeight: line === "" ? 12 : undefined }}
          dangerouslySetInnerHTML={{ __html: bold }} />
      );
    });
  }

  return (
    <div className="grid-2" style={{ alignItems: "start" }}>
      <div className="card card-sm">
        <div className="card-title" style={{ marginBottom: 12 }}>Secciones</div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {SECCIONES.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              style={{
                background: active === s.id ? "var(--bg-card-hover)" : "none",
                border: "none",
                borderLeft: active === s.id ? "3px solid var(--accent)" : "3px solid transparent",
                color: active === s.id ? "var(--text)" : "var(--text-dim)",
                padding: "8px 12px",
                textAlign: "left",
                cursor: "pointer",
                borderRadius: "0 4px 4px 0",
                fontSize: 13,
                fontFamily: "var(--sans)",
              }}
            >
              {s.titulo}
            </button>
          ))}
        </nav>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>{current.titulo}</h2>
        <div style={{ fontSize: 13, lineHeight: 1.8, color: "var(--text-dim)" }}>
          {renderContent(current.contenido)}
        </div>
      </div>
    </div>
  );
}
