#!/usr/bin/env python3
"""Smoke del ASISTENTE «crear área» (L3b) — 2026-06-24.

Verifica el endpoint atómico `POST /structure/structures/provision`, que aprovisiona
una estructura organizacional COMPLETA y operativa de una sola vez (identidad +
niveles base + primer nodo raíz) dentro de una transacción:

 1) APROVISIONAMIENTO completo y operable:
    - provision con identidad + N niveles + nodo raíz ⇒ 200 y `nodeCount`>=1.
    - la estructura aparece en GET /structure/structures (operable, nodeCount>=1).
    - los niveles quedan creados en orden (GET /structure/levels).
    - el nodo raíz queda en el nivel 0, sin padre (GET /structure/nodes).
    - identidad (color/icon) persistida.

 2) ATOMICIDAD / fallo parcial (no deja huérfanas):
    - provision con clave DUPLICADA ⇒ 400 y NO crea estructura nueva.
    - provision con body inválido (0 niveles) ⇒ 400 (Zod), sin estructura.

 3) AUTORIZACIÓN (super-admin only):
    - un usuario con `orglevel:manage` (pasa el gate del controller) pero SIN
      `module:structure:manage` ⇒ 403 (el servicio re-autoriza super-admin).

Crea y LIMPIA por ID (psql) + usuario/rol temporal. API :3000. Clave Demo!Pass2026."""
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
# usuario con orglevel:manage pero SIN super-admin (module:structure:manage)
NS_USER, NS_EMAIL, NS_ROLE = "smoke-asis-nosuper", "smoke-asis-nosuper@watchlog.local", "smoke-asis-nosuper-role"


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


def make_user(uid, email, role, perms):
    """Usuario temporal con un rol que tiene `perms`. Copia el passwordHash de un
    usuario real para que el login con la clave demo funcione."""
    drop_user(uid, role)
    sql("INSERT INTO \"User\" (id,email,\"displayName\",\"passwordHash\",status,\"updatedAt\") "
        f"SELECT '{uid}','{email}',u.\"displayName\",u.\"passwordHash\",'ACTIVE',now() "
        "FROM \"User\" u WHERE u.email='operador@watchlog.local';")
    sql(f"INSERT INTO \"Role\" (id,key,name,\"updatedAt\") VALUES ('{role}','{role}','Smoke Asistente',now());")
    keys = "','".join(perms)
    sql("INSERT INTO \"RolePermission\" (\"roleId\",\"permissionId\") "
        f"SELECT '{role}', id FROM \"Permission\" WHERE key IN ('{keys}');")
    sql(f"INSERT INTO \"UserRole\" (\"userId\",\"roleId\",\"assignedAt\") VALUES ('{uid}','{role}',now());")


def main():
    global ADMIN_TOK
    ADMIN_TOK = login(ADMIN)
    check("contexto: login admin", bool(ADMIN_TOK))
    if not ADMIN_TOK:
        return finish()

    # ── 1) APROVISIONAMIENTO completo y operable ─────────────────────────────
    payload = {
        "key": "smoke-asis-a",
        "name": "Smoke Asistente A",
        "description": "Área creada por el asistente",
        "color": "teal",
        "icon": "mountain",
        "levels": ["Faena", "Planta", "Área"],
        "rootNode": {"name": "Planta Concentradora", "code": "PL-001"},
    }
    s, prov = call("POST", "/structure/structures/provision", ADMIN_TOK, payload)
    ok_prov = s in (200, 201) and isinstance(prov, dict) and prov.get("id")
    if ok_prov:
        CREATED_STRUCTURES.append(prov["id"])
    check("P1 provision atómico ⇒ 201 con id", bool(ok_prov), f"http={s}")
    check("P2 payload de respuesta marca nodeCount>=1 (operable)", isinstance(prov, dict) and prov.get("nodeCount", 0) >= 1,
          f"nodeCount={prov.get('nodeCount') if isinstance(prov, dict) else prov}")
    check("P3 identidad (color/icon) persistida", isinstance(prov, dict) and prov.get("color") == "teal" and prov.get("icon") == "mountain",
          f"color={prov.get('color') if isinstance(prov, dict) else '?'}")
    if not ok_prov:
        return finish()
    sid = prov["id"]

    # Aparece en el listado como operable (nodeCount>=1)
    s, structs = call("GET", "/structure/structures", ADMIN_TOK)
    row = next((x for x in structs if x["id"] == sid), {}) if isinstance(structs, list) else {}
    check("P4 aparece en /structures con nodeCount>=1", row.get("nodeCount", 0) >= 1, f"nodeCount={row.get('nodeCount')}")

    # Niveles creados en orden
    s, levels = call("GET", f"/structure/levels?structureId={sid}", ADMIN_TOK)
    names_in_order = [l["name"] for l in sorted(levels, key=lambda x: x["order"])] if isinstance(levels, list) else []
    check("P5 niveles creados en orden", names_in_order == ["Faena", "Planta", "Área"], f"levels={names_in_order}")
    level0 = next((l for l in (levels or []) if l.get("order") == 0), None) if isinstance(levels, list) else None

    # Nodo raíz en el nivel 0, sin padre
    s, tree = call("GET", f"/structure/nodes?structureId={sid}", ADMIN_TOK)
    roots = tree if isinstance(tree, list) else []
    one_root = len(roots) == 1 and roots[0].get("parentId") is None
    check("P6 un solo nodo raíz, sin padre", one_root, f"roots={len(roots)}")
    check("P7 nodo raíz en el nivel 0 con su código", one_root and level0 and roots[0].get("levelId") == level0["id"] and roots[0].get("code") == "PL-001",
          f"name={roots[0].get('name') if roots else None}")

    # ── 2) ATOMICIDAD / fallo parcial ────────────────────────────────────────
    before = sql("SELECT count(*) FROM \"OrgStructure\";")
    # Clave duplicada ⇒ 400, sin crear nada
    s, dup = call("POST", "/structure/structures/provision", ADMIN_TOK, {**payload, "name": "Otra"})
    after = sql("SELECT count(*) FROM \"OrgStructure\";")
    check("A1 clave duplicada ⇒ 400", s == 400, f"http={s}")
    check("A2 fallo no crea estructura huérfana (count igual)", before == after, f"{before}→{after}")
    # Body inválido (0 niveles) ⇒ 400 (Zod)
    s, _ = call("POST", "/structure/structures/provision", ADMIN_TOK,
                {"key": "smoke-asis-bad", "name": "Bad", "levels": [], "rootNode": {"name": "X"}})
    after2 = sql("SELECT count(*) FROM \"OrgStructure\" WHERE key='smoke-asis-bad';")
    check("A3 body inválido (0 niveles) ⇒ 400", s == 400, f"http={s}")
    check("A4 body inválido no crea estructura", after2 == "0", f"count={after2}")

    # ── 3) AUTORIZACIÓN: super-admin only ────────────────────────────────────
    # Usuario con orglevel:manage (pasa el gate del controller) pero NO super-admin.
    make_user(NS_USER, NS_EMAIL, NS_ROLE, ["orglevel:manage", "orgnode:create", "orgnode:read"])
    ns_tok = login(NS_EMAIL)
    check("setup: login usuario con orglevel:manage pero sin super-admin", bool(ns_tok))
    if ns_tok:
        s, _ = call("POST", "/structure/structures/provision", ns_tok,
                    {"key": "smoke-asis-403", "name": "No super", "levels": ["Área"], "rootNode": {"name": "N"}})
        check("Z1 sin module:structure:manage ⇒ 403 (servicio re-autoriza)", s == 403, f"http={s}")
        check("Z2 no se creó la estructura del intento 403",
              sql("SELECT count(*) FROM \"OrgStructure\" WHERE key='smoke-asis-403';") == "0")

    return finish()


def drop_user(uid, role):
    sql(f"DELETE FROM \"UserRole\" WHERE \"userId\"='{uid}';")
    sql(f"DELETE FROM \"RolePermission\" WHERE \"roleId\"='{role}';")
    sql(f"DELETE FROM \"Role\" WHERE id='{role}';")
    sql(f"DELETE FROM \"User\" WHERE id='{uid}';")


def cleanup():
    drop_user(NS_USER, NS_ROLE)
    # Borra nodos/niveles/estructura de las áreas de prueba (FK: nodos antes que estructura).
    for sid in CREATED_STRUCTURES:
        sql(f"DELETE FROM \"OrgNode\" WHERE \"structureId\"='{sid}';")
        sql(f"DELETE FROM \"OrgLevel\" WHERE \"structureId\"='{sid}';")
        sql(f"DELETE FROM \"OrgStructure\" WHERE id='{sid}';")
    sql("DELETE FROM \"OrgNode\" WHERE \"structureId\" IN (SELECT id FROM \"OrgStructure\" WHERE key LIKE 'smoke-asis-%');")
    sql("DELETE FROM \"OrgLevel\" WHERE \"structureId\" IN (SELECT id FROM \"OrgStructure\" WHERE key LIKE 'smoke-asis-%');")
    sql("DELETE FROM \"OrgStructure\" WHERE key LIKE 'smoke-asis-%';")
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
