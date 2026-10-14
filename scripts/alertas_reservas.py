#!/usr/bin/env python3
"""
Alertas de WhatsApp el día PREVIO a la fecha de entrega de una reserva.

Recorre data/reservas.json y, para las tarjetas en estado "Pago y Sin Entregar"
o "Ir a probar" cuya fecha_entrega sea MAÑANA (hora de Uruguay, UTC-3), manda un
WhatsApp a cada número configurado con los datos de la tarjeta.

Envío vía CallMeBot (https://www.callmebot.com/blog/free-api-whatsapp-messages/).
Cada número tiene su propia apikey (activación única). Se pasan por variables de
entorno:
    CALLMEBOT_APIKEY_1  -> para el número DESTINOS[0]
    CALLMEBOT_APIKEY_2  -> para el número DESTINOS[1]

Para no repetir el mismo aviso, se guarda un registro en data/alertas_enviadas.json
con clave (id de reserva + fecha de entrega). Si ya se mandó, no se vuelve a mandar.
"""

import json
import os
import sys
import time
import urllib.parse
from datetime import datetime, timedelta, timezone

import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESERVAS_PATH = os.path.join(ROOT, "data", "reservas.json")
REGISTRO_PATH = os.path.join(ROOT, "data", "alertas_enviadas.json")

# Estados que disparan la alerta de entrega.
ESTADOS_ALERTA = {"Pago y Sin Entregar", "Ir a probar"}

# Números de destino (con código de país, sin espacios). Su apikey va aparte.
DESTINOS = [
    {"phone": "+59895622112", "apikey_env": "CALLMEBOT_APIKEY_1"},
    {"phone": "+59895756112", "apikey_env": "CALLMEBOT_APIKEY_2"},
]

UY_TZ = timezone(timedelta(hours=-3))  # Uruguay, sin horario de verano desde 2015.


def hoy_uy() -> datetime:
    return datetime.now(UY_TZ)


def fmt_fecha(iso: str) -> str:
    """YYYY-MM-DD -> DD/MM/YYYY (si no parsea, devuelve tal cual)."""
    try:
        d = datetime.strptime(iso[:10], "%Y-%m-%d")
        return d.strftime("%d/%m/%Y")
    except Exception:
        return iso


def leer_json(path: str, default):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default
    except Exception as e:
        print(f"[WARN] No se pudo leer {path}: {e}", file=sys.stderr)
        return default


def armar_mensaje(r: dict, fecha_label: str) -> str:
    lineas = [
        f"🔔 *Entrega MAÑANA* ({fecha_label})",
        f"Estado: {r.get('estado', '')}",
        "",
        f"👤 {r.get('nombre', '').strip() or '(sin nombre)'}",
    ]
    celular = (r.get("celular") or "").strip()
    if celular:
        lineas.append(f"📱 {celular}")
    direccion = (r.get("direccion") or "").strip()
    if direccion:
        lineas.append(f"📍 {direccion}")
    lineas.append(f"📅 Entrega: {fecha_label}")
    articulos = (r.get("articulos") or "").strip()
    if articulos:
        lineas.append(f"🛋️ {articulos}")
    notas = (r.get("notas") or "").strip()
    if notas:
        lineas.append(f"📝 {notas}")
    return "\n".join(lineas)


def enviar_callmebot(phone: str, apikey: str, texto: str) -> bool:
    url = (
        "https://api.callmebot.com/whatsapp.php?"
        + urllib.parse.urlencode({"phone": phone, "text": texto, "apikey": apikey})
    )
    try:
        resp = requests.get(url, timeout=30)
        ok = resp.status_code == 200
        if not ok:
            print(
                f"[ERROR] CallMeBot {phone} HTTP {resp.status_code}: {resp.text[:200]}",
                file=sys.stderr,
            )
        else:
            print(f"[OK] Enviado a {phone}")
        return ok
    except Exception as e:
        print(f"[ERROR] CallMeBot {phone} excepción: {e}", file=sys.stderr)
        return False


def main() -> int:
    data = leer_json(RESERVAS_PATH, {"reservas": []})
    reservas = data.get("reservas", []) if isinstance(data, dict) else []

    manana = (hoy_uy() + timedelta(days=1)).strftime("%Y-%m-%d")
    fecha_label = fmt_fecha(manana)
    print(f"[INFO] Buscando entregas para mañana {manana} ({fecha_label})")

    registro = leer_json(REGISTRO_PATH, {"enviadas": []})
    if not isinstance(registro, dict):
        registro = {"enviadas": []}
    enviadas = registro.get("enviadas", [])
    ya_enviadas = {(e.get("id"), e.get("fecha")) for e in enviadas}

    # Apikeys disponibles por destino.
    destinos = []
    for d in DESTINOS:
        key = os.environ.get(d["apikey_env"], "").strip()
        if key:
            destinos.append({"phone": d["phone"], "apikey": key})
        else:
            print(
                f"[WARN] Falta {d['apikey_env']} (no se enviará a {d['phone']})",
                file=sys.stderr,
            )
    if not destinos:
        print("[ERROR] No hay ninguna apikey de CallMeBot configurada.", file=sys.stderr)
        return 1

    pendientes = [
        r
        for r in reservas
        if r.get("estado") in ESTADOS_ALERTA
        and (r.get("fecha_entrega") or "")[:10] == manana
    ]
    print(f"[INFO] {len(pendientes)} reserva(s) con entrega mañana en estados de alerta")

    hubo_error = False
    nuevas = 0
    for r in pendientes:
        clave = (r.get("id"), manana)
        if clave in ya_enviadas:
            print(f"[SKIP] Ya avisado: {r.get('nombre')} ({r.get('id')})")
            continue

        texto = armar_mensaje(r, fecha_label)
        enviados_ok = 0
        for dest in destinos:
            if enviar_callmebot(dest["phone"], dest["apikey"], texto):
                enviados_ok += 1
            time.sleep(2)  # CallMeBot pide un pequeño intervalo entre mensajes.

        if enviados_ok > 0:
            # Marcar como enviado si al menos un número lo recibió.
            enviadas.append(
                {
                    "id": r.get("id"),
                    "fecha": manana,
                    "nombre": r.get("nombre"),
                    "destinos_ok": enviados_ok,
                    "ts": hoy_uy().isoformat(),
                }
            )
            ya_enviadas.add(clave)
            nuevas += 1
        if enviados_ok < len(destinos):
            hubo_error = True

    # Podar registros de más de 90 días para que el archivo no crezca sin control.
    limite = (hoy_uy() - timedelta(days=90)).strftime("%Y-%m-%d")
    enviadas = [e for e in enviadas if (e.get("fecha") or "") >= limite]

    registro["enviadas"] = enviadas
    registro["_ultima_corrida"] = hoy_uy().isoformat()
    with open(REGISTRO_PATH, "w", encoding="utf-8") as f:
        json.dump(registro, f, ensure_ascii=False, indent=2)
    print(f"[INFO] {nuevas} alerta(s) nueva(s) enviada(s). Registro actualizado.")

    # No fallar el workflow por un error de envío puntual (se reintenta al día
    # siguiente igual); solo registrar en el log.
    return 0 if not hubo_error else 0


if __name__ == "__main__":
    sys.exit(main())
