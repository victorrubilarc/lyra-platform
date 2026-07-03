#!/usr/bin/env python3
"""Smoke de ÓRDENES DE TRABAJO · Dashboard (tendencias + indicadores) — OT S7a.

Espejo del smoke del dashboard de Incidencias (4.5). Verifica que las AGREGACIONES sean
correctas, que respeten el ABAC por nodo (idéntico a la lista) y que el DRILL-DOWN (los
querystrings que arma el dashboard) devuelvan la misma lista.

 A) Agregación (admin, ventana acotada para aislar las OT del smoke):
    A1) kpis.created cuenta las creadas en el rango.
    A2) byNode incluye nodo A y nodo B con sus conteos.
    A3) byCriticality C5 == 1; byOrigin DIRECT >= 5; bySpecialty incluye la del smoke.
    A4) trend: la suma de created == kpis.created.
    A5) byType incluye el tipo del smoke; typeId filtra (narrows).
    A6) byState: la suma de conteos == kpis.created (estado del workflow, no hardcodeado).
    A7) kpis vivos: open >= 5, critical >= 1 (las 5 quedaron OPEN vía `enviar`).
 B) Cerradas / MTTR / cumplimiento SLA (OT cerrada vía SQL: createdAt −5h, closedAt now,
    dueAt +1h) ⇒ closed >= 1, mttrHours ≈5 (4..6), slaCompliancePct == 100.
 C) ABAC: usuario temporal con workorder:view scoped SOLO al nodo A ⇒ ve A, no B.
 D) Rango / contrato: rango lejano ⇒ created == 0; range echo bucket/timeZone.
 E) Gate: operador (sin workorder:view) ⇒ 403.
 F) Drill-down (parity con la lista): los filtros del drill (createdFrom/To + dimensión)
    devuelven la lista correcta (typeId, criticality, orgNodeIds).

Crea y LIMPIA por título/key (psql cascade) + usuario/rol/scope temporales. API :3000.
OJO: fechas ISO con sufijo 'Z' (no offset). Clave demo Demo!Pass2026."""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE = os.environ.get("WL_BASE", "http://localhost:3000/api")
PASS = os.environ.get("WL_DEMO_PASS", "Demo!Pass2026")
ADMIN = "demo@watchlog.local"
OPERADOR = "operador@watchlog.local"
PG = ["docker", "exec", "lyra-watchlog-dev-postgres-1", "psql", "-U", "watchlog", "-d", "watchlog", "-t", "-A"]
OK, FAIL = [], []
CREATED = []  # work order ids
WO_TITLE_PREFIX = "OT Smoke Dash"
TYPE_KEY = "smoke-ot-dash-tipo"
SPEC_KEY = "smoke-ot-dash-spec"

TMP_USER = "smoke-wo-dash-user"
TMP_USER_EMAIL = "smoke-wo-dash@watchlog.local"
TMP_ROLE = "smoke-wo-dash-role"


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


def iso(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def create_wo(admin, type_id, node_id, title, criticality, spec_id, send=True):
    body = {"title": title, "typeId": type_id, "criticality": criticality, "orgNodeId": node_id}
    if spec_id:
        body["specialtyIds"] = [spec_id]
    s, r = call("POST", "/work-orders", admin, body)
    if s in (200, 201) and isinstance(r, dict):
        CREATED.append(r["id"])
        if send:
            # DRAFT → solicitada (OPEN): así los KPIs vivos (open/critical) tienen sentido.
            call("POST", f"/work-orders/{r['id']}/transitions", admin, {"transitionKey": "enviar"})
    return s, r


def dash(tok, **params):
    qs = "&".join(f"{k}={urllib.request.quote(str(v))}" for k, v in params.items() if v is not None)
    s, r = call("GET", "/work-orders/dashboard" + ("?" + qs if qs else ""), tok)
    return s, r


def wolist(tok, **params):
    qs = "&".join(f"{k}={urllib.request.quote(str(v))}" for k, v in params.items() if v is not None)
    s, r = call("GET", "/work-orders" + ("?" + qs if qs else ""), tok)
    return s, r


def slice_count(arr, key):
    for it in arr:
        if it["key"] == key:
            return it["count"]
    return 0


def cleanup():
    ids = "','".join(CREATED)
    if CREATED:
        # Satélites primero (por si algún FK no cascada), luego la OT.
        for tbl, col in (("WorkOrderSpecialty", "workOrderId"), ("WorkOrderTransition", "workOrderId"),
                         ("WorkOrderEvent", "workOrderId")):
            sql(f"DELETE FROM \"{tbl}\" WHERE \"{col}\" IN ('{ids}');")
        sql(f"DELETE FROM \"WorkOrder\" WHERE id IN ('{ids}');")
    sql(f"DELETE FROM \"WorkOrder\" WHERE title LIKE '{WO_TITLE_PREFIX}%';")
    sql(f"DELETE FROM \"FolioCounter\" WHERE \"seqKey\" LIKE '%{TYPE_KEY}%';")
    sql(f"DELETE FROM \"WorkOrderType\" WHERE key='{TYPE_KEY}';")
    sql(f"DELETE FROM \"Specialty\" WHERE key='{SPEC_KEY}';")
    sql(f"DELETE FROM \"Scope\" WHERE \"userId\"='{TMP_USER}';")
    sql(f"DELETE FROM \"UserRole\" WHERE \"userId\"='{TMP_USER}';")
    sql(f"DELETE FROM \"RolePermission\" WHERE \"roleId\"='{TMP_ROLE}';")
    sql(f"DELETE FROM \"Role\" WHERE id='{TMP_ROLE}';")
    sql(f"DELETE FROM \"User\" WHERE id='{TMP_USER}';")


def setup_scoped_user(node_a):
    """Usuario temporal con workorder:view (rol propio) scoped SOLO al nodo A. Copia el
    passwordHash de operador DENTRO de SQL para que el login con la clave demo funcione."""
    perm = sql("SELECT id FROM \"Permission\" WHERE key='workorder:view';")
    sql(f"DELETE FROM \"Scope\" WHERE \"userId\"='{TMP_USER}';")
    sql(f"DELETE FROM \"UserRole\" WHERE \"userId\"='{TMP_USER}';")
    sql(f"DELETE FROM \"RolePermission\" WHERE \"roleId\"='{TMP_ROLE}';")
    sql(f"DELETE FROM \"Role\" WHERE id='{TMP_ROLE}';")
    sql(f"DELETE FROM \"User\" WHERE id='{TMP_USER}';")
    sql(
        "INSERT INTO \"User\" (id,email,\"displayName\",\"passwordHash\",status,\"updatedAt\") "
        f"SELECT '{TMP_USER}','{TMP_USER_EMAIL}',u.\"displayName\",u.\"passwordHash\",'ACTIVE',now() "
        "FROM \"User\" u WHERE u.email='operador@watchlog.local';"
    )
    sql(f"INSERT INTO \"Role\" (id,key,name,\"updatedAt\") VALUES ('{TMP_ROLE}','{TMP_ROLE}','Smoke WO Dashboard',now());")
    sql(f"INSERT INTO \"RolePermission\" (\"roleId\",\"permissionId\") VALUES ('{TMP_ROLE}','{perm}');")
    sql(f"INSERT INTO \"UserRole\" (\"userId\",\"roleId\",\"assignedAt\") VALUES ('{TMP_USER}','{TMP_ROLE}',now());")
    sql(
        f"INSERT INTO \"Scope\" (id,\"userId\",\"orgNodeId\",\"includeDescendants\") "
        f"VALUES ('smoke-wo-dash-scope','{TMP_USER}','{node_a}',true);"
    )


def main():
    admin = login(ADMIN)
    check("contexto: login admin", bool(admin))
    if not admin:
        return finish()

    # Dos nodos HOJA disjuntos (no ancestro/descendiente): así el scope (includeDescendants)
    # del nodo A no arrastra al B.
    leaves = sql("SELECT id FROM \"OrgNode\" WHERE \"deletedAt\" IS NULL AND id NOT IN "
                 "(SELECT \"parentId\" FROM \"OrgNode\" WHERE \"parentId\" IS NOT NULL) "
                 "ORDER BY \"createdAt\" LIMIT 2;")
    parts = [x for x in leaves.splitlines() if x.strip()]
    node_a = parts[0] if len(parts) > 0 else ""
    node_b = parts[1] if len(parts) > 1 else ""
    check("contexto: dos nodos hoja disjuntos", bool(node_a) and bool(node_b) and node_a != node_b,
          f"A={node_a} B={node_b}")
    if not (node_a and node_b):
        return finish()

    # Tipo + especialidad del smoke.
    call("POST", "/work-orders/types?create=true", admin,
         {"key": TYPE_KEY, "name": "Tipo OT Dash Smoke", "criticalityDefault": 3, "sortOrder": 98})
    type_id = sql(f"SELECT id FROM \"WorkOrderType\" WHERE key='{TYPE_KEY}';")
    call("POST", "/work-orders/specialties?create=true", admin,
         {"key": SPEC_KEY, "name": "Especialidad Dash Smoke", "sortOrder": 98})
    spec_id = sql(f"SELECT id FROM \"Specialty\" WHERE key='{SPEC_KEY}';")
    check("contexto: tipo + especialidad del smoke", bool(type_id) and bool(spec_id), f"t={type_id} s={spec_id}")
    if not (type_id and spec_id):
        return finish()

    now = datetime.now(timezone.utc)
    win_from = iso(now - timedelta(minutes=5))
    win_to = iso(now + timedelta(minutes=5))

    # Nodo A: 3 OT (crit 5, 3, 3). Nodo B: 2 OT (crit 3, 4). Todas OPEN (enviar).
    create_wo(admin, type_id, node_a, f"{WO_TITLE_PREFIX} A1 crit5", 5, spec_id)
    create_wo(admin, type_id, node_a, f"{WO_TITLE_PREFIX} A2", 3, spec_id)
    create_wo(admin, type_id, node_a, f"{WO_TITLE_PREFIX} A3", 3, spec_id)
    create_wo(admin, type_id, node_b, f"{WO_TITLE_PREFIX} B1", 3, spec_id)
    create_wo(admin, type_id, node_b, f"{WO_TITLE_PREFIX} B2", 4, spec_id)
    n_a, n_b = 3, 2
    check("contexto: 5 OT creadas", len(CREATED) == 5, str(len(CREATED)))

    # Una CERRADA en nodo A (fuera de la ventana de createdAt) para MTTR/closed/SLA.
    s, closed_wo = create_wo(admin, type_id, node_a, f"{WO_TITLE_PREFIX} A4 cerrada", 3, spec_id, send=False)
    closed_id = closed_wo["id"] if isinstance(closed_wo, dict) else None
    if closed_id:
        sql(f"UPDATE \"WorkOrder\" SET lifecycle='CLOSED', \"closedAt\"=now(), "
            f"\"createdAt\"=now() - interval '5 hours', \"dueAt\"=now() + interval '1 hour' WHERE id='{closed_id}';")

    # === A) Agregación =====================================================
    s, d = dash(admin, createdFrom=win_from, createdTo=win_to)
    check("A1 created == 5 (en el rango)", s == 200 and d["kpis"]["created"] == n_a + n_b,
          f"{d['kpis']['created'] if s==200 else s}")
    if s == 200:
        check("A2 byNode nodo A == 3", slice_count(d["byNode"], node_a) == n_a, str(slice_count(d["byNode"], node_a)))
        check("A2 byNode nodo B == 2", slice_count(d["byNode"], node_b) == n_b, str(slice_count(d["byNode"], node_b)))
        check("A3 byCriticality C5 == 1", slice_count(d["byCriticality"], "5") == 1, str(slice_count(d["byCriticality"], "5")))
        check("A3 byOrigin DIRECT >= 5", slice_count(d["byOrigin"], "DIRECT") >= 5, str(slice_count(d["byOrigin"], "DIRECT")))
        check("A3 bySpecialty incluye la del smoke (5)", slice_count(d["bySpecialty"], spec_id) == 5,
              str(slice_count(d["bySpecialty"], spec_id)))
        trend_created = sum(p["created"] for p in d["trend"])
        check("A4 suma trend.created == kpis.created", trend_created == d["kpis"]["created"],
              f"{trend_created} vs {d['kpis']['created']}")
        check("A5 byType incluye el tipo del smoke (5)", slice_count(d["byType"], type_id) == 5,
              str(slice_count(d["byType"], type_id)))
        by_state_total = sum(x["count"] for x in d["byState"])
        check("A6 suma byState == created", by_state_total == d["kpis"]["created"], f"{by_state_total}")
        check("A7 kpis vivos: open >= 5", d["kpis"]["open"] >= 5, str(d["kpis"]["open"]))
        check("A7 kpis vivos: critical >= 1", d["kpis"]["critical"] >= 1, str(d["kpis"]["critical"]))

    # A5 typeId filtra (narrows) — nota: sin ventana, cuenta también la cerrada del tipo.
    s, d2 = dash(admin, typeId=type_id)
    check("A5 typeId filtra (byType de 1 tipo)", s == 200 and len(d2["byType"]) == 1,
          f"types={len(d2['byType']) if s==200 else s}")

    # === B) Cerradas / MTTR / SLA ==========================================
    s, d = dash(admin, createdFrom=win_from, createdTo=win_to, typeId=type_id)
    if s == 200:
        check("B closed >= 1", d["kpis"]["closed"] >= 1, str(d["kpis"]["closed"]))
        mttr = d["kpis"]["mttrHours"]
        check("B mttrHours ≈5 (4..6)", mttr is not None and 4 <= mttr <= 6, str(mttr))
        check("B slaCompliancePct == 100 (cerró dentro del plazo)", d["kpis"]["slaCompliancePct"] == 100,
              str(d["kpis"]["slaCompliancePct"]))

    # === C) ABAC ============================================================
    setup_scoped_user(node_a)
    scoped = login(TMP_USER_EMAIL)
    check("C contexto: login del usuario scoped", bool(scoped))
    if scoped:
        s, ds = dash(scoped, createdFrom=win_from, createdTo=win_to)
        check("C1 scoped: byNode contiene nodo A (3)", s == 200 and slice_count(ds["byNode"], node_a) == n_a,
              str(slice_count(ds["byNode"], node_a)) if s == 200 else str(s))
        check("C1 scoped: byNode NO contiene nodo B (ABAC)", s == 200 and slice_count(ds["byNode"], node_b) == 0,
              str(slice_count(ds["byNode"], node_b)) if s == 200 else str(s))
        check("C2 scoped: created == solo nodo A (3)", s == 200 and ds["kpis"]["created"] == n_a,
              f"{ds['kpis']['created'] if s==200 else s}")
    s, da = dash(admin, createdFrom=win_from, createdTo=win_to)
    check("C3 admin ve nodo A y nodo B", s == 200 and slice_count(da["byNode"], node_a) > 0 and slice_count(da["byNode"], node_b) > 0)

    # === D) Rango / contrato ================================================
    far_from = iso(now - timedelta(days=900))
    far_to = iso(now - timedelta(days=800))
    s, df = dash(admin, createdFrom=far_from, createdTo=far_to)
    check("D1 rango lejano ⇒ created == 0", s == 200 and df["kpis"]["created"] == 0, str(df["kpis"]["created"] if s == 200 else s))
    s, d = dash(admin)
    check("D2 range echo: bucket/timeZone", s == 200 and d["range"]["bucket"] in ("day", "week", "month") and bool(d["range"]["timeZone"]),
          str(d["range"]) if s == 200 else str(s))

    # === E) Gate ============================================================
    operador = login(OPERADOR)
    s, _ = dash(operador)
    check("E operador (sin workorder:view) ⇒ 403", s == 403, str(s))

    # === F) Drill-down (parity con la lista) ================================
    s, lst = wolist(admin, typeId=type_id, createdFrom=win_from, createdTo=win_to, pageSize=100)
    check("F1 lista typeId+ventana == 5", s == 200 and lst["total"] == 5, str(lst.get("total") if s == 200 else s))
    s, lst = wolist(admin, typeId=type_id, criticality=5, createdFrom=win_from, createdTo=win_to, pageSize=100)
    check("F2 drill criticality=5 == 1", s == 200 and lst["total"] == 1, str(lst.get("total") if s == 200 else s))
    s, lst = wolist(admin, typeId=type_id, orgNodeIds=node_b, createdFrom=win_from, createdTo=win_to, pageSize=100)
    check("F3 drill orgNodeIds=B == 2", s == 200 and lst["total"] == 2, str(lst.get("total") if s == 200 else s))

    return finish()


def finish():
    cleanup()
    print(f"\n=== {len(OK)} ok, {len(FAIL)} fail ===")
    if FAIL:
        print("FALLARON:", ", ".join(FAIL))
        sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    finally:
        pass
