#!/usr/bin/env python3
"""
MercadoLibre API — OAuth + ventas mes a mes.
Requiere: ML_CLIENT_ID, ML_CLIENT_SECRET, ML_REFRESH_TOKEN
El refresh token se actualiza automáticamente en data/ml_tokens.json
"""
import os, json, sys, requests
from datetime import datetime, timezone, timedelta

CLIENT_ID = os.environ.get("ML_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("ML_CLIENT_SECRET", "")
REFRESH_TOKEN = os.environ.get("ML_REFRESH_TOKEN", "")
TOKENS_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "ml_tokens.json")
DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "mercadolibre.json")
COMISION = float(os.environ.get("ML_COMISION", "0.17"))

UY_TZ = timezone(timedelta(hours=-3))

def uy_now():
    return datetime.now(UY_TZ)

def load_tokens():
    if os.path.exists(TOKENS_PATH):
        with open(TOKENS_PATH) as f:
            return json.load(f)
    return {"refresh_token": REFRESH_TOKEN}

def save_tokens(data):
    with open(TOKENS_PATH, "w") as f:
        json.dump(data, f, indent=2)

def refresh_access_token():
    tokens = load_tokens()
    rt = tokens.get("refresh_token") or REFRESH_TOKEN
    if not rt:
        print("ERROR: ML_REFRESH_TOKEN no configurado", file=sys.stderr)
        sys.exit(1)

    resp = requests.post("https://api.mercadolibre.com/oauth/token", data={
        "grant_type": "refresh_token",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "refresh_token": rt,
    })
    resp.raise_for_status()
    data = resp.json()
    save_tokens(data)
    print(f"Token ML renovado, expira en {data.get('expires_in', 0)}s")
    return data["access_token"]

def ml_get(url, access_token, params=None):
    headers = {"Authorization": f"Bearer {access_token}"}
    resp = requests.get(url, headers=headers, params=params or {})
    resp.raise_for_status()
    return resp.json()

def get_user_id(access_token):
    data = ml_get("https://api.mercadolibre.com/users/me", access_token)
    return data["id"]

def fetch_orders_month(access_token, user_id, year, month):
    from_dt = datetime(year, month, 1, tzinfo=UY_TZ)
    if month == 12:
        to_dt = datetime(year + 1, 1, 1, tzinfo=UY_TZ)
    else:
        to_dt = datetime(year, month + 1, 1, tzinfo=UY_TZ)

    from_str = from_dt.strftime("%Y-%m-%dT%H:%M:%S.000-0300")
    to_str = to_dt.strftime("%Y-%m-%dT%H:%M:%S.000-0300")

    orders = []
    offset = 0
    while True:
        data = ml_get(
            f"https://api.mercadolibre.com/orders/search",
            access_token,
            params={
                "seller": user_id,
                "order.date_created.from": from_str,
                "order.date_created.to": to_str,
                "order.status": "paid",
                "limit": 50,
                "offset": offset,
            }
        )
        results = data.get("results", [])
        orders.extend(results)
        total = data.get("paging", {}).get("total", 0)
        offset += len(results)
        if offset >= total or not results:
            break

    return orders

def aggregate_orders(orders):
    revenue_bruto = sum(float(o.get("total_amount", 0)) for o in orders)
    comision = revenue_bruto * COMISION
    return {
        "orders_count": len(orders),
        "revenue_bruto": round(revenue_bruto, 2),
        "revenue_neto_post_comision": round(revenue_bruto - comision, 2),
        "comision_pagada": round(comision, 2),
        "aov": round(revenue_bruto / len(orders), 2) if orders else 0,
    }

def main():
    if not CLIENT_ID or not CLIENT_SECRET:
        print("ERROR: ML_CLIENT_ID y ML_CLIENT_SECRET requeridos", file=sys.stderr)
        sys.exit(1)

    access_token = refresh_access_token()
    user_id = get_user_id(access_token)
    print(f"Usuario ML: {user_id}")

    now = uy_now()

    existing = {}
    if os.path.exists(DATA_PATH):
        with open(DATA_PATH) as f:
            existing = json.load(f)
    prev_historic = existing.get("historico_mensual", [])

    historico = []
    for year in range(now.year - 1, now.year + 1):
        start_month = 1
        end_month = now.month if year == now.year else 12
        for month in range(start_month, end_month + 1):
            print(f"  ML: {year}-{month:02d}...")
            orders = fetch_orders_month(access_token, user_id, year, month)
            agg = aggregate_orders(orders)
            historico.append({"year": year, "month": month, **agg})

    mtd = next((r for r in historico if r["year"] == now.year and r["month"] == now.month), None) or aggregate_orders([])

    output = {
        "_status": "ok",
        "_ultima_actualizacion": now.isoformat(),
        "mes_actual": {k: v for k, v in mtd.items() if k not in ("year", "month")},
        "historico_mensual": historico,
    }

    with open(DATA_PATH, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"✅ mercadolibre.json actualizado — {len(historico)} meses")

if __name__ == "__main__":
    main()
