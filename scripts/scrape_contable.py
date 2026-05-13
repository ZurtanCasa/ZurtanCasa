#!/usr/bin/env python3
"""
Zeta Software — scraper de facturación por local.
Requiere: ZETA_USER, ZETA_PASS
URL hardcodeada: https://www.zetasoftware.com/z.info.inicio

Estrategia:
- Login → Gestión → Comprobantes → Ventas y Devoluciones
- Filtrar por mes → Export Excel → parsear
- Agregar por mes, excluyendo notas de crédito y devoluciones del neto
"""
import os, json, sys, tempfile, shutil, calendar
from datetime import datetime, timezone, timedelta

DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "locales.json")
BASE_URL = "https://www.zetasoftware.com/z.info.inicio"
UY_TZ = timezone(timedelta(hours=-3))

TIPOS_VENTA = {"venta contado", "venta crédito", "venta credito", "factura", "ticket"}
TIPOS_DEVOLUCION = {"nota de crédito", "nota de credito", "devolución", "devolucion", "nota crédito", "nota credito"}

def uy_now():
    return datetime.now(UY_TZ)

def login(page, user, password):
    page.goto(BASE_URL, timeout=30000)
    page.wait_for_load_state("networkidle")
    page.fill("input[name='vUSULIBRAEMAIL']", user)
    page.fill("input[name='vUSULIBRAPASSWORD']", password)
    page.click("input[name='BTNENTER']")
    import time; time.sleep(8)
    frame = page.frames[0]
    if "z.usuarios.home" not in frame.url and "z.gestion" not in frame.url and "z.info" not in frame.url:
        raise RuntimeError(f"Login falló. URL: {frame.url}")
    print(f"  Login OK. Frame: {frame.url}")
    return frame

def go_to_ventas(frame, page):
    import time
    frame.goto("https://www.zetasoftware.com/z.gestion.comprobantes.comprobantesfavoritosusuario")
    time.sleep(3)
    frame.click("#span_GESTIONNOMBRE_0001 a")
    time.sleep(4)
    print(f"  En Ventas y Devoluciones. URL: {frame.url}")

def set_date_filter(frame, from_str: str, to_str: str):
    """from_str / to_str en formato DD/MM/YY"""
    import time
    frame.evaluate(f"""() => {{
        const from = document.querySelector('input[name="vDOCFECHA1"]');
        const to = document.querySelector('input[name="vDOCFECHA1_TO"]');
        if (!from || !to) return;
        from.value = '{from_str}';
        from.dispatchEvent(new Event('change', {{bubbles: true}}));
        from.dispatchEvent(new Event('blur', {{bubbles: true}}));
        to.value = '{to_str}';
        to.dispatchEvent(new Event('change', {{bubbles: true}}));
        to.dispatchEvent(new Event('blur', {{bubbles: true}}));
    }}""")
    time.sleep(4)

def download_excel(frame, page, tmp_dir: str) -> str:
    dest = os.path.join(tmp_dir, "ventas.xlsx")
    with page.expect_download(timeout=20000) as dl_info:
        frame.click("input#BTNEXPORT")
    dl = dl_info.value
    dl.save_as(dest)
    return dest

def parse_excel(path: str) -> dict:
    """
    Devuelve:
      revenue_bruto  — total ventas (con IVA)
      devoluciones   — total notas de crédito/devoluciones
      revenue_neto   — bruto - devoluciones
      orders_count   — cantidad de ventas
      moneda_mix     — {"USD": x, "UYU": y}  (U$S = USD, $$ = UYU)
    """
    try:
        import openpyxl
    except ImportError:
        raise ImportError("openpyxl requerido: pip install openpyxl")

    wb = openpyxl.load_workbook(path)
    ws = wb.active

    rows = list(ws.iter_rows(values_only=True))

    # Encontrar fila de headers
    header_row = None
    for i, row in enumerate(rows):
        vals = [str(v).lower().strip() if v else "" for v in row]
        if "fecha" in vals and "total" in vals:
            header_row = i
            break

    if header_row is None:
        print(f"    WARN: No se encontró header en {path}")
        return {"revenue_bruto": 0, "devoluciones": 0, "revenue_neto": 0, "orders_count": 0, "moneda_mix": {}}

    headers = [str(v).lower().strip() if v else "" for v in rows[header_row]]
    col = {name: idx for idx, name in enumerate(headers)}

    revenue_bruto = 0.0
    devoluciones = 0.0
    orders_count = 0
    moneda_mix: dict = {}

    for row in rows[header_row + 1:]:
        if not any(row):
            continue
        tipo_raw = str(row[col.get("tipo", 1)] or "").lower().strip()
        total_raw = row[col.get("total", 8)]
        moneda_raw = str(row[col.get("moneda", 7)] or "").strip()
        estado = str(row[col.get("estado dgi", 4)] or "").lower().strip()

        # Normalizar moneda
        if "u$s" in moneda_raw.lower() or "usd" in moneda_raw.lower():
            moneda = "USD"
        else:
            moneda = "UYU"

        try:
            total = float(total_raw or 0)
        except (TypeError, ValueError):
            continue

        if total == 0:
            continue

        # Clasificar
        is_devolucion = any(kw in tipo_raw for kw in TIPOS_DEVOLUCION)
        is_venta = any(kw in tipo_raw for kw in TIPOS_VENTA)

        moneda_mix[moneda] = moneda_mix.get(moneda, 0) + total

        if is_devolucion:
            devoluciones += total
        elif is_venta or (not is_devolucion):
            revenue_bruto += total
            orders_count += 1

    return {
        "revenue_bruto": round(revenue_bruto, 2),
        "devoluciones": round(devoluciones, 2),
        "revenue_neto": round(revenue_bruto - devoluciones, 2),
        "orders_count": orders_count,
        "moneda_mix": {k: round(v, 2) for k, v in moneda_mix.items()},
    }

def fetch_month(frame, page, year: int, month: int, tmp_dir: str) -> dict:
    last_day = calendar.monthrange(year, month)[1]
    yy = str(year)[-2:]
    from_str = f"01/{month:02d}/{yy}"
    to_str = f"{last_day:02d}/{month:02d}/{yy}"

    print(f"    Fetching {year}-{month:02d} ({from_str} → {to_str})")
    set_date_filter(frame, from_str, to_str)

    try:
        xl_path = download_excel(frame, page, tmp_dir)
        result = parse_excel(xl_path)
        print(f"      → bruto={result['revenue_bruto']} dev={result['devoluciones']} orders={result['orders_count']}")
        return result
    except Exception as e:
        print(f"      WARN: {e}")
        return {"revenue_bruto": 0, "devoluciones": 0, "revenue_neto": 0, "orders_count": 0, "moneda_mix": {}}

def main():
    user = os.environ.get("ZETA_USER", "")
    password = os.environ.get("ZETA_PASS", "")

    if not user or not password:
        print("SKIP: ZETA_USER y ZETA_PASS requeridos", file=sys.stderr)
        sys.exit(0)

    try:
        from playwright.sync_api import sync_playwright
        import openpyxl
    except ImportError as e:
        print(f"ERROR: {e}. Corré: pip install playwright openpyxl && playwright install chromium", file=sys.stderr)
        sys.exit(1)

    import time
    now = uy_now()

    # Cargar JSON existente para preservar histórico anterior
    existing = {"locales": []}
    if os.path.exists(DATA_PATH):
        try:
            with open(DATA_PATH) as f:
                existing = json.load(f)
        except:
            pass

    prev_records: dict = {}
    for loc in existing.get("locales", []):
        for rec in loc.get("historico_mensual", []):
            prev_records[(loc["id"], rec["year"], rec["month"])] = rec

    tmp_dir = tempfile.mkdtemp()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()

            frame = login(page, user, password)
            go_to_ventas(frame, page)

            # Scrapear desde Jan 2024 hasta el mes actual
            # (Si ya tenemos datos de un mes pasado, los reutilizamos para no sobrecargar)
            historico = []
            start_year = 2024
            for year in range(start_year, now.year + 1):
                max_month = now.month if year == now.year else 12
                for month in range(1, max_month + 1):
                    key = ("juan_b_alberdi", year, month)
                    # Reusar data pasada salvo el mes actual (puede estar incompleto)
                    if key in prev_records and not (year == now.year and month == now.month):
                        rec = prev_records[key]
                        historico.append(rec)
                        print(f"    Reutilizando {year}-{month:02d}: bruto={rec.get('revenue_bruto', 0)}")
                        continue

                    data = fetch_month(frame, page, year, month, tmp_dir)
                    historico.append({
                        "year": year,
                        "month": month,
                        "revenue_bruto": data["revenue_bruto"],
                        "revenue_neto": data["revenue_neto"],
                        "devoluciones": data["devoluciones"],
                        "orders_count": data["orders_count"],
                        "moneda_mix": data["moneda_mix"],
                    })

            browser.close()

        # Mes actual
        mes_actual_rec = next((r for r in historico if r["year"] == now.year and r["month"] == now.month), {})

        output = {
            "_status": "ok",
            "_ultima_actualizacion": now.isoformat(),
            "locales": [
                {
                    "id": "juan_b_alberdi",
                    "nombre": "Juan B Alberdi 6280",
                    "mes_actual": {
                        "revenue": mes_actual_rec.get("revenue_bruto", 0),
                        "revenue_neto": mes_actual_rec.get("revenue_neto", 0),
                        "orders_count": mes_actual_rec.get("orders_count", 0),
                    },
                    "historico_mensual": historico,
                }
            ],
        }

        with open(DATA_PATH, "w") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)

        total_meses = len(historico)
        total_bruto_actual = mes_actual_rec.get("revenue_bruto", 0)
        print(f"✅ locales.json actualizado — {total_meses} meses | mes actual: USD {total_bruto_actual:,.2f}")

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

if __name__ == "__main__":
    main()
