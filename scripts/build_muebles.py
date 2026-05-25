#!/usr/bin/env python3
"""
Genera data/muebles.json y public/muebles-imgs/img_NN.jpg
a partir del archivo data/_muebles.xls (Proforma Invoice Indonesia).

Uso:
  python scripts/build_muebles.py
"""
import os, json, struct, re
from datetime import datetime, timezone, timedelta

BASE_DIR   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLS_PATH   = os.path.join(BASE_DIR, "data", "_muebles.xls")
OUT_JSON   = os.path.join(BASE_DIR, "data", "muebles.json")
OUT_IMGS   = os.path.join(BASE_DIR, "public", "muebles-imgs")
UY_TZ      = timezone(timedelta(hours=-3))

# ─── Image extraction ────────────────────────────────────────────────────────

def extract_blip_images(xls_path: str) -> dict[int, bytes]:
    """Returns {pib_1indexed: jpeg_bytes} for all BSE records."""
    try:
        import olefile
    except ImportError:
        raise ImportError("pip install olefile")

    ol = olefile.OleFileIO(xls_path)
    stream_name = "Workbook" if ol.exists("Workbook") else "Book"
    stream = ol.openstream(stream_name).read()

    # Collect MSODRAWINGGROUP + CONTINUE records
    offset = 0
    collecting = False
    dg_chunks = []
    while offset < len(stream) - 4:
        rec_type = struct.unpack_from("<H", stream, offset)[0]
        rec_len  = struct.unpack_from("<H", stream, offset + 2)[0]
        rec_data = stream[offset + 4: offset + 4 + rec_len]
        if rec_type == 0x00EB:
            collecting = True
            dg_chunks = [rec_data]
        elif rec_type == 0x003C and collecting:
            dg_chunks.append(rec_data)
        elif collecting:
            collecting = False
        offset += 4 + rec_len

    dg_data = b"".join(dg_chunks)

    # Recursive MSO parser to collect BSE blip data
    bse_blips = []

    def parse_mso(data):
        i = 0
        while i < len(data) - 8:
            if i + 8 > len(data):
                break
            ver_inst = struct.unpack_from("<H", data, i)[0]
            ver      = ver_inst & 0x000F
            fbt      = struct.unpack_from("<H", data, i + 2)[0]
            length   = struct.unpack_from("<I", data, i + 4)[0]
            if i + 8 + length > len(data):
                break
            payload = data[i + 8: i + 8 + length]
            if fbt == 0xF007:  # BSE record; skip 36-byte header
                blip = payload[36:] if len(payload) > 36 else b""
                bse_blips.append(blip)
            if ver == 0xF:
                parse_mso(payload)
            i += 8 + length

    parse_mso(dg_data)

    # Extract JPEG from each blip (starts with 25-byte PICT header then FF D8 FF)
    images = {}
    for idx, blip in enumerate(bse_blips):
        jpeg_pos = blip.find(b"\xff\xd8\xff")
        if jpeg_pos < 0:
            continue
        jpeg_data = blip[jpeg_pos:]
        end = jpeg_data.rfind(b"\xff\xd9")
        if end >= 0:
            jpeg_data = jpeg_data[:end + 2]
        images[idx + 1] = jpeg_data  # 1-indexed (pib is 1-indexed)

    return images


def extract_shape_anchors(xls_path: str) -> list[dict]:
    """Returns list of {row1, pib} for each picture shape in the sheet."""
    try:
        import olefile
    except ImportError:
        raise ImportError("pip install olefile")

    ol = olefile.OleFileIO(xls_path)
    stream_name = "Workbook" if ol.exists("Workbook") else "Book"
    stream = ol.openstream(stream_name).read()

    offset = 0
    sheet_chunks = []
    while offset < len(stream) - 4:
        rec_type = struct.unpack_from("<H", stream, offset)[0]
        rec_len  = struct.unpack_from("<H", stream, offset + 2)[0]
        rec_data = stream[offset + 4: offset + 4 + rec_len]
        if rec_type == 0x00EC:
            sheet_chunks.append(rec_data)
        offset += 4 + rec_len

    mso = b"".join(sheet_chunks)
    shapes = []

    def parse_sheet(data):
        i = 0
        while i < len(data) - 8:
            if i + 8 > len(data):
                break
            ver_inst = struct.unpack_from("<H", data, i)[0]
            ver      = ver_inst & 0x000F
            fbt      = struct.unpack_from("<H", data, i + 2)[0]
            length   = struct.unpack_from("<I", data, i + 4)[0]
            if i + 8 + length > len(data):
                break
            payload = data[i + 8: i + 8 + length]

            if fbt == 0xF00A:  # SP — new shape
                shapes.append({"row1": None, "pib": None})
            elif fbt == 0xF00B and shapes:  # OPT — properties
                j = 0
                while j + 6 <= len(payload):
                    pid = struct.unpack_from("<H", payload, j)[0] & 0x3FFF
                    val = struct.unpack_from("<I", payload, j + 2)[0]
                    if pid == 260:  # pib
                        shapes[-1]["pib"] = val
                    j += 6
            elif fbt == 0xF010 and shapes and length >= 18:  # ClientAnchor
                _, _, _, row1 = struct.unpack_from("<HHHH", payload)
                shapes[-1]["row1"] = row1

            if ver == 0xF:
                parse_sheet(payload)
            i += 8 + length

    parse_sheet(mso)
    return [s for s in shapes if s["row1"] is not None and s["pib"] is not None]


# ─── XLS data rows ────────────────────────────────────────────────────────────

def read_muebles_rows(xls_path: str) -> list[dict]:
    """Returns [{row_idx, codigo, nombre, precio_usd}]"""
    try:
        import xlrd
    except ImportError:
        raise ImportError("pip install xlrd")

    wb = xlrd.open_workbook(xls_path)
    ws = wb.sheets()[0]

    items = []
    last_nombre = ""
    for i in range(ws.nrows):
        row = ws.row(i)
        no_val = row[0].value if row[0].value else ""
        if not isinstance(no_val, float):
            continue  # skip non-data rows

        # Code (col 1)
        code_raw = str(row[1].value).strip() if row[1].value else ""
        if code_raw.endswith(".0"):
            code_raw = code_raw[:-2]

        # Description (col 2) — may be empty for sub-items
        nombre = str(row[2].value).strip() if row[2].value else ""
        if nombre:
            last_nombre = nombre
        else:
            nombre = last_nombre  # inherit from parent

        # Precio de venta USD (col 19)
        precio_raw = row[19].value if len(row) > 19 else None
        try:
            precio = round(float(precio_raw), 2) if precio_raw else 0.0
        except (TypeError, ValueError):
            precio = 0.0

        if not code_raw or precio <= 0:
            continue

        items.append({
            "row_idx": i,
            "codigo": code_raw,
            "nombre": nombre,
            "precio_usd": precio,
        })

    return items


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    if not os.path.exists(XLS_PATH):
        print(f"ERROR: No se encontró {XLS_PATH}")
        print("  Copiá el archivo con:  cp '/path/to/Precios de venta Indonesia 2023.xls' data/_muebles.xls")
        return

    os.makedirs(OUT_IMGS, exist_ok=True)

    print("Extrayendo imágenes del XLS...")
    images  = extract_blip_images(XLS_PATH)
    anchors = extract_shape_anchors(XLS_PATH)
    print(f"  Imágenes únicas: {len(images)}, Shapes con anchor: {len(anchors)}")

    # Build row → pib mapping
    row_to_pib: dict[int, int] = {}
    for s in anchors:
        row_to_pib[s["row1"]] = s["pib"]

    # Save unique images to public/muebles-imgs/
    saved_pibs: set[int] = set()
    for pib, jpeg_bytes in images.items():
        img_path = os.path.join(OUT_IMGS, f"img_{pib:02d}.jpg")
        with open(img_path, "wb") as f:
            f.write(jpeg_bytes)
        saved_pibs.add(pib)
    print(f"  Imágenes guardadas en {OUT_IMGS}: {len(saved_pibs)}")

    print("Leyendo filas de artículos...")
    rows = read_muebles_rows(XLS_PATH)
    print(f"  Artículos válidos: {len(rows)}")

    # Build final articulos list (deduplicate: same code+nombre → keep first with foto)
    seen: dict[str, dict] = {}
    articulos = []
    for r in rows:
        pib  = row_to_pib.get(r["row_idx"])
        foto = f"/muebles-imgs/img_{pib:02d}.jpg" if pib and pib in images else None
        key  = f"{r['codigo']}|{r['nombre']}"

        if key not in seen:
            entry = {
                "codigo":    r["codigo"],
                "nombre":    r["nombre"],
                "precio_usd": r["precio_usd"],
            }
            if foto:
                entry["foto"] = foto
            seen[key] = entry
            articulos.append(entry)
        elif foto and "foto" not in seen[key]:
            # Add foto to existing entry if we now have one
            seen[key]["foto"] = foto

    articulos.sort(key=lambda x: x["nombre"].lower())

    now = datetime.now(UY_TZ)
    output = {
        "_status": "ok",
        "_ultima_actualizacion": now.isoformat(),
        "_fuente": "Proforma Invoice PI#006 — Yudhistira, Indonesia",
        "total_articulos": len(articulos),
        "articulos": articulos,
    }

    with open(OUT_JSON, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    con_foto = sum(1 for a in articulos if a.get("foto"))
    print(f"\n✅ muebles.json — {len(articulos)} artículos, {con_foto} con foto")
    print(f"   → {OUT_JSON}")


if __name__ == "__main__":
    main()
