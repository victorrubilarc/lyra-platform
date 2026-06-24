#!/usr/bin/env python3
"""Smoke de ADMINISTRACIÓN DELEGADA por estructura (L2b) + red anti-lockout — 2026-06-24.

Verifica que un administrador NO sea "dios de toda la instalación", sino que pueda
administrar SOLO la(s) estructura(s) que se le delega(n), mientras el super-admin
(permiso `module:structure:manage`) sigue administrándolo todo. Además, la red
anti-lockout: nunca se puede dejar la instalación sin quién administre todo.

Modelo: tabla `StructureAdmin(structureId, roleId?/userId?)`. El alcance de
administración = UNIÓN de las delegaciones propias del usuario + las de sus roles,
evaluada EN VIVO. La autorización contextual (permiso ∧ estructura delegada, o
super-admin) se decide en el BACKEND, en cada mutación de structure/levels/nodes.

Ejes probados:
 T1  Super-admin (demo) crea estructuras A/B/C (setup, 200).
 T2  Delegado con orgnode:create pero SIN delegación ⇒ 403 al crear nodo en A.
 T3  PUT /security/users/{id}/admin-structures persiste y GET lo devuelve.
 T4  Con A delegada: crear nodo en A ⇒ 200.
 T5  Con A delegada: renombrar estructura A ⇒ 200 y crear nivel en A ⇒ 200.
 T6  Estructura B NO delegada: crear nodo en B ⇒ 403.
 T7  Estructura B NO delegada: renombrar B ⇒ 403; eliminar nodo de B ⇒ 403.
 T8  LEER el árbol de B (GET /structure/nodes?structureId=B) ⇒ 200 (lectura por ABAC,
     no por delegación; L2b restringe MUTAR, no leer — paridad by-id con L1/L2c).
 T9  Actos GLOBALES = super-admin only: crear estructura ⇒ 403, reordenar ⇒ 403,
     eliminar estructura ⇒ 403.
 T10 DEUDA (b) CERRADA: delegar C (estructura SIN nodos) ⇒ el delegado la ve en el
     selector (canAdminister=true) y puede crear su PRIMER nodo (200), aunque no
     tenga ningún nodo accesible en ella.
 T11 Quitar la delegación re-acota EN VIVO: crear nodo en A ⇒ 403.
 T12 Delegación por ROL (unión): delegar A al rol ⇒ el miembro crea nodo en A (200);
     quitar la delegación del rol ⇒ 403.
 L-A Candado A: el rol de sistema no puede modificar sus permisos (403), pero el
     guardado idempotente (mismo set) pasa (200).
 L-N Control negativo B/C: con ≥2 admins, quitar el rol / deshabilitar a un admin
     NO-último ⇒ 200 (la red no produce falsos positivos).
 L-B Candado B: quitar el rol al ÚLTIMO admin activo ⇒ 400.
 L-C Candado C: deshabilitar al ÚLTIMO admin activo ⇒ 400.

Limpia por ID (cascada de OrgStructure) + usuarios/roles temporales. API :3000.
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

# Sujetos temporales.
DELE_USER = "smoke-dad-dele"
DELE_EMAIL = "smoke-dad-dele@watchlog.local"
DELE_ROLE = "smoke-dad-delerole"
ADMIN_X = "smoke-dad-admin-x"          # admin temporal que quedará como ÚLTIMO activo
ADMIN_X_EMAIL = "smoke-dad-admin-x@watchlog.local"
ADMIN_Y = "smoke-dad-admin-y"          # admin temporal para el control negativo
ADMIN_Y_EMAIL = "smoke-dad-admin-y@watchlog.local"
CREATED_STRUCTURES = []
DISABLED_ADMINS = []                    # ids reactivados en la limpieza (seguridad)


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


def make_structure(key, name, with_node=True):
    """Crea una estructura como super-admin. Devuelve {id, level, node?}."""
    s, st = call("POST", "/structure/structures", ADMIN_TOK, {"key": key, "name": name})
    if not (isinstance(st, dict) and st.get("id")):
        return None
    CREATED_STRUCTURES.append(st["id"])
    s, lv = call("POST", "/structure/levels", ADMIN_TOK, {"structureId": st["id"], "name": "Área", "order": 0})
    out = {"id": st["id"], "level": lv.get("id") if isinstance(lv, dict) else None}
    if with_node:
        s, node = call("POST", "/structure/nodes", ADMIN_TOK,
                       {"structureId": st["id"], "name": "Nodo " + name, "levelId": out["level"]})
        out["node"] = node.get("id") if isinstance(node, dict) else None
    return out


def insert_user(uid, email):
    """Usuario temporal con la clave demo (copia el passwordHash de operador)."""
    sql("INSERT INTO \"User\" (id,email,\"displayName\",\"passwordHash\",status,\"updatedAt\") "
        f"SELECT '{uid}','{email}',u.\"displayName\",u.\"passwordHash\",'ACTIVE',now() "
        "FROM \"User\" u WHERE u.email='operador@watchlog.local';")


def grant_system_role(uid):
    """Asigna el rol de SISTEMA (Administrador) al usuario ⇒ super-admin de facto."""
    sql(f"INSERT INTO \"UserRole\" (\"userId\",\"roleId\",\"assignedAt\") "
        f"SELECT '{uid}', id, now() FROM \"Role\" WHERE \"isSystem\" AND key='admin';")


def admin_role_id():
    return sql("SELECT id FROM \"Role\" WHERE \"isSystem\" AND key='admin' LIMIT 1;").strip()


def main():
    global ADMIN_TOK
    ADMIN_TOK = login(ADMIN)
    check("contexto: login super-admin (demo)", bool(ADMIN_TOK))
    if not ADMIN_TOK:
        return finish()

    cleanup()  # estado limpio de corridas previas

    # ── Setup: estructuras A/B (con nodo) y C (SIN nodos, para la deuda b) ──
    a = make_structure("smoke-dad-a", "DAD A")
    b = make_structure("smoke-dad-b", "DAD B")
    c = make_structure("smoke-dad-c", "DAD C", with_node=False)
    check("T1 super-admin crea A/B/C", bool(a and b and c and a.get("node") and b.get("node")),
          f"A={a} B={b} C={c}")
    if not (a and b and c):
        return finish()

    # ── Delegado: rol con permisos de estructura PERO sin module:structure:manage ──
    sql(f"INSERT INTO \"Role\" (id,key,name,\"updatedAt\") VALUES ('{DELE_ROLE}','{DELE_ROLE}','Smoke DAD Delegado',now());")
    sql("INSERT INTO \"RolePermission\" (\"roleId\",\"permissionId\") "
        f"SELECT '{DELE_ROLE}', id FROM \"Permission\" WHERE key IN "
        "('orglevel:manage','orgnode:read','orgnode:create','orgnode:edit','orgnode:delete','module:structure:view');")
    insert_user(DELE_USER, DELE_EMAIL)
    sql(f"INSERT INTO \"UserRole\" (\"userId\",\"roleId\",\"assignedAt\") VALUES ('{DELE_USER}','{DELE_ROLE}',now());")
    dele = login(DELE_EMAIL)
    check("setup: login delegado (sin super-admin)", bool(dele))
    if not dele:
        return finish()

    # ── T2 sin delegación: tiene orgnode:create pero NO administra ninguna estructura ──
    s, _ = call("POST", "/structure/nodes", dele, {"structureId": a["id"], "name": "X", "levelId": a["level"]})
    check("T2 delegado SIN delegación ⇒ 403 al crear nodo en A", s == 403, f"http={s}")

    # ── T3 delegar A al usuario; GET lo refleja ──
    s, ud = call("PUT", f"/security/users/{DELE_USER}/admin-structures", ADMIN_TOK, {"structureIds": [a["id"]]})
    has_a = isinstance(ud, dict) and a["id"] in (ud.get("adminStructureIds") or [])
    check("T3a PUT admin-structures(A) ⇒ 200 y lo devuelve", s == 200 and has_a, f"http={s}")
    s, ug = call("GET", f"/security/users/{DELE_USER}", ADMIN_TOK)
    check("T3b GET usuario devuelve adminStructureIds=[A]", s == 200 and isinstance(ug, dict)
          and ug.get("adminStructureIds") == [a["id"]], f"http={s} ids={ug.get('adminStructureIds') if isinstance(ug, dict) else ug}")

    # ── T4 con A delegada: crear nodo en A ⇒ 200 ──
    s, n = call("POST", "/structure/nodes", dele, {"structureId": a["id"], "name": "Hijo A", "levelId": a["level"]})
    node_a2 = n.get("id") if isinstance(n, dict) else None
    check("T4 delegado de A ⇒ crea nodo en A (200)", s == 201 or s == 200, f"http={s}")

    # ── T5 renombrar estructura A + crear nivel en A ⇒ 200 ──
    s, _ = call("PATCH", f"/structure/structures/{a['id']}", dele, {"name": "DAD A (editada)"})
    check("T5a delegado de A ⇒ renombra A (200)", s == 200, f"http={s}")
    s, _ = call("POST", "/structure/levels", dele, {"structureId": a["id"], "name": "Sub-área", "order": 1})
    check("T5b delegado de A ⇒ crea nivel en A (200/201)", s in (200, 201), f"http={s}")

    # ── T6/T7 estructura B NO delegada: mutaciones ⇒ 403 ──
    s, _ = call("POST", "/structure/nodes", dele, {"structureId": b["id"], "name": "Y", "levelId": b["level"]})
    check("T6 delegado ⇒ crear nodo en B (no delegada) ⇒ 403", s == 403, f"http={s}")
    s, _ = call("PATCH", f"/structure/structures/{b['id']}", dele, {"name": "no"})
    check("T7a delegado ⇒ renombrar B ⇒ 403", s == 403, f"http={s}")
    s, _ = call("DELETE", f"/structure/nodes/{b['node']}", dele)
    check("T7b delegado ⇒ eliminar nodo de B ⇒ 403", s == 403, f"http={s}")

    # ── T8 LEER el árbol de B sigue permitido (lectura por ABAC, no por delegación) ──
    s, tree = call("GET", f"/structure/nodes?structureId={b['id']}", dele)
    check("T8 delegado ⇒ LEE el árbol de B (200, lectura por ABAC)", s == 200 and isinstance(tree, list), f"http={s}")

    # ── T9 actos GLOBALES = super-admin only ──
    s, _ = call("POST", "/structure/structures", dele, {"key": "smoke-dad-nope", "name": "Nope"})
    check("T9a delegado ⇒ crear estructura nueva ⇒ 403", s == 403, f"http={s}")
    s, _ = call("PUT", "/structure/structures/reorder", dele, {"ids": [a["id"], b["id"]]})
    check("T9b delegado ⇒ reordenar estructuras ⇒ 403", s == 403, f"http={s}")
    s, _ = call("DELETE", f"/structure/structures/{a['id']}", dele)
    check("T9c delegado ⇒ eliminar estructura ⇒ 403", s == 403, f"http={s}")

    # ── T10 DEUDA (b) CERRADA: delegar C (sin nodos) ⇒ la ve y la arma ──
    call("PUT", f"/security/users/{DELE_USER}/admin-structures", ADMIN_TOK, {"structureIds": [a["id"], c["id"]]})
    s, lst = call("GET", "/structure/structures", dele)
    c_row = next((x for x in (lst or []) if isinstance(x, dict) and x.get("id") == c["id"]), None) if isinstance(lst, list) else None
    check("T10a deuda (b): el delegado VE la estructura C sin nodos (canAdminister)",
          bool(c_row) and c_row.get("canAdminister") is True, f"row={c_row}")
    s, n = call("POST", "/structure/nodes", dele, {"structureId": c["id"], "name": "Primer nodo C", "levelId": c["level"]})
    check("T10b deuda (b): el delegado crea el PRIMER nodo de C (200/201)", s in (200, 201), f"http={s}")

    # ── T11 quitar la delegación re-acota EN VIVO ──
    call("PUT", f"/security/users/{DELE_USER}/admin-structures", ADMIN_TOK, {"structureIds": []})
    s, _ = call("POST", "/structure/nodes", dele, {"structureId": a["id"], "name": "Z", "levelId": a["level"]})
    check("T11 quitar delegación ⇒ crear nodo en A ⇒ 403 (re-acota en vivo)", s == 403, f"http={s}")

    # ── T12 delegación por ROL (unión user+rol) ──
    s, _ = call("PUT", f"/security/roles/{DELE_ROLE}/admin-structures", ADMIN_TOK, {"structureIds": [a["id"]]})
    check("T12a PUT admin-structures del ROL ⇒ 200", s == 200, f"http={s}")
    s, n = call("POST", "/structure/nodes", dele, {"structureId": a["id"], "name": "Por rol", "levelId": a["level"]})
    check("T12b miembro del rol delegado ⇒ crea nodo en A (200/201)", s in (200, 201), f"http={s}")
    call("PUT", f"/security/roles/{DELE_ROLE}/admin-structures", ADMIN_TOK, {"structureIds": []})
    s, _ = call("POST", "/structure/nodes", dele, {"structureId": a["id"], "name": "ya no", "levelId": a["level"]})
    check("T12c quitar delegación del rol ⇒ 403 (re-acota en vivo)", s == 403, f"http={s}")

    # ════════════════ Red anti-lockout ════════════════
    arid = admin_role_id()
    check("setup anti-lockout: id del rol de sistema", bool(arid), arid)
    s, role = call("GET", f"/security/roles/{arid}", ADMIN_TOK)
    perms_now = role.get("permissionKeys", []) if isinstance(role, dict) else []

    # ── L-A candado A: el rol de sistema no puede modificar sus permisos ──
    reduced = [p for p in perms_now if p != "audit:read"]  # quita uno cualquiera
    s, _ = call("PATCH", f"/security/roles/{arid}", ADMIN_TOK, {"permissionKeys": reduced})
    check("L-A candado A: reducir permisos del rol de sistema ⇒ 403", s == 403, f"http={s}")
    s, _ = call("PATCH", f"/security/roles/{arid}", ADMIN_TOK, {"permissionKeys": perms_now})
    check("L-A' candado A: guardar el MISMO set (idempotente) ⇒ 200", s == 200, f"http={s}")

    # ── L-N control negativo: con ≥2 admins, deshabilitar un admin NO-último ⇒ 200 ──
    insert_user(ADMIN_Y, ADMIN_Y_EMAIL)
    grant_system_role(ADMIN_Y)
    s, _ = call("PATCH", f"/security/users/{ADMIN_Y}", ADMIN_TOK, {"status": "DISABLED"})
    check("L-N control negativo: deshabilitar admin NO-último ⇒ 200 (sin falso positivo)", s == 200, f"http={s}")

    # ── L-B / L-C positivos: dejar a X como ÚLTIMO admin activo y probar los candados ──
    insert_user(ADMIN_X, ADMIN_X_EMAIL)
    grant_system_role(ADMIN_X)
    xtok = login(ADMIN_X_EMAIL)
    check("setup anti-lockout: login admin temporal X", bool(xtok))
    if xtok:
        # Deshabilita TODOS los demás admins activos ⇒ X queda como el único.
        others = sql("SELECT DISTINCT u.id FROM \"User\" u "
                     "JOIN \"UserRole\" ur ON ur.\"userId\"=u.id "
                     "JOIN \"Role\" r ON r.id=ur.\"roleId\" "
                     f"WHERE r.\"isSystem\" AND u.status='ACTIVE' AND u.id <> '{ADMIN_X}';")
        DISABLED_ADMINS.extend([x for x in others.splitlines() if x.strip()])
        if DISABLED_ADMINS:
            ids = ",".join(f"'{x}'" for x in DISABLED_ADMINS)
            sql(f"UPDATE \"User\" SET status='DISABLED' WHERE id IN ({ids});")
        # L-C: deshabilitar al ÚLTIMO admin activo ⇒ 400.
        s, _ = call("PATCH", f"/security/users/{ADMIN_X}", xtok, {"status": "DISABLED"})
        check("L-C candado C: deshabilitar al ÚLTIMO admin activo ⇒ 400", s == 400, f"http={s}")
        # L-B: quitarle el rol al ÚLTIMO admin activo ⇒ 400.
        s, _ = call("PUT", f"/security/users/{ADMIN_X}/roles", xtok, {"roleIds": []})
        check("L-B candado B: quitar el rol al ÚLTIMO admin activo ⇒ 400", s == 400, f"http={s}")
        # Restaura a los demás admins ANTES de seguir (también lo hace la limpieza).
        if DISABLED_ADMINS:
            ids = ",".join(f"'{x}'" for x in DISABLED_ADMINS)
            sql(f"UPDATE \"User\" SET status='ACTIVE' WHERE id IN ({ids});")
            DISABLED_ADMINS.clear()

    return finish()


def cleanup():
    # Seguridad: reactiva cualquier admin que el test haya dejado deshabilitado.
    if DISABLED_ADMINS:
        ids = ",".join(f"'{x}'" for x in DISABLED_ADMINS)
        sql(f"UPDATE \"User\" SET status='ACTIVE' WHERE id IN ({ids});")
        DISABLED_ADMINS.clear()
    for uid in (DELE_USER, ADMIN_X, ADMIN_Y):
        sql(f"DELETE FROM \"StructureAdmin\" WHERE \"userId\"='{uid}';")
        sql(f"DELETE FROM \"UserRole\" WHERE \"userId\"='{uid}';")
        sql(f"DELETE FROM \"User\" WHERE id='{uid}';")
    sql(f"DELETE FROM \"StructureAdmin\" WHERE \"roleId\"='{DELE_ROLE}';")
    sql(f"DELETE FROM \"RolePermission\" WHERE \"roleId\"='{DELE_ROLE}';")
    sql(f"DELETE FROM \"Role\" WHERE id='{DELE_ROLE}';")
    for sid in CREATED_STRUCTURES:
        sql(f"DELETE FROM \"OrgStructure\" WHERE id='{sid}';")
    sql("DELETE FROM \"OrgStructure\" WHERE key LIKE 'smoke-dad-%';")


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
