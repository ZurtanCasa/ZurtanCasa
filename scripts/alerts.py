#!/usr/bin/env python3
"""
Alertas WhatsApp 2x/día via Twilio.
Requiere: ANTHROPIC_API_KEY, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
          TWILIO_FROM_WA, TWILIO_TO_WA, TWILIO_TEMPLATE_SID (fallback)
"""
import os, json, sys, hashlib
from datetime import datetime, timezone, timedelta

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
ALERTS_FILE = os.path.join(DATA_DIR, "alerts_sent.json")
UY_TZ = timezone(timedelta(hours=-3))

def uy_now():
    return datetime.now(UY_TZ)

def load(name):
    try:
        with open(os.path.join(DATA_DIR, name)) as f:
            return json.load(f)
    except:
        return {}

def load_alerts_sent():
    try:
        with open(ALERTS_FILE) as f:
            return json.load(f)
    except:
        return {}

def save_alerts_sent(data):
    with open(ALERTS_FILE, "w") as f:
        json.dump(data, f, indent=2)

def is_cooldown(alerts_sent: dict, alert_type: str, hours=24) -> bool:
    if alert_type not in alerts_sent:
        return False
    last = datetime.fromisoformat(alerts_sent[alert_type])
    return (uy_now() - last).total_seconds() < hours * 3600

def mark_sent(alerts_sent: dict, alert_type: str):
    alerts_sent[alert_type] = uy_now().isoformat()

def detect_candidates(shopify, ml, meta, google, locales, plan, contexto, ceo):
    now = uy_now()
    candidates = []
    alerts_sent = load_alerts_sent()

    breakeven = contexto.get("breakeven_mensual", {}).get("usd", 13000)
    day_of_month = now.day
    days_in_month = 30

    web_mtd = shopify.get("mes_actual", {}).get("revenue_bruto", 0)
    ml_mtd = ml.get("mes_actual", {}).get("revenue_bruto", 0)
    locales_mtd = sum(l.get("mes_actual", {}).get("revenue", 0) for l in locales.get("locales", []))
    total_mtd = web_mtd + ml_mtd + locales_mtd
    forecast = (total_mtd / day_of_month) * days_in_month if day_of_month > 0 else 0

    if forecast < breakeven * 0.85 and not is_cooldown(alerts_sent, "breakeven"):
        candidates.append({
            "tipo": "breakeven",
            "severidad": "alta",
            "mensaje": f"Forecast mensual USD {forecast:,.0f} está {((forecast/breakeven - 1) * 100):+.0f}% del breakeven de USD {breakeven:,.0f}",
        })

    prev_year = now.year - 1
    ytd_actual = web_mtd + ml_mtd
    ytd_prev = sum(r.get("revenue_bruto", 0) for r in shopify.get("historico_mensual", [])
                   if r.get("year") == prev_year and r.get("month") <= now.month)
    ytd_prev += sum(r.get("revenue_bruto", 0) for r in ml.get("historico_mensual", [])
                    if r.get("year") == prev_year and r.get("month") <= now.month)

    if ytd_prev > 0 and ytd_actual / ytd_prev < 0.85 and not is_cooldown(alerts_sent, "yoy"):
        candidates.append({
            "tipo": "yoy",
            "severidad": "media",
            "mensaje": f"YTD digital está {((ytd_actual/ytd_prev - 1) * 100):+.0f}% vs mismo período {prev_year}",
        })
    elif ytd_prev > 0 and ytd_actual / ytd_prev > 1.15 and not is_cooldown(alerts_sent, "yoy_logro"):
        candidates.append({
            "tipo": "yoy_logro",
            "severidad": "baja",
            "mensaje": f"YTD digital está {((ytd_actual/ytd_prev - 1) * 100):+.0f}% arriba vs {prev_year} ✅",
        })

    contexto_locales = {l["id"]: l for l in contexto.get("locales", [])}
    plan_locales = plan.get("targets_por_local", {})
    meses_especiales = contexto.get("meses_temporada_especial", [])

    for local in locales.get("locales", []):
        lid = local.get("id")
        conf = contexto_locales.get(lid, {})
        local_plan = plan_locales.get(lid, {})
        is_estacional = conf.get("es_estacional", False)
        meses_alta = conf.get("meses_temporada_alta", [])
        is_off_season = is_estacional and now.month not in meses_alta

        if is_off_season:
            continue

        anual = local_plan.get("anual_usd", 0)
        if anual == 0:
            continue

        target_ytd = sum(local_plan.get("monthly_share", {}).get(str(m), 0) * anual for m in range(1, now.month + 1))
        actual_ytd = sum(r.get("revenue", 0) for r in local.get("historico_mensual", [])
                         if r.get("year") == now.year and r.get("month") <= now.month)

        threshold = 0.80 if now.month in meses_especiales else 0.85
        alert_key = f"local_{lid}"

        if target_ytd > 0 and actual_ytd / target_ytd < threshold and not is_cooldown(alerts_sent, alert_key):
            candidates.append({
                "tipo": alert_key,
                "severidad": "media",
                "mensaje": f"Local {local.get('nombre', lid)}: YTD en {(actual_ytd/target_ytd*100):.0f}% del target",
            })

    contexto_campanas = contexto.get("tipos_de_campana", {})
    for plataforma, ads_data in [("Meta", meta), ("Google", google)]:
        if ads_data.get("_status") == "sin_datos":
            continue
        for camp in ads_data.get("campanas", []):
            if camp.get("tipo") == "alcance":
                continue
            roas = camp.get("roas", 0)
            spend = camp.get("spend", 0)
            if spend < 50:
                continue
            camp_key = f"camp_{hashlib.md5(camp.get('id', camp.get('nombre', '')).encode()).hexdigest()[:8]}"

            if roas > 8 and not is_cooldown(alerts_sent, camp_key + "_winner"):
                candidates.append({
                    "tipo": camp_key + "_winner",
                    "severidad": "baja",
                    "mensaje": f"🏆 {plataforma} '{camp.get('nombre')}' ROAS {roas:.1f}x — winner! Subí presupuesto.",
                })
            elif roas < 1 and not is_cooldown(alerts_sent, camp_key + "_loser"):
                candidates.append({
                    "tipo": camp_key + "_loser",
                    "severidad": "alta",
                    "mensaje": f"💸 {plataforma} '{camp.get('nombre')}' ROAS {roas:.1f}x — por debajo de 1x. Pausar.",
                })

    ceo_insight = ceo.get("insight_del_dia", "")
    acciones = ceo.get("acciones_priorizadas", [])[:2]
    if ceo_insight:
        candidates.append({
            "tipo": "ceo_insight",
            "severidad": "baja",
            "mensaje": f"🧠 Insight: {ceo_insight}",
            "extra": acciones,
        })

    return candidates, alerts_sent

def ask_claude_to_pick(candidates, api_key):
    import urllib.request

    if not candidates:
        return None

    candidates_str = "\n".join(f"- [{c['severidad'].upper()}] {c['mensaje']}" for c in candidates)

    prompt = f"""Tenés estos candidatos a alertas para WhatsApp de ZurtanCasa:

{candidates_str}

Seleccioná las 1-3 más importantes y escribí UN mensaje de WhatsApp de máximo 700 caracteres.
Formato: bullets con emojis (✅ logro / ⚠️ alerta / 🎯 acción / 🧠 insight).
Incluí LOGROS y ALERTAS, no solo malas noticias.
Tono directo, sin saludos formales.
Arrancá con el estado del día (🟢/🟡/🔴) y la fecha.
Respondé SOLO con el mensaje, sin JSON ni markdown."""

    body = json.dumps({
        "model": "claude-sonnet-4-6",
        "max_tokens": 512,
        "messages": [{"role": "user", "content": prompt}],
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

    return result["content"][0]["text"].strip()

def send_whatsapp(message: str):
    from twilio.rest import Client
    account_sid = os.environ["TWILIO_ACCOUNT_SID"]
    auth_token = os.environ["TWILIO_AUTH_TOKEN"]
    from_wa = os.environ["TWILIO_FROM_WA"]
    to_wa = os.environ["TWILIO_TO_WA"]

    client = Client(account_sid, auth_token)

    try:
        msg = client.messages.create(
            from_=from_wa,
            to=to_wa,
            body=message,
        )
        print(f"✅ WhatsApp enviado: {msg.sid}")
        return True
    except Exception as e:
        error_str = str(e)
        if "63016" in error_str or "template" in error_str.lower():
            template_sid = os.environ.get("TWILIO_TEMPLATE_SID", "")
            if template_sid:
                msg = client.messages.create(
                    from_=from_wa,
                    to=to_wa,
                    content_sid=template_sid,
                )
                print(f"✅ WhatsApp template enviado: {msg.sid}")
                return True
        raise

def main():
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY requerido", file=sys.stderr)
        sys.exit(1)

    for twilio_var in ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_WA", "TWILIO_TO_WA"]:
        if not os.environ.get(twilio_var):
            print(f"ERROR: {twilio_var} requerido", file=sys.stderr)
            sys.exit(1)

    shopify = load("shopify.json")
    ml = load("mercadolibre.json")
    meta = load("meta_ads.json")
    google = load("google_ads.json")
    locales = load("locales.json")
    plan = load("plan_anual.json")
    contexto = load("contexto_negocio.json")
    ceo = load("ceo_analysis.json")

    candidates, alerts_sent = detect_candidates(shopify, ml, meta, google, locales, plan, contexto, ceo)
    print(f"Candidatos detectados: {len(candidates)}")

    if not candidates:
        print("Sin alertas para enviar.")
        return

    message = ask_claude_to_pick(candidates, api_key)
    if not message:
        print("Claude no generó mensaje.")
        return

    print(f"Mensaje ({len(message)} chars):\n{message}\n")

    send_whatsapp(message)

    for c in candidates:
        if c["tipo"] in ("breakeven", "yoy", "yoy_logro", "ceo_insight") or c["tipo"].startswith(("camp_", "local_")):
            mark_sent(alerts_sent, c["tipo"])

    save_alerts_sent(alerts_sent)
    print("✅ Alertas enviadas y cooldowns actualizados")

if __name__ == "__main__":
    main()
