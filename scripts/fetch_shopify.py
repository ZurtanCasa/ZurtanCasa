#!/usr/bin/env python3
"""
Shopify Admin API — trae órdenes año en curso + histórico.
Requiere: SHOPIFY_STORE_URL, SHOPIFY_ACCESS_TOKEN

Si algo falla, deja _status="error" (conservando los datos anteriores) y sale
con código != 0 para que el workflow lo marque como fallido.
"""
import os, json, sys, requests
from datetime import datetime, timezone, timedelta

API_VERSION = "2025-10"
ACCESS_TOKEN = os.environ.get("SHOPIFY_ACCESS_TOKEN", "").strip()
DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "shopify.json")
# Sin el scope read_all_orders, Shopify solo devuelve órdenes de los últimos 60 días.
ORDERS_WINDOW_DAYS = 60


def normalize_store_url(raw: str) -> str:
    """Acepta 'handle', 'handle.myshopify.com' o 'https://handle.myshopify.com[/admin]'."""
    url = raw.strip().rstrip("/")
    if not url:
        return ""
    if "://" not in url:
        url = "https://" + url
    if url.endswith("/admin"):
        url = url[: -len("/admin")]
    host = url.split("://", 1)[1]
    if "." not in host:
        url += ".myshopify.com"
    return url


STORE_URL = normalize_store_url(os.environ.get("SHOPIFY_STORE_URL", ""))

UY_TZ = timezone(timedelta(hours=-3))

def uy_now():
    return datetime.now(UY_TZ)

def check_response(resp):
    if resp.status_code == 401:
        raise RuntimeError(f"401 en {STORE_URL}: SHOPIFY_ACCESS_TOKEN inválido, expirado o de otra tienda")
    if resp.status_code == 403:
        raise RuntimeError(f"403 en {resp.url}: al token le falta un scope ({resp.text[:200]})")
    if resp.status_code == 404:
        raise RuntimeError(f"404 en {resp.url}: SHOPIFY_STORE_URL apunta a una tienda que no existe")
    resp.raise_for_status()

def shopify_get(endpoint, params=None):
    url = f"{STORE_URL}/admin/{endpoint}"
    headers = {"X-Shopify-Access-Token": ACCESS_TOKEN, "Content-Type": "application/json"}
    resp = requests.get(url, headers=headers, params=params or {}, timeout=30)
    check_response(resp)
    return resp.json()

def check_tax_included():
    shop = shopify_get(f"api/{API_VERSION}/shop.json")
    return shop.get("shop", {}).get("taxes_included", False)

def has_all_orders_scope():
    scopes = shopify_get("oauth/access_scopes.json").get("access_scopes", [])
    return any(s.get("handle") == "read_all_orders" for s in scopes)

def fetch_orders_range(created_at_min: str, created_at_max: str, status="any"):
    orders = []
    params = {
        "status": status,
        "created_at_min": created_at_min,
        "created_at_max": created_at_max,
        "limit": 250,
        "fields": "id,created_at,cancelled_at,test,financial_status,total_price,subtotal_price,total_tax,total_discounts,line_items,refunds",
    }
    url = f"{STORE_URL}/admin/api/{API_VERSION}/orders.json"
    headers = {"X-Shopify-Access-Token": ACCESS_TOKEN}
    while url:
        resp = requests.get(url, headers=headers, params=params, timeout=60)
        check_response(resp)
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

def is_valid_sale(o):
    return (
        o.get("financial_status") not in ("voided", "refunded")
        and not o.get("cancelled_at")
        and not o.get("test")
    )

def order_month(o):
    dt = datetime.fromisoformat(o["created_at"].replace("Z", "+00:00")).astimezone(UY_TZ)
    return (dt.year, dt.month)

def refunded_amount(o):
    return sum(
        float(t.get("amount", 0))
        for r in o.get("refunds", [])
        for t in r.get("transactions", [])
        if t.get("kind") == "refund" and t.get("status") == "success"
    )

def aggregate_monthly(orders, tax_included: bool):
    monthly: dict = {}
    for o in orders:
        if not is_valid_sale(o):
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

def load_existing():
    if os.path.exists(DATA_PATH):
        with open(DATA_PATH) as f:
            return json.load(f)
    return {}

def write_error(message):
    data = load_existing()
    data["_status"] = "error"
    data["_error"] = message
    data["_ultimo_intento"] = uy_now().isoformat()
    with open(DATA_PATH, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def main():
    if not STORE_URL or not ACCESS_TOKEN:
        raise RuntimeError("SHOPIFY_STORE_URL y SHOPIFY_ACCESS_TOKEN son requeridos (¿secret vacío?)")

    now = uy_now()
    print(f"Tienda: {STORE_URL}")
    tax_included = check_tax_included()
    print(f"Shopify tax_included: {tax_included}")

    year_start_dt = datetime(now.year, 1, 1, tzinfo=UY_TZ)
    fetch_start_dt = year_start_dt
    if not has_all_orders_scope():
        window_start = now - timedelta(days=ORDERS_WINDOW_DAYS)
        if window_start > year_start_dt:
            fetch_start_dt = window_start
            print(f"  ⚠️  Token sin read_all_orders: solo se ven órdenes desde {window_start.date()}")

    fetch_start = fetch_start_dt.strftime("%Y-%m-%dT%H:%M:%S-03:00")
    year_end = now.strftime("%Y-%m-%dT23:59:59-03:00")

    print(f"Fetching orders {fetch_start} → {year_end}")
    all_orders = fetch_orders_range(fetch_start, year_end)
    print(f"  Total órdenes: {len(all_orders)} ({sum(map(is_valid_sale, all_orders))} válidas)")

    historico = aggregate_monthly(all_orders, tax_included)

    mtd_orders = [o for o in all_orders if order_month(o) == (now.year, now.month)]
    mtd_sales = [o for o in mtd_orders if is_valid_sale(o)]
    mtd_revenue = sum(float(o.get("total_price", 0)) for o in mtd_sales)
    # Solo refunds de órdenes reales — excluir canceladas/anuladas y de prueba
    # (si no, los checkouts de test reembolsados se cuentan como devoluciones).
    mtd_refunds = sum(
        refunded_amount(o) for o in mtd_orders
        if not o.get("cancelled_at") and not o.get("test")
    )
    mtd_aov = mtd_revenue / len(mtd_sales) if mtd_sales else 0

    existing = load_existing()

    # Los meses fetcheados completos se reemplazan; los anteriores (otros años, o
    # fuera de la ventana de 60 días) se conservan del JSON existente. El mes en
    # que arranca la ventana solo se reemplaza si la ventana cubre el mes entero.
    first_full_month = (fetch_start_dt.year, fetch_start_dt.month)
    if fetch_start_dt.day != 1 or fetch_start_dt.hour or fetch_start_dt.minute:
        y, m = first_full_month
        first_full_month = (y + (m == 12), m % 12 + 1)
    fetched = {(r["year"], r["month"]): r for r in historico}
    kept = {
        (r["year"], r["month"]): r
        for r in existing.get("historico_mensual", [])
        if (r["year"], r["month"]) < first_full_month
    }
    merged = sorted({**fetched, **kept}.values(), key=lambda r: (r["year"], r["month"]))

    output = {
        "_status": "ok",
        "_ultima_actualizacion": now.isoformat(),
        "configuracion": {"tax_included": tax_included, "moneda": "USD"},
        "mes_actual": {
            "orders_count": len(mtd_sales),
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
    try:
        main()
    except Exception as e:
        msg = f"{type(e).__name__}: {e}"
        print(f"❌ ERROR fetch_shopify: {msg}", file=sys.stderr)
        write_error(msg)
        sys.exit(1)
