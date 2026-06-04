#!/usr/bin/env python3
"""
Zeta Software — scraper de facturación por local.
Requiere: ZETA_USER, ZETA_PASS

Flujo:
1. Login
2. Navegar directamente a z.gestion.comprobantes.ventasydevoluciones
   (fallback: buscar por texto en el panel de favoritos)
3. Configurar fechas + IVA incluido + generar XLS
4. BTNENTER → redirige a z.informes.procesosww (flujo asíncrono Zeta)
5. Esperar "Descargar XLS" → capturar descarga vía execEvt
6. Parsear Excel (columna emitida=S solamente)
"""
import os, json, sys, tempfile, shutil, calendar, re, time
from datetime import datetime, timezone, timedelta

DATA_PATH  = os.path.join(os.path.dirname(__file__), "..", "data", "locales.json")
BASE_URL   = "https://www.zetasoftware.com/z.info.inicio"
VENTAS_URL = "https://www.zetasoftware.com/z.gestion.comprobantes.ventasydevoluciones"
UY_TZ      = timezone(timedelta(hours=-3))

TIPOS_DEVOLUCION = {
    "nota de crédito", "nota de credito", "devolución", "devolucion",
    "nota crédito", "nota credito",
}

# Tasas BCU mensuales promedio (UYU/USD).
BCU_RATES: dict[tuple[int, int], float] = {
    (2024, 1): 39.3,  (2024, 2): 38.9,  (2024, 3): 38.6,  (2024, 4): 38.1,
    (2024, 5): 38.0,  (2024, 6): 38.2,  (2024, 7): 38.7,  (2024, 8): 39.5,
    (2024, 9): 40.2,  (2024, 10): 41.2, (2024, 11): 42.3, (2024, 12): 43.0,
    (2025, 1): 43.5,  (2025, 2): 43.0,  (2025, 3): 42.8,  (2025, 4): 42.5,
    (2025, 5): 43.2,  (2025, 6): 43.8,  (2025, 7): 44.0,  (2025, 8): 44.2,
    (2025, 9): 44.5,  (2025, 10): 44.8, (2025, 11): 45.0, (2025, 12): 45.2,
    (2026, 1): 45.0,  (2026, 2): 44.5,  (2026, 3): 44.0,  (2026, 4): 44.5,
    (2026, 5): 44.0,  (2026, 6): 44.0,
}

def get_usd_uyu_rate(year: int, month: int) -> float:
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
    return BCU_RATES.get((year, month), 44.0)

def uyu_to_usd(amount_uyu: float, year: int, month: int) -> float:
    rate = get_usd_uyu_rate(year, month)
    return amount_uyu / rate if rate > 0 else 0

def uy_now():
    return datetime.now(UY_TZ)

# ─── Browser helpers ──────────────────────────────────────────────────────────

def login(page, user, password):
    page.goto(BASE_URL, timeout=60000, wait_until="domcontentloaded")
    # Esperar networkidle para que el JS de GeneXus termine de renderizar el form
    try:
        page.wait_for_load_state("networkidle", timeout=30000)
    except Exception:
        pass

    # Diagnóstico: mostrar URL y campos presentes
    print(f"  [login] URL: {page.url}")
    fields = page.evaluate("""() =>
        Array.from(document.querySelectorAll('input')).map(e =>
            e.name + '/' + e.type + '/' + (e.offsetParent !== null ? 'vis' : 'hid')
        )
    """)
    print(f"  [login] Campos: {fields}")

    # Si el campo de password ya está en el DOM, llenar directamente
    has_pw = page.evaluate(
        "() => !!document.querySelector(\"input[name='vSIMPLEPASSWORD']\")"
    )
    if not has_pw:
        # Flujo email-primero: algunos builds GeneXus muestran el password
        # solo después de confirmar el email
        print("  [login] Campo password no encontrado, probando flujo email-first...")
        email_el = page.wait_for_selector("input[name='vUSULIBRAEMAIL']", timeout=30000)
        email_el.fill(user)
        email_el.press("Enter")
        time.sleep(4)
        print(f"  [login] Campos tras Enter: {page.evaluate('() => Array.from(document.querySelectorAll(\"input\")).map(e => e.name)')}")

    page.wait_for_selector("input[name='vSIMPLEPASSWORD']", timeout=60000)
    page.fill("input[name='vUSULIBRAEMAIL']", user, timeout=30000)
    page.fill("input[name='vSIMPLEPASSWORD']", password, timeout=30000)
    page.click("input[name='BTNENTER']")
    time.sleep(10)
    frame = page.frames[0]
    print(f"  Login OK — {frame.url}")
    return frame

def go_to_ventas(frame, page):
    """Navega al formulario Ventas y Devoluciones.
    Intenta la URL directa primero; si no carga el form, usa el panel de favoritos."""

    # Intento 1: URL directa
    try:
        frame.goto(VENTAS_URL, wait_until="domcontentloaded", timeout=20000)
        time.sleep(4)
        has_form = frame.evaluate(
            "() => !!(document.querySelector('[name=\"vDOCFECHA1\"]') "
            "|| document.querySelector('[name=\"BTNENTER\"]') "
            "|| document.querySelector('[name=\"BTNEXPORT\"]'))"
        )
        if has_form:
            print(f"  Ventas form cargado vía URL directa — {frame.url}")
            return
        print("  URL directa cargó pero sin formulario, intentando favoritos...")
    except Exception as e:
        print(f"  URL directa falló ({e}), intentando favoritos...")

    # Intento 2: panel de favoritos — buscar por texto "Ventas"
    FAV_URL = "https://www.zetasoftware.com/z.gestion.comprobantes.comprobantesfavoritosusuario"
    frame.goto(FAV_URL, wait_until="domcontentloaded", timeout=20000)
    time.sleep(4)

    # Primero intentar el selector original
    clicked = frame.evaluate("""() => {
        const a = document.querySelector('#span_GESTIONNOMBRE_0001 a');
        if (a) { a.click(); return 'original'; }
        // Fallback: cualquier link cuyo texto contenga "Ventas"
        const links = Array.from(document.querySelectorAll('a'));
        const target = links.find(l => (l.textContent || '').toLowerCase().includes('ventas'));
        if (target) { target.click(); return 'text-ventas'; }
        return null;
    }""")
    time.sleep(5)
    print(f"  Navegación por favoritos: {clicked} — {frame.url}")

def submit_month(frame, page, from_str: str, to_str: str, tmp_dir: str) -> str | None:
    """Configura fechas, genera XLS y devuelve la ruta del archivo descargado.
    Maneja tanto el flujo directo (BTNEXPORT) como el flujo asíncrono (procesosww).
    Devuelve None si falla."""

    dest = os.path.join(tmp_dir, "ventas.xlsx")

    # Navegar al formulario de ventas y esperar que el JS lo renderice
    try:
        frame.goto(VENTAS_URL, wait_until="domcontentloaded", timeout=30000)
        # Esperar networkidle (GeneXus hace fetch de recursos adicionales)
        try:
            frame.wait_for_load_state("networkidle", timeout=20000)
        except Exception:
            pass
        # Esperar el elemento que indica que el formulario está listo
        try:
            frame.wait_for_selector(
                "[name='BTNENTER'], [name='vDOCFECHA1'], [name='BTNEXPORT']",
                timeout=20000
            )
        except Exception:
            # Dump de diagnóstico si el form sigue sin aparecer
            all_fields = frame.evaluate("""() =>
                Array.from(document.querySelectorAll('input,select,button')).map(e =>
                    (e.name||e.id||'?') + '/' + (e.tagName) + '/' + (e.type||'')
                ).slice(0, 30)
            """)
            print(f"      [debug] Campos en página: {all_fields[:15]}")
    except Exception as e:
        print(f"      ⚠ No se pudo cargar formulario: {e}")
        return None

    # Configurar fechas + IVA + XLS
    # Usamos triple-click para limpiar el campo antes de escribir (GeneXus a veces
    # ignora el seteo directo si el campo tiene un valor previo cacheado).
    frame.evaluate(f"""() => {{
        function clearAndSet(name, val) {{
            const el = document.querySelector('[name="' + name + '"]');
            if (!el) return false;
            // Limpiar primero
            el.value = '';
            el.dispatchEvent(new Event('input',  {{bubbles: true}}));
            // Ahora setear el nuevo valor
            el.value = val;
            el.dispatchEvent(new Event('input',  {{bubbles: true}}));
            el.dispatchEvent(new Event('change', {{bubbles: true}}));
            el.dispatchEvent(new Event('blur',   {{bubbles: true}}));
            return true;
        }}
        function clickChk(name) {{
            const el = document.querySelector('[name="' + name + '"]');
            if (el && el.type === 'checkbox' && !el.checked)
                el.dispatchEvent(new MouseEvent('click', {{bubbles: true, cancelable: true, view: window}}));
        }}
        clearAndSet('vDOCFECHA1',    '{from_str}');
        clearAndSet('vDOCFECHA1_TO', '{to_str}');
        clickChk('vIVAINCLUIDO');
        clickChk('vGENERARXLS');
    }}""")
    time.sleep(3)

    # Verificar que las fechas quedaron seteadas correctamente
    btns = frame.evaluate("""() => ({
        btnEnter:  !!document.querySelector('[name="BTNENTER"]'),
        btnExport: !!document.querySelector('input#BTNEXPORT, [name="BTNEXPORT"]'),
        fechaFrom: (document.querySelector('[name="vDOCFECHA1"]')    || {}).value || null,
        fechaTo:   (document.querySelector('[name="vDOCFECHA1_TO"]') || {}).value || null,
    })""")
    print(f"      form: btnEnter={btns.get('btnEnter')} btnExport={btns.get('btnExport')} "
          f"fechaFrom={btns.get('fechaFrom')!r} fechaTo={btns.get('fechaTo')!r}")

    # ── Flujo 1: BTNENTER → procesosww (patrón habitual Zeta) ──────────────
    if btns.get("btnEnter"):
        try:
            frame.click("[name='BTNENTER']", timeout=10000)
            # Esperar redirect a procesosww
            page.wait_for_url("**/z.informes.procesosww**", timeout=30000)
            print("      ✅ En procesosww")
            ok = wait_and_download(frame, page, dest)
            return dest if ok else None
        except Exception as e:
            print(f"      ⚠ Flujo BTNENTER/procesosww falló: {e}")

    # ── Flujo 2: BTNEXPORT → descarga directa (fallback) ──────────────────
    if btns.get("btnExport"):
        try:
            with page.expect_download(timeout=60000) as dl_info:
                frame.click("input#BTNEXPORT, [name='BTNEXPORT']", timeout=10000)
            dl = dl_info.value
            dl.save_as(dest)
            print(f"      ✅ Descarga directa: {dl.suggested_filename}")
            return dest
        except Exception as e:
            print(f"      ⚠ Flujo BTNEXPORT falló: {e}")

    print("      ⚠ No se encontró BTNENTER ni BTNEXPORT")
    return None

def wait_and_download(frame, page, dest: str, timeout_sec=300) -> bool:
    """Espera 'Descargar XLS' en procesosww y descarga via execEvt."""
    print(f"      Esperando finalización (máx {timeout_sec}s)...")
    try:
        frame.wait_for_function(
            "() => document.body.innerText.includes('Descargar XLS')",
            timeout=timeout_sec * 1000,
        )
    except Exception as e:
        print(f"      ⚠ Timeout esperando proceso: {e}")
        return False

    gxoch = frame.evaluate("""() => {
        const sel = document.querySelector('select[name="vACCIONES_0001"]');
        return sel ? sel.getAttribute('data-gxoch0') : null;
    }""")
    if not gxoch:
        print("      ⚠ No se encontró select vACCIONES_0001")
        return False

    m = re.search(r"execEvt\('([^']*)',([^,]*),\s*'([^']*)',this,(\d+)\)", gxoch)
    if not m:
        print(f"      ⚠ No se pudo parsear gxoch0: {gxoch!r}")
        return False

    p1, p2, evtname, rowid = m.group(1), m.group(2), m.group(3), m.group(4)
    try:
        with page.expect_download(timeout=180000) as dl_info:
            frame.evaluate(f"""() => {{
                const sel = document.querySelector('select[name="vACCIONES_0001"]');
                sel.value = '2';
                gx.evt.execEvt('{p1}', {p2}, '{evtname}', sel, {rowid});
            }}""")
        dl = dl_info.value
        dl.save_as(dest)
        print(f"      ✅ {dl.suggested_filename} ({os.path.getsize(dest):,} bytes)")
        return True
    except Exception as e:
        print(f"      ⚠ execEvt download falló: {e}")
        return False

# ─── Excel parser ─────────────────────────────────────────────────────────────

def parse_excel(path: str, year: int, month: int) -> dict:
    import openpyxl
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
        print(f"      WARN: header no encontrado en {os.path.basename(path)}")
        return _empty_result(year, month)

    headers = [str(v).lower().strip() if v else "" for v in rows[header_row]]
    col = {name: idx for idx, name in enumerate(headers)}
    emitida_col = col.get("emitida", -1)

    revenue_bruto = 0.0
    devoluciones  = 0.0
    orders_count  = 0
    moneda_mix: dict = {}
    tipo_stats: dict = {}
    skipped_n = 0
    skipped_usd = 0.0

    for row in rows[header_row + 1:]:
        if not any(row):
            continue
        tipo_raw   = str(row[col.get("tipo", 1)] or "").lower().strip()
        total_raw  = row[col.get("total", 8)]
        moneda_raw = str(row[col.get("moneda", 7)] or "").strip()
        emitida    = (str(row[emitida_col] or "").strip().upper()
                      if emitida_col >= 0 else "S")

        if not tipo_raw or ("total" in tipo_raw and len(tipo_raw) < 20):
            continue

        is_usd = "u$s" in moneda_raw.lower() or "usd" in moneda_raw.lower()
        moneda_key = "USD" if is_usd else "UYU"

        try:
            total_orig = float(total_raw or 0)
        except (TypeError, ValueError):
            continue
        if total_orig == 0:
            continue

        total_usd = total_orig if is_usd else uyu_to_usd(total_orig, year, month)

        if emitida_col >= 0 and emitida != "S":
            skipped_n += 1
            skipped_usd += total_usd
            continue

        moneda_mix[moneda_key] = moneda_mix.get(moneda_key, 0) + total_orig
        tipo_stats[tipo_raw] = round(tipo_stats.get(tipo_raw, 0) + total_usd, 2)

        if any(kw in tipo_raw for kw in TIPOS_DEVOLUCION):
            devoluciones += total_usd
        else:
            revenue_bruto += total_usd
            orders_count  += 1

    for t, amt in sorted(tipo_stats.items(), key=lambda x: -x[1]):
        flag = "DEVOL" if any(kw in t for kw in TIPOS_DEVOLUCION) else "VENTA"
        print(f"        [{flag}] {t!r:35s} USD {amt:,.0f}")
    if skipped_n:
        print(f"        [SKIP] no-emitidos: {skipped_n} filas, USD {skipped_usd:,.0f}")
    if emitida_col < 0:
        print(f"        WARN: columna 'emitida' no encontrada — sumando todo. Headers: {headers}")

    return {
        "revenue_bruto_usd": round(revenue_bruto, 2),
        "devoluciones_usd":  round(devoluciones, 2),
        "revenue_neto_usd":  round(revenue_bruto - devoluciones, 2),
        "orders_count":      orders_count,
        "moneda_mix_original": {k: round(v, 2) for k, v in moneda_mix.items()},
        "tasa_uyu_usd":      get_usd_uyu_rate(year, month),
    }

def _empty_result(year: int, month: int) -> dict:
    return {
        "revenue_bruto_usd": 0, "devoluciones_usd": 0, "revenue_neto_usd": 0,
        "orders_count": 0, "moneda_mix_original": {}, "tasa_uyu_usd": get_usd_uyu_rate(year, month),
    }

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    user     = os.environ.get("ZETA_USER", "")
    password = os.environ.get("ZETA_PASS", "")

    if not user or not password:
        print("SKIP: ZETA_USER y ZETA_PASS requeridos", file=sys.stderr)
        sys.exit(0)

    try:
        from playwright.sync_api import sync_playwright
        import openpyxl
    except ImportError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    now = uy_now()

    # Cargar histórico existente para reutilizar meses ya scrapeados
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
            prev_records[("juan_b_alberdi", rec["year"], rec["month"])] = rec

    tmp_dir = tempfile.mkdtemp()
    historico = []
    scrape_ok = False

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page    = browser.new_page()
            frame   = login(page, user, password)
            go_to_ventas(frame, page)

            for year in range(2024, now.year + 1):
                max_month = now.month if year == now.year else 12
                for month in range(1, max_month + 1):
                    key = ("juan_b_alberdi", year, month)
                    is_current = (year == now.year and month == now.month)
                    rec_prev   = prev_records.get(key)

                    # Reutilizar meses pasados con filtro emitida ya aplicado
                    if rec_prev and not is_current and rec_prev.get("_emitida_filtered"):
                        historico.append(rec_prev)
                        print(f"    Reutilizando {year}-{month:02d}: "
                              f"neto={rec_prev.get('revenue_neto', 0):.0f}")
                        continue

                    last_day = calendar.monthrange(year, month)[1]
                    yy       = str(year)[-2:]
                    from_str = f"01/{month:02d}/{yy}"
                    to_str   = f"{last_day:02d}/{month:02d}/{yy}"
                    print(f"    Scrapeando {year}-{month:02d} ({from_str} → {to_str})")

                    xl_path = submit_month(frame, page, from_str, to_str, tmp_dir)

                    if xl_path and os.path.exists(xl_path):
                        data = parse_excel(xl_path, year, month)
                        print(f"      → bruto={data['revenue_bruto_usd']:.0f} "
                              f"dev={data['devoluciones_usd']:.0f} "
                              f"orders={data['orders_count']}")
                        scrape_ok = True
                    else:
                        print(f"      ⚠ Sin archivo — usando ceros")
                        data = _empty_result(year, month)

                    historico.append({
                        "year":  year,
                        "month": month,
                        "revenue_bruto":       data["revenue_bruto_usd"],
                        "revenue_neto":        data["revenue_neto_usd"],
                        "devoluciones":        data["devoluciones_usd"],
                        "orders_count":        data["orders_count"],
                        "moneda_mix_original": data["moneda_mix_original"],
                        "tasa_uyu_usd":        data["tasa_uyu_usd"],
                        "_emitida_filtered":   True,
                    })

            browser.close()

    except Exception as e:
        print(f"ERROR en scraper: {e}", file=sys.stderr)
        import traceback; traceback.print_exc()
        # Si no pudo scrapear nada nuevo, conservar histórico previo intacto
        if not historico:
            for loc in existing.get("locales", []):
                historico = loc.get("historico_mensual", [])
            print("  Conservando histórico previo sin cambios.")
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

    if not historico:
        print("ERROR: sin datos para guardar", file=sys.stderr)
        sys.exit(1)

    mes_actual = next(
        (r for r in historico if r["year"] == now.year and r["month"] == now.month), {}
    )

    output = {
        "_status": "ok",
        "_ultima_actualizacion": now.isoformat(),
        "locales": [{
            "id":     "juan_b_alberdi",
            "nombre": "Juan B Alberdi 6280",
            "mes_actual": {
                "revenue":       mes_actual.get("revenue_bruto", 0),
                "revenue_neto":  mes_actual.get("revenue_neto", 0),
                "orders_count":  mes_actual.get("orders_count", 0),
                "devoluciones":  mes_actual.get("devoluciones", 0),
            },
            "historico_mensual": historico,
        }],
    }

    with open(DATA_PATH, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"✅ locales.json — {len(historico)} meses | "
          f"mes actual: USD {mes_actual.get('revenue_bruto', 0):,.0f}")

if __name__ == "__main__":
    main()
