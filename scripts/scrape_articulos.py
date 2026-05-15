#!/usr/bin/env python3
"""
Zeta Software — scraper de ventas por artículo y categoría.
Requiere: ZETA_USER, ZETA_PASS

Flujo GeneXus:
1. Login → reporte → Confirmar (checkbox XLS marcado)
2. GeneXus redirige a z.informes.procesosww (proceso asíncrono)
3. Esperar hasta "Descargar XLS" (Estado: Finalizado)
4. Seleccionar opción 2 del dropdown vACCIONES_0001
5. Capturar descarga via page.expect_download()
6. Parsear Excel con columnas: NOMBRE, CATEGORÍA, FECHA, CANTIDAD, TOTAL U$S
"""
import os, json, sys, tempfile, shutil, time, re
import requests as req_lib
from datetime import datetime, timezone, timedelta

DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "articulos.json")
BASE_URL   = "https://www.zetasoftware.com/z.info.inicio"
REPORT_URL = "https://www.zetasoftware.com/z.gestion.reportes.ventasporarticulo"
UY_TZ = timezone(timedelta(hours=-3))

# Columnas del Excel exportado (0-indexed, header en fila 3)
COL_ARTICULO  = 0
COL_NOMBRE    = 3
COL_CATEGORIA = 4
COL_FECHA     = 9
COL_CANTIDAD  = 13
COL_TOTAL_USD = 14  # Ya en U$S (vEXPRESAR=2)

def login(page, user, password):
    page.goto(BASE_URL, timeout=60000, wait_until="domcontentloaded")
    time.sleep(3)
    page.fill("input[name='vUSULIBRAEMAIL']", user)
    page.fill("input[name='vUSULIBRAPASSWORD']", password)
    page.click("input[name='BTNENTER']")
    time.sleep(10)
    frame = page.frames[0]
    print(f"  Login OK — {frame.url}")
    return frame

def submit_report(frame, page, from_str: str, to_str: str, max_retries=3) -> bool:
    for attempt in range(1, max_retries + 1):
        try:
            frame.goto(REPORT_URL, wait_until="domcontentloaded", timeout=30000)
            time.sleep(6)

            # Loguear todos los campos del form para diagnóstico
            all_fields = frame.evaluate("""() => {
                const fields = [];
                document.querySelectorAll('input, select').forEach(el => {
                    if (el.name) fields.push({
                        name: el.name,
                        type: el.type || el.tagName,
                        value: el.value,
                        checked: el.checked ?? null,
                        options: el.tagName === 'SELECT'
                            ? Array.from(el.options).map(o => o.value + '=' + o.text.trim())
                            : null,
                    });
                });
                return fields;
            }""")
            print("  Campos del form:")
            for f in all_fields:
                if f.get('options'):
                    print(f"    [{f['name']}] SELECT val={f['value']} opts={f['options']}")
                elif f.get('type') == 'checkbox':
                    print(f"    [{f['name']}] CHECKBOX checked={f['checked']}")
                else:
                    print(f"    [{f['name']}] {f['type']} val={f['value']!r}")

            frame.evaluate(f"""() => {{
                function setVal(name, val) {{
                    const el = document.querySelector('[name="' + name + '"]');
                    if (!el) {{ console.warn('Campo no encontrado: ' + name); return; }}
                    el.value = val;
                    el.dispatchEvent(new Event('change', {{bubbles: true}}));
                    el.dispatchEvent(new Event('blur', {{bubbles: true}}));
                }}
                setVal('vDESDEFECHA', '{from_str}');
                setVal('vHASTAFECHA', '{to_str}');
                setVal('vFORMATO', '0');
                setVal('vEXPRESAR', '2');
                // IVA incluido — intentar nombres comunes de GeneXus
                setVal('vCONIVA', '1');
                setVal('vIVA', '1');
                setVal('vMOSTRARIVA', '1');
                // Todas las unidades — dejar vacío el filtro de unidad
                setVal('vUNIDAD', '');
                setVal('vFILTROUNIDAD', '');
                const chk = document.querySelector('[name="vGENERARXLS"]');
                if (chk && !chk.checked) {{
                    chk.dispatchEvent(new MouseEvent('click', {{bubbles: true, cancelable: true, view: window}}));
                }}
            }}""")
            time.sleep(6)

            state = frame.evaluate("""() => {
                const fields = ['vCONIVA','vIVA','vMOSTRARIVA','vUNIDAD','vFILTROUNIDAD','vEXPRESAR','vFORMATO'];
                const res = {xls: document.querySelector('[name="vGENERARXLS"]')?.checked, btn: !!document.querySelector('[name="BTNENTER"]')};
                fields.forEach(n => {
                    const el = document.querySelector('[name="' + n + '"]');
                    if (el) res[n] = el.value;
                });
                return res;
            }""")
            print(f"  Intento {attempt}: xls={state.get('xls')} btn={state.get('btn')}")
            print(f"  Valores seteados: { {k:v for k,v in state.items() if k not in ('xls','btn')} }")

            frame.click("input[name='BTNENTER']", timeout=15000)
            page.wait_for_url("**/z.informes.procesosww**", timeout=60000)
            print(f"  ✅ En procesosww")
            return True

        except Exception as e:
            print(f"  ⚠ Intento {attempt}: {e}")
            time.sleep(5)

    return False

def wait_and_download(frame, page, context, dest: str, timeout_sec=600) -> bool:
    """Espera que el proceso finalice y descarga el XLS.
    Flujo:
      1. Esperar que aparezca 'Descargar XLS' (status Finalizado)
      2. Leer data-gxoch0 del select para extraer params de execEvt
      3. Llamar gx.evt.execEvt() directamente (bypass de isTrusted check)
      4. El browser fetcha /z.informes.descargar → capturar con expect_download
    """
    print(f"  Esperando finalización del proceso (máx {timeout_sec}s)...")
    try:
        frame.wait_for_function(
            "() => document.body.innerText.includes('Descargar XLS')",
            timeout=timeout_sec * 1000
        )
    except Exception as e:
        print(f"  ⚠ Timeout: {e}")
        return False

    print("  ✅ Proceso finalizado — preparando descarga...")

    # Leer parámetros del execEvt desde data-gxoch0
    gxoch_info = frame.evaluate("""() => {
        const sel = document.querySelector('select[name="vACCIONES_0001"]');
        if (!sel) return null;
        return sel.getAttribute('data-gxoch0');
    }""")

    if not gxoch_info:
        print("  ⚠ No se encontró select vACCIONES_0001 o data-gxoch0")
        return False

    m = re.search(r"execEvt\('([^']*)',([^,]*),\s*'([^']*)',this,(\d+)\)", gxoch_info)
    if not m:
        print(f"  ⚠ No se pudo parsear gxoch0: {gxoch_info!r}")
        return False

    p1, p2, evtname, rowid = m.group(1), m.group(2), m.group(3), m.group(4)
    print(f"  execEvt params: evtname={evtname!r} rowid={rowid}")

    # Llamar execEvt directamente y capturar la descarga
    try:
        with page.expect_download(timeout=60000) as dl_info:
            frame.evaluate(f"""() => {{
                const sel = document.querySelector('select[name="vACCIONES_0001"]');
                if (!sel) {{ console.error('select not found'); return; }}
                sel.value = '2';
                gx.evt.execEvt('{p1}', {p2}, '{evtname}', sel, {rowid});
            }}""")
        dl = dl_info.value
        dl.save_as(dest)
        print(f"  ✅ Descargado: {dl.suggested_filename} ({os.path.getsize(dest):,} bytes)")
        return True
    except Exception as e:
        print(f"  ⚠ Download falló: {e}")
        return False

def parse_excel(path: str) -> list[dict]:
    """
    Parsea el XLS de Zeta Software (Ventas por Artículo).
    Columnas: ARTICULO, NOMBRE, CATEGORÍA, FECHA, CANTIDAD, TOTAL U$S
    Retorna lista de registros individuales por venta.
    """
    try:
        import openpyxl
    except ImportError:
        raise ImportError("pip install openpyxl")

    wb = openpyxl.load_workbook(path)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))

    # Buscar el header (fila con "ARTICULO" o "NOMBRE")
    header_row = None
    for i, row in enumerate(rows):
        vals = [str(v).upper().strip() if v else "" for v in row]
        if "ARTICULO" in vals or "NOMBRE" in vals:
            header_row = i
            break

    if header_row is None:
        print("    WARN: header no encontrado")
        print("    Primeras 5 filas:")
        for r in rows[:5]:
            print(f"      {r}")
        return []

    print(f"    Header en fila {header_row}: {[str(v) for v in rows[header_row] if v][:8]}")

    records = []
    for row in rows[header_row + 1:]:
        if not any(row):
            continue

        def get(col_idx):
            if col_idx < len(row):
                return row[col_idx]
            return None

        nombre   = get(COL_NOMBRE) or get(COL_ARTICULO)  # fallback al código si el nombre está vacío
        categoria = get(COL_CATEGORIA)
        fecha    = get(COL_FECHA)
        cantidad = get(COL_CANTIDAD)
        total_usd = get(COL_TOTAL_USD)

        # Filas de subtotal/totalizadoras: sin nombre ni código
        if not nombre:
            continue

        # Parsear fecha
        year, month = None, None
        if isinstance(fecha, datetime):
            year, month = fecha.year, fecha.month
        elif isinstance(fecha, str) and fecha:
            for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d/%m/%y"):
                try:
                    dt = datetime.strptime(fecha.strip(), fmt)
                    year, month = dt.year, dt.month
                    break
                except ValueError:
                    pass

        if year is None or month is None:
            continue

        try:
            rev = float(total_usd or 0)
        except (TypeError, ValueError):
            continue

        if rev == 0:
            continue

        try:
            units = int(float(cantidad or 0))
        except (TypeError, ValueError):
            units = 0

        records.append({
            "year": year,
            "month": month,
            "articulo": str(nombre).strip(),
            "categoria": str(categoria).strip() if categoria else "Sin categoría",
            "revenue_usd": round(rev, 2),
            "units": units,
        })

    return records

def aggregate(records: list[dict]) -> dict:
    """Agrupa por año/mes/categoría y genera top artículos."""
    por_periodo: dict = {}
    por_categoria_total: dict = {}
    por_articulo_total: dict = {}
    por_anio_articulo: dict = {}  # año → { articulo → {revenue_usd, units, categoria} }

    for r in records:
        yr = str(r["year"])
        mo = str(r["month"])
        cat = r["categoria"]
        art = r["articulo"]
        rev = r["revenue_usd"]
        units = r["units"]

        # Por período (año → mes → categoría)
        por_periodo.setdefault(yr, {}).setdefault(mo, {})
        c = por_periodo[yr][mo].setdefault(cat, {"revenue_usd": 0.0, "units": 0})
        c["revenue_usd"] = round(c["revenue_usd"] + rev, 2)
        c["units"] += units

        # Total categoría (histórico)
        ct = por_categoria_total.setdefault(cat, {"revenue_usd": 0.0, "units": 0})
        ct["revenue_usd"] = round(ct["revenue_usd"] + rev, 2)
        ct["units"] += units

        # Total artículo (histórico)
        at = por_articulo_total.setdefault(art, {"revenue_usd": 0.0, "units": 0, "categoria": cat})
        at["revenue_usd"] = round(at["revenue_usd"] + rev, 2)
        at["units"] += units

        # Por año → artículo
        por_anio_articulo.setdefault(yr, {})
        ay = por_anio_articulo[yr].setdefault(art, {"revenue_usd": 0.0, "units": 0, "categoria": cat})
        ay["revenue_usd"] = round(ay["revenue_usd"] + rev, 2)
        ay["units"] += units

    top_categorias = sorted(
        [{"categoria": k, **v} for k, v in por_categoria_total.items()],
        key=lambda x: x["revenue_usd"], reverse=True
    )
    top_articulos = sorted(
        [{"articulo": k, **v} for k, v in por_articulo_total.items()],
        key=lambda x: x["revenue_usd"], reverse=True
    )[:100]

    # Top 100 artículos por año
    top_articulos_por_anio = {
        yr: sorted(
            [{"articulo": k, **v} for k, v in arts.items()],
            key=lambda x: x["revenue_usd"], reverse=True
        )[:100]
        for yr, arts in por_anio_articulo.items()
    }

    return {
        "por_anio_mes_categoria": por_periodo,
        "por_categoria_total": por_categoria_total,
        "top_categorias": top_categorias,
        "top_articulos": top_articulos,
        "top_articulos_por_anio": top_articulos_por_anio,
    }

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
        print(f"ERROR: {e}. Instalar: pip install playwright openpyxl && playwright install chromium", file=sys.stderr)
        sys.exit(1)

    now = datetime.now(UY_TZ)
    from_str = "01/01/24"
    to_str   = now.strftime("%d/%m/%y")

    print(f"Scrapeando ventas por artículo {from_str} → {to_str}")

    tmp_dir = tempfile.mkdtemp()
    dest = os.path.join(tmp_dir, "articulos.xlsx")

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(accept_downloads=True)
            page    = context.new_page()

            frame = login(page, user, password)

            ok = submit_report(frame, page, from_str, to_str)
            if not ok:
                print("ERROR: No se pudo enviar el reporte", file=sys.stderr)
                sys.exit(1)

            downloaded = wait_and_download(frame, page, context, dest, timeout_sec=600)
            browser.close()

        if not downloaded or not os.path.exists(dest):
            print("ERROR: No se descargó el XLS", file=sys.stderr)
            sys.exit(1)

        print(f"  Parseando Excel...")
        records = parse_excel(dest)
        print(f"  Registros: {len(records)}")

        if not records:
            agg = {"por_anio_mes_categoria": {}, "por_categoria_total": {}, "top_categorias": [], "top_articulos": []}
        else:
            agg = aggregate(records)

        output = {
            "_status": "ok",
            "_ultima_actualizacion": now.isoformat(),
            "_rango": f"{from_str} → {to_str}",
            "_nota": "Sin categoría = artículos facturados sin categoría en sistema",
            **agg,
        }

        with open(DATA_PATH, "w") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)

        total_rev = sum(c["revenue_usd"] for c in agg["top_categorias"])
        print(f"✅ articulos.json — {len(records)} ventas | {len(agg['top_categorias'])} categorías | USD {total_rev:,.0f}")
        for c in agg["top_categorias"][:6]:
            print(f"  {c['categoria']}: USD {c['revenue_usd']:,.0f} ({c['units']} u)")

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

if __name__ == "__main__":
    main()
