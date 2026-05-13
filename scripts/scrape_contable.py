#!/usr/bin/env python3
"""
Zeta Software — scraper de facturación por local.
Requiere: ZETA_USER, ZETA_PASS, ZETA_BASE_URL
Se implementa cuando el cliente provee credenciales y URL del panel.
"""
import os, json, sys
from datetime import datetime, timezone, timedelta

DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "locales.json")
UY_TZ = timezone(timedelta(hours=-3))

def uy_now():
    return datetime.now(UY_TZ)

def main():
    user = os.environ.get("ZETA_USER", "")
    password = os.environ.get("ZETA_PASS", "")
    base_url = os.environ.get("ZETA_BASE_URL", "")

    if not user or not password or not base_url:
        print("SKIP: ZETA_USER, ZETA_PASS o ZETA_BASE_URL no configurados", file=sys.stderr)
        sys.exit(0)

    print(f"Conectando a Zeta Software: {base_url}")

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("ERROR: playwright no instalado. Corré: pip install playwright && playwright install chromium", file=sys.stderr)
        sys.exit(1)

    now = uy_now()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        page.goto(base_url)

        page.fill("#usuario", user)
        page.fill("#contrasena", password)
        page.click('button[type="submit"]')
        page.wait_for_load_state("networkidle")

        print("⚠️  Scraper de Zeta Software pendiente de implementación.")
        print("   Cuando tengas la URL exacta del panel, completamos este script.")
        print("   Por ahora el script termina sin datos.")

        browser.close()

    sys.exit(0)

if __name__ == "__main__":
    main()
