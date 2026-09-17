#!/usr/bin/env python3
"""
Sincroniza el stock de Zeta Software (data/stock.json) hacia Shopify.

Match por SKU: el código Zeta (clave en stock.json) debe coincidir
exactamente con el SKU de la variante en Shopify. Cantidad enviada =
local + dialcaren (los dos depósitos de Zeta se suman en el único
location de Shopify).

Requiere: SHOPIFY_STORE_URL, SHOPIFY_ACCESS_TOKEN (scope write_inventory).
Env opcional: DRY_RUN=true para solo mostrar los cambios sin aplicarlos.
"""
import os, json, sys, time, requests
from datetime import datetime, timezone, timedelta

STORE_URL = os.environ.get("SHOPIFY_STORE_URL", "").rstrip("/")
ACCESS_TOKEN = os.environ.get("SHOPIFY_ACCESS_TOKEN", "")
DRY_RUN = os.environ.get("DRY_RUN", "").lower() in ("1", "true", "yes")
API_VERSION = "2024-10"

STOCK_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "stock.json")
REPORT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "stock_sync_report.json")
CODIGOS_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "stock_codigos_zeta.json")

# SKUs que nunca se sincronizan: la cantidad de Zeta no es confiable para estos.
# Sacar de la lista cuando el dato esté corregido en Zeta.
SKUS_EXCLUIDOS = {
    "245413",    # Alfombra PET Reciclado Anthracite
    "BACT4548",  # Banqueta Itanhandú
}

UY_TZ = timezone(timedelta(hours=-3))

# El refresh corre 08:00, 13:00 y 20:00; el hueco más largo es de 12 h.
MAX_EDAD_STOCK_HORAS = 14


def shopify_get(endpoint, params=None):
    url = f"{STORE_URL}/admin/api/{API_VERSION}/{endpoint}"
    headers = {"X-Shopify-Access-Token": ACCESS_TOKEN}
    resp = requests.get(url, headers=headers, params=params or {})
    resp.raise_for_status()
    return resp


def fetch_all_variants():
    variants = []
    url = f"{STORE_URL}/admin/api/{API_VERSION}/products.json"
    params = {"limit": 250, "fields": "id,title,variants"}
    headers = {"X-Shopify-Access-Token": ACCESS_TOKEN}
    while url:
        resp = requests.get(url, headers=headers, params=params)
        resp.raise_for_status()
        data = resp.json()
        for p in data.get("products", []):
            for v in p.get("variants", []):
                variants.append({
                    "product_title": p["title"],
                    "variant_id": v["id"],
                    "sku": (v.get("sku") or "").strip(),
                    "inventory_item_id": v["inventory_item_id"],
                    "inventory_quantity": v.get("inventory_quantity", 0),
                })
        link = resp.headers.get("Link", "")
        next_url = None
        for part in link.split(","):
            if 'rel="next"' in part:
                next_url = part.split(";")[0].strip().strip("<>")
        url = next_url
        params = {}
    return variants


def get_location():
    resp = shopify_get("locations.json")
    locations = resp.json().get("locations", [])
    if not locations:
        raise RuntimeError("No hay locations configurados en Shopify")
    if len(locations) > 1:
        print(f"AVISO: hay {len(locations)} locations, se usa el primero: {locations[0]['name']}", file=sys.stderr)
    return locations[0]["id"], locations[0]["name"]


def set_inventory(location_id, inventory_item_id, available):
    url = f"{STORE_URL}/admin/api/{API_VERSION}/inventory_levels/set.json"
    headers = {"X-Shopify-Access-Token": ACCESS_TOKEN, "Content-Type": "application/json"}
    body = {"location_id": location_id, "inventory_item_id": inventory_item_id, "available": available}
    resp = requests.post(url, headers=headers, json=body)
    resp.raise_for_status()
    return resp.json()


def main():
    if not STORE_URL or not ACCESS_TOKEN:
        print("ERROR: SHOPIFY_STORE_URL y SHOPIFY_ACCESS_TOKEN son requeridos", file=sys.stderr)
        sys.exit(1)
    if not os.path.exists(STOCK_PATH):
        print("ERROR: no existe data/stock.json — correr scrape_stock.py primero", file=sys.stderr)
        sys.exit(1)

    with open(STOCK_PATH) as f:
        stock = json.load(f)
    articulos = stock.get("articulos", {})
    if not articulos:
        print("ERROR: stock.json no tiene artículos", file=sys.stderr)
        sys.exit(1)

    # Si el scraper de Zeta falló, stock.json queda con datos viejos: no los mandamos a Shopify.
    actualizado = stock.get("_ultima_actualizacion")
    if not actualizado:
        print("ERROR: stock.json no tiene fecha de actualización", file=sys.stderr)
        sys.exit(1)
    edad = datetime.now(UY_TZ) - datetime.fromisoformat(actualizado).replace(tzinfo=UY_TZ)
    if edad > timedelta(hours=MAX_EDAD_STOCK_HORAS):
        print(f"ERROR: stock.json es de {actualizado} ({edad.total_seconds() / 3600:.0f} h) — "
              f"más viejo que {MAX_EDAD_STOCK_HORAS} h, no sincronizo", file=sys.stderr)
        sys.exit(1)

    # Zeta omite del reporte los artículos con stock 0: un código conocido que no vino, está agotado.
    conocidos = set()
    if os.path.exists(CODIGOS_PATH):
        with open(CODIGOS_PATH) as f:
            conocidos = set(json.load(f).get("codigos", []))

    location_id, location_name = get_location()
    print(f"Location Shopify: {location_name} ({location_id})")
    if DRY_RUN:
        print("*** DRY RUN — no se va a escribir nada en Shopify ***")

    variants = fetch_all_variants()
    print(f"Variantes en Shopify: {len(variants)}")

    updated, unchanged, sin_sku, sin_match_shopify, excluidos = [], [], [], [], []
    skus_shopify = set()

    for v in variants:
        sku = v["sku"]
        if not sku:
            sin_sku.append(v["product_title"])
            continue
        skus_shopify.add(sku)
        if sku in SKUS_EXCLUIDOS:
            excluidos.append({"sku": sku, "producto": v["product_title"]})
            continue
        if sku in articulos:
            s = articulos[sku]
            target = (s.get("local") or 0) + (s.get("dialcaren") or 0)
        elif sku in conocidos:
            target = 0
        else:
            sin_match_shopify.append({"sku": sku, "producto": v["product_title"]})
            continue
        current = v["inventory_quantity"]

        if target == current:
            unchanged.append(sku)
            continue

        entry = {"sku": sku, "producto": v["product_title"], "actual": current, "nuevo": target}
        if DRY_RUN:
            print(f"[DRY RUN] {sku} ({v['product_title']}): {current} -> {target}")
        else:
            set_inventory(location_id, v["inventory_item_id"], target)
            print(f"OK {sku} ({v['product_title']}): {current} -> {target}")
            time.sleep(0.5)  # margen para rate limit de la REST API (2 req/s)
        updated.append(entry)

    sin_match_zeta = sorted(sku for sku in set(articulos) | conocidos if sku not in skus_shopify)

    report = {
        "_ultima_sincronizacion": datetime.now(UY_TZ).isoformat(),
        "dry_run": DRY_RUN,
        "location": location_name,
        "actualizados": updated,
        "sin_cambios": len(unchanged),
        "excluidos_manualmente": excluidos,
        "variantes_sin_sku_en_shopify": sin_sku,
        "sku_shopify_sin_match_en_zeta": sin_match_shopify,
        "codigos_zeta_sin_match_en_shopify": sin_match_zeta,
    }
    with open(REPORT_PATH, "w") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print(
        f"\nResumen: {len(updated)} actualizados, {len(unchanged)} sin cambios, "
        f"{len(excluidos)} excluidos manualmente, "
        f"{len(sin_sku)} variantes sin SKU, {len(sin_match_shopify)} SKUs de Shopify sin match en Zeta, "
        f"{len(sin_match_zeta)} códigos de Zeta sin match en Shopify."
    )


if __name__ == "__main__":
    main()
