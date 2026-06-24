#!/usr/bin/env python3
"""Smoke de ALCANCE POR NODO a nivel de ROL (L2a) — 2026-06-24.

Verifica que el alcance ABAC por nodo se pueda configurar en el ROL (no solo por
usuario) y que el alcance efectivo del usuario sea la UNIÓN de sus scopes propios
+ los de sus roles, evaluada EN VIVO (sin denormalizar).

Caso guía: un usuario SIN Scope propio pero con un rol scopeado a la estructura A
ve SOLO datos de A; sumarle un Scope propio en B AMPLÍA su alcance a A∪B; quitarle
el rol re-acota a B en vivo. Además: el endpoint nuevo persiste/lee el scope del
rol, exige `role:manage` (403 sin él) y valida nodos (400).

Ejes probados:
 T1  PUT /security/roles/{id}/scope persiste y GET lo devuelve (write+read).
 T2  Usuario sin scope propio + rol→A ⇒ ve A, NO ve B (unión user+rol).
 T3  + Scope propio del usuario en B ⇒ ve A∪B (la unión AMPLÍA).
 T4  Estructura ajena: el rol scopeado a A NO filtra datos de B (ya cubierto por T2).
 T5  Quitar el rol al usuario re-acota EN VIVO (queda solo su scope propio B).
 T6  Gate: el endpoint exige `role:manage` (usuario común ⇒ 403).
 T7  Validación: nodo inexistente ⇒ 400.
 T8  Lista vacía limpia el scope del rol (GET ⇒ sin nodos).

Crea y LIMPIA por ID (psql cascade) + usuario/roles/scope temporales. API :3000.
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

TMP_USER = "smoke-rolescope-user"
TMP_USER_EMAIL = "smoke-rolescope@watchlog.local"
ROLE_PERMS = "smoke-rolescope-perms"   # rol que aporta PERMISOS de lectura (sin scope)
ROLE_SCOPED = "smoke-rolescope-scoped" # rol que aporta el ALCANCE por nodo (bajo prueba)
CREATED_STRUCTURES = []
CREATED_INCIDENTS = []


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


def ids_of(resp):
    if isinstance(resp, dict) and isinstance(resp.get("items"), list):
        return {it.get("id") for it in resp["items"]}
    if isinstance(resp, list):
        return {it.get("id") for it in resp if isinstance(it, dict)}
    return set()


def make_structure(key, name, level_name, node_name):
    s, st = call("POST", "/structure/structures", ADMIN_TOK, {"key": key, "name": name})
    if not (st and st.get("id")):
        return None
    CREATED_STRUCTURES.append(st["id"])
    s, lv = call("POST", "/structure/levels", ADMIN_TOK, {"structureId": st["id"], "name": level_name, "order": 0})
    s, node = call("POST", "/structure/nodes", ADMIN_TOK, {"structureId": st["id"], "name": node_name, "levelId": lv["id"]})
    return {"id": st["id"], "node": node["id"]}


def make_incident(type_id, node_id, title):
    s, inc = call("POST", "/incidents", ADMIN_TOK, {"title": title, "typeId": type_id, "severity": 3, "orgNodeId": node_id})
    if isinstance(inc, dict) and inc.get("id"):
        CREATED_INCIDENTS.append(inc["id"])
        return inc["id"]
    return None


def setup_user_and_roles():
    """Usuario temporal SIN Scope propio + dos roles: uno con los PERMISOS de lectura
    (sin scope) y otro vacío que recibirá el ALCANCE por nodo vía la API bajo prueba.
    Copia el passwordHash de operador DENTRO de SQL para que el login con la clave
    demo funcione."""
    cleanup_user()
    sql("INSERT INTO \"User\" (id,email,\"displayName\",\"passwordHash\",status,\"updatedAt\") "
        f"SELECT '{TMP_USER}','{TMP_USER_EMAIL}',u.\"displayName\",u.\"passwordHash\",'ACTIVE',now() "
        "FROM \"User\" u WHERE u.email='operador@watchlog.local';")
    sql(f"INSERT INTO \"Role\" (id,key,name,\"updatedAt\") VALUES ('{ROLE_PERMS}','{ROLE_PERMS}','Smoke RoleScope Perms',now());")
    sql(f"INSERT INTO \"Role\" (id,key,name,\"updatedAt\") VALUES ('{ROLE_SCOPED}','{ROLE_SCOPED}','Smoke RoleScope Scoped',now());")
    # El rol de permisos aporta SOLO lectura de incidencias (sin role:manage a propósito).
    sql("INSERT INTO \"RolePermission\" (\"roleId\",\"permissionId\") "
        f"SELECT '{ROLE_PERMS}', id FROM \"Permission\" WHERE key IN ('incident:view','module:incidents:view');")
    sql(f"INSERT INTO \"UserRole\" (\"userId\",\"roleId\",\"assignedAt\") VALUES ('{TMP_USER}','{ROLE_PERMS}',now());")
    sql(f"INSERT INTO \"UserRole\" (\"userId\",\"roleId\",\"assignedAt\") VALUES ('{TMP_USER}','{ROLE_SCOPED}',now());")


def main():
    global ADMIN_TOK
    ADMIN_TOK = login(ADMIN)
    check("contexto: login admin", bool(ADMIN_TOK))
    if not ADMIN_TOK:
        return finish()

    a = make_structure("smoke-rsc-a", "Smoke RoleScope A", "Área", "Nodo A")
    b = make_structure("smoke-rsc-b", "Smoke RoleScope B", "Área", "Nodo B")
    check("setup: estructuras A y B con nodo", bool(a and b and a["node"] and b["node"]), f"A={a} B={b}")
    if not (a and b):
        return finish()
    node_a, node_b = a["node"], b["node"]

    s, types = call("GET", "/incidents/types", ADMIN_TOK)
    type_id = next((t["id"] for t in (types or []) if t.get("active")), None) if isinstance(types, list) else None
    check("setup: tipo de incidencia compartido", bool(type_id), str(type_id))

    inc_a = make_incident(type_id, node_a, "Smoke rolescope A")
    inc_b = make_incident(type_id, node_b, "Smoke rolescope B")
    check("setup: incidencias A/B", bool(inc_a and inc_b), f"A={inc_a} B={inc_b}")

    setup_user_and_roles()
    scoped = login(TMP_USER_EMAIL)
    check("setup: login usuario temporal (sin scope propio)", bool(scoped))
    if not (scoped and inc_a and inc_b):
        return finish()

    # ── T6 (antes de mutar): el usuario común NO puede escribir el scope del rol ──
    s, _ = call("PUT", f"/security/roles/{ROLE_SCOPED}/scope", scoped,
                {"scopes": [{"orgNodeId": node_a, "includeDescendants": True}]})
    check("T6 gate: usuario sin role:manage ⇒ 403 al PUT scope del rol", s == 403, f"http={s}")

    # ── T7 validación: nodo inexistente ⇒ 400 ──
    s, _ = call("PUT", f"/security/roles/{ROLE_SCOPED}/scope", ADMIN_TOK,
                {"scopes": [{"orgNodeId": "no-existe-xyz", "includeDescendants": True}]})
    check("T7 validación: nodo inexistente ⇒ 400", s == 400, f"http={s}")

    # ── T1 write+read: el admin asigna el scope del rol a NODO A ──
    s, rd = call("PUT", f"/security/roles/{ROLE_SCOPED}/scope", ADMIN_TOK,
                 {"scopes": [{"orgNodeId": node_a, "includeDescendants": True}]})
    rd_nodes = {x.get("orgNodeId") for x in rd.get("scopes", [])} if isinstance(rd, dict) else set()
    check("T1a PUT scope del rol ⇒ 200 y devuelve el nodo", s == 200 and node_a in rd_nodes, f"http={s} scopes={rd_nodes}")
    s, rg = call("GET", f"/security/roles/{ROLE_SCOPED}", ADMIN_TOK)
    rg_nodes = {x.get("orgNodeId") for x in rg.get("scopes", [])} if isinstance(rg, dict) else set()
    check("T1b GET rol devuelve el scope por nodo", s == 200 and node_a in rg_nodes, f"http={s} scopes={rg_nodes}")

    # ── T2 unión user+rol: sin scope propio, hereda el del rol (A) ──
    s, r = call("GET", "/incidents", scoped)
    seen = ids_of(r)
    check("T2 usuario sin scope propio + rol→A: ve A, NO ve B", s == 200 and inc_a in seen and inc_b not in seen,
          f"http={s} seen={seen & {inc_a, inc_b}}")

    # ── T3 la unión AMPLÍA: + scope PROPIO del usuario en B ⇒ ve A∪B ──
    s, _ = call("PUT", f"/security/users/{TMP_USER}/scope", ADMIN_TOK,
                {"scopes": [{"orgNodeId": node_b, "includeDescendants": True}]})
    check("T3a PUT scope propio del usuario en B ⇒ 200", s == 200, f"http={s}")
    s, r = call("GET", "/incidents", scoped)
    seen = ids_of(r)
    check("T3b unión user(B)+rol(A) ⇒ ve A y B", s == 200 and inc_a in seen and inc_b in seen,
          f"http={s} seen={seen & {inc_a, inc_b}}")

    # ── T5 quitar el rol re-acota EN VIVO (queda solo el scope propio B) ──
    sql(f"DELETE FROM \"UserRole\" WHERE \"userId\"='{TMP_USER}' AND \"roleId\"='{ROLE_SCOPED}';")
    s, r = call("GET", "/incidents", scoped)
    seen = ids_of(r)
    check("T5 quitar el rol re-acota en vivo: ve B, NO ve A", s == 200 and inc_b in seen and inc_a not in seen,
          f"http={s} seen={seen & {inc_a, inc_b}}")

    # ── T8 lista vacía limpia el scope del rol ──
    s, rd = call("PUT", f"/security/roles/{ROLE_SCOPED}/scope", ADMIN_TOK, {"scopes": []})
    empty = isinstance(rd, dict) and rd.get("scopes") == []
    check("T8 PUT scopes=[] limpia el alcance del rol", s == 200 and empty, f"http={s} scopes={rd.get('scopes') if isinstance(rd, dict) else rd}")

    return finish()


def cleanup_user():
    sql(f"DELETE FROM \"Scope\" WHERE \"userId\"='{TMP_USER}';")
    sql(f"DELETE FROM \"Scope\" WHERE \"roleId\" IN ('{ROLE_PERMS}','{ROLE_SCOPED}');")
    sql(f"DELETE FROM \"UserRole\" WHERE \"userId\"='{TMP_USER}';")
    sql(f"DELETE FROM \"RolePermission\" WHERE \"roleId\" IN ('{ROLE_PERMS}','{ROLE_SCOPED}');")
    sql(f"DELETE FROM \"Role\" WHERE id IN ('{ROLE_PERMS}','{ROLE_SCOPED}');")
    sql(f"DELETE FROM \"User\" WHERE id='{TMP_USER}';")


def cleanup():
    for iid in CREATED_INCIDENTS:
        sql(f"DELETE FROM \"Incident\" WHERE id='{iid}';")
    cleanup_user()
    # La cascada de OrgStructure limpia niveles/nodos/calendarios.
    for sid in CREATED_STRUCTURES:
        sql(f"DELETE FROM \"OrgStructure\" WHERE id='{sid}';")
    sql("DELETE FROM \"OrgStructure\" WHERE key LIKE 'smoke-rsc-%';")
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
