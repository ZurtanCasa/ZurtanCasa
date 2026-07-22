#!/usr/bin/env python3
"""
Zeta Software — scraper de stock actual (muebles + alfombras neutras).
Requiere: ZETA_USER, ZETA_PASS

Flujo:
1. Login
2. Navegar a Gestión → Informes → Stock Actual (z.informes.stockactual)
3. Correr reporte para "Local"     (Casa Central) → descargar Excel
4. Correr reporte para "Dialcaren"                → descargar Excel
5. Parsear ambos Excels, filtrar muebles y neutras (yute/lana/PET)
6. Guardar data/stock.json
"""
import os, json, sys, tempfile, shutil, time, re
from datetime import datetime, timezone, timedelta

DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "stock.json")
BASE_URL  = "https://www.zetasoftware.com/z.info.inicio"
STOCK_URL = "https://www.zetasoftware.com/z.informes.stockactual"
UY_TZ     = timezone(timedelta(hours=-3))

NEUTRAS_RE = re.compile(r'\b(yute|lana|pet)\b', re.IGNORECASE)

# Nombres de campo candidatos para empresa y depósito (GeneXus varía por instalación)
EMPRESA_FIELDS  = ["vEMPRESA", "vEMPRESA_0001", "vSEDE", "vCOMPANIA", "vLOCAL_EMP"]
DEPOSITO_FIELDS = ["vDEPOSITO", "vDEPOSITO_0001", "vLOCAL", "vSUCURSAL", "vALMACEN"]

def uy_now():
    return datetime.now(UY_TZ)

# ─── Login ────────────────────────────────────────────────────────────────────

def login(page, user, password):
    page.goto(BASE_URL, timeout=60000, wait_until="domcontentloaded")
    try:
        page.wait_for_load_state("networkidle", timeout=30000)
    except Exception:
        pass
    print(f"  [login] URL: {page.url}")

    try:
        el = page.wait_for_selector("input[name='vUSULIBRAEMAIL']", timeout=15000)
        el.fill(user)
        page.wait_for_selector("input[name='vSIMPLEPASSWORD']", timeout=10000).fill(password)
        page.click("input[name='BTNENTER']")
        page.wait_for_load_state("networkidle", timeout=30000)
        print("  Login OK (email+pass)")
        return page.main_frame
    except Exception:
        pass

    try:
        page.wait_for_selector("input[name='vSIMPLEPASSWORD']", timeout=10000).fill(password)
        page.click("input[name='BTNENTER']")
        page.wait_for_load_state("networkidle", timeout=30000)
        print("  Login OK (pass)")
        return page.main_frame
    except Exception as e:
        print(f"  ⚠ Login falló: {e}")
        return page.main_frame

# ─── Helpers de formulario ────────────────────────────────────────────────────

def discover_fields(frame):
    """Imprime todos los campos del formulario para depuración."""
    fields = frame.evaluate("""() =>
        Array.from(document.querySelectorAll('input,select,button')).map(e => ({
            tag:     e.tagName,
            name:    e.name || e.id || '?',
            type:    e.type || '',
            value:   e.value || '',
            options: e.tagName === 'SELECT'
                ? Array.from(e.options).map(o => o.value + ':' + o.text.trim()).slice(0, 15)
                : []
        }))
    """)
    print(f"  [discover] {len(fields)} campos:")
    for f in fields:
        if f["options"]:
            print(f"    SELECT name={f['name']!r}  options={f['options']}")
        elif f["tag"] != "BUTTON":
            print(f"    {f['tag']} name={f['name']!r} type={f['type']!r} val={f['value']!r}")

def select_by_text(frame, candidate_names: list, search_text: str) -> str | None:
    """Selecciona la opción de un select cuyo texto contenga search_text."""
    result = frame.evaluate("""([names, text]) => {
        for (const name of names) {
            const el = document.querySelector('[name="' + name + '"]');
            if (!el || el.tagName !== 'SELECT') continue;
            const opt = Array.from(el.options).find(o =>
                o.text.toLowerCase().includes(text.toLowerCase())
            );
            if (opt) {
                el.value = opt.value;
                el.dispatchEvent(new Event('change', {bubbles: true}));
                el.dispatchEvent(new Event('blur',   {bubbles: true}));
                return name + '=' + opt.value + ':' + opt.text.trim();
            }
        }
        return null;
    }""", [candidate_names, search_text])
    return result

def wait_and_download(frame, page, dest: str, timeout_sec=300) -> bool:
    """Espera 'Descargar XLS' en procesosww y descarga vía execEvt."""
    print(f"    Esperando proceso (máx {timeout_sec}s)...")
    try:
        frame.wait_for_function(
            "() => document.body.innerText.includes('Descargar XLS')",
            timeout=timeout_sec * 1000,
        )
    except Exception as e:
        print(f"    ⚠ Timeout: {e}")
        return False

    gxoch = frame.evaluate("""() => {
        const sel = document.querySelector('select[name="vACCIONES_0001"]');
        if (!sel) return null;
        const opt = Array.from(sel.options).find(o => o.text.includes('XLS'));
        if (opt) { sel.value = opt.value; return opt.value; }
        return null;
    }""")

    if gxoch:
        try:
            with page.expect_download(timeout=180000) as dl_info:
                frame.evaluate("""(val) => {
                    const sel = document.querySelector('select[name="vACCIONES_0001"]');
                    sel.value = val;
                    sel.dispatchEvent(new Event('change', {bubbles: true}));
                    if (typeof execEvt === 'function') execEvt(sel);
                }""", gxoch)
            dl_info.value.save_as(dest)
            print(f"    ✅ Descargado OK")
            return True
        except Exception as e:
            print(f"    ⚠ Download falló: {e}")
    return False

# ─── Fetch por depósito ───────────────────────────────────────────────────────

def fetch_for_deposito(frame, page, deposito_text: str, tmp_dir: str, fname: str) -> str | None:
    """Genera y descarga el Excel de stock para un depósito. Devuelve ruta o None."""
    dest = os.path.join(tmp_dir, fname)

    print(f"  Navegando a Stock Actual ({deposito_text})...")
    try:
        frame.goto(STOCK_URL, wait_until="domcontentloaded", timeout=30000)
        try:
            frame.wait_for_load_state("networkidle", timeout=15000)
        except Exception:
            pass
    except Exception as e:
        print(f"  ⚠ Navegación falló: {e}")
        return None

    time.sleep(2)
    discover_fields(frame)

    # Seleccionar empresa (Casa Central) si hay dropdown para eso
    r1 = select_by_text(frame, EMPRESA_FIELDS, "Casa Central")
    print(f"  Empresa: {r1 or 'no encontrado (puede ser único)'}")
    if r1:
        time.sleep(2)  # esperar recarga AJAX de depósitos

    # Seleccionar depósito
    r2 = select_by_text(frame, DEPOSITO_FIELDS, deposito_text)
    print(f"  Depósito: {r2 or '⚠ no encontrado'}")
    if not r2:
        print(f"  ⚠ No se encontró depósito '{deposito_text}' — abortando")
        return None
    time.sleep(1)

    # Activar "Generar XLS" si existe
    frame.evaluate("""() => {
        const xls = document.querySelector('[name="vGENERARXLS"]');
        if (xls && xls.type === 'checkbox' && !xls.checked)
            xls.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
    }""")
    time.sleep(1)

    btns = frame.evaluate("""() => ({
        enter:  !!document.querySelector('[name="BTNENTER"]'),
        export: !!document.querySelector('input#BTNEXPORT, [name="BTNEXPORT"]'),
    })""")
    print(f"  Botones: enter={btns.get('enter')} export={btns.get('export')}")

    if btns.get("enter"):
        try:
            frame.click("[name='BTNENTER']", timeout=10000)
            page.wait_for_url("**/z.informes.procesosww**", timeout=30000)
            print("  ✅ En procesosww")
            ok = wait_and_download(frame, page, dest)
            return dest if ok else None
        except Exception as e:
            print(f"  ⚠ BTNENTER falló: {e}")

    if btns.get("export"):
        try:
            with page.expect_download(timeout=60000) as dl_info:
                frame.click("input#BTNEXPORT, [name='BTNEXPORT']", timeout=10000)
            dl_info.value.save_as(dest)
            return dest
        except Exception as e:
            print(f"  ⚠ BTNEXPORT falló: {e}")

    print("  ⚠ No se encontró ningún botón de submit")
    return None

# ─── Parseo de Excel ──────────────────────────────────────────────────────────

def parse_stock_excel(path: str) -> dict[str, int]:
    """
    Parsea Excel de Stock Actual. Devuelve {codigo: cantidad} filtrando
    solo muebles (categoría contiene 'mueble') y neutras (nombre contiene yute/lana/PET).
    """
    import openpyxl
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb.active

    # Fila 5 = encabezados. Col 1=ARTICULO, 2=NOMBRE, 6=CATEGORÍA, 12=stock local
    result: dict[str, int] = {}
    for r in range(6, ws.max_row + 1):
        codigo    = ws.cell(r, 1).value
        nombre    = str(ws.cell(r, 2).value or "")
        categoria = str(ws.cell(r, 6).value or "").lower()
        stock_val = ws.cell(r, 12).value

        if not codigo:
            continue

        is_mueble = "mueble" in categoria
        is_neutra = bool(NEUTRAS_RE.search(nombre))

        if not (is_mueble or is_neutra):
            continue

        try:
            qty = int(float(stock_val)) if stock_val is not None else 0
        except (ValueError, TypeError):
            qty = 0

        result[str(codigo).strip()] = qty

    print(f"    Parseados: {len(result)} artículos (muebles + neutras)")
    return result

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    user     = os.environ.get("ZETA_USER", "")
    password = os.environ.get("ZETA_PASS", "")

    if not user or not password:
        print("SKIP: ZETA_USER y ZETA_PASS requeridos", file=sys.stderr)
        sys.exit(0)

    try:
        from playwright.sync_api import sync_playwright
        import openpyxl  # noqa: F401
    except ImportError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)

    tmp_dir = tempfile.mkdtemp()

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page    = browser.new_page()
            frame   = login(page, user, password)

            print("\n[1/2] Stock Local (Casa Central)...")
            path_local = fetch_for_deposito(frame, page,
                deposito_text="Local",
                tmp_dir=tmp_dir,
                fname="stock_local.xlsx",
            )

            print("\n[2/2] Stock Dialcaren...")
            path_dialcaren = fetch_for_deposito(frame, page,
                deposito_text="Dialcaren",
                tmp_dir=tmp_dir,
                fname="stock_dialcaren.xlsx",
            )

            browser.close()

        local_data     = parse_stock_excel(path_local)     if path_local     else {}
        dialcaren_data = parse_stock_excel(path_dialcaren) if path_dialcaren else {}

        all_codes = set(local_data) | set(dialcaren_data)
        articulos = {
            cod: {
                "local":     local_data.get(cod, 0),
                "dialcaren": dialcaren_data.get(cod, 0),
            }
            for cod in all_codes
        }

        output = {
            "_status":               "ok",
            "_ultima_actualizacion": uy_now().strftime("%Y-%m-%dT%H:%M:%S"),
            "_tiene_datos":          True,
            "articulos":             articulos,
        }

        with open(DATA_PATH, "w", encoding="utf-8") as f:
            json.dump(output, f, ensure_ascii=False, indent=2)

        total_stock = sum(v["local"] + v["dialcaren"] for v in articulos.values())
        print(f"\n✅ stock.json: {len(articulos)} artículos, {total_stock} unidades totales")

    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        import traceback; traceback.print_exc()
        if not os.path.exists(DATA_PATH):
            with open(DATA_PATH, "w") as f:
                json.dump({"_status": "error", "_tiene_datos": False, "articulos": {}}, f)
        sys.exit(1)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

if __name__ == "__main__":
    main()
