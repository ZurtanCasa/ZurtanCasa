#!/usr/bin/env python3
"""
Genera el análisis CEO con Claude Sonnet 4.6.
Requiere: ANTHROPIC_API_KEY
"""
import os, json, sys
from datetime import datetime, timezone, timedelta

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
UY_TZ = timezone(timedelta(hours=-3))

def uy_now():
    return datetime.now(UY_TZ)

def load(name):
    try:
        with open(os.path.join(DATA_DIR, name)) as f:
            return json.load(f)
    except:
        return {}

def main():
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY requerido", file=sys.stderr)
        sys.exit(1)

    import urllib.request

    shopify = load("shopify.json")
    ml = load("mercadolibre.json")
    meta = load("meta_ads.json")
    google = load("google_ads.json")
    locales = load("locales.json")
    articulos = load("articulos.json")
    plan = load("plan_anual.json")
    contexto = load("contexto_negocio.json")

    now = uy_now()
    day_of_month = now.day
    days_in_month = (datetime(now.year, now.month % 12 + 1, 1) - timedelta(days=1)).day if now.month < 12 else 31

    breakeven = contexto.get("breakeven_mensual", {}).get("usd", 13000)
    margen = contexto.get("margen_neto_pct", 0.28)
    comision_ml = contexto.get("comision_marketplace_pct", 0.17)
    promo_activa = contexto.get("promo_activa_actual", {}).get("activa", False)

    web_mtd = shopify.get("mes_actual", {}).get("revenue_bruto", 0)
    ml_mtd = ml.get("mes_actual", {}).get("revenue_bruto", 0)
    locales_mtd = sum(l.get("mes_actual", {}).get("revenue", 0) for l in locales.get("locales", []))
    total_mtd = web_mtd + ml_mtd + locales_mtd
    forecast_lineal = (total_mtd / day_of_month) * days_in_month if day_of_month > 0 else 0
    neto_mtd = total_mtd * margen

    meta_30d = meta.get("periodos", {}).get("last_30d", {})
    google_30d = google.get("periodos", {}).get("last_30d", {})

    current_year = now.year
    prev_year = current_year - 1
    yoy_web = sum(r.get("revenue_bruto", 0) for r in shopify.get("historico_mensual", [])
                  if r.get("year") == prev_year and r.get("month") <= now.month)
    yoy_ml = sum(r.get("revenue_bruto", 0) for r in ml.get("historico_mensual", [])
                 if r.get("year") == prev_year and r.get("month") <= now.month)
    ytd_total_prev = yoy_web + yoy_ml

    target_anual = plan.get("target_anual_usd", 0)
    target_mtd = target_anual / 12 if target_anual > 0 else 0

    # --- Sección artículos/categorías ---
    art_section = ""
    if articulos.get("_status") == "ok":
        por_periodo = articulos.get("por_anio_mes_categoria", {})
        yr = str(now.year)
        mo = str(now.month)
        prev_mo = str(now.month - 1) if now.month > 1 else "12"
        prev_yr = yr if now.month > 1 else str(now.year - 1)

        def cats_for(year, month):
            data = por_periodo.get(year, {}).get(month, {})
            return sorted(data.items(), key=lambda x: x[1]["revenue_usd"], reverse=True)

        cats_mtd = cats_for(yr, mo)
        cats_prev = cats_for(prev_yr, prev_mo)

        def cat_line(cats):
            if not cats:
                return "  (sin datos)"
            return "\n".join(
                f"  {cat}: USD {v['revenue_usd']:,.0f} ({v['units']} u)"
                for cat, v in cats[:6]
            )

        top_arts = articulos.get("top_articulos", [])[:8]
        top_arts_str = "\n".join(
            f"  {i+1}. {a['articulo']} ({a['categoria']}): USD {a['revenue_usd']:,.0f} · {a['units']} u · ticket USD {a['revenue_usd']/a['units']:,.0f}"
            for i, a in enumerate(top_arts) if a.get("units", 0) > 0
        )

        top_cats_hist = articulos.get("top_categorias", [])
        total_rev_hist = sum(c["revenue_usd"] for c in top_cats_hist)
        top_cats_str = "\n".join(
            f"  {c['categoria']}: USD {c['revenue_usd']:,.0f} ({c['revenue_usd']/total_rev_hist*100:.1f}% del total)"
            for c in top_cats_hist[:6]
        ) if total_rev_hist > 0 else "  (sin datos)"

        art_section = f"""
=== ARTÍCULOS Y CATEGORÍAS ===
Rango histórico: {articulos.get('_rango', 'N/A')}

Mes actual ({now.strftime('%B %Y')}):
{cat_line(cats_mtd)}

Mes anterior:
{cat_line(cats_prev)}

Mix histórico por categoría:
{top_cats_str}

Top artículos históricos:
{top_arts_str}

Nota: {articulos.get('_nota', '')}
"""

    data_summary = f"""
FECHA ACTUAL (Uruguay): {now.strftime('%Y-%m-%d %H:%M')}
DÍA {day_of_month} de {days_in_month} del mes.

=== VENTAS MTD ===
Web (Shopify): USD {web_mtd:,.0f}
MercadoLibre: USD {ml_mtd:,.0f} (bruto) / USD {ml_mtd * (1 - comision_ml):,.0f} (neto post-comisión)
Locales físicos: USD {locales_mtd:,.0f}
TOTAL MTD: USD {total_mtd:,.0f}
Neto real estimado (margen {margen*100:.0f}%): USD {neto_mtd:,.0f}

=== FORECAST MENSUAL ===
Lineal: USD {forecast_lineal:,.0f}
Realista (−8%): USD {forecast_lineal * 0.92:,.0f}
BREAKEVEN: USD {breakeven:,.0f}
¿Cubre breakeven?: {'SÍ ✅' if forecast_lineal >= breakeven else 'NO ⚠️'}

=== TARGET ===
Target mensual: USD {target_mtd:,.0f}
Cumplimiento: {(total_mtd / target_mtd * 100):.0f}% del target si target > 0 else "sin target"

=== ADS (ÚLTIMOS 30 DÍAS) ===
Meta — Spend: USD {meta_30d.get('spend', 0):,.0f} | ROAS: {meta_30d.get('roas', 0):.1f}x | Revenue reportado: USD {meta_30d.get('revenue_reportado', 0):,.0f}
Google — Spend: USD {google_30d.get('spend', 0):,.0f} | ROAS: {google_30d.get('roas', 0):.1f}x | Revenue reportado: USD {google_30d.get('revenue_reportado', 0):,.0f}

=== YoY (YTD vs mismo período año anterior) ===
YTD actual (web+ML): USD {web_mtd + ml_mtd:,.0f}
YTD año anterior (web+ML): USD {ytd_total_prev:,.0f}
YoY: {((web_mtd + ml_mtd) / ytd_total_prev - 1) * 100:+.1f}% vs año anterior {prev_year if ytd_total_prev > 0 else '(sin datos)'}

=== CONTEXTO ===
Promo activa: {'SÍ (AOV bajo es esperado)' if promo_activa else 'NO'}
Status datos Shopify: {shopify.get('_status', 'sin_datos')}
Status datos ML: {ml.get('_status', 'sin_datos')}
Status datos Meta: {meta.get('_status', 'sin_datos')}
Status datos Google: {google.get('_status', 'sin_datos')}
Status datos Locales: {locales.get('_status', 'sin_datos')}
Status datos Artículos: {articulos.get('_status', 'sin_datos')}
{art_section}"""

    equipo = contexto.get("equipo", [])
    equipo_str = "\n".join(f"- {m['nombre']}: {m['rol']}" for m in equipo)

    system = f"""Sos el CEO IA de ZurtanCasa, empresa de decoración (alfombras y muebles) en Uruguay.
Generás análisis ejecutivos concisos, directos y sin vueltas.

EQUIPO:
{equipo_str}

REGLAS:
- El breakeven mensual es USD {breakeven:,.0f}. Es el KPI #1.
- Si el forecast NO cubre el breakeven, es la alerta #1 incuestionable.
- No inventés datos. Si hay "sin_datos" en una fuente, decilo.
- No alertes por AOV bajo si hay promo activa.
- No juzgues campañas de alcance por ROAS.
- Las acciones deben tener responsable concreto del equipo.
- Usá el mix de categorías y artículos para detectar cambios en producto: si una categoría sube/baja vs mes anterior, mencionalo. Si un artículo de alto ticket domina, contextualizá el AOV.
- "Otros" o "Sin categoría" en artículos indica venta sin código correcto en el sistema — alertar si supera 10% del revenue.
- Tono: directo, sin formalidades, como dueño que habla con su gerente.
- Respondé SOLO con JSON válido, sin markdown ni texto extra."""

    prompt = f"""Analizá los datos del dashboard de ZurtanCasa y generá el análisis CEO.

DATOS ACTUALES:
{data_summary}

Respondé con este JSON exacto (sin markdown, solo JSON):
{{
  "_ultima_actualizacion": "{now.isoformat()}",
  "estado_general": "🟢 o 🟡 o 🔴",
  "headline": "titular ejecutivo de una línea",
  "carta_ceo": ["párrafo 1 interpretativo sin números crudos", "párrafo 2", "párrafo 3"],
  "insight_del_dia": "algo no obvio que surge de los datos",
  "que_viene_bien": ["logro 1", "logro 2"],
  "que_hay_que_corregir": [
    {{"descripcion": "problema", "severidad": "alta|media|baja"}}
  ],
  "acciones_priorizadas": [
    {{"accion": "qué hacer concreto", "responsable": "nombre", "impacto": "qué mejora", "severidad": "alta|media|baja"}}
  ],
  "preguntas_para_pensar": ["pregunta estratégica 1", "pregunta 2"],
  "outlook_proximo_mes": "qué esperar el mes que viene en 2-3 líneas"
}}"""

    import urllib.request, urllib.error

    body = json.dumps({
        "model": "claude-sonnet-4-6",
        "max_tokens": 2048,
        "messages": [{"role": "user", "content": prompt}],
        "system": system,
    }).encode()

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )

    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read())

    text = result["content"][0]["text"].strip()

    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1] == "```" else lines[1:])

    analysis = json.loads(text)

    output_path = os.path.join(DATA_DIR, "ceo_analysis.json")
    with open(output_path, "w") as f:
        json.dump(analysis, f, indent=2, ensure_ascii=False)

    print(f"✅ ceo_analysis.json generado — estado: {analysis.get('estado_general')}")
    print(f"   Headline: {analysis.get('headline')}")

if __name__ == "__main__":
    main()
