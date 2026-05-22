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

# Tasas BCU mensuales promedio (UYU por USD).
# Fuente: Banco Central del Uruguay — tipo de cambio comprador oficial.
# Actualizar manualmente cuando sea necesario; el mes actual se fetchea en vivo.
BCU_RATES: dict[tuple[int, int], float] = {
    (2024, 1): 39.3,  (2024, 2): 38.9,  (2024, 3): 38.6,  (2024, 4): 38.1,
    (2024, 5): 38.0,  (2024, 6): 38.2,  (2024, 7): 38.7,  (2024, 8): 39.5,
    (2024, 9): 40.2,  (2024, 10): 41.2, (2024, 11): 42.3, (2024, 12): 43.0,
    (2025, 1): 43.5,  (2025, 2): 43.0,  (2025, 3): 42.8,  (2025, 4): 42.5,
    (2025, 5): 43.2,  (2025, 6): 43.8,  (2025, 7): 44.0,  (2025, 8): 44.2,
    (2025, 9): 44.5,  (2025, 10): 44.8, (2025, 11): 45.0, (2025, 12): 45.2,
    (2026, 1): 45.0,  (2026, 2): 44.5,  (2026, 3): 44.0,  (2026, 4): 44.5,
    (2026, 5): 44.0,
}

def get_usd_uyu_rate(year: int, month: int) -> float:
    """Devuelve UYU por USD para el mes dado. Para el mes actual usa API live."""
    now = datetime.now(UY_TZ)
    if year == now.year and month == now.month:
        try:
            import requests
            r = requests.get("https://open.er-api.com/v6/latest/USD", timeout=5)
            if r.ok:
                rate = r.json().get("rates", {}).get("UYU", 0)
                if rate > 10:
                    return rate
        except Exception:
            pass
    return BCU_RATES.get((year, month), 44.0)  # fallback 44 si no está en tabla

def uyu_to_usd(amount_uyu: float, year: int, month: int) -> float:
    rate = get_usd_uyu_rate(year, month)
    return amount_uyu / rate if rate > 0 else 0

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
        // Activar IVA incluido en totales
        const iva = document.querySelector('input[name="vIVAINCLUIDO"]');
        if (iva && !iva.checked) {{
            iva.dispatchEvent(new MouseEvent('click', {{bubbles: true, cancelable: true, view: window}}));
        }}
    }}""")
    time.sleep(4)

def download_excel(frame, page, tmp_dir: str) -> str:
    dest = os.path.join(tmp_dir, "ventas.xlsx")
    with page.expect_download(timeout=20000) as dl_info:
        frame.click("input#BTNEXPORT")
    dl = dl_info.value
    dl.save_as(dest)
    return dest

def parse_excel(path: str, year: int, month: int) -> dict:
    """
    Devuelve revenue en USD (convirtiendo UYU con tasa BCU del mes).
    revenue_bruto_usd — ventas totales convertidas a USD
    devoluciones_usd  — notas de crédito convertidas a USD
    revenue_neto_usd  — bruto - devoluciones
    orders_count
    moneda_mix_original — montos originales sin convertir {"USD": x, "UYU": y}
    """
    try:
        import openpyxl
    except ImportError:
        raise ImportError("openpyxl requerido: pip install openpyxl")

    wb = openpyxl.load_workbook(path)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))

    header_row = None
    for i, row in enumerate(rows):
        vals = [str(v).lower().strip() if v else "" for v in row]
        if "fecha" in vals and "total" in vals:
            header_row = i
            break

    if header_row is None:
        print(f"    WARN: No se encontró header en {path}")
        return {"revenue_bruto_usd": 0, "devoluciones_usd": 0, "revenue_neto_usd": 0,
                "orders_count": 0, "moneda_mix_original": {}}

    headers = [str(v).lower().strip() if v else "" for v in rows[header_row]]
    col = {name: idx for idx, name in enumerate(headers)}

    revenue_bruto_usd = 0.0
    devoluciones_usd = 0.0
    orders_count = 0
    moneda_mix_original: dict = {}
    tipo_stats: dict = {}  # diagnóstico: tipo → USD acumulado (emitidos)
    skipped_no_emitida_usd = 0.0  # diagnóstico: total saltado por emitida != S
    skipped_no_emitida_count = 0
    emitida_col_idx = col.get("emitida", -1)

    for row in rows[header_row + 1:]:
        if not any(row):
            continue
        tipo_raw = str(row[col.get("tipo", 1)] or "").lower().strip()
        total_raw = row[col.get("total", 8)]
        moneda_raw = str(row[col.get("moneda", 7)] or "").strip()
        emitida_raw = (
            str(row[emitida_col_idx] or "").strip().upper()
            if emitida_col_idx >= 0 else "S"
        )

        # Saltar filas de resumen/totalizadoras (sin tipo o tipo es "total")
        if not tipo_raw or ("total" in tipo_raw and len(tipo_raw) < 20):
            continue

        is_usd = "u$s" in moneda_raw.lower() or "usd" in moneda_raw.lower()
        moneda_key = "USD" if is_usd else "UYU"

        try:
            total_original = float(total_raw or 0)
        except (TypeError, ValueError):
            continue

        if total_original == 0:
            continue

        # Convertir a USD
        if is_usd:
            total_usd = total_original
        else:
            total_usd = uyu_to_usd(total_original, year, month)

        # Solo contar comprobantes emitidos. Si la columna 'emitida' no
        # existe, se asume emitido (compatibilidad hacia atrás).
        if emitida_col_idx >= 0 and emitida_raw != "S":
            skipped_no_emitida_usd += total_usd
            skipped_no_emitida_count += 1
            continue

        moneda_mix_original[moneda_key] = moneda_mix_original.get(moneda_key, 0) + total_original
        tipo_stats[tipo_raw] = round(tipo_stats.get(tipo_raw, 0) + total_usd, 2)

        is_devolucion = any(kw in tipo_raw for kw in TIPOS_DEVOLUCION)

        if is_devolucion:
            devoluciones_usd += total_usd
        else:
            revenue_bruto_usd += total_usd
            orders_count += 1

    # Diagnóstico: tipos de comprobante emitidos detectados en este mes
    for t, amt in sorted(tipo_stats.items(), key=lambda x: -x[1]):
        flag = "DEVOL" if any(kw in t for kw in TIPOS_DEVOLUCION) else "VENTA"
        print(f"      [{flag}] tipo={t!r:35s} USD {amt:,.0f}")
    if skipped_no_emitida_count > 0:
        print(f"      [SKIP] no-emitidos: {skipped_no_emitida_count} filas, USD {skipped_no_emitida_usd:,.0f}")
    if emitida_col_idx < 0:
        print(f"      WARN: columna 'emitida' NO encontrada en headers — sumando todo. Headers: {headers}")

    return {
        "revenue_bruto_usd": round(revenue_bruto_usd, 2),
        "devoluciones_usd": round(devoluciones_usd, 2),
        "revenue_neto_usd": round(revenue_bruto_usd - devoluciones_usd, 2),
        "orders_count": orders_count,
        "moneda_mix_original": {k: round(v, 2) for k, v in moneda_mix_original.items()},
        "tasa_uyu_usd": get_usd_uyu_rate(year, month),
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
        result = parse_excel(xl_path, year, month)
        print(f"      → bruto_usd={result['revenue_bruto_usd']} dev_usd={result['devoluciones_usd']} orders={result['orders_count']} tasa={result['tasa_uyu_usd']}")
        return result
    except Exception as e:
        print(f"      WARN: {e}")
        return {"revenue_bruto_usd": 0, "devoluciones_usd": 0, "revenue_neto_usd": 0,
                "orders_count": 0, "moneda_mix_original": {}, "tasa_uyu_usd": 0}

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
                    # Re-scrapear 2025 completo (corrección IVA). Cachear 2024 y meses pasados de 2026.
                    is_current_month = (year == now.year and month == now.month)
                    reuse = key in prev_records and year != 2025 and not is_current_month
                    if reuse:
                        rec = prev_records[key]
                        historico.append(rec)
                        print(f"    Reutilizando {year}-{month:02d}: bruto={rec.get('revenue_bruto', 0)}")
                        continue

                    data = fetch_month(frame, page, year, month, tmp_dir)
                    historico.append({
                        "year": year,
                        "month": month,
                        "revenue_bruto": data["revenue_bruto_usd"],
                        "revenue_neto": data["revenue_neto_usd"],
                        "devoluciones": data["devoluciones_usd"],
                        "orders_count": data["orders_count"],
                        "moneda_mix_original": data["moneda_mix_original"],
                        "tasa_uyu_usd": data["tasa_uyu_usd"],
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
                        "devoluciones": mes_actual_rec.get("devoluciones", 0),
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
