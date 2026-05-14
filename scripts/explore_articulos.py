#!/usr/bin/env python3
"""
Explorador de z.gestion.reportes.ventasporarticulo
Guarda HTML + screenshot para mapear los campos del formulario.
Requiere: ZETA_USER, ZETA_PASS
"""
import os, sys, time, json
from datetime import datetime, timezone, timedelta

BASE_URL = "https://www.zetasoftware.com/z.info.inicio"
REPORT_URL = "https://www.zetasoftware.com/z.gestion.reportes.ventasporarticulo"
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "_debug")

def main():
    user = os.environ.get("ZETA_USER", "")
    password = os.environ.get("ZETA_PASS", "")
    if not user or not password:
        print("SKIP: ZETA_USER y ZETA_PASS requeridos", file=sys.stderr)
        sys.exit(0)

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("ERROR: pip install playwright && playwright install chromium", file=sys.stderr)
        sys.exit(1)

    os.makedirs(OUT_DIR, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)  # headless=False para debug visual
        page = browser.new_page()

        # Login
        print("Loginando...")
        page.goto(BASE_URL, timeout=30000)
        page.wait_for_load_state("networkidle")
        page.fill("input[name='vUSULIBRAEMAIL']", user)
        page.fill("input[name='vUSULIBRAPASSWORD']", password)
        page.click("input[name='BTNENTER']")
        time.sleep(8)

        frame = page.frames[0]
        print(f"Login OK. Frame: {frame.url}")

        # Navegar al reporte
        print(f"Navegando a {REPORT_URL}...")
        frame.goto(REPORT_URL)
        time.sleep(5)
        print(f"URL actual: {frame.url}")

        # Screenshot
        ss_path = os.path.join(OUT_DIR, "articulos_page.png")
        page.screenshot(path=ss_path, full_page=True)
        print(f"Screenshot guardado: {ss_path}")

        # Guardar HTML
        html = frame.content()
        html_path = os.path.join(OUT_DIR, "articulos_page.html")
        with open(html_path, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"HTML guardado: {html_path}")

        # Extraer inputs y botones
        inputs = frame.evaluate("""() => {
            const els = document.querySelectorAll('input, select, textarea, button');
            return Array.from(els).map(el => ({
                tag: el.tagName,
                type: el.type || '',
                name: el.name || '',
                id: el.id || '',
                value: el.value || '',
                placeholder: el.placeholder || '',
                visible: el.offsetWidth > 0 && el.offsetHeight > 0,
                rect: JSON.stringify(el.getBoundingClientRect())
            }));
        }""")

        print(f"\n=== INPUTS/BOTONES ENCONTRADOS ({len(inputs)}) ===")
        for el in inputs:
            if el['name'] or el['id']:
                print(f"  <{el['tag'].lower()} type={el['type']} name={el['name']!r} id={el['id']!r} visible={el['visible']} value={el['value']!r}>")

        # Guardar listado como JSON
        info_path = os.path.join(OUT_DIR, "articulos_inputs.json")
        with open(info_path, "w") as f:
            json.dump(inputs, f, indent=2)
        print(f"\nListado completo en: {info_path}")

        # Pausa para inspeccion visual si headless=False
        print("\nPausa 15s para inspección visual...")
        time.sleep(15)
        browser.close()

if __name__ == "__main__":
    main()
