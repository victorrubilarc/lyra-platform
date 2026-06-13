#!/usr/bin/env python3
"""Smoke de VISTAS GUARDADAS + MULTI-SORT (Fase 2.8.1b).

Verifica: (1) CRUD de SavedView (crear/listar/actualizar/eliminar); (2) UNA default
por (usuario, modulo) — crear/actualizar otra default DESMARCA la previa; (3) OWNERSHIP:
un usuario NO ve ni modifica/borra vistas de otro (404); (4) validacion del contrato
(modulo invalido, nombre vacio, PATCH vacio, >3 claves de orden); (5) MULTI-SORT en el
listado: `sorts=campo:dir,campo:dir` ordena server-side; claves invalidas se descartan.

CREA solo vistas (sin tocar bitacoras) y LIMPIA TODO por ID al terminar. API :3000.
Usuarios demo: operador@/supervisor@/mantenedor@watchlog.local clave Demo!Pass2026."""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE = os.environ.get("WL_BASE", "http://localhost:3000/api")
PASS = os.environ.get("WL_DEMO_PASS", "Demo!Pass2026")
USERS = {
    "operador": "operador@watchlog.local",
    "supervisor": "supervisor@watchlog.local",
    "mantenedor": "mantenedor@watchlog.local",
}
OK, FAIL = [], []


def call(method, path, tok=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    if body is not None:
        r.add_header("Content-Type", "application/json")
    if tok:
        r.add_header("Authorization", "Bearer " + tok)
    try:
        with urllib.request.urlopen(r) as resp:
            txt = resp.read().decode()
            return resp.status, (json.loads(txt) if txt else None)
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, body


def login(email):
    s, resp = call("POST", "/auth/login", body={"email": email, "password": PASS})
    assert s == 200 and isinstance(resp, dict) and resp.get("accessToken"), f"login {email}: {s} {resp}"
    return resp["accessToken"]


def check(name, cond, detail=""):
    (OK if cond else FAIL).append(name)
    print(("  ok  " if cond else "FAIL ") + name + (f"   [{detail}]" if detail else ""))


def list_views(tok):
    s, resp = call("GET", "/saved-views?module=LOGBOOK", tok)
    return s, (resp.get("views") if isinstance(resp, dict) else [])


def defaults(views):
    return [v for v in views if v.get("isDefault")]


def main():
    tokens = {k: login(v) for k, v in USERS.items()}
    op, sup = tokens["operador"], tokens["supervisor"]
    created = []  # ids creados por operador (para limpiar)

    # Baseline
    s, base = list_views(op)
    check("operador lista sus vistas (200)", s == 200, str(s))
    base_ids = {v["id"] for v in base}

    cfg = {
        "filters": {"status": "SUBMITTED", "pendingSignature": True},
        "sort": [{"field": "effectiveAt", "dir": "asc"}],
        "columns": {"order": ["entryNumber", "summary"], "hidden": ["author"], "pinnedLeft": ["entryNumber"], "widths": {"summary": 320}},
        "density": "compact",
    }

    # 1. Crear vista simple
    s, v1 = call("POST", "/saved-views", op, {"module": "LOGBOOK", "name": "Smoke A", "config": cfg})
    check("crea vista (200)", s in (200, 201) and isinstance(v1, dict) and v1.get("id"), str(s))
    if isinstance(v1, dict) and v1.get("id"):
        created.append(v1["id"])
        check("config round-trip (densidad compact)", v1["config"]["density"] == "compact")
        check("config round-trip (1 clave de orden)", v1["config"]["sort"] == [{"field": "effectiveAt", "dir": "asc"}])
        check("no es default por defecto", v1.get("isDefault") is False)

    # 2. Crear default
    s, vd1 = call("POST", "/saved-views", op, {"module": "LOGBOOK", "name": "Smoke Default", "config": {}, "isDefault": True})
    check("crea vista default (200)", s in (200, 201) and vd1.get("isDefault") is True, str(s))
    if vd1.get("id"):
        created.append(vd1["id"])

    # 3. Crear SEGUNDA default → desmarca la primera
    s, vd2 = call("POST", "/saved-views", op, {"module": "LOGBOOK", "name": "Smoke Default 2", "config": {}, "isDefault": True})
    check("crea 2.a default (200)", s in (200, 201) and vd2.get("isDefault") is True, str(s))
    if vd2.get("id"):
        created.append(vd2["id"])
    s, after = list_views(op)
    check("UNA sola default tras 2 defaults", len(defaults(after)) == 1, f"{len(defaults(after))} defaults")
    check("la default vigente es la 2.a", defaults(after) and defaults(after)[0]["id"] == vd2.get("id"))

    # 4. PATCH nombre + marcar Smoke A como default (desmarca vd2)
    s, up = call("PATCH", f"/saved-views/{v1['id']}", op, {"name": "Smoke A renombrada", "isDefault": True})
    check("actualiza nombre (200)", s == 200 and up.get("name") == "Smoke A renombrada", str(s))
    s, after2 = list_views(op)
    check("marcar otra default desmarca la previa", len(defaults(after2)) == 1 and defaults(after2)[0]["id"] == v1["id"])
    check("lista = baseline + 3", len([v for v in after2 if v["id"] not in base_ids]) == 3)

    # 5. OWNERSHIP: supervisor NO ve las de operador y no las puede tocar
    s, sup_views = list_views(sup)
    leaked = [v for v in sup_views if v["id"] in set(created)]
    check("supervisor NO ve las vistas del operador", s == 200 and not leaked, f"{len(leaked)} fugadas")
    s, _ = call("PATCH", f"/saved-views/{v1['id']}", sup, {"name": "hack"})
    check("supervisor no puede ACTUALIZAR vista ajena (404)", s == 404, str(s))
    s, _ = call("DELETE", f"/saved-views/{v1['id']}", sup)
    check("supervisor no puede ELIMINAR vista ajena (404)", s == 404, str(s))

    # 6. Validacion del contrato
    s, _ = call("POST", "/saved-views", op, {"module": "NOPE", "name": "x", "config": {}})
    check("rechaza modulo invalido (400)", s == 400, str(s))
    s, _ = call("POST", "/saved-views", op, {"module": "LOGBOOK", "name": "   ", "config": {}})
    check("rechaza nombre vacio (400)", s == 400, str(s))
    s, _ = call("PATCH", f"/saved-views/{v1['id']}", op, {})
    check("rechaza PATCH vacio (400)", s == 400, str(s))
    s, _ = call("POST", "/saved-views", op, {"module": "LOGBOOK", "name": "x", "config": {"sort": [
        {"field": "a", "dir": "asc"}, {"field": "b", "dir": "asc"}, {"field": "c", "dir": "asc"}, {"field": "d", "dir": "asc"}]}})
    check("rechaza >3 claves de orden (400)", s == 400, str(s))

    # 7. MULTI-SORT en el listado
    s, r = call("GET", "/log-entries?sorts=effectiveAt:asc&take=5", op)
    check("multi-sort 1 clave (200)", s == 200 and isinstance(r, dict) and "items" in r, str(s))
    s, r2 = call("GET", "/log-entries?sorts=" + urllib.parse.quote("entryNumber:desc,effectiveAt:asc") + "&take=10", op)
    check("multi-sort 2 claves (200)", s == 200 and isinstance(r2, dict), str(s))
    if isinstance(r2, dict) and len(r2.get("items", [])) >= 2:
        nums = [it["entryNumber"] for it in r2["items"]]
        check("ordena por entryNumber desc (clave primaria)", nums == sorted(nums, reverse=True), str(nums[:6]))
    s, r3 = call("GET", "/log-entries?sorts=foo:asc&take=3", op)
    check("claves invalidas se descartan → 200 (cae a default)", s == 200, str(s))

    # Limpieza por ID
    print("\nLimpieza:")
    for vid in created:
        s, _ = call("DELETE", f"/saved-views/{vid}", op)
        print(f"  DELETE {vid}: {s}")
    s, final = list_views(op)
    check("vuelta a baseline tras limpiar", len([v for v in final if v["id"] not in base_ids]) == 0)

    print(f"\n== {len(OK)} ok, {len(FAIL)} fail ==")
    if FAIL:
        print("FALLARON:", ", ".join(FAIL))
        sys.exit(1)


if __name__ == "__main__":
    main()
