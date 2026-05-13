#!/usr/bin/env python3
"""
Shopify Admin API — trae órdenes año en curso + histórico.
Requiere: SHOPIFY_STORE_URL, SHOPIFY_ACCESS_TOKEN
"""
import os, json, sys, requests
from datetime import datetime, timezone, timedelta

STORE_URL = os.environ.get("SHOPIFY_STORE_URL", "").rstrip("/")
ACCESS_TOKEN = os.environ.get("SHOPIFY_ACCESS_TOKEN", "")
DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "shopify.json")

UY_TZ = timezone(timedelta(hours=-3))

def uy_now():
    return datetime.now(UY_TZ)

def shopify_get(endpoint, params=None):
    url = f"{STORE_URL}/admin/api/2024-10/{endpoint}"
    headers = {"X-Shopify-Access-Token": ACCESS_TOKEN, "Content-Type": "application/json"}
    resp = requests.get(url, headers=headers, params=params or {})
    resp.raise_for_status()
    return resp.json()

def check_tax_included():
    shop = shopify_get("shop.json")
    return shop.get("shop", {}).get("taxes_included", False)

def fetch_orders_range(created_at_min: str, created_at_max: str, status="any"):
    orders = []
    params = {
        "status": status,
        "created_at_min": created_at_min,
        "created_at_max": created_at_max,
        "limit": 250,
        "fields": "id,created_at,financial_status,total_price,subtotal_price,total_tax,total_discounts,line_items,refunds",
    }
    url = f"{STORE_URL}/admin/api/2024-10/orders.json"
    headers = {"X-Shopify-Access-Token": ACCESS_TOKEN}
    while url:
        resp = requests.get(url, headers=headers, params=params)
        resp.raise_for_status()
        data = resp.json()
        orders.extend(data.get("orders", []))
        link = resp.headers.get("Link", "")
        next_url = None
        for part in link.split(","):
            if 'rel="next"' in part:
                next_url = part.split(";")[0].strip().strip("<>")
        url = next_url
        params = {}
    return orders

def aggregate_monthly(orders, tax_included: bool):
    monthly: dict = {}
    for o in orders:
        if o.get("financial_status") in ("voided", "refunded"):
            continue
        dt = datetime.fromisoformat(o["created_at"].replace("Z", "+00:00")).astimezone(UY_TZ)
        key = (dt.year, dt.month)
        price = float(o.get("total_price", 0))
        tax = float(o.get("total_tax", 0))
        revenue_bruto = price if tax_included else price
        if key not in monthly:
            monthly[key] = {"year": dt.year, "month": dt.month, "revenue_bruto": 0.0, "orders_count": 0, "total_tax": 0.0}
        monthly[key]["revenue_bruto"] += revenue_bruto
        monthly[key]["orders_count"] += 1
        monthly[key]["total_tax"] += tax
    return sorted(monthly.values(), key=lambda r: (r["year"], r["month"]))

def main():
    if not STORE_URL or not ACCESS_TOKEN:
        print("ERROR: SHOPIFY_STORE_URL y SHOPIFY_ACCESS_TOKEN son requeridos", file=sys.stderr)
        sys.exit(1)

    now = uy_now()
    tax_included = check_tax_included()
    print(f"Shopify tax_included: {tax_included}")

    year_start = f"{now.year}-01-01T00:00:00-03:00"
    year_end = now.strftime("%Y-%m-%dT23:59:59-03:00")
    month_start = f"{now.year}-{now.month:02d}-01T00:00:00-03:00"

    print(f"Fetching orders {year_start} → {year_end}")
    all_orders = fetch_orders_range(year_start, year_end)
    print(f"  Total órdenes: {len(all_orders)}")

    historico = aggregate_monthly(all_orders, tax_included)

    mtd_orders = [o for o in all_orders
                  if datetime.fromisoformat(o["created_at"].replace("Z", "+00:00")).astimezone(UY_TZ).month == now.month
                  and datetime.fromisoformat(o["created_at"].replace("Z", "+00:00")).astimezone(UY_TZ).year == now.year]

    mtd_revenue = sum(float(o.get("total_price", 0)) for o in mtd_orders if o.get("financial_status") not in ("voided", "refunded"))
    mtd_refunds = sum(
        sum(float(r.get("transactions", [{}])[0].get("amount", 0)) if r.get("transactions") else 0 for r in o.get("refunds", []))
        for o in mtd_orders
    )
    mtd_aov = mtd_revenue / len(mtd_orders) if mtd_orders else 0

    existing = {}
    if os.path.exists(DATA_PATH):
        with open(DATA_PATH) as f:
            existing = json.load(f)

    prev_historic = existing.get("historico_mensual", [])
    prev_years = {(r["year"], r["month"]) for r in prev_historic if r["year"] < now.year}
    current_year_records = [r for r in historico]
    merged = [r for r in prev_historic if (r["year"], r["month"]) in prev_years] + current_year_records
    merged.sort(key=lambda r: (r["year"], r["month"]))

    output = {
        "_status": "ok",
        "_ultima_actualizacion": now.isoformat(),
        "configuracion": {"tax_included": tax_included, "moneda": "USD"},
        "mes_actual": {
            "orders_count": len(mtd_orders),
            "revenue_bruto": round(mtd_revenue, 2),
            "revenue_neto_sin_iva": round(mtd_revenue / 1.22, 2),
            "aov": round(mtd_aov, 2),
            "refunds": round(mtd_refunds, 2),
        },
        "historico_mensual": merged,
    }

    with open(DATA_PATH, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"✅ shopify.json actualizado — {len(merged)} meses históricos")

if __name__ == "__main__":
    main()
