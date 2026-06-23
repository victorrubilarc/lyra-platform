#!/usr/bin/env python3
"""Smoke del SELECTOR DE NODOS ACOTADO POR ABAC — 2026-06-23.

Verifica el fix del BUG: el selector de nodos (crear incidencia/bitácora/handover)
mostraba TODOS los nodos a un usuario con alcance acotado. El arreglo es un camino
"scoped" aparte: GET /structure/accessible-nodes filtra con ScopeService, mientras
que GET /structure/nodes (administración) sigue mostrando todo.

 A) Admin (sin scope) ⇒ /structure/accessible-nodes == /structure/nodes (todo el árbol).
 B) Usuario temporal con Scope a UN subárbol (includeDescendants).
 C) Ese usuario, vía /structure/accessible-nodes, ve SOLO su subárbol:
    - cuenta == tamaño del subárbol;
    - incluye el nodo scopeado;
    - NO incluye su nodo padre (ancestro fuera de alcance);
    - todos los ids caen dentro del subárbol;
    - cuenta < árbol completo (prueba que filtra).

Crea y LIMPIA por ID (psql). API :3000. Clave demo Demo!Pass2026.
"""
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

TMP_USER = "smoke-scoped-node-user"
TMP_USER_EMAIL = "smoke-scoped-node@watchlog.local"
TMP_SCOPE = "smoke-scoped-node-scope"


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
    return r["accessToken"] if isinstance(r, dict) and r.get("accessToken") else None


def sql(q):
    return subprocess.run(PG + ["-c", q], capture_output=True, text=True).stdout.strip()


def check(name, cond, detail=""):
    (OK if cond else FAIL).append(name)
    print(("  ok  " if cond else "FAIL ") + name + (f"   [{detail}]" if detail else ""))


def flatten_ids(tree):
    ids = []
    for n in tree or []:
        ids.append(n["id"])
        ids.extend(flatten_ids(n.get("children")))
    return ids


def cleanup():
    sql(f"DELETE FROM \"Scope\" WHERE id='{TMP_SCOPE}';")
    sql(f"DELETE FROM \"Scope\" WHERE \"userId\"='{TMP_USER}';")
    sql(f"DELETE FROM \"User\" WHERE id='{TMP_USER}';")


def main():
    admin = login(ADMIN)
    check("contexto: login admin", bool(admin))
    if not admin:
        return finish()

    # ── A) Admin sin restricción: accessible-nodes == árbol completo ─────────
    s_full, full = call("GET", "/structure/nodes", admin)
    s_acc, acc = call("GET", "/structure/accessible-nodes", admin)
    check("A1 admin /structure/nodes 200", s_full == 200 and isinstance(full, list), f"http={s_full}")
    check("A2 admin /structure/accessible-nodes 200", s_acc == 200 and isinstance(acc, list), f"http={s_acc}")
    full_ids = set(flatten_ids(full))
    admin_acc_ids = set(flatten_ids(acc))
    check("A3 admin (sin scope) ve TODO el árbol en accessible-nodes",
          len(full_ids) > 0 and admin_acc_ids == full_ids,
          f"full={len(full_ids)} acc={len(admin_acc_ids)}")

    # ── B) Elegir un nodo intermedio (con padre y con hijos) y crear el user ─
    row = sql(
        "SELECT n.id, n.path, n.\"structureId\" FROM \"OrgNode\" n "
        "WHERE n.\"deletedAt\" IS NULL AND n.\"parentId\" IS NOT NULL "
        "AND EXISTS (SELECT 1 FROM \"OrgNode\" c WHERE c.\"parentId\"=n.id AND c.\"deletedAt\" IS NULL) "
        "ORDER BY length(n.path) ASC LIMIT 1;"
    )
    if not row or "|" not in row:
        check("B0 hay un nodo intermedio (con padre e hijos) para scopear", False,
              "no se encontró; ¿seed de estructura corrido?")
        return finish()
    node_id, node_path, sid = row.split("|")
    parent_id = sql(f"SELECT \"parentId\" FROM \"OrgNode\" WHERE id='{node_id}';")
    subtree_ids = {x for x in sql(
        f"SELECT id FROM \"OrgNode\" WHERE \"deletedAt\" IS NULL AND path LIKE '{node_path}%';"
    ).splitlines() if x}
    structure_count = int(sql(
        f"SELECT count(*) FROM \"OrgNode\" WHERE \"deletedAt\" IS NULL AND \"structureId\"='{sid}';"
    ) or "0")
    check("B1 contexto: subárbol y árbol de la estructura resueltos",
          len(subtree_ids) >= 1 and bool(parent_id) and structure_count > len(subtree_ids),
          f"subtree={len(subtree_ids)} structure={structure_count} parent={parent_id}")

    cleanup()
    # Usuario temporal: copia el passwordHash del admin DENTRO de SQL (no por shell)
    # para que el login con la clave demo funcione. Scope directo al nodo (sin rol:
    # accessible-nodes no exige permiso, solo autenticación).
    sql(
        "INSERT INTO \"User\" (id,email,\"displayName\",\"passwordHash\",status,\"updatedAt\") "
        f"SELECT '{TMP_USER}','{TMP_USER_EMAIL}',u.\"displayName\",u.\"passwordHash\",'ACTIVE',now() "
        f"FROM \"User\" u WHERE u.email='{ADMIN}';"
    )
    sql(
        "INSERT INTO \"Scope\" (id,\"userId\",\"orgNodeId\",\"includeDescendants\") "
        f"VALUES ('{TMP_SCOPE}','{TMP_USER}','{node_id}',true);"
    )

    # ── C) El usuario scoped ve SOLO su subárbol ─────────────────────────────
    scoped = login(TMP_USER_EMAIL)
    check("C0 login del usuario scoped", bool(scoped))
    if scoped:
        s, tree = call("GET", f"/structure/accessible-nodes?structureId={sid}", scoped)
        ids = set(flatten_ids(tree))
        check("C1 accessible-nodes 200 para el scoped (sin orgnode:read)", s == 200 and isinstance(tree, list), f"http={s}")
        check("C2 cuenta == tamaño del subárbol", len(ids) == len(subtree_ids), f"got={len(ids)} want={len(subtree_ids)}")
        check("C3 incluye el nodo scopeado", node_id in ids, node_id)
        check("C4 NO incluye el nodo padre (ancestro fuera de alcance)", parent_id not in ids, f"parent={parent_id}")
        check("C5 todos los ids caen dentro del subárbol", ids.issubset(subtree_ids),
              f"fuera={list(ids - subtree_ids)[:3]}")
        check("C6 cuenta < árbol completo de la estructura (prueba que FILTRA)",
              len(ids) < structure_count, f"scoped={len(ids)} structure={structure_count}")

    cleanup()
    finish()


def finish():
    print(f"\nResultado: {len(OK)} OK, {len(FAIL)} FAIL")
    if FAIL:
        print("FALLARON:")
        for f in FAIL:
            print("  - " + f)
        sys.exit(1)
    print("Todos los checks en verde ✅")


if __name__ == "__main__":
    main()
