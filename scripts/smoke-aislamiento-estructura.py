#!/usr/bin/env python3
"""Smoke de AISLAMIENTO por ESTRUCTURA organizacional (L1) — 2026-06-24.

Verifica que ningún usuario/estructura vea datos OPERACIONALES de otra, en NINGÚN
listado. Caso guía: dos departamentos (estructura A y B) sin fugas entre ellos.

Siembra datos REALES en A y B (incidencias, bitácoras, equipos) y barre TODOS los
listados con dos miradas:

 A) Usuario ACOTADO al nodo de la estructura A (ABAC):
    - ve SOLO datos de A en incidencias/bitácoras/equipos (no los de B).
    - con `?structureId=B` (estructura ajena) ⇒ intersección VACÍA ⇒ listas vacías.
    - L1a: búsqueda de equipos acotada (no ve equipos de B); listByNode(B) ⇒ 403.
    - exceptions/schedules/my-rounds/shift-handover responden 200 sin datos de B.
 B) ADMIN sin alcance cambiando la ESTRUCTURA ACTIVA (`?structureId=`):
    - structureId=A ⇒ solo A; structureId=B ⇒ solo B; sin param ⇒ ambos.
    - dashboard de incidencias respeta la estructura activa (byNode).
    - búsqueda de equipos respeta la estructura activa.

Crea y LIMPIA por ID (psql cascade) + usuario/rol/scope temporales. API :3000.
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

TOKEN = "AISLZZ" + os.urandom(2).hex().upper()  # token de búsqueda compartido por los equipos
TMP_USER = "smoke-aisl-user"
TMP_USER_EMAIL = "smoke-aisl@watchlog.local"
TMP_ROLE = "smoke-aisl-role"
CREATED_STRUCTURES = []
CREATED_INCIDENTS = []
CREATED_ENTRIES = []
CREATED_EQUIPMENT = []
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


def ids_of(resp):
    """Extrae el set de ids de una respuesta de lista (items[] o array crudo)."""
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


def make_equipment(node_id, label):
    s, eq = call("POST", "/structure/equipment", ADMIN_TOK, {"name": f"{TOKEN} {label}", "tag": f"{TOKEN}-{label}", "orgNodeId": node_id})
    if isinstance(eq, dict) and eq.get("id"):
        CREATED_EQUIPMENT.append(eq["id"])
        return eq["id"]
    return None


def make_incident(type_id, node_id, title):
    s, inc = call("POST", "/incidents", ADMIN_TOK, {"title": title, "typeId": type_id, "severity": 3, "orgNodeId": node_id})
    if isinstance(inc, dict) and inc.get("id"):
        CREATED_INCIDENTS.append(inc["id"])
        return inc["id"]
    return None


def make_template_and_entry(node_a, node_b):
    """Plantilla PUBLICADA asignada a A y B + una entrada en cada nodo."""
    s, tpl = call("POST", "/templates", ADMIN_TOK, {
        "name": f"SMOKE AISL {TOKEN}",
        "nodeAssignments": [{"orgNodeId": node_a, "includeDescendants": False},
                            {"orgNodeId": node_b, "includeDescendants": False}],
    })
    if not (isinstance(tpl, dict) and tpl.get("id")):
        return None, None
    tpl_id = tpl["id"]
    CREATED_TEMPLATES.append(tpl_id)
    call("PUT", f"/templates/{tpl_id}/draft", ADMIN_TOK, {
        "sections": [{"key": "s1", "title": "Operación", "fields": [{"key": "obs", "type": "TEXT", "label": "Observación"}]}],
    })
    call("POST", f"/templates/{tpl_id}/publish", ADMIN_TOK, {})
    ea = eb = None
    s, entry_a = call("POST", "/log-entries", ADMIN_TOK, {"templateId": tpl_id, "orgNodeId": node_a})
    if isinstance(entry_a, dict) and entry_a.get("id"):
        ea = entry_a["id"]; CREATED_ENTRIES.append(ea)
    s, entry_b = call("POST", "/log-entries", ADMIN_TOK, {"templateId": tpl_id, "orgNodeId": node_b})
    if isinstance(entry_b, dict) and entry_b.get("id"):
        eb = entry_b["id"]; CREATED_ENTRIES.append(eb)
    return ea, eb


def setup_scoped_user(node_a):
    """Usuario temporal acotado SOLO al nodo de la estructura A, con los permisos de
    LECTURA de todos los módulos operacionales. Copia el passwordHash de operador
    DENTRO de SQL para que el login con la clave demo funcione."""
    cleanup_user()
    sql("INSERT INTO \"User\" (id,email,\"displayName\",\"passwordHash\",status,\"updatedAt\") "
        f"SELECT '{TMP_USER}','{TMP_USER_EMAIL}',u.\"displayName\",u.\"passwordHash\",'ACTIVE',now() "
        "FROM \"User\" u WHERE u.email='operador@watchlog.local';")
    sql(f"INSERT INTO \"Role\" (id,key,name,\"updatedAt\") VALUES ('{TMP_ROLE}','{TMP_ROLE}','Smoke Aislamiento',now());")
    sql("INSERT INTO \"RolePermission\" (\"roleId\",\"permissionId\") "
        f"SELECT '{TMP_ROLE}', id FROM \"Permission\" WHERE key IN "
        "('incident:view','logentry:view','module:incidents:view','schedule:view','round:execute','shifthandover:view','equipment:view');")
    sql(f"INSERT INTO \"UserRole\" (\"userId\",\"roleId\",\"assignedAt\") VALUES ('{TMP_USER}','{TMP_ROLE}',now());")
    sql("INSERT INTO \"Scope\" (id,\"userId\",\"orgNodeId\",\"includeDescendants\") "
        f"VALUES ('smoke-aisl-scope','{TMP_USER}','{node_a}',true);")


def main():
    global ADMIN_TOK
    ADMIN_TOK = login(ADMIN)
    check("contexto: login admin", bool(ADMIN_TOK))
    if not ADMIN_TOK:
        return finish()

    a = make_structure("smoke-aisl-a", "Smoke Aislamiento A", "Área", "Nodo A")
    b = make_structure("smoke-aisl-b", "Smoke Aislamiento B", "Área", "Nodo B")
    check("setup: estructuras A y B con nodo", bool(a and b and a["node"] and b["node"]), f"A={a} B={b}")
    if not (a and b):
        return finish()
    node_a, node_b = a["node"], b["node"]

    s, types = call("GET", "/incidents/types", ADMIN_TOK)
    type_id = next((t["id"] for t in (types or []) if t.get("active")), None) if isinstance(types, list) else None
    check("setup: tipo de incidencia compartido", bool(type_id), str(type_id))

    eq_a = make_equipment(node_a, "EQA")
    eq_b = make_equipment(node_b, "EQB")
    inc_a = make_incident(type_id, node_a, "Smoke aisl A")
    inc_b = make_incident(type_id, node_b, "Smoke aisl B")
    entry_a, entry_b = make_template_and_entry(node_a, node_b)
    check("setup: equipos A/B", bool(eq_a and eq_b), f"A={eq_a} B={eq_b}")
    check("setup: incidencias A/B", bool(inc_a and inc_b), f"A={inc_a} B={inc_b}")
    check("setup: bitácoras A/B", bool(entry_a and entry_b), f"A={entry_a} B={entry_b}")

    setup_scoped_user(node_a)
    scoped = login(TMP_USER_EMAIL)
    check("setup: login usuario acotado a A", bool(scoped))

    # ── A) Usuario ACOTADO a la estructura A ─────────────────────────────────
    if scoped:
        # Incidencias
        s, r = call("GET", "/incidents", scoped)
        seen = ids_of(r)
        check("A1 incidencias: ve A, NO ve B (ABAC)", s == 200 and inc_a in seen and inc_b not in seen, f"http={s} seen={seen}")
        # Bitácoras
        s, r = call("GET", "/log-entries", scoped)
        seen = ids_of(r)
        check("A2 bitácoras: ve A, NO ve B (ABAC)", s == 200 and entry_a in seen and entry_b not in seen, f"http={s} seen={seen}")
        # Equipos (L1a): búsqueda acotada
        s, r = call("GET", f"/structure/equipment?search={TOKEN}", scoped)
        seen = ids_of(r)
        check("A3 equipos búsqueda: ve A, NO ve B (L1a ABAC)", s == 200 and eq_a in seen and eq_b not in seen, f"http={s} seen={seen}")
        # Equipos (L1a): listByNode de nodo ajeno ⇒ 403
        s, _ = call("GET", f"/structure/equipment?orgNodeId={node_b}", scoped)
        check("A4 equipos listByNode(B): 403 (L1a)", s == 403, f"http={s}")
        s, r = call("GET", f"/structure/equipment?orgNodeId={node_a}", scoped)
        check("A5 equipos listByNode(A): 200 con EQ-A", s == 200 and eq_a in ids_of(r), f"http={s}")
        # Resto de listados operacionales: responden 200 sin filtrarse (no B)
        for label, path in [("excepciones", "/exceptions"), ("rondas", "/schedules"),
                            ("ocurrencias", "/schedules/occurrences"), ("mis-rondas", "/schedules/my-rounds"),
                            ("cambio-turno", "/shift-handover?page=1&pageSize=25")]:
            s, _ = call("GET", path, scoped)
            check(f"A6 {label}: responde 200 para el acotado", s == 200, f"http={s}")

        # ── B) Usuario ACOTADO a A con estructura ACTIVA = B (ajena) ⇒ vacío ──
        s, r = call("GET", f"/incidents?structureId={b['id']}", scoped)
        check("B1 incidencias ?structureId=B (ajena) ⇒ vacío", s == 200 and len(ids_of(r)) == 0, f"http={s} n={len(ids_of(r))}")
        s, r = call("GET", f"/log-entries?structureId={b['id']}", scoped)
        check("B2 bitácoras ?structureId=B (ajena) ⇒ vacío", s == 200 and len(ids_of(r)) == 0, f"http={s} n={len(ids_of(r))}")
        s, r = call("GET", f"/structure/equipment?search={TOKEN}&structureId={b['id']}", scoped)
        check("B3 equipos ?structureId=B (ajena) ⇒ vacío", s == 200 and len(ids_of(r)) == 0, f"http={s} n={len(ids_of(r))}")
        # Estructura activa = A (propia) ⇒ sigue viendo lo de A
        s, r = call("GET", f"/incidents?structureId={a['id']}", scoped)
        check("B4 incidencias ?structureId=A (propia) ⇒ ve A", s == 200 and inc_a in ids_of(r), f"http={s}")

    # ── C) ADMIN cambiando la ESTRUCTURA ACTIVA ──────────────────────────────
    # Incidencias
    s, ra = call("GET", f"/incidents?structureId={a['id']}", ADMIN_TOK)
    s, rb = call("GET", f"/incidents?structureId={b['id']}", ADMIN_TOK)
    s, rn = call("GET", "/incidents", ADMIN_TOK)
    ia, ib, inn = ids_of(ra), ids_of(rb), ids_of(rn)
    check("C1 admin incidencias structureId=A ⇒ solo A", inc_a in ia and inc_b not in ia, f"A={ia & {inc_a, inc_b}}")
    check("C2 admin incidencias structureId=B ⇒ solo B", inc_b in ib and inc_a not in ib, f"B={ib & {inc_a, inc_b}}")
    check("C3 admin incidencias sin estructura ⇒ ambas", inc_a in inn and inc_b in inn, "")
    # Bitácoras
    s, ra = call("GET", f"/log-entries?structureId={a['id']}", ADMIN_TOK)
    s, rb = call("GET", f"/log-entries?structureId={b['id']}", ADMIN_TOK)
    ea_set, eb_set = ids_of(ra), ids_of(rb)
    check("C4 admin bitácoras structureId=A ⇒ solo A", entry_a in ea_set and entry_b not in ea_set, "")
    check("C5 admin bitácoras structureId=B ⇒ solo B", entry_b in eb_set and entry_a not in eb_set, "")
    # Equipos
    s, ra = call("GET", f"/structure/equipment?search={TOKEN}&structureId={a['id']}", ADMIN_TOK)
    s, rb = call("GET", f"/structure/equipment?search={TOKEN}&structureId={b['id']}", ADMIN_TOK)
    qa, qb = ids_of(ra), ids_of(rb)
    check("C6 admin equipos structureId=A ⇒ solo EQ-A", eq_a in qa and eq_b not in qa, f"A={qa}")
    check("C7 admin equipos structureId=B ⇒ solo EQ-B", eq_b in qb and eq_a not in qb, f"B={qb}")
    # Dashboard de incidencias
    s, da = call("GET", f"/incidents/dashboard?structureId={a['id']}", ADMIN_TOK)
    s, db = call("GET", f"/incidents/dashboard?structureId={b['id']}", ADMIN_TOK)
    def node_in_dash(d, node):
        return any(x.get("key") == node and x.get("count", 0) > 0 for x in (d.get("byNode", []) if isinstance(d, dict) else []))
    check("C8 dashboard structureId=A ⇒ byNode tiene A, no B",
          node_in_dash(da, node_a) and not node_in_dash(da, node_b), "")
    check("C9 dashboard structureId=B ⇒ byNode tiene B, no A",
          node_in_dash(db, node_b) and not node_in_dash(db, node_a), "")
    # Listados restantes aceptan structureId (200)
    for label, path in [("excepciones", f"/exceptions?structureId={a['id']}"),
                        ("rondas", f"/schedules?structureId={a['id']}"),
                        ("cambio-turno", f"/shift-handover?page=1&pageSize=25&structureId={a['id']}")]:
        s, _ = call("GET", path, ADMIN_TOK)
        check(f"C10 admin {label} acepta structureId ⇒ 200", s == 200, f"http={s}")

    return finish()


def cleanup_user():
    sql(f"DELETE FROM \"Scope\" WHERE \"userId\"='{TMP_USER}';")
    sql(f"DELETE FROM \"UserRole\" WHERE \"userId\"='{TMP_USER}';")
    sql(f"DELETE FROM \"RolePermission\" WHERE \"roleId\"='{TMP_ROLE}';")
    sql(f"DELETE FROM \"Role\" WHERE id='{TMP_ROLE}';")
    sql(f"DELETE FROM \"User\" WHERE id='{TMP_USER}';")


def cleanup():
    for iid in CREATED_INCIDENTS:
        sql(f"DELETE FROM \"Incident\" WHERE id='{iid}';")
    for eid in CREATED_ENTRIES:
        sql(f"DELETE FROM \"LogEntry\" WHERE id='{eid}';")
    for tid in CREATED_TEMPLATES:
        sql(f"DELETE FROM \"Template\" WHERE id='{tid}';")
    for eq in CREATED_EQUIPMENT:
        sql(f"DELETE FROM \"Equipment\" WHERE id='{eq}';")
    cleanup_user()
    # La cascada de OrgStructure limpia niveles/nodos/calendarios.
    for sid in CREATED_STRUCTURES:
        sql(f"DELETE FROM \"OrgStructure\" WHERE id='{sid}';")
    sql("DELETE FROM \"OrgStructure\" WHERE key LIKE 'smoke-aisl-%';")
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
