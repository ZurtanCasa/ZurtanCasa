#!/usr/bin/env python3
"""
Zeta Software — scraper de Lista de Precios desde reporte Stock Actual.
Requiere: ZETA_USER, ZETA_PASS

Flujo GeneXus:
1. Login
2. Ir a Gestión → Informes → Stock Actual
3. Configurar filtros:
   - Depósito: '-' (todos)
   - Unidad: '-' (todas)
   - Stock valorado: checkbox tildado
   - Moneda: USD
   - Precio: "Precio de Venta 2026" (último del dropdown)
   - Mostrar precios con IVA: checkbox tildado
4. Confirmar → redirige a z.informes.procesosww
5. Esperar finalización del proceso
6. Descargar XLS
7. Parsear: columnas A=ARTICULO, B=NOMBRE, K=TOTAL (precio USD con IVA)
8. Solo guardar artículos con precio > 0
"""
import os, json, sys, tempfile, shutil, time, re
from datetime import datetime, timezone, timedelta

DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "precios.json")
BASE_URL   = "https://www.zetasoftware.com/z.info.inicio"
REPORT_URL = "https://www.zetasoftware.com/z.gestion.reportes.stockactual"
UY_TZ = timezone(timedelta(hours=-3))

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

def submit_report(frame, page, max_retries=3) -> bool:
    """Configura los filtros del Stock Actual y dispara la generación."""
    for attempt in range(1, max_retries + 1):
        try:
            frame.goto(REPORT_URL, wait_until="domcontentloaded", timeout=30000)
            time.sleep(6)

            # Debug: dump de los campos del formulario para ver nombres reales
            fields = frame.evaluate("""() => {
                const els = document.querySelectorAll('input, select');
                return Array.from(els).filter(e => e.name).map(e => ({
                    name: e.name,
                    type: e.type || e.tagName,
                    value: String(e.value || '').slice(0, 30),
                    checked: e.type === 'checkbox' ? e.checked : null,
                    options: e.tagName === 'SELECT'
                        ? Array.from(e.options).slice(0, 15).map(o => ({val: o.value, text: o.text.slice(0, 40)}))
                        : null,
                }));
            }""")
            print(f"  Intento {attempt}: campos del form:")
            for f in fields[:30]:
                opts = f" opts={f['options']}" if f.get('options') else ""
                chk = f" checked={f['checked']}" if f['checked'] is not None else ""
                print(f"    [{f['type']:10s}] {f['name']:30s} val={f['value']!r}{chk}{opts}")

            # Configurar todos los filtros. Usamos nombres comunes en Zeta +
            # fallbacks para distintas variantes.
            result = frame.evaluate("""() => {
                const log = [];
                function setVal(name, val) {
                    const el = document.querySelector('[name="' + name + '"]');
                    if (!el) return false;
                    el.value = val;
                    el.dispatchEvent(new Event('change', {bubbles: true}));
                    el.dispatchEvent(new Event('blur', {bubbles: true}));
                    log.push(name + '=' + val);
                    return true;
                }
                function clickChk(name) {
                    const el = document.querySelector('[name="' + name + '"]');
                    if (el && el.type === 'checkbox' && !el.checked) {
                        el.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, view: window}));
                        log.push(name + '=checked');
                        return true;
                    }
                    return false;
                }
                function setSelectByText(name, textMatch) {
                    // Selecciona la opción cuyo text contiene textMatch (case-insensitive)
                    const sel = document.querySelector('select[name="' + name + '"]');
                    if (!sel) return false;
                    const target = textMatch.toLowerCase();
                    for (const opt of sel.options) {
                        if ((opt.text || '').toLowerCase().includes(target)) {
                            sel.value = opt.value;
                            sel.dispatchEvent(new Event('change', {bubbles: true}));
                            log.push(name + '=' + opt.value + ' (' + opt.text + ')');
                            return true;
                        }
                    }
                    return false;
                }

                // Depósito = '-' (todos = valor 0 típicamente)
                setVal('vDEPID', '0') || setVal('vDEPOSITO', '0') || setVal('vDEPID', '');
                // Unidad = '-' (todas)
                setVal('vUNIID', '0') || setVal('vUNIDAD', '0') || setVal('vUNIID', '');

                // Stock valorado
                clickChk('vSTOCKVALORADO') || clickChk('vVALORADO') || clickChk('vSTKVAL');

                // Moneda USD (puede ser select por value o por texto)
                setSelectByText('vMONID', 'usd')
                    || setSelectByText('vMONID', 'u$s')
                    || setSelectByText('vMONEDA', 'usd')
                    || setSelectByText('vMONEDA', 'u$s');

                // Precio: dropdown "Precio de Venta 2026"
                setSelectByText('vPRECIO', '2026')
                    || setSelectByText('vTIPOPRECIO', '2026')
                    || setSelectByText('vPREID', '2026')
                    || setSelectByText('vLISTAPRECIO', '2026');

                // Mostrar precios con IVA
                clickChk('vIVAINCLUIDO')
                    || clickChk('vPRECIOSCONIVA')
                    || clickChk('vMOSTRARIVA')
                    || clickChk('vCONIVA');

                // Generar XLS
                clickChk('vGENERARXLS');

                return log;
            }""")
            print(f"  Filtros aplicados: {result}")
            time.sleep(6)

            # Confirmar
            frame.click("input[name='BTNENTER']", timeout=15000)
            page.wait_for_url("**/z.informes.procesosww**", timeout=60000)
            print(f"  ✅ En procesosww")
            return True

        except Exception as e:
            print(f"  ⚠ Intento {attempt}: {e}")
            time.sleep(5)

    return False

def wait_and_download(frame, page, dest: str, timeout_sec=600) -> bool:
    """Espera que el proceso termine y descarga el XLS via execEvt (igual que articulos)."""
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

    try:
        with page.expect_download(timeout=180000) as dl_info:
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
    Parsea el Excel de Stock Actual.
    Estructura conocida (basado en export manual):
      - Header en fila 4
      - Col A (0): ARTICULO (código)
      - Col B (1): NOMBRE
      - Col K (10): TOTAL (precio USD con IVA)
    Pero detectamos por nombre de header para ser robusto.
    """
    try:
        import openpyxl
    except ImportError:
        raise ImportError("pip install openpyxl")

    wb = openpyxl.load_workbook(path)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))

    # Buscar header
    header_row = None
    for i, row in enumerate(rows[:30]):
        vals = [str(v).upper().strip() if v is not None else "" for v in row]
        if "ARTICULO" in vals and "NOMBRE" in vals:
            header_row = i
            break

    if header_row is None:
        print(f"    WARN: header no encontrado. Primeras 5 filas:")
        for r in rows[:5]:
            print(f"      {r}")
        return []

    headers = [str(v).upper().strip() if v is not None else "" for v in rows[header_row]]
    print(f"    Header fila {header_row}: {headers}")

    def col(*names) -> int:
        """Devuelve el índice de la primera columna cuyo header == alguno de los nombres."""
        for n in names:
            for i, h in enumerate(headers):
                if h == n.upper():
                    return i
        return -1

    c_articulo = col("ARTICULO", "CODIGO", "CÓDIGO")
    c_nombre   = col("NOMBRE", "DESCRIPCION", "DESCRIPCIÓN")
    c_total    = col("TOTAL")  # En el Stock Actual con stock valorado, TOTAL = precio * stock... o precio?

    # Si TOTAL no aparece, intentar otras opciones
    if c_total == -1:
        c_total = col("PRECIO", "PRECIO VENTA", "IMPORTE")

    print(f"    Columnas: articulo={c_articulo} nombre={c_nombre} precio={c_total}")

    if c_articulo == -1 or c_nombre == -1 or c_total == -1:
        print(f"    ERROR: faltan columnas requeridas. Headers: {headers}")
        return []

    articulos = []
    for row in rows[header_row + 1:]:
        if not row or len(row) <= max(c_articulo, c_nombre, c_total):
            continue
        codigo = row[c_articulo]
        nombre = row[c_nombre]
        precio = row[c_total]
        if not codigo or not nombre:
            continue
        try:
            precio_f = float(precio or 0)
        except (TypeError, ValueError):
            continue
        if precio_f <= 0:
            continue
        articulos.append({
            "codigo": str(codigo).strip(),
            "nombre": str(nombre).strip(),
            "precio_usd": round(precio_f, 2),
        })

    # Ordenar alfabético por nombre
    articulos.sort(key=lambda x: x["nombre"].lower())
    return articulos

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
    print(f"Scrapeando Lista de Precios desde Stock Actual ({now.isoformat()})")

    tmp_dir = tempfile.mkdtemp()
    dest = os.path.join(tmp_dir, "stock_actual.xlsx")

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(accept_downloads=True)
            page    = context.new_page()

            frame = login(page, user, password)

            ok = submit_report(frame, page)
            if not ok:
                print("ERROR: No se pudo enviar el reporte", file=sys.stderr)
                sys.exit(1)

            downloaded = wait_and_download(frame, page, dest, timeout_sec=600)
            browser.close()

        if not downloaded or not os.path.exists(dest):
            print("ERROR: No se descargó el XLS", file=sys.stderr)
            sys.exit(1)

        print(f"  Parseando Excel...")
        articulos = parse_excel(dest)
        print(f"  Artículos con precio > 0: {len(articulos)}")

        if not articulos:
            # No sobreescribir el JSON con vacío si falla el parser
            print("ERROR: parser devolvió 0 artículos — no se actualiza precios.json", file=sys.stderr)
            sys.exit(1)

        output = {
            "_status": "ok",
            "_ultima_actualizacion": now.isoformat(),
            "_fuente": "Stock Actual (Zeta) — Precio Venta 2026 con IVA",
            "total_articulos": len(articulos),
            "articulos": articulos,
        }

        with open(DATA_PATH, "w") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)

        precios = [a["precio_usd"] for a in articulos]
        print(f"✅ precios.json — {len(articulos)} artículos | "
              f"min USD {min(precios):,.0f} | máx USD {max(precios):,.0f} | "
              f"promedio USD {sum(precios)/len(precios):,.0f}")

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

if __name__ == "__main__":
    main()
