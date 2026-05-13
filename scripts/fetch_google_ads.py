#!/usr/bin/env python3
"""
Google Ads API v20 — spend, ROAS, campañas.
Requiere: GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET,
          GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_MANAGER_ID, GOOGLE_ADS_ACCOUNT_ID
"""
import os, json, sys
from datetime import datetime, timezone, timedelta

DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "google_ads.json")
CONTEXTO_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "contexto_negocio.json")

UY_TZ = timezone(timedelta(hours=-3))

def uy_now():
    return datetime.now(UY_TZ)

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

def get_google_ads_client():
    try:
        from google.ads.googleads.client import GoogleAdsClient
    except ImportError:
        print("ERROR: google-ads no instalado. Corré: pip install google-ads", file=sys.stderr)
        sys.exit(1)

    return GoogleAdsClient.load_from_dict({
        "developer_token": os.environ["GOOGLE_ADS_DEVELOPER_TOKEN"],
        "client_id": os.environ["GOOGLE_ADS_CLIENT_ID"],
        "client_secret": os.environ["GOOGLE_ADS_CLIENT_SECRET"],
        "refresh_token": os.environ["GOOGLE_ADS_REFRESH_TOKEN"],
        "login_customer_id": os.environ.get("GOOGLE_ADS_MANAGER_ID", ""),
        "use_proto_plus": True,
    })

def run_query(client, customer_id, query: str):
    service = client.get_service("GoogleAdsService")
    request = client.get_type("SearchGoogleAdsRequest")
    request.customer_id = customer_id
    request.query = query
    response = service.search(request=request)
    return list(response)

def fetch_period(client, account_id, since: str, until: str, contexto: dict):
    query = f"""
        SELECT
            campaign.id, campaign.name,
            metrics.cost_micros, metrics.conversions_value, metrics.conversions,
            metrics.impressions, metrics.clicks
        FROM campaign
        WHERE segments.date BETWEEN '{since}' AND '{until}'
        AND campaign.status = 'ENABLED'
    """
    rows = run_query(client, account_id, query)

    total_spend = 0.0
    total_revenue = 0.0
    total_conv = 0
    total_impr = 0
    total_clicks = 0
    campanas = []

    for row in rows:
        spend = row.metrics.cost_micros / 1_000_000
        revenue = row.metrics.conversions_value
        conv = int(row.metrics.conversions)
        impr = int(row.metrics.impressions)
        clicks = int(row.metrics.clicks)
        roas = revenue / spend if spend > 0 else 0
        tipo = classify_campaign(row.campaign.name, contexto)

        total_spend += spend
        total_revenue += revenue
        total_conv += conv
        total_impr += impr
        total_clicks += clicks

        campanas.append({
            "id": str(row.campaign.id),
            "nombre": row.campaign.name,
            "tipo": tipo,
            "spend": round(spend, 2),
            "revenue": round(revenue, 2),
            "roas": round(roas, 2),
            "conversiones": conv,
        })

    campanas.sort(key=lambda c: c["spend"], reverse=True)
    total_roas = total_revenue / total_spend if total_spend > 0 else 0

    return {
        "spend": round(total_spend, 2),
        "revenue_reportado": round(total_revenue, 2),
        "roas": round(total_roas, 2),
        "conversiones": total_conv,
        "impressions": total_impr,
        "clicks": total_clicks,
    }, campanas

def main():
    required = ["GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET",
                "GOOGLE_ADS_REFRESH_TOKEN", "GOOGLE_ADS_ACCOUNT_ID"]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        print(f"ERROR: Faltan variables: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    client = get_google_ads_client()
    account_id = os.environ["GOOGLE_ADS_ACCOUNT_ID"]
    contexto = load_contexto()
    now = uy_now()

    def date_range(preset):
        if preset == "today":
            d = now.strftime("%Y-%m-%d")
            return d, d
        if preset == "yesterday":
            d = (now - timedelta(days=1)).strftime("%Y-%m-%d")
            return d, d
        if preset == "last_7d":
            return (now - timedelta(days=7)).strftime("%Y-%m-%d"), now.strftime("%Y-%m-%d")
        if preset == "last_30d":
            return (now - timedelta(days=30)).strftime("%Y-%m-%d"), now.strftime("%Y-%m-%d")
        return now.strftime("%Y-%m-%d"), now.strftime("%Y-%m-%d")

    periodos = {}
    campanas_last30 = []
    for preset in ["today", "yesterday", "last_7d", "last_30d"]:
        since, until = date_range(preset)
        stats, campanas = fetch_period(client, account_id, since, until, contexto)
        periodos[preset] = stats
        if preset == "last_30d":
            campanas_last30 = campanas
    print("  Períodos OK")

    historico = []
    for month in range(1, now.month + 1):
        from_dt = datetime(now.year, month, 1)
        if month == 12:
            to_dt = datetime(now.year + 1, 1, 1) - timedelta(days=1)
        else:
            to_dt = datetime(now.year, month + 1, 1) - timedelta(days=1)
        since = from_dt.strftime("%Y-%m-%d")
        until = min(to_dt, now.replace(tzinfo=None)).strftime("%Y-%m-%d")
        stats, _ = fetch_period(client, account_id, since, until, contexto)
        historico.append({"year": now.year, "month": month, **stats})
    print(f"  Histórico {len(historico)} meses OK")

    output = {
        "_status": "ok",
        "_ultima_actualizacion": now.isoformat(),
        "periodos": periodos,
        "campanas": campanas_last30,
        "historico_mensual": historico,
    }

    with open(DATA_PATH, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print("✅ google_ads.json actualizado")

if __name__ == "__main__":
    main()
