#!/usr/bin/env python3
"""Smoke de UX PREMIUM CROSS-ESTRUCTURA (L3) — 2026-06-24.

Verifica las tres piezas entregadas:

 1) IDENTIDAD por estructura en el payload:
    - GET /structure/structures expone `color`/`icon` por fila.
    - una estructura creada CON acento/ícono los persiste; una creada SIN ellos
      queda en null (el front los deriva de la `key`).
    - editar color/icon (incluido `null` para volver a "auto") persiste.

 2) VISTA EJECUTIVA cross-estructura (GET /incidents/dashboard/cross):
    - un gerente SIN alcance consolida KPIs de ≥2 estructuras a la vez.
    - el ABAC por nodo es la FRONTERA: un usuario acotado al nodo de A SOLO ve la
      tarjeta de A (no la de B), aunque tenga el permiso de la vista.
    - los KPIs de la tarjeta reflejan las incidencias abiertas del alcance.

 3) GATE del permiso nuevo `module:dashboard:cross-view`:
    - un usuario SIN el permiso recibe 403 en la vista ejecutiva.

Crea y LIMPIA por ID (psql cascade) + usuarios/roles/scopes temporales. API :3000.
Clave demo Demo!Pass2026."""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE = os.environ.get("WL_BASE", "http://localhost:3000/api")
PASS = os.environ.get("WL_DEMO_PASS", "Demo!Pass2026")
ADMIN = "demo@watchlog.local"
PG = ["docker", "exec", "lyra-watchlog-dev-postgres-1", "psql", "-U", "watchlog", "-d", "watchlog", "-t", "-A"]
OK, FAIL = [], []

CREATED_STRUCTURES = []
CREATED_INCIDENTS = []
# usuario SIN permiso de la vista
NOPERM_USER, NOPERM_EMAIL, NOPERM_ROLE = "smoke-uxp-noperm", "smoke-uxp-noperm@watchlog.local", "smoke-uxp-noperm-role"
# usuario CON permiso pero ACOTADO al nodo de A
SCOPED_USER, SCOPED_EMAIL, SCOPED_ROLE = "smoke-uxp-scoped", "smoke-uxp-scoped@watchlog.local", "smoke-uxp-scoped-role"


def call(method, path, tok=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    if tok:
        r.add_header("Authorization", "Bearer " + tok)
    if data is not None:
        r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r) as resp:
            txt = resp.read().decode()
            return resp.status, (json.loads(txt) if txt else None)
    except urllib.error.HTTPError as e:
        b = e.read().decode()
        try:
            return e.code, json.loads(b)
        except Exception:
            return e.code, b


def login(email):
    s, r = call("POST", "/auth/login", body={"email": email, "password": PASS})
    return r["accessToken"] if s == 200 and isinstance(r, dict) else None


def sql(q):
    return subprocess.run(PG + ["-c", q], capture_output=True, text=True).stdout.strip()


def check(name, cond, detail=""):
    (OK if cond else FAIL).append(name)
    print(("  ok  " if cond else "FAIL ") + name + (f"   [{detail}]" if detail else ""))


def make_structure(key, name, node_name, color=None, icon=None):
    body = {"key": key, "name": name}
    if color is not None:
        body["color"] = color
    if icon is not None:
        body["icon"] = icon
    s, st = call("POST", "/structure/structures", ADMIN_TOK, body)
    if not (isinstance(st, dict) and st.get("id")):
        return None
    CREATED_STRUCTURES.append(st["id"])
    s, lv = call("POST", "/structure/levels", ADMIN_TOK, {"structureId": st["id"], "name": "Área", "order": 0})
    s, node = call("POST", "/structure/nodes", ADMIN_TOK, {"structureId": st["id"], "name": node_name, "levelId": lv["id"]})
    return {"id": st["id"], "node": node["id"], "dto": st}


def make_incident(type_id, node_id, title):
    s, inc = call("POST", "/incidents", ADMIN_TOK, {"title": title, "typeId": type_id, "severity": 5, "orgNodeId": node_id})
    if isinstance(inc, dict) and inc.get("id"):
        CREATED_INCIDENTS.append(inc["id"])
        return inc["id"]
    return None


def make_user(uid, email, role, perms, node=None):
    """Usuario temporal con un rol que tiene `perms`; opcionalmente acotado a `node`.
    Copia el passwordHash de un usuario real para que el login con la clave demo funcione."""
    drop_user(uid, role)
    sql("INSERT INTO \"User\" (id,email,\"displayName\",\"passwordHash\",status,\"updatedAt\") "
        f"SELECT '{uid}','{email}',u.\"displayName\",u.\"passwordHash\",'ACTIVE',now() "
        "FROM \"User\" u WHERE u.email='operador@watchlog.local';")
    sql(f"INSERT INTO \"Role\" (id,key,name,\"updatedAt\") VALUES ('{role}','{role}','Smoke UXP',now());")
    keys = "','".join(perms)
    sql("INSERT INTO \"RolePermission\" (\"roleId\",\"permissionId\") "
        f"SELECT '{role}', id FROM \"Permission\" WHERE key IN ('{keys}');")
    sql(f"INSERT INTO \"UserRole\" (\"userId\",\"roleId\",\"assignedAt\") VALUES ('{uid}','{role}',now());")
    if node:
        sql("INSERT INTO \"Scope\" (id,\"userId\",\"orgNodeId\",\"includeDescendants\") "
            f"VALUES ('{uid}-scope','{uid}','{node}',true);")


def cards_by_id(resp):
    if not (isinstance(resp, dict) and isinstance(resp.get("cards"), list)):
        return {}
    return {c.get("structureId"): c for c in resp["cards"]}


def main():
    global ADMIN_TOK
    ADMIN_TOK = login(ADMIN)
    check("contexto: login admin", bool(ADMIN_TOK))
    if not ADMIN_TOK:
        return finish()

    a = make_structure("smoke-uxp-a", "Smoke UXP A", "Nodo A", color="emerald", icon="factory")
    b = make_structure("smoke-uxp-b", "Smoke UXP B", "Nodo B")  # sin identidad → auto
    check("setup: estructuras A (con identidad) y B (auto)", bool(a and b and a["node"] and b["node"]), f"A={bool(a)} B={bool(b)}")
    if not (a and b):
        return finish()

    s, types = call("GET", "/incidents/types", ADMIN_TOK)
    type_id = next((t["id"] for t in (types or []) if t.get("active")), None) if isinstance(types, list) else None
    check("setup: tipo de incidencia compartido", bool(type_id), str(type_id))
    inc_a = make_incident(type_id, a["node"], "UXP abierta A")
    inc_b = make_incident(type_id, b["node"], "UXP abierta B")
    check("setup: incidencias abiertas A/B", bool(inc_a and inc_b), f"A={inc_a} B={inc_b}")

    # ── 1) IDENTIDAD en el payload ───────────────────────────────────────────
    s, structs = call("GET", "/structure/structures", ADMIN_TOK)
    by_id = {x["id"]: x for x in structs} if isinstance(structs, list) else {}
    ca, cb = by_id.get(a["id"], {}), by_id.get(b["id"], {})
    check("I1 payload expone color/icon por fila", "color" in ca and "icon" in ca, f"keys={sorted(ca.keys())[:6]}")
    check("I2 A persiste acento/ícono configurados", ca.get("color") == "emerald" and ca.get("icon") == "factory",
          f"color={ca.get('color')} icon={ca.get('icon')}")
    check("I3 B sin identidad ⇒ null (auto, se deriva en front)", cb.get("color") is None and cb.get("icon") is None,
          f"color={cb.get('color')} icon={cb.get('icon')}")
    # Editar A: cambiar acento y luego volver a 'auto' (null)
    call("PATCH", f"/structure/structures/{a['id']}", ADMIN_TOK, {"color": "rose"})
    s, ra = call("GET", "/structure/structures", ADMIN_TOK)
    rec = next((x for x in ra if x["id"] == a["id"]), {})
    check("I4 editar acento persiste", rec.get("color") == "rose", f"color={rec.get('color')}")
    call("PATCH", f"/structure/structures/{a['id']}", ADMIN_TOK, {"color": None})
    s, ra = call("GET", "/structure/structures", ADMIN_TOK)
    rec = next((x for x in ra if x["id"] == a["id"]), {})
    check("I5 volver a auto (null) persiste", rec.get("color") is None, f"color={rec.get('color')}")
    # Validación: un acento fuera de la paleta es rechazado (400)
    s, _ = call("POST", "/structure/structures", ADMIN_TOK, {"key": "smoke-uxp-bad", "name": "Bad", "color": "fucsia"})
    check("I6 acento fuera de paleta ⇒ 400", s == 400, f"http={s}")

    # ── 2) VISTA EJECUTIVA: gerente SIN alcance ve ≥2 estructuras ─────────────
    s, cross = call("GET", "/incidents/dashboard/cross", ADMIN_TOK)
    cards = cards_by_id(cross)
    check("X1 admin sin alcance consolida ≥2 estructuras", s == 200 and a["id"] in cards and b["id"] in cards,
          f"http={s} structuras={len(cards)}")
    card_a = cards.get(a["id"], {})
    check("X2 tarjeta A lleva identidad + nodos accesibles",
          card_a.get("accessibleNodeCount", 0) >= 1 and "kpis" in card_a, f"card={card_a}")
    check("X3 tarjeta A cuenta su incidencia abierta", card_a.get("kpis", {}).get("open", 0) >= 1,
          f"open={card_a.get('kpis', {}).get('open')}")
    totals = cross.get("totals", {}) if isinstance(cross, dict) else {}
    check("X4 totales consolidan (open ≥ 2)", totals.get("open", 0) >= 2, f"totals={totals}")

    # ── 2b) ABAC = FRONTERA: usuario acotado a A (con permiso) solo ve A ──────
    make_user(SCOPED_USER, SCOPED_EMAIL, SCOPED_ROLE,
              ["module:dashboard:cross-view", "incident:view", "module:incidents:view"], node=a["node"])
    scoped = login(SCOPED_EMAIL)
    check("setup: login usuario acotado CON permiso de vista", bool(scoped))
    if scoped:
        s, cross_s = call("GET", "/incidents/dashboard/cross", scoped)
        cs = cards_by_id(cross_s)
        check("X5 acotado a A: ve A, NO ve B (ABAC frontera)", s == 200 and a["id"] in cs and b["id"] not in cs,
              f"http={s} structuras={list(cs.keys())}")

    # ── 3) GATE del permiso: usuario SIN permiso ⇒ 403 ───────────────────────
    make_user(NOPERM_USER, NOPERM_EMAIL, NOPERM_ROLE, ["incident:view", "module:incidents:view"])
    noperm = login(NOPERM_EMAIL)
    check("setup: login usuario SIN permiso de vista", bool(noperm))
    if noperm:
        s, _ = call("GET", "/incidents/dashboard/cross", noperm)
        check("G1 sin module:dashboard:cross-view ⇒ 403", s == 403, f"http={s}")

    return finish()


def drop_user(uid, role):
    sql(f"DELETE FROM \"Scope\" WHERE \"userId\"='{uid}';")
    sql(f"DELETE FROM \"UserRole\" WHERE \"userId\"='{uid}';")
    sql(f"DELETE FROM \"RolePermission\" WHERE \"roleId\"='{role}';")
    sql(f"DELETE FROM \"Role\" WHERE id='{role}';")
    sql(f"DELETE FROM \"User\" WHERE id='{uid}';")


def cleanup():
    for iid in CREATED_INCIDENTS:
        sql(f"DELETE FROM \"Incident\" WHERE id='{iid}';")
    drop_user(SCOPED_USER, SCOPED_ROLE)
    drop_user(NOPERM_USER, NOPERM_ROLE)
    for sid in CREATED_STRUCTURES:
        sql(f"DELETE FROM \"OrgStructure\" WHERE id='{sid}';")
    sql("DELETE FROM \"OrgStructure\" WHERE key LIKE 'smoke-uxp-%';")
    print("  · limpieza ejecutada")


def finish():
    cleanup()
    print(f"\n=== {len(OK)} ok, {len(FAIL)} fail ===")
    if FAIL:
        for f in FAIL:
            print("  - " + f)
        sys.exit(1)
    print("Todos los checks en verde ✅")


if __name__ == "__main__":
    main()
