#!/usr/bin/env python3
"""
Zeta Software — scraper de facturación por local usando Libro de Ventas.
Requiere: ZETA_USER, ZETA_PASS

Estrategia:
- Login → Gestión → Informes → Libro de Ventas (primer favorito)
- Filtrar por mes → Export Excel → parsear columna Total
- El Libro ya viene en USD con IVA incluido y neto de devoluciones
"""
import os, json, sys, tempfile, shutil, calendar
from datetime import datetime, timezone, timedelta

DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "locales.json")
BASE_URL = "https://www.zetasoftware.com/z.info.inicio"
LIBRO_URL = "https://www.zetasoftware.com/z.gestion.reportes.informesfavoritosusuario"
UY_TZ = timezone(timedelta(hours=-3))

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

def go_to_libro_ventas(frame, page):
    import time
    frame.goto(LIBRO_URL)
    time.sleep(3)
    frame.click("#span_GESTIONNOMBRE_0001 a")
    time.sleep(4)
    print(f"  En Libro de Ventas. URL: {frame.url}")
    # Debug: loguear campos del formulario
    fields = frame.evaluate("""() => {
        const els = document.querySelectorAll('input, select');
        return Array.from(els).filter(e => e.name).map(e => ({
            name: e.name, type: e.type || e.tagName,
            value: String(e.value || '').slice(0, 40)
        }));
    }""")
    for f in fields:
        print(f"    [FIELD] {f['type']:10s} name={f['name']:30s} val={f['value']}")

def set_libro_date_filter(frame, from_str: str, to_str: str):
    """from_str / to_str en formato DD/MM/YY. Intenta varios nombres de campo."""
    import time
    result = frame.evaluate(f"""() => {{
        const log = [];
        function setVal(name, val) {{
            const el = document.querySelector('[name="' + name + '"]');
            if (!el) return false;
            el.value = val;
            el.dispatchEvent(new Event('change', {{bubbles: true}}));
            el.dispatchEvent(new Event('blur', {{bubbles: true}}));
            log.push(name + '=' + val);
            return true;
        }}
        const desde = '{from_str}';
        const hasta  = '{to_str}';
        // Probar múltiples nombres (distintos reportes de Zeta usan distintos nombres)
        setVal('vDESDEFECHA', desde) || setVal('vDOCFECHA1', desde) ||
        setVal('vFECHADESDE', desde) || setVal('vFECHAINICIO', desde);
        setVal('vHASTAFECHA', hasta)  || setVal('vDOCFECHA1_TO', hasta) ||
        setVal('vFECHAHASTA', hasta)  || setVal('vFECHAFIN', hasta);
        return log;
    }}""")
    print(f"    Date filter seteado: {result}")
    time.sleep(3)

def download_libro_excel(frame, page, tmp_dir: str) -> str:
    dest = os.path.join(tmp_dir, "libro_ventas.xlsx")
    with page.expect_download(timeout=60000) as dl_info:
        # Intentar los botones más comunes en Zeta reportes
        for selector in ["input#BTNEXPORT", "input#btnGENERAR", "input[name='BTNEXPORT']",
                         "input[name='btnGENERAR']", "button#btnGENERAR"]:
            try:
                frame.click(selector, timeout=3000)
                break
            except Exception:
                continue
    dl = dl_info.value
    dl.save_as(dest)
    return dest

def parse_libro_excel(path: str) -> dict:
    """
    Parsea el Excel del Libro de Ventas.
    El reporte ya viene en USD con IVA incluido.
    Suma la columna Total (positivo=ventas, negativo=devoluciones).
    Retorna revenue_neto (neto total con IVA) y orders_count.
    """
    try:
        import openpyxl
    except ImportError:
        raise ImportError("openpyxl requerido: pip install openpyxl")

    wb = openpyxl.load_workbook(path)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))

    # Buscar fila de header con "total" y "fecha" o "comprobante"
    header_row = None
    for i, row in enumerate(rows):
        vals = [str(v).lower().strip() if v else "" for v in row]
        if "total" in vals and ("fecha" in vals or "comprobante" in vals):
            header_row = i
            break

    if header_row is None:
        print(f"    WARN: No se encontró header en Libro de Ventas — {path}")
        return {"revenue_neto_usd": 0, "orders_count": 0}

    headers = [str(v).lower().strip() if v else "" for v in rows[header_row]]
    print(f"    Header Libro: {headers}")

    # Columna Total: la última ocurrencia de "total" (evitar "subtotal")
    total_col = -1
    for i, h in enumerate(headers):
        if h.strip() == "total":
            total_col = i

    if total_col == -1:
        print(f"    WARN: No se encontró columna 'total'")
        return {"revenue_neto_usd": 0, "orders_count": 0}

    revenue_neto = 0.0
    orders_count = 0

    for row in rows[header_row + 1:]:
        if not any(row):
            continue
        val = row[total_col]
        if val is None:
            continue
        try:
            amount = float(val)
        except (TypeError, ValueError):
            continue
        if amount == 0:
            continue
        revenue_neto += amount
        if amount > 0:
            orders_count += 1

    return {
        "revenue_neto_usd": round(revenue_neto, 2),
        "orders_count": orders_count,
    }

def fetch_month(frame, page, year: int, month: int, tmp_dir: str) -> dict:
    last_day = calendar.monthrange(year, month)[1]
    yy = str(year)[-2:]
    from_str = f"01/{month:02d}/{yy}"
    to_str = f"{last_day:02d}/{month:02d}/{yy}"

    print(f"    Fetching {year}-{month:02d} ({from_str} → {to_str})")
    set_libro_date_filter(frame, from_str, to_str)

    try:
        xl_path = download_libro_excel(frame, page, tmp_dir)
        result = parse_libro_excel(xl_path)
        print(f"      → revenue_neto={result['revenue_neto_usd']:,.2f} orders={result['orders_count']}")
        return result
    except Exception as e:
        print(f"      WARN: {e}")
        return {"revenue_neto_usd": 0, "orders_count": 0}

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

    now = uy_now()

    # Cargar JSON existente para preservar histórico anterior
    existing = {"locales": []}
    if os.path.exists(DATA_PATH):
        try:
            with open(DATA_PATH) as f:
                existing = json.load(f)
        except Exception:
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
            go_to_libro_ventas(frame, page)

            historico = []
            start_year = 2024
            for year in range(start_year, now.year + 1):
                max_month = now.month if year == now.year else 12
                for month in range(1, max_month + 1):
                    key = ("juan_b_alberdi", year, month)
                    is_current_month = (year == now.year and month == now.month)

                    # Reusar registros ya scrapeados desde el Libro de Ventas.
                    # 2024 no se muestra en la gráfica — reusar siempre (salvo que falte _libro).
                    # 2025 siempre re-scrapear (corrección fuente).
                    # 2026 meses pasados: reusar solo si ya vienen del Libro (_libro=True).
                    rec = prev_records.get(key)
                    reuse = (
                        rec is not None
                        and not is_current_month
                        and year != 2025
                        and rec.get("_libro", False)
                    )
                    if reuse:
                        historico.append(rec)
                        print(f"    Reutilizando {year}-{month:02d}: neto={rec.get('revenue_neto', 0):,.0f}")
                        continue

                    data = fetch_month(frame, page, year, month, tmp_dir)
                    historico.append({
                        "year": year,
                        "month": month,
                        "revenue_neto": data["revenue_neto_usd"],
                        "orders_count": data["orders_count"],
                        "_libro": True,
                    })

            browser.close()

        mes_actual_rec = next(
            (r for r in historico if r["year"] == now.year and r["month"] == now.month), {}
        )

        output = {
            "_status": "ok",
            "_ultima_actualizacion": now.isoformat(),
            "locales": [
                {
                    "id": "juan_b_alberdi",
                    "nombre": "Juan B Alberdi 6280",
                    "mes_actual": {
                        "revenue": mes_actual_rec.get("revenue_neto", 0),
                        "orders_count": mes_actual_rec.get("orders_count", 0),
                    },
                    "historico_mensual": historico,
                }
            ],
        }

        with open(DATA_PATH, "w") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)

        total_meses = len(historico)
        revenue_actual = mes_actual_rec.get("revenue_neto", 0)
        print(f"✅ locales.json actualizado — {total_meses} meses | mes actual: USD {revenue_actual:,.2f}")

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

if __name__ == "__main__":
    main()
