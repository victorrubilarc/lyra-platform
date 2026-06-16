#!/usr/bin/env python3
"""Smoke de "MIS RONDAS" — worklist del operador (Fase 2.3.1, 2026-06-16).

Verifica el SPLIT planificar/ejecutar y el SCOPING del worklist por ROL responsable:
 1) `round:execute` separado: start/skip ya NO exigen `schedule:manage` (admin las hace
    con round:execute heredado del rol admin); un usuario SIN round:execute ⇒ 403 en
    `/schedules/my-rounds`.
 2) Filtro de responsabilidad (lo NUEVO): con 3 horarios — responsable=mi rol /
    responsable=NULL (fallback) / responsable=OTRO rol — el worklist del admin trae los
    dos primeros y NO el tercero (no es su rol).
 3) Cruzado (cada quien ve lo suyo): tras conceder round:execute al rol del operador, su
    worklist trae el horario de SU rol + el de fallback, pero NO el del rol del admin.
 4) Toggles: overdueOnly deriva la vencida; my-rounds/stats trae pending/overdue/today.
 5) El endpoint del PLANIFICADOR (`/schedules` listado) sigue gateado por schedule:view
    (el operador con round:execute NO entra ahí): separación de permisos.

Crea y LIMPIA por ID (psql) y revoca el permiso concedido. API :3000. Clave Demo!Pass2026."""
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
OPERADOR = "operador@watchlog.local"
SUPERVISOR = "supervisor@watchlog.local"
PG = ["docker", "exec", "lyra-watchlog-dev-postgres-1", "psql", "-U", "watchlog", "-d", "watchlog", "-t", "-A"]
OK, FAIL = [], []


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
    return r["accessToken"]


def sql(q):
    return subprocess.run(PG + ["-c", q], capture_output=True, text=True).stdout.strip()


def flush_redis():
    subprocess.run(["docker", "exec", "lyra-watchlog-dev-redis-1", "redis-cli", "FLUSHALL"], capture_output=True, text=True)


def check(name, cond, detail=""):
    (OK if cond else FAIL).append(name)
    print(("  ok  " if cond else "FAIL ") + name + (f"   [{detail}]" if detail else ""))


def ids_of(occs):
    return {o["scheduleId"] for o in occs} if isinstance(occs, list) else set()


def main():
    admin = login(ADMIN)
    admin_role = sql("SELECT id FROM \"Role\" WHERE key='admin';")
    op_role = sql("SELECT id FROM \"Role\" WHERE key='op-molienda';")
    perm_id = sql("SELECT id FROM \"Permission\" WHERE key='round:execute';")
    check("existe permiso round:execute en catálogo", bool(perm_id), perm_id)
    check("roles admin/op-molienda resueltos", bool(admin_role and op_role), f"admin={admin_role} op={op_role}")

    sched_mine = sched_fallback = sched_other = None
    granted = False
    try:
        # Plantilla publicada + nodo elegible (mismo patrón que smoke-rondas).
        s, tpls = call("GET", "/log-entries/templates", admin)
        tpl_id = node_id = None
        for t in (tpls or []):
            s, el = call("GET", f"/log-entries/templates/{t['id']}/nodes", admin)
            if s == 200 and el.get("nodes") and el.get("equipmentMode") != "REQUIRED":
                tpl_id, node_id = t["id"], el["nodes"][0]["id"]
                break
        check("hay plantilla con nodo elegible", bool(tpl_id and node_id), f"tpl={tpl_id} node={node_id}")
        if not (tpl_id and node_id):
            return
        base = {"templateId": tpl_id, "orgNodeId": node_id, "dueWindowMinutes": 720, "horizonDays": 3,
                "recurrenceKind": "SHIFT", "recurrenceConfig": {}}

        # Validación: rol responsable inexistente ⇒ 400.
        s, _ = call("POST", "/schedules", admin, {**base, "responsibleRoleId": "rol-fantasma-xyz"})
        check("rol responsable inexistente ⇒ 400", s == 400, f"{s}")

        # 3 horarios con responsabilidad distinta.
        s, a = call("POST", "/schedules", admin, {**base, "name": "Smoke MIA", "responsibleRoleId": admin_role})
        sched_mine = a.get("id") if isinstance(a, dict) else None
        check("crear horario responsable=MI rol ⇒ 2xx + responsibleRoleName", s in (200, 201) and a.get("responsibleRoleName"), f"{s} {a.get('responsibleRoleName') if isinstance(a,dict) else a}")
        s, b = call("POST", "/schedules", admin, {**base, "name": "Smoke FALLBACK", "responsibleRoleId": None})
        sched_fallback = b.get("id") if isinstance(b, dict) else None
        check("crear horario SIN responsable (fallback) ⇒ 2xx", s in (200, 201) and b.get("responsibleRoleId") is None, f"{s}")
        s, c = call("POST", "/schedules", admin, {**base, "name": "Smoke OTRO", "responsibleRoleId": op_role})
        sched_other = c.get("id") if isinstance(c, dict) else None
        check("crear horario responsable=OTRO rol ⇒ 2xx", s in (200, 201), f"{s}")
        if not (sched_mine and sched_fallback and sched_other):
            return

        # (2) Worklist del ADMIN: ve MIA + FALLBACK, NO ve OTRO.
        s, mine = call("GET", "/schedules/my-rounds?includeUpcoming=true", admin)
        sids = ids_of(mine)
        check("worklist admin trae el horario de SU rol", s == 200 and sched_mine in sids, f"{s}")
        check("worklist admin trae el horario de fallback (sin responsable)", sched_fallback in sids)
        check("worklist admin NO trae el horario de OTRO rol", sched_other not in sids, f"otros={sched_other in sids}")

        # (4) Toggles + stats (admin).
        # Vence una ocurrencia de MIA → overdueOnly la trae.
        target = sql(f"SELECT id FROM \"RoundOccurrence\" WHERE \"scheduleId\"='{sched_mine}' AND status='PENDING' LIMIT 1;")
        if target:
            sql(f"UPDATE \"RoundOccurrence\" SET \"dueAt\" = now() - interval '2 hours' WHERE id='{target}';")
            s, over = call("GET", "/schedules/my-rounds?overdueOnly=true", admin)
            check("overdueOnly trae la vencida (overdue=true)", s == 200 and any(o["id"] == target and o["overdue"] for o in (over or [])), f"{s}")
        s, st = call("GET", "/schedules/my-rounds/stats", admin)
        check("my-rounds/stats trae pending/overdue/today", s == 200 and all(k in (st or {}) for k in ("pending", "overdue", "today")), f"{s} {st}")

        # (5) Separación de permisos: el listado del PLANIFICADOR sigue exigiendo schedule:view.
        # El operador (sin schedule:view) NO entra ahí aunque tenga round:execute luego.
        sup = login(SUPERVISOR)
        s, _ = call("GET", "/schedules/my-rounds", sup)
        check("usuario SIN round:execute ⇒ 403 en my-rounds", s == 403, f"{s}")

        # (3) Cruzado: conceder round:execute al rol del operador y verificar SU worklist.
        sql(f"INSERT INTO \"RolePermission\" (\"roleId\",\"permissionId\") VALUES ('{op_role}','{perm_id}') ON CONFLICT DO NOTHING;")
        granted = True
        flush_redis()
        op = login(OPERADOR)
        s, opw = call("GET", "/schedules/my-rounds?includeUpcoming=true", op)
        opsids = ids_of(opw)
        check("operador con round:execute entra a my-rounds ⇒ 200", s == 200, f"{s}")
        check("worklist operador trae el horario de SU rol (op-molienda)", sched_other in opsids, f"{s}")
        check("worklist operador trae el de fallback", sched_fallback in opsids)
        check("worklist operador NO trae el del rol admin", sched_mine not in opsids, f"mine={sched_mine in opsids}")
        # El operador NO accede al admin del planificador (gate schedule:view).
        s, _ = call("GET", "/schedules", op)
        check("operador NO entra al listado de horarios (schedule:view) ⇒ 403", s == 403, f"{s}")

    finally:
        for sid in (sched_mine, sched_fallback, sched_other):
            if sid:
                sql(f'DELETE FROM "RoundOccurrence" WHERE "scheduleId" = \'{sid}\';')
                sql(f'DELETE FROM "LogSchedule" WHERE id = \'{sid}\';')
        if granted and op_role and perm_id:
            sql(f"DELETE FROM \"RolePermission\" WHERE \"roleId\"='{op_role}' AND \"permissionId\"='{perm_id}';")
            flush_redis()

    print(f"\n=== {len(OK)} ok, {len(FAIL)} fail ===")
    if FAIL:
        print("FAILS:", FAIL)
        sys.exit(1)


if __name__ == "__main__":
    main()
