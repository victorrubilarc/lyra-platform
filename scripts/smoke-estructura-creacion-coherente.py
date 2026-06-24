#!/usr/bin/env python3
"""Smoke de COHERENCIA DE LA ESTRUCTURA ACTIVA en los caminos de CREACIÓN (L1c) — 2026-06-24.

Hasta L1b los LISTADOS ya filtraban por la estructura activa (`?structureId=`), pero
el flujo de "Nueva entrada" ignoraba la estructura: el picker de plantilla y el de
nodos elegibles solo aplicaban ABAC + alcance de plantilla. Un usuario cuyo alcance
abarca DOS estructuras (A y B), estando "en A", veía y podía elegir plantillas/nodos
de B — incoherente con el badge "Estás en A".

Verifica los DOS endpoints de creación, espejo del aislamiento L1b:
  · GET /log-entries/templates?structureId=…       (picker de plantillas)
  · GET /log-entries/templates/:id/nodes?structureId=…  (nodos elegibles)

Escenario: estructuras A y B, cada una con su nodo; plantilla ANCLADA a A (tplA),
plantilla anclada a B (tplB) y plantilla GLOBAL sin asignación (tplG). Dos miradas:

 D) Usuario con alcance en A *y* B (dual), cambiando la estructura activa:
    - structureId=A ⇒ ve tplA + tplG, NO tplB; nodos de tplG = solo nodo A.
    - structureId=B ⇒ ve tplB + tplG, NO tplA; nodos de tplG = solo nodo B.
    - SIN structureId ⇒ ve ambas (el filtro es lo que las separa).
    - GLOBAL aparece SIEMPRE bajo cualquier estructura (decisión 2026-06-24 (a)).
    - nodos de tplA bajo structureId=B ⇒ VACÍO (su nodo no vive en B).
 E) Frontera ABAC: usuario acotado SOLO a A, sin pasar structureId, jamás ve tplB
    ni el nodo B (el ABAC sigue siendo la frontera; la estructura es ADITIVA).

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

DUAL_USER = "smoke-crea-dual"
DUAL_EMAIL = "smoke-crea-dual@watchlog.local"
DUAL_ROLE = "smoke-crea-role"
SOLO_USER = "smoke-crea-solo"
SOLO_EMAIL = "smoke-crea-solo@watchlog.local"
CREATED_STRUCTURES = []
CREATED_TEMPLATES = []


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


def tpl_ids(resp):
    """Ids de plantilla de la respuesta del picker (array crudo de TemplateListItem)."""
    if isinstance(resp, list):
        return {it.get("id") for it in resp if isinstance(it, dict)}
    return set()


def node_ids(resp):
    """Ids de nodo de la respuesta de nodos elegibles ({templateId, nodes:[…]})."""
    if isinstance(resp, dict) and isinstance(resp.get("nodes"), list):
        return {n.get("id") for n in resp["nodes"] if isinstance(n, dict)}
    return set()


def make_structure(key, name, level_name, node_name):
    s, st = call("POST", "/structure/structures", ADMIN_TOK, {"key": key, "name": name})
    if not (st and st.get("id")):
        return None
    CREATED_STRUCTURES.append(st["id"])
    s, lv = call("POST", "/structure/levels", ADMIN_TOK, {"structureId": st["id"], "name": level_name, "order": 0})
    s, node = call("POST", "/structure/nodes", ADMIN_TOK, {"structureId": st["id"], "name": node_name, "levelId": lv["id"]})
    return {"id": st["id"], "node": node["id"]}


def make_template(name, assignments):
    """Crea + publica una plantilla. `assignments` = lista de orgNodeId (o vacía = GLOBAL)."""
    body = {"name": name, "nodeAssignments": [{"orgNodeId": n, "includeDescendants": False} for n in assignments]}
    s, tpl = call("POST", "/templates", ADMIN_TOK, body)
    if not (isinstance(tpl, dict) and tpl.get("id")):
        return None
    tid = tpl["id"]
    CREATED_TEMPLATES.append(tid)
    call("PUT", f"/templates/{tid}/draft", ADMIN_TOK, {
        "sections": [{"key": "s1", "title": "Operación", "fields": [{"key": "obs", "type": "TEXT", "label": "Observación"}]}],
    })
    call("POST", f"/templates/{tid}/publish", ADMIN_TOK, {})
    return tid


def setup_user(uid, email, role_key, node_ids_scope, with_role_perms):
    """Usuario temporal con `logentry:create`/`:view` y un Scope por cada nodo en
    `node_ids_scope`. Copia el passwordHash de operador DENTRO de SQL para que el
    login con la clave demo funcione."""
    sql(f"DELETE FROM \"Scope\" WHERE \"userId\"='{uid}';")
    sql(f"DELETE FROM \"UserRole\" WHERE \"userId\"='{uid}';")
    sql(f"DELETE FROM \"User\" WHERE id='{uid}';")
    sql("INSERT INTO \"User\" (id,email,\"displayName\",\"passwordHash\",status,\"updatedAt\") "
        f"SELECT '{uid}','{email}',u.\"displayName\",u.\"passwordHash\",'ACTIVE',now() "
        "FROM \"User\" u WHERE u.email='operador@watchlog.local';")
    if with_role_perms:
        sql(f"INSERT INTO \"Role\" (id,key,name,\"updatedAt\") VALUES ('{role_key}','{role_key}','Smoke Creación',now());")
        sql("INSERT INTO \"RolePermission\" (\"roleId\",\"permissionId\") "
            f"SELECT '{role_key}', id FROM \"Permission\" WHERE key IN ('logentry:create','logentry:view');")
    sql(f"INSERT INTO \"UserRole\" (\"userId\",\"roleId\",\"assignedAt\") VALUES ('{uid}','{role_key}',now());")
    for i, nid in enumerate(node_ids_scope):
        sql("INSERT INTO \"Scope\" (id,\"userId\",\"orgNodeId\",\"includeDescendants\") "
            f"VALUES ('{uid}-sc{i}','{uid}','{nid}',true);")


def main():
    global ADMIN_TOK
    ADMIN_TOK = login(ADMIN)
    check("contexto: login admin", bool(ADMIN_TOK))
    if not ADMIN_TOK:
        return finish()

    a = make_structure("smoke-crea-a", "Smoke Creación A", "Área", "Nodo A")
    b = make_structure("smoke-crea-b", "Smoke Creación B", "Área", "Nodo B")
    check("setup: estructuras A y B con nodo", bool(a and b and a["node"] and b["node"]), f"A={a} B={b}")
    if not (a and b):
        return finish()
    node_a, node_b = a["node"], b["node"]

    tpl_a = make_template("SMOKE CREA tplA (ancla A)", [node_a])
    tpl_b = make_template("SMOKE CREA tplB (ancla B)", [node_b])
    tpl_g = make_template("SMOKE CREA tplG (global)", [])
    check("setup: plantillas tplA/tplB/tplG publicadas", bool(tpl_a and tpl_b and tpl_g), f"A={tpl_a} B={tpl_b} G={tpl_g}")
    if not (tpl_a and tpl_b and tpl_g):
        return finish()

    # Usuario con alcance en AMBAS estructuras (A y B).
    setup_user(DUAL_USER, DUAL_EMAIL, DUAL_ROLE, [node_a, node_b], with_role_perms=True)
    # Usuario acotado SOLO a A (reusa el mismo rol con permisos).
    setup_user(SOLO_USER, SOLO_EMAIL, DUAL_ROLE, [node_a], with_role_perms=False)
    dual = login(DUAL_EMAIL)
    solo = login(SOLO_EMAIL)
    check("setup: login usuario dual (A+B)", bool(dual))
    check("setup: login usuario acotado a A", bool(solo))
    if not (dual and solo):
        return finish()

    # ── D) Usuario DUAL cambiando la estructura activa ───────────────────────
    # Picker de plantillas
    s, ra = call("GET", f"/log-entries/templates?structureId={a['id']}", dual)
    ta = tpl_ids(ra)
    check("D1 plantillas en A ⇒ tplA + tplG, NO tplB",
          s == 200 and tpl_a in ta and tpl_g in ta and tpl_b not in ta, f"http={s} seen={ta & {tpl_a, tpl_b, tpl_g}}")
    s, rb = call("GET", f"/log-entries/templates?structureId={b['id']}", dual)
    tb = tpl_ids(rb)
    check("D2 plantillas en B ⇒ tplB + tplG, NO tplA",
          s == 200 and tpl_b in tb and tpl_g in tb and tpl_a not in tb, f"http={s} seen={tb & {tpl_a, tpl_b, tpl_g}}")
    s, rn = call("GET", "/log-entries/templates", dual)
    tn = tpl_ids(rn)
    check("D3 plantillas SIN structureId ⇒ ambas ancladas + global",
          s == 200 and tpl_a in tn and tpl_b in tn and tpl_g in tn, f"http={s} seen={tn & {tpl_a, tpl_b, tpl_g}}")
    check("D4 GLOBAL aparece SIEMPRE (en A y en B) — decisión (a)",
          tpl_g in ta and tpl_g in tb, "")

    # Nodos elegibles de la GLOBAL: se acotan a la estructura activa.
    s, ga = call("GET", f"/log-entries/templates/{tpl_g}/nodes?structureId={a['id']}", dual)
    na = node_ids(ga)
    check("D5 nodos de tplG en A ⇒ nodo A sí, nodo B no",
          s == 200 and node_a in na and node_b not in na, f"http={s} nodes={na & {node_a, node_b}}")
    s, gb = call("GET", f"/log-entries/templates/{tpl_g}/nodes?structureId={b['id']}", dual)
    nb = node_ids(gb)
    check("D6 nodos de tplG en B ⇒ nodo B sí, nodo A no",
          s == 200 and node_b in nb and node_a not in nb, f"http={s} nodes={nb & {node_a, node_b}}")
    s, gn = call("GET", f"/log-entries/templates/{tpl_g}/nodes", dual)
    nn = node_ids(gn)
    check("D7 nodos de tplG SIN structureId ⇒ ambos nodos", s == 200 and node_a in nn and node_b in nn, f"nodes={nn & {node_a, node_b}}")

    # Nodos elegibles de tplA (anclada a A) bajo estructura B ⇒ vacío.
    s, ab = call("GET", f"/log-entries/templates/{tpl_a}/nodes?structureId={b['id']}", dual)
    check("D8 nodos de tplA (ancla A) bajo structureId=B ⇒ vacío", s == 200 and len(node_ids(ab)) == 0, f"http={s} n={len(node_ids(ab))}")
    s, aa = call("GET", f"/log-entries/templates/{tpl_a}/nodes?structureId={a['id']}", dual)
    check("D9 nodos de tplA bajo structureId=A ⇒ nodo A", s == 200 and node_a in node_ids(aa), f"http={s}")

    # ── E) Frontera ABAC: usuario acotado SOLO a A ───────────────────────────
    # Sin pasar structureId, JAMÁS ve la plantilla anclada a B ni el nodo B.
    s, re = call("GET", "/log-entries/templates", solo)
    te = tpl_ids(re)
    check("E1 acotado a A (sin structureId) ⇒ ve tplA + tplG, NO tplB (ABAC)",
          s == 200 and tpl_a in te and tpl_g in te and tpl_b not in te, f"http={s} seen={te & {tpl_a, tpl_b, tpl_g}}")
    s, ge = call("GET", f"/log-entries/templates/{tpl_g}/nodes", solo)
    ne = node_ids(ge)
    check("E2 acotado a A: nodos de tplG (sin structureId) ⇒ solo nodo A (ABAC)",
          s == 200 and node_a in ne and node_b not in ne, f"http={s} nodes={ne & {node_a, node_b}}")

    return finish()


def cleanup():
    for tid in CREATED_TEMPLATES:
        sql(f"DELETE FROM \"Template\" WHERE id='{tid}';")
    for uid in (DUAL_USER, SOLO_USER):
        sql(f"DELETE FROM \"Scope\" WHERE \"userId\"='{uid}';")
        sql(f"DELETE FROM \"UserRole\" WHERE \"userId\"='{uid}';")
        sql(f"DELETE FROM \"User\" WHERE id='{uid}';")
    sql(f"DELETE FROM \"RolePermission\" WHERE \"roleId\"='{DUAL_ROLE}';")
    sql(f"DELETE FROM \"Role\" WHERE id='{DUAL_ROLE}';")
    # La cascada de OrgStructure limpia niveles/nodos/calendarios.
    for sid in CREATED_STRUCTURES:
        sql(f"DELETE FROM \"OrgStructure\" WHERE id='{sid}';")
    sql("DELETE FROM \"OrgStructure\" WHERE key LIKE 'smoke-crea-%';")
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
