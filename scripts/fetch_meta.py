#!/usr/bin/env python3
"""
Meta Marketing API v23 — spend, revenue, ROAS, conversiones, campañas.
Requiere: META_ACCESS_TOKEN, META_ACCOUNT_ID
"""
import os, json, sys, requests
from datetime import datetime, timezone, timedelta

ACCESS_TOKEN = os.environ.get("META_ACCESS_TOKEN", "")
ACCOUNT_ID = os.environ.get("META_ACCOUNT_ID", "")
DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "meta_ads.json")
CONTEXTO_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "contexto_negocio.json")
API_BASE = "https://graph.facebook.com/v23.0"

UY_TZ = timezone(timedelta(hours=-3))

def uy_now():
    return datetime.now(UY_TZ)

def normalize_account_id(raw):
    return f"act_{raw}" if not raw.startswith("act_") else raw

def meta_get(endpoint, params=None):
    p = params or {}
    p["access_token"] = ACCESS_TOKEN
    resp = requests.get(f"{API_BASE}/{endpoint}", params=p)
    resp.raise_for_status()
    return resp.json()

def load_contexto():
    try:
        with open(CONTEXTO_PATH) as f:
            return json.load(f)
    except:
        return {}

def classify_campaign(name: str, contexto: dict) -> str:
    name_lower = name.lower()
    for kw in contexto.get("tipos_de_campana", {}).get("alcance", []):
        if kw in name_lower:
            return "alcance"
    return "performance"

def fetch_insights(account_id, date_preset=None, since=None, until=None, level="account"):
    params = {
        "fields": "spend,action_values,actions,impressions,clicks,campaign_name,campaign_id",
        "level": level,
        "limit": 500,
    }
    if date_preset:
        params["date_preset"] = date_preset
    elif since and until:
        params["time_range"] = json.dumps({"since": since, "until": until})

    data = meta_get(f"{account_id}/insights", params)
    return data.get("data", [])

def parse_insight(insight: dict):
    spend = float(insight.get("spend", 0))
    revenue = 0.0
    conversiones = 0
    for av in insight.get("action_values", []):
        if av.get("action_type") == "offsite_conversion.fb_pixel_purchase":
            revenue += float(av.get("value", 0))
    for ac in insight.get("actions", []):
        if ac.get("action_type") == "offsite_conversion.fb_pixel_purchase":
            conversiones += int(ac.get("value", 0))
    roas = revenue / spend if spend > 0 else 0
    return {
        "spend": round(spend, 2),
        "revenue_reportado": round(revenue, 2),
        "roas": round(roas, 2),
        "conversiones": conversiones,
        "impressions": int(insight.get("impressions", 0)),
        "clicks": int(insight.get("clicks", 0)),
    }

def fetch_campaigns_period(account_id, date_preset, contexto):
    insights = fetch_insights(account_id, date_preset=date_preset, level="campaign")
    campanas = []
    for ins in insights:
        parsed = parse_insight(ins)
        tipo = classify_campaign(ins.get("campaign_name", ""), contexto)
        campanas.append({
            "id": ins.get("campaign_id", ""),
            "nombre": ins.get("campaign_name", ""),
            "tipo": tipo,
            **parsed,
        })
    campanas.sort(key=lambda c: c["spend"], reverse=True)
    return campanas

def main():
    if not ACCESS_TOKEN or not ACCOUNT_ID:
        print("ERROR: META_ACCESS_TOKEN y META_ACCOUNT_ID requeridos", file=sys.stderr)
        sys.exit(1)

    account_id = normalize_account_id(ACCOUNT_ID)
    contexto = load_contexto()
    now = uy_now()

    periodos = {}
    for preset in ["today", "yesterday", "last_7d", "last_30d"]:
        insights = fetch_insights(account_id, date_preset=preset)
        if insights:
            periodos[preset] = parse_insight(insights[0])
        else:
            periodos[preset] = {"spend": 0, "revenue_reportado": 0, "roas": 0, "conversiones": 0, "impressions": 0, "clicks": 0}
    print("  Períodos base OK")

    campanas = fetch_campaigns_period(account_id, "last_30d", contexto)
    print(f"  {len(campanas)} campañas fetched")

    historico = []
    for month in range(1, now.month + 1):
        from_dt = datetime(now.year, month, 1)
        if month == 12:
            to_dt = datetime(now.year + 1, 1, 1) - timedelta(days=1)
        else:
            to_dt = datetime(now.year, month + 1, 1) - timedelta(days=1)
        since = from_dt.strftime("%Y-%m-%d")
        until = min(to_dt, now.replace(tzinfo=None)).strftime("%Y-%m-%d")
        insights = fetch_insights(account_id, since=since, until=until)
        if insights:
            parsed = parse_insight(insights[0])
        else:
            parsed = {"spend": 0, "revenue_reportado": 0, "roas": 0, "conversiones": 0, "impressions": 0, "clicks": 0}
        historico.append({"year": now.year, "month": month, **parsed})
    print(f"  Histórico {len(historico)} meses OK")

    output = {
        "_status": "ok",
        "_ultima_actualizacion": now.isoformat(),
        "periodos": periodos,
        "campanas": campanas,
        "historico_mensual": historico,
    }

    with open(DATA_PATH, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print("✅ meta_ads.json actualizado")

if __name__ == "__main__":
    main()
