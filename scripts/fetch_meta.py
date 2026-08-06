#!/usr/bin/env python3
"""
Meta Marketing API v23 — spend, revenue, ROAS, conversiones, campañas.
Requiere: META_ACCESS_TOKEN, META_ACCOUNT_ID
"""
import os, json, sys, requests
from datetime import datetime, timezone, timedelta

ACCESS_TOKEN = os.environ.get("META_ACCESS_TOKEN", "")
# Cuenta publicitaria ZurtanCasa (no es secreto — inútil sin un token válido).
# Se puede sobreescribir con la env var META_ACCOUNT_ID si algún día cambia.
DEFAULT_ACCOUNT_ID = "1473211181507559"
ACCOUNT_ID = os.environ.get("META_ACCOUNT_ID", "") or DEFAULT_ACCOUNT_ID
DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "meta_ads.json")
CONTEXTO_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "contexto_negocio.json")
API_BASE = "https://graph.facebook.com/v23.0"

UY_TZ = timezone(timedelta(hours=-3))

def uy_now():
    return datetime.now(UY_TZ)

def normalize_account_id(raw):
    return f"act_{raw}" if not raw.startswith("act_") else raw

def meta_get(endpoint, params=None):
    p = params or {}
    p.setdefault("access_token", ACCESS_TOKEN)  # permite override con page token
    resp = requests.get(f"{API_BASE}/{endpoint}", params=p)
    if not resp.ok:
        # Surface el error real de la Graph API (token expirado, sin permisos, cuenta inválida…)
        try:
            err = resp.json().get("error", {})
            msg = err.get("message", resp.text[:300])
            code = err.get("code", resp.status_code)
            print(f"  ⚠ Meta API error {code}: {msg}", file=sys.stderr)
        except Exception:
            print(f"  ⚠ Meta API HTTP {resp.status_code}: {resp.text[:300]}", file=sys.stderr)
        resp.raise_for_status()
    return resp.json()

def load_contexto():
    try:
        with open(CONTEXTO_PATH) as f:
            return json.load(f)
    except:
        return {}

def classify_campaign(name: str, contexto: dict) -> str:
    name_lower = name.lower()
    for kw in contexto.get("tipos_de_campana", {}).get("alcance", []):
        if kw in name_lower:
            return "alcance"
    return "performance"

def fetch_insights(account_id, date_preset=None, since=None, until=None, level="account"):
    params = {
        "fields": "spend,action_values,actions,impressions,clicks,campaign_name,campaign_id",
        "level": level,
        "limit": 500,
    }
    if date_preset:
        params["date_preset"] = date_preset
    elif since and until:
        params["time_range"] = json.dumps({"since": since, "until": until})

    data = meta_get(f"{account_id}/insights", params)
    return data.get("data", [])

def parse_insight(insight: dict):
    spend = float(insight.get("spend", 0))
    revenue = 0.0
    conversiones = 0
    for av in insight.get("action_values", []):
        if av.get("action_type") == "offsite_conversion.fb_pixel_purchase":
            revenue += float(av.get("value", 0))
    for ac in insight.get("actions", []):
        if ac.get("action_type") == "offsite_conversion.fb_pixel_purchase":
            conversiones += int(ac.get("value", 0))
    roas = revenue / spend if spend > 0 else 0
    return {
        "spend": round(spend, 2),
        "revenue_reportado": round(revenue, 2),
        "roas": round(roas, 2),
        "conversiones": conversiones,
        "impressions": int(insight.get("impressions", 0)),
        "clicks": int(insight.get("clicks", 0)),
    }

def fetch_campaigns_period(account_id, date_preset, contexto):
    insights = fetch_insights(account_id, date_preset=date_preset, level="campaign")
    campanas = []
    for ins in insights:
        parsed = parse_insight(ins)
        tipo = classify_campaign(ins.get("campaign_name", ""), contexto)
        campanas.append({
            "id": ins.get("campaign_id", ""),
            "nombre": ins.get("campaign_name", ""),
            "tipo": tipo,
            **parsed,
        })
    campanas.sort(key=lambda c: c["spend"], reverse=True)
    return campanas

# ─── Métricas de Marketing (impresiones, alcance, CPM, perfil, seguidores) ──────

PERIODS = ["today", "yesterday", "last_7d", "last_30d"]

def _num(x):
    try:
        return float(x)
    except (TypeError, ValueError):
        return 0.0

def _cpm(spend, impressions):
    return round(spend / impressions * 1000, 2) if impressions else 0.0

def insights_query(obj, fields, level=None, date_preset=None, since=None, until=None, extra=None):
    params = {"fields": fields, "limit": 300}
    if level:
        params["level"] = level
    if date_preset:
        params["date_preset"] = date_preset
    elif since and until:
        params["time_range"] = json.dumps({"since": since, "until": until})
    if extra:
        params.update(extra)
    return meta_get(f"{obj}/insights", params).get("data", [])

def build_ad_metrics(account_id):
    """Métricas de anuncios por período: cuenta agregada + desglose por anuncio."""
    periodos = {}
    por_anuncio = {}  # ad_id -> {id, nombre, periodos}
    for preset in PERIODS:
        # Agregado de cuenta
        acc = insights_query(account_id, "impressions,reach,spend,clicks",
                             level="account", date_preset=preset)
        if acc:
            a = acc[0]
            imp = int(_num(a.get("impressions")))
            sp = _num(a.get("spend"))
            periodos[preset] = {
                "impressions": imp,
                "reach": int(_num(a.get("reach"))),
                "spend": round(sp, 2),
                "cpm": _cpm(sp, imp),
                "clicks": int(_num(a.get("clicks"))),
            }
        else:
            periodos[preset] = {"impressions": 0, "reach": 0, "spend": 0, "cpm": 0, "clicks": 0}

        # Desglose por anuncio
        for ad in insights_query(account_id, "ad_id,ad_name,impressions,reach,spend",
                                 level="ad", date_preset=preset):
            aid = ad.get("ad_id") or ad.get("ad_name", "?")
            imp = int(_num(ad.get("impressions")))
            sp = _num(ad.get("spend"))
            e = por_anuncio.setdefault(aid, {"id": aid, "nombre": ad.get("ad_name", ""), "periodos": {}})
            e["periodos"][preset] = {
                "impressions": imp,
                "reach": int(_num(ad.get("reach"))),
                "spend": round(sp, 2),
                "cpm": _cpm(sp, imp),
            }
    return periodos, list(por_anuncio.values())

def _period_ranges(now):
    d = now.date()
    return {
        "today":     (d.isoformat(), d.isoformat()),
        "yesterday": ((d - timedelta(days=1)).isoformat(), (d - timedelta(days=1)).isoformat()),
        "last_7d":   ((d - timedelta(days=6)).isoformat(), d.isoformat()),
        "last_30d":  ((d - timedelta(days=29)).isoformat(), d.isoformat()),
    }

def discover_pages(token):
    """Páginas de FB accesibles + su cuenta de Instagram vinculada."""
    data = meta_get("me/accounts", {"fields": "id,name,access_token,instagram_business_account"})
    out = []
    for p in data.get("data", []):
        out.append({
            "page_id": p.get("id"),
            "page_name": p.get("name"),
            "page_token": p.get("access_token"),
            "ig_id": (p.get("instagram_business_account") or {}).get("id"),
        })
    return out

def fetch_fb_metrics(page_id, page_token, ranges):
    """Facebook Page: seguidores nuevos (page_daily_follows).
    Nota: page_views_total y page_fan_adds fueron eliminadas en v23; Facebook ya
    no expone 'visitas al perfil' de página, así que ese valor queda en 0."""
    res = {}
    for label, (since, until) in ranges.items():
        vals = {"profile_visits": 0, "new_followers": 0}
        try:
            data = meta_get(f"{page_id}/insights", {
                "metric": "page_daily_follows",
                "period": "day", "since": since, "until": until,
                "access_token": page_token,
            })
            for m in data.get("data", []):
                if m.get("name") == "page_daily_follows":
                    vals["new_followers"] = sum(int(_num(v.get("value"))) for v in m.get("values", []))
        except Exception as e:
            print(f"  [fb] page_daily_follows {label}: {e}", file=sys.stderr)
        res[label] = vals
    return res

def fetch_ig_metrics(ig_id, ranges):
    """Instagram: visitas al perfil (profile_views con metric_type=total_value)
    y seguidores nuevos (follower_count, serie temporal)."""
    res = {}
    for label, (since, until) in ranges.items():
        vals = {"profile_visits": 0, "new_followers": 0}
        # profile_views: requiere metric_type=total_value → devuelve total del rango
        try:
            data = meta_get(f"{ig_id}/insights", {
                "metric": "profile_views", "metric_type": "total_value",
                "period": "day", "since": since, "until": until,
            })
            for m in data.get("data", []):
                if m.get("name") == "profile_views":
                    tv = m.get("total_value") or {}
                    vals["profile_visits"] = int(_num(tv.get("value")))
        except Exception as e:
            print(f"  [ig] profile_views {label}: {e}", file=sys.stderr)
        # follower_count: serie temporal → sumar el rango
        try:
            data = meta_get(f"{ig_id}/insights", {
                "metric": "follower_count", "period": "day", "since": since, "until": until,
            })
            for m in data.get("data", []):
                if m.get("name") == "follower_count":
                    vals["new_followers"] = sum(int(_num(v.get("value"))) for v in m.get("values", []))
        except Exception as e:
            print(f"  [ig] follower_count {label}: {e}", file=sys.stderr)
        res[label] = vals
    return res

def build_marketing(account_id, now):
    periodos, por_anuncio = build_ad_metrics(account_id)
    marketing = {"periodos": periodos, "por_anuncio": por_anuncio, "_ig_ok": False, "_fb_ok": False}

    # Métricas orgánicas (perfil + seguidores) de FB e IG — requieren scopes de páginas/IG
    ranges = _period_ranges(now)
    fb_tot = {k: {"profile_visits": 0, "new_followers": 0} for k in ranges}
    ig_tot = {k: {"profile_visits": 0, "new_followers": 0} for k in ranges}
    try:
        pages = discover_pages(ACCESS_TOKEN)
        print(f"  [organic] {len(pages)} página(s) accesible(s)")
        for pg in pages:
            if pg["page_id"] and pg["page_token"]:
                fb = fetch_fb_metrics(pg["page_id"], pg["page_token"], ranges)
                for k in ranges:
                    fb_tot[k]["profile_visits"] += fb[k]["profile_visits"]
                    fb_tot[k]["new_followers"] += fb[k]["new_followers"]
                marketing["_fb_ok"] = True
            if pg["ig_id"]:
                ig = fetch_ig_metrics(pg["ig_id"], ranges)
                for k in ranges:
                    ig_tot[k]["profile_visits"] += ig[k]["profile_visits"]
                    ig_tot[k]["new_followers"] += ig[k]["new_followers"]
                marketing["_ig_ok"] = True
    except Exception as e:
        print(f"  [organic] no disponible ({e}) — regenerar token con permisos de páginas/IG", file=sys.stderr)

    for k in ranges:
        marketing["periodos"].setdefault(k, {})
        marketing["periodos"][k]["profile_visits_fb"] = fb_tot[k]["profile_visits"]
        marketing["periodos"][k]["profile_visits_ig"] = ig_tot[k]["profile_visits"]
        marketing["periodos"][k]["new_followers_fb"]  = fb_tot[k]["new_followers"]
        marketing["periodos"][k]["new_followers_ig"]  = ig_tot[k]["new_followers"]
    return marketing

# ─── Main ───────────────────────────────────────────────────────────────────────

def main():
    if not ACCESS_TOKEN or not ACCOUNT_ID:
        print("ERROR: META_ACCESS_TOKEN y META_ACCOUNT_ID requeridos", file=sys.stderr)
        sys.exit(1)

    account_id = normalize_account_id(ACCOUNT_ID)
    contexto = load_contexto()
    now = uy_now()

    # Diagnóstico: qué cuentas publicitarias puede leer este token.
    # Si la cuenta objetivo no está en la lista, el problema es el ID o la
    # asignación de la cuenta al usuario del sistema (no el scope del token).
    print(f"  [diag] Cuenta objetivo: {account_id}")
    try:
        acc_data = meta_get("me/adaccounts", {"fields": "account_id,name", "limit": 100})
        accts = acc_data.get("data", [])
        print(f"  [diag] El token puede leer {len(accts)} cuenta(s):")
        for a in accts:
            print(f"     - act_{a.get('account_id')} : {a.get('name')}")
        ids = {f"act_{a.get('account_id')}" for a in accts}
        if account_id not in ids:
            print(f"  [diag] ⚠ {account_id} NO está entre las cuentas accesibles por el token")
    except Exception as e:
        print(f"  [diag] ⚠ No se pudieron listar las cuentas del token ({e}) — probable falta de ads_read")

    periodos = {}
    for preset in ["today", "yesterday", "last_7d", "last_30d"]:
        insights = fetch_insights(account_id, date_preset=preset)
        if insights:
            periodos[preset] = parse_insight(insights[0])
        else:
            periodos[preset] = {"spend": 0, "revenue_reportado": 0, "roas": 0, "conversiones": 0, "impressions": 0, "clicks": 0}
    print("  Períodos base OK")

    campanas = fetch_campaigns_period(account_id, "last_30d", contexto)
    print(f"  {len(campanas)} campañas fetched")

    historico = []
    for month in range(1, now.month + 1):
        from_dt = datetime(now.year, month, 1)
        if month == 12:
            to_dt = datetime(now.year + 1, 1, 1) - timedelta(days=1)
        else:
            to_dt = datetime(now.year, month + 1, 1) - timedelta(days=1)
        since = from_dt.strftime("%Y-%m-%d")
        until = min(to_dt, now.replace(tzinfo=None)).strftime("%Y-%m-%d")
        insights = fetch_insights(account_id, since=since, until=until)
        if insights:
            parsed = parse_insight(insights[0])
        else:
            parsed = {"spend": 0, "revenue_reportado": 0, "roas": 0, "conversiones": 0, "impressions": 0, "clicks": 0}
        historico.append({"year": now.year, "month": month, **parsed})
    print(f"  Histórico {len(historico)} meses OK")

    # Métricas de marketing (impresiones, alcance, CPM, perfil, seguidores).
    # En try/except: si falla, no rompe el resto de meta_ads.json.
    marketing = None
    try:
        marketing = build_marketing(account_id, now)
        pa = len(marketing.get("por_anuncio", []))
        print(f"  Marketing OK — {pa} anuncio(s) | IG={marketing['_ig_ok']} FB={marketing['_fb_ok']}")
    except Exception as e:
        print(f"  ⚠ Marketing metrics fallaron: {e}", file=sys.stderr)

    output = {
        "_status": "ok",
        "_ultima_actualizacion": now.isoformat(),
        "periodos": periodos,
        "campanas": campanas,
        "historico_mensual": historico,
    }
    if marketing:
        output["marketing"] = marketing

    with open(DATA_PATH, "w") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print("✅ meta_ads.json actualizado")

if __name__ == "__main__":
    main()
