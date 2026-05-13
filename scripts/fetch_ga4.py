#!/usr/bin/env python3
"""
Google Analytics 4 Data API — revenue por source/medium.
Requiere: GA4_PROPERTY_ID, GA4_SERVICE_ACCOUNT_JSON (path al JSON de service account)
"""
import os, json, sys
from datetime import datetime, timezone, timedelta

DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "ga4.json")
UY_TZ = timezone(timedelta(hours=-3))

def uy_now():
    return datetime.now(UY_TZ)

def main():
    property_id = os.environ.get("GA4_PROPERTY_ID", "")
    sa_json_path = os.environ.get("GA4_SERVICE_ACCOUNT_JSON", "")

    if not property_id or not sa_json_path:
        print("ERROR: GA4_PROPERTY_ID y GA4_SERVICE_ACCOUNT_JSON requeridos", file=sys.stderr)
        sys.exit(1)

    try:
        from google.analytics.data_v1beta import BetaAnalyticsDataClient
        from google.analytics.data_v1beta.types import RunReportRequest, DateRange, Dimension, Metric
        from google.oauth2 import service_account
    except ImportError:
        print("ERROR: google-analytics-data no instalado. Corré: pip install google-analytics-data", file=sys.stderr)
        sys.exit(1)

    credentials = service_account.Credentials.from_service_account_file(
        sa_json_path,
        scopes=["https://www.googleapis.com/auth/analytics.readonly"],
    )
    client = BetaAnalyticsDataClient(credentials=credentials)
    now = uy_now()

    year_start = f"{now.year}-01-01"
    today = now.strftime("%Y-%m-%d")

    request = RunReportRequest(
        property=f"properties/{property_id}",
        dimensions=[
            Dimension(name="year"),
            Dimension(name="month"),
            Dimension(name="sessionSourceMedium"),
        ],
        metrics=[
            Metric(name="purchaseRevenue"),
            Metric(name="transactions"),
        ],
        date_ranges=[DateRange(start_date=f"{now.year - 1}-01-01", end_date=today)],
    )
    response = client.run_report(request)

    revenue_por_source = []
    historico_mensual: dict = {}

    for row in response.rows:
        year = int(row.dimension_values[0].value)
        month = int(row.dimension_values[1].value)
        source_medium = row.dimension_values[2].value
        revenue = float(row.metric_values[0].value)
        transactions = int(row.metric_values[1].value)

        revenue_por_source.append({
            "year": year, "month": month,
            "source_medium": source_medium,
            "revenue": round(revenue, 2),
            "transactions": transactions,
        })

        key = (year, month)
        if key not in historico_mensual:
            historico_mensual[key] = {"year": year, "month": month, "revenue_total": 0.0, "transactions": 0}
        historico_mensual[key]["revenue_total"] += revenue
        historico_mensual[key]["transactions"] += transactions

    historico_list = sorted(historico_mensual.values(), key=lambda r: (r["year"], r["month"]))
    for r in historico_list:
        r["revenue_total"] = round(r["revenue_total"], 2)

    output = {
        "_status": "ok",
        "_ultima_actualizacion": now.isoformat(),
        "revenue_por_source_medium": revenue_por_source[:200],
        "historico_mensual": historico_list,
    }

    with open(DATA_PATH, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"✅ ga4.json actualizado — {len(historico_list)} meses, {len(revenue_por_source)} fuentes")

if __name__ == "__main__":
    main()
