#!/usr/bin/env python3
"""Smoke de INCIDENCIAS · Dashboard (tendencias + indicadores) — Fase 4.5.

Verifica que las AGREGACIONES del dashboard sean correctas y que respeten el ABAC por
nodo (idéntico a la lista): un no-admin con alcance limitado NO agrega nodos ajenos.

 A) Agregación (admin, ventana acotada para aislar las incidencias del smoke):
    A1) kpis.created cuenta las creadas en el rango.
    A2) byNode incluye nodo A y nodo B con sus conteos.
    A3) byType / bySeverity / byOrigin reflejan lo creado; typeId filtra (narrows).
    A4) trend tiene buckets; la suma de created del trend == kpis.created.
    A5) byEquipment incluye el equipo compartido (≥2).
    A6) recurrence: mismo tipo+equipo en la ventana ⇒ par con count ≥2.
 B) Cerradas / MTTR / cumplimiento SLA:
    B1) una incidencia cerrada (createdAt −5h, closedAt now, dueAt now+1h) ⇒ closed ≥1,
        mttrHours ≈5 (4..6), slaCompliancePct == 100 (cerró dentro del plazo).
 C) ABAC (lo crítico): usuario temporal con incident:view scoped SOLO al nodo A:
    C1) su dashboard byNode contiene el nodo A y NO el nodo B.
    C2) su kpis.created == nº de incidencias del nodo A (no ve las del nodo B).
    C3) el admin SÍ ve ambos nodos (contraste).
 D) Rango / contrato:
    D1) rango lejano en el pasado ⇒ created == 0.
    D2) range echo: bucket/timeZone/recurrenceWindowDays presentes.
 E) Gate: operador (sin incident:view) ⇒ 403.

Crea y LIMPIA por ID (psql cascade) + usuario/rol/scope temporales. API :3000. Clave demo Demo!Pass2026.
OJO: el @Cron de fondo NO afecta (el dashboard es read-only); re-correr es idempotente."""
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
CREATED = []  # incident ids

# Usuario/rol/scope temporales para el test de ABAC.
TMP_USER = "smoke-dash-user"
TMP_USER_EMAIL = "smoke-dash@watchlog.local"
TMP_ROLE = "smoke-dash-role"


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


def create_incident(admin, type_id, node_id, title, severity=3, equipment=None):
    body = {"title": title, "typeId": type_id, "severity": severity, "orgNodeId": node_id}
    if equipment is not None:
        body["equipmentId"] = equipment
    s, r = call("POST", "/incidents", admin, body)
    if s in (200, 201) and isinstance(r, dict):
        CREATED.append(r["id"])
    return s, r


def dash(tok, **params):
    qs = "&".join(f"{k}={urllib.request.quote(str(v))}" for k, v in params.items() if v is not None)
    s, r = call("GET", "/incidents/dashboard" + ("?" + qs if qs else ""), tok)
    return s, r


def slice_count(arr, key):
    for it in arr:
        if it["key"] == key:
            return it["count"]
    return 0


def cleanup():
    for iid in CREATED:
        sql(f"DELETE FROM \"Incident\" WHERE id='{iid}';")
    sql(f"DELETE FROM \"Scope\" WHERE \"userId\"='{TMP_USER}';")
    sql(f"DELETE FROM \"UserRole\" WHERE \"userId\"='{TMP_USER}';")
    sql(f"DELETE FROM \"RolePermission\" WHERE \"roleId\"='{TMP_ROLE}';")
    sql(f"DELETE FROM \"Role\" WHERE id='{TMP_ROLE}';")
    sql(f"DELETE FROM \"User\" WHERE id='{TMP_USER}';")


def setup_scoped_user(node_a):
    """Usuario temporal con incident:view (rol propio) scoped SOLO al nodo A.
    Copia el passwordHash de operador DENTRO de SQL (sin pasarlo por el shell) para
    que el login con la clave demo funcione."""
    perm = sql("SELECT id FROM \"Permission\" WHERE key='incident:view';")
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
    sql(
        f"INSERT INTO \"Role\" (id,key,name,\"updatedAt\") VALUES ('{TMP_ROLE}','{TMP_ROLE}','Smoke Dashboard',now());"
    )
    sql(f"INSERT INTO \"RolePermission\" (\"roleId\",\"permissionId\") VALUES ('{TMP_ROLE}','{perm}');")
    sql(f"INSERT INTO \"UserRole\" (\"userId\",\"roleId\",\"assignedAt\") VALUES ('{TMP_USER}','{TMP_ROLE}',now());")
    sql(
        f"INSERT INTO \"Scope\" (id,\"userId\",\"orgNodeId\",\"includeDescendants\") "
        f"VALUES ('smoke-dash-scope','{TMP_USER}','{node_a}',true);"
    )


def main():
    admin = login(ADMIN)
    check("contexto: login admin", bool(admin))
    if not admin:
        return finish()

    # Nodo A = SECADO (tiene equipos para byEquipment/reincidencia). Nodo B = Molienda SAG (disjunto).
    node_a = sql("SELECT \"orgNodeId\" FROM \"Equipment\" WHERE active=true AND \"deletedAt\" IS NULL "
                 "AND name='Caldera de vapor' LIMIT 1;")
    equip = sql("SELECT id FROM \"Equipment\" WHERE active=true AND \"deletedAt\" IS NULL "
                "AND name='Caldera de vapor' LIMIT 1;")
    node_b = sql("SELECT id FROM \"OrgNode\" WHERE name='Molienda SAG' AND \"deletedAt\" IS NULL LIMIT 1;")
    type_geo = sql("SELECT id FROM \"IncidentType\" WHERE key='geomecanica' AND active=true LIMIT 1;")
    type_ene = sql("SELECT id FROM \"IncidentType\" WHERE key='energia-electrica' AND active=true LIMIT 1;")
    check("contexto: nodos A/B + equipo + tipos", all([node_a, equip, node_b, type_geo, type_ene]),
          f"A={node_a} B={node_b} eq={equip}")
    if not all([node_a, equip, node_b, type_geo, type_ene]):
        return finish()
    check("contexto: A y B son disjuntos", node_a != node_b)

    now = datetime.now(timezone.utc)
    win_from = iso(now - timedelta(minutes=5))
    win_to = iso(now + timedelta(minutes=5))

    # === Crear data del smoke ===============================================
    # Nodo A: 2 mismas (tipo geomecánica + Caldera) para reincidencia/byEquipment + 1 crítica.
    create_incident(admin, type_geo, node_a, "Smoke dash A1", severity=3, equipment=equip)
    create_incident(admin, type_geo, node_a, "Smoke dash A2", severity=3, equipment=equip)
    create_incident(admin, type_ene, node_a, "Smoke dash A3 crítica", severity=5)
    # Nodo B: 2 (tipo geomecánica).
    create_incident(admin, type_geo, node_b, "Smoke dash B1", severity=2)
    create_incident(admin, type_geo, node_b, "Smoke dash B2", severity=4)
    n_a, n_b = 3, 2
    check("contexto: 5 incidencias creadas", len(CREATED) == 5, str(len(CREATED)))

    # Una cerrada en nodo A para MTTR/closed/SLA (vía SQL: createdAt −5h, closedAt now, dueAt +1h).
    s, closed_inc = create_incident(admin, type_geo, node_a, "Smoke dash A4 cerrada", severity=2)
    closed_id = closed_inc["id"] if isinstance(closed_inc, dict) else None
    if closed_id:
        sql(f"UPDATE \"Incident\" SET lifecycle='CLOSED', \"closedAt\"=now(), "
            f"\"createdAt\"=now() - interval '5 hours', \"dueAt\"=now() + interval '1 hour' WHERE id='{closed_id}';")
    n_a_open = n_a  # las 3 abiertas siguen en la ventana; la cerrada salió de la ventana de createdAt

    # === A) Agregación (admin, ventana acotada) =============================
    s, d = dash(admin, createdFrom=win_from, createdTo=win_to)
    check("A1 created cuenta las creadas en el rango", s == 200 and d["kpis"]["created"] == n_a_open + n_b,
          f"{d['kpis']['created'] if s==200 else s} esperado {n_a_open + n_b}")
    if s == 200:
        check("A2 byNode incluye nodo A", slice_count(d["byNode"], node_a) == n_a_open, str(slice_count(d["byNode"], node_a)))
        check("A2 byNode incluye nodo B", slice_count(d["byNode"], node_b) == n_b, str(slice_count(d["byNode"], node_b)))
        check("A3 bySeverity S5 == 1 (la crítica)", slice_count(d["bySeverity"], "5") == 1, str(slice_count(d["bySeverity"], "5")))
        check("A3 byOrigin MANUAL >= 5", slice_count(d["byOrigin"], "MANUAL") >= n_a_open + n_b)
        trend_created = sum(p["created"] for p in d["trend"])
        check("A4 suma trend.created == kpis.created", trend_created == d["kpis"]["created"], f"{trend_created} vs {d['kpis']['created']}")
        check("A5 byEquipment incluye la Caldera (>=2)", slice_count(d["byEquipment"], equip) >= 2, str(slice_count(d["byEquipment"], equip)))
        rec = [r for r in d["recurrence"] if r["typeId"] == type_geo and r["equipmentId"] == equip]
        check("A6 recurrence: par tipo+equipo con count>=2", bool(rec) and rec[0]["count"] >= 2, str(rec))

    # A3 typeId filtra (narrows): solo el tipo energía ⇒ byType de un solo tipo.
    s, d2 = dash(admin, createdFrom=win_from, createdTo=win_to, typeId=type_ene)
    check("A3 typeId filtra (byType de 1 tipo, created==1)",
          s == 200 and d2["kpis"]["created"] == 1 and len(d2["byType"]) == 1,
          f"created={d2['kpis']['created'] if s==200 else s} types={len(d2['byType']) if s==200 else '-'}")

    # === B) Cerradas / MTTR / cumplimiento SLA ==============================
    s, d = dash(admin, createdFrom=win_from, createdTo=win_to)
    if s == 200:
        check("B1 closed >= 1", d["kpis"]["closed"] >= 1, str(d["kpis"]["closed"]))
        mttr = d["kpis"]["mttrHours"]
        check("B1 mttrHours ≈5 (4..6)", mttr is not None and 4 <= mttr <= 6, str(mttr))
        check("B1 slaCompliancePct == 100 (cerró dentro del plazo)", d["kpis"]["slaCompliancePct"] == 100,
              str(d["kpis"]["slaCompliancePct"]))

    # === C) ABAC ============================================================
    setup_scoped_user(node_a)
    scoped = login(TMP_USER_EMAIL)
    check("C contexto: login del usuario scoped", bool(scoped))
    if scoped:
        s, ds = dash(scoped, createdFrom=win_from, createdTo=win_to)
        check("C1 scoped: byNode contiene nodo A", s == 200 and slice_count(ds["byNode"], node_a) == n_a_open,
              str(slice_count(ds["byNode"], node_a)) if s == 200 else str(s))
        check("C1 scoped: byNode NO contiene nodo B (ABAC)", s == 200 and slice_count(ds["byNode"], node_b) == 0,
              str(slice_count(ds["byNode"], node_b)) if s == 200 else str(s))
        check("C2 scoped: created == solo nodo A", s == 200 and ds["kpis"]["created"] == n_a_open,
              f"{ds['kpis']['created'] if s==200 else s} esperado {n_a_open}")
    # C3 contraste admin ve ambos
    s, da = dash(admin, createdFrom=win_from, createdTo=win_to)
    check("C3 admin ve nodo A y nodo B", s == 200 and slice_count(da["byNode"], node_a) > 0 and slice_count(da["byNode"], node_b) > 0)

    # === D) Rango / contrato ================================================
    far_from = iso(now - timedelta(days=900))
    far_to = iso(now - timedelta(days=800))
    s, df = dash(admin, createdFrom=far_from, createdTo=far_to)
    check("D1 rango lejano ⇒ created == 0", s == 200 and df["kpis"]["created"] == 0, str(df["kpis"]["created"] if s == 200 else s))
    s, d = dash(admin)
    check("D2 range echo: bucket/timeZone/recurrenceWindowDays",
          s == 200 and d["range"]["bucket"] in ("day", "week", "month")
          and bool(d["range"]["timeZone"]) and d["range"]["recurrenceWindowDays"] == 30,
          str(d["range"]) if s == 200 else str(s))

    # === E) Gate ============================================================
    operador = login(OPERADOR)
    s, _ = dash(operador)
    check("E operador (sin incident:view) ⇒ 403", s == 403, str(s))

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
