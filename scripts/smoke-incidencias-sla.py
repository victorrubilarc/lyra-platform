#!/usr/bin/env python3
"""Smoke de INCIDENCIAS · SLA de resolución + avisos de plazo + escalamiento — Fase 4.4.

Verifica el plazo de resolución auto (SLA light), la desambiguación §21 (permanencia vs
plazo), el sweeper que emite los 4 eventos derivados, los destinatarios (asignado + roles
del estado + escalamiento, ABAC por nodo) y los gates:

 A) SLA light: tipo con resolutionDueMinutes ⇒ dueAt = creación + minutos (auto).
    A2) Override explícito en el alta gana sobre el auto.
 B) §21 desambiguado:
    B1) incidencia con dueAt pasado ⇒ resolutionOverdue=true, slaBreached=false.
    B2) stats.overdue ≥1; filtro overdueOnly la incluye; slaBreachedOnly NO.
    B3) permanencia (maxStayMinutes + currentStateSince pasado) ⇒ slaBreached=true,
        stats.slaBreached ≥1, filtro slaBreachedOnly la incluye.
    B4) editar dueAt deja entrada de timeline DUE_CHANGED.
 C) Sweeper + destinatarios (corre POST /notifications/run):
    C1) incident.overdue emitido para la vencida + outbox al responsable (owner=admin).
    C2) incident.sla.breached emitido para la permanencia + outbox al responsable.
    C3) incident.action.overdue emitido para una CAPA vencida + outbox al responsable.
    C4) incident.report.due emitido para un reporte PENDIENTE vencido + outbox al responsable.
 D) Escalamiento (discriminante — el estado inicial NO tiene roles):
    D1) incidencia SIN responsable, escalada (dueAt muy pasado) ⇒ overdue CON destinatarios
        (miembros del rol de escalamiento).
    D2) incidencia SIN responsable, NO escalada aún (dueAt apenas pasado) ⇒ overdue emitido
        pero SIN destinatarios (0 filas de outbox).
 E) Gates: operador (sin incidentcatalog:manage / incident:edit) ⇒ 403 al crear tipo y editar.

Crea y LIMPIA por ID (psql cascade). API :3000. Clave demo Demo!Pass2026.
OJO: el @Cron de fondo puede adelantar el barrido; el smoke es idempotente (dedupe) — re-correr si algo falla por carrera."""
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
SMOKE_TYPE_KEY = "smoke-sla-tipo"


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


def check(name, cond, detail=""):
    (OK if cond else FAIL).append(name)
    print(("  ok  " if cond else "FAIL ") + name + (f"   [{detail}]" if detail else ""))


def iso(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def create_incident(admin, type_id, node_id, title, severity=3, owner=None, due=None):
    body = {"title": title, "typeId": type_id, "severity": severity, "orgNodeId": node_id}
    if owner is not None:
        body["ownerId"] = owner
    if due is not None:
        body["dueAt"] = due
    s, r = call("POST", "/incidents", admin, body)
    if s in (200, 201):
        CREATED.append(r["id"])
    return s, r


def ev_exists(event_key, json_path, value):
    """¿Hay un NotificationEvent de ese tipo cuyo payload->>json_path = value?"""
    n = sql(f"SELECT count(*) FROM \"NotificationEvent\" WHERE \"eventKey\"='{event_key}' AND payload->>'{json_path}'='{value}';")
    return n not in ("", "0")


def outbox_for(event_key, json_path, value, recipient=None):
    """Cuenta filas de outbox del evento (por payload) opcionalmente para un destinatario."""
    rcpt = f" AND o.\"recipientUserId\"='{recipient}'" if recipient else ""
    return sql(
        "SELECT count(*) FROM \"NotificationOutbox\" o JOIN \"NotificationEvent\" e ON e.id=o.\"eventId\" "
        f"WHERE e.\"eventKey\"='{event_key}' AND e.payload->>'{json_path}'='{value}'{rcpt};"
    )


def run_worker(tok):
    call("POST", "/notifications/run", tok)


def main():
    admin = login(ADMIN)
    operador = login(OPERADOR)
    admin_id = sql(f"SELECT id FROM \"User\" WHERE email='{ADMIN}';")
    admin_role_id = sql("SELECT id FROM \"Role\" WHERE key='admin';")
    node_id = sql("SELECT id FROM \"OrgNode\" WHERE \"deletedAt\" IS NULL ORDER BY \"path\" LIMIT 1;")
    check("contexto: admin/rol/nodo", bool(admin_id and admin_role_id and node_id), f"{admin_id[:6]}/{admin_role_id[:6]}/{node_id[:6]}")

    # --- Tipo de smoke con SLA + escalamiento (al rol admin, cuyos miembros pasan ABAC) ---
    s, t = call("POST", f"/incidents/types?create=true", admin, {
        "key": SMOKE_TYPE_KEY, "name": "SLA smoke", "resolutionDueMinutes": 120,
        "escalationAfterMinutes": 120, "escalationRoleId": admin_role_id,
    })
    if s == 409:  # de una corrida previa: actualiza
        s, t = call("POST", "/incidents/types", admin, {
            "key": SMOKE_TYPE_KEY, "name": "SLA smoke", "resolutionDueMinutes": 120,
            "escalationAfterMinutes": 120, "escalationRoleId": admin_role_id,
        })
    type_id = t["id"] if isinstance(t, dict) else sql(f"SELECT id FROM \"IncidentType\" WHERE key='{SMOKE_TYPE_KEY}';")
    check("setup: tipo SLA creado con escalamiento", bool(type_id) and isinstance(t, dict) and t.get("resolutionDueMinutes") == 120, f"{s}")
    check("setup: escalationRoleName resuelto en el DTO", isinstance(t, dict) and t.get("escalationRoleName") is not None, str(t.get("escalationRoleName") if isinstance(t, dict) else t))

    # === A. SLA light: auto-due + override ====================================
    before = datetime.now(timezone.utc)
    s, a1 = create_incident(admin, type_id, node_id, "SLA — auto due")
    auto_due = datetime.fromisoformat(a1["dueAt"].replace("Z", "+00:00")) if a1.get("dueAt") else None
    expected = before + timedelta(minutes=120)
    check("A1 auto-due = creación + resolutionDueMinutes", auto_due is not None and abs((auto_due - expected).total_seconds()) < 180, str(a1.get("dueAt")))

    past = iso(datetime.now(timezone.utc) - timedelta(hours=2))
    s, a2 = create_incident(admin, type_id, node_id, "SLA — override vencida", owner=admin_id, due=past)
    check("A2 override explícito gana al auto-due", a2.get("dueAt", "")[:16] == past[:16], f"{a2.get('dueAt')} vs {past}")

    # === B. §21 desambiguado ==================================================
    check("B1 vencida: resolutionOverdue=true, slaBreached=false", a2.get("resolutionOverdue") is True and a2.get("slaBreached") is False,
          f"ro={a2.get('resolutionOverdue')} sb={a2.get('slaBreached')}")
    s, stats = call("GET", "/incidents/stats", admin)
    check("B2 stats.overdue ≥1 y stats.slaBreached presente", stats.get("overdue", 0) >= 1 and "slaBreached" in stats, json.dumps(stats))
    s, lst = call("GET", "/incidents?overdueOnly=true&pageSize=200", admin)
    ids_overdue = {i["id"] for i in lst.get("items", [])}
    check("B2 filtro overdueOnly incluye la vencida", a2["id"] in ids_overdue, f"n={len(ids_overdue)}")
    s, lst2 = call("GET", "/incidents?slaBreachedOnly=true&pageSize=200", admin)
    ids_sla = {i["id"] for i in lst2.get("items", [])}
    check("B2 filtro slaBreachedOnly NO incluye la (solo) vencida", a2["id"] not in ids_sla, f"n={len(ids_sla)}")

    # Permanencia: maxStayMinutes en el estado del flujo de a2 + currentStateSince pasado.
    ver = sql(f"SELECT \"workflowDefinitionVersionId\" FROM \"Incident\" WHERE id='{a2['id']}';")
    skey = sql(f"SELECT \"currentStateKey\" FROM \"Incident\" WHERE id='{a2['id']}';")
    sql(f"UPDATE \"WorkflowState\" SET \"maxStayMinutes\"=1 WHERE \"workflowDefinitionVersionId\"='{ver}' AND key='{skey}';")
    sql(f"UPDATE \"Incident\" SET \"currentStateSince\"=now() - interval '1 hour' WHERE id='{a2['id']}';")
    s, a2d = call("GET", f"/incidents/{a2['id']}", admin)
    check("B3 permanencia: slaBreached=true tras maxStay+since pasado", a2d.get("slaBreached") is True, f"sb={a2d.get('slaBreached')}")
    s, lst3 = call("GET", "/incidents?slaBreachedOnly=true&pageSize=200", admin)
    check("B3 filtro slaBreachedOnly incluye la de permanencia", a2["id"] in {i["id"] for i in lst3.get("items", [])})
    s, stats2 = call("GET", "/incidents/stats", admin)
    check("B3 stats.slaBreached ≥1", stats2.get("slaBreached", 0) >= 1, json.dumps(stats2))

    # B4 DUE_CHANGED al editar dueAt
    new_due = iso(datetime.now(timezone.utc) + timedelta(days=3))
    s, _ = call("PATCH", f"/incidents/{a1['id']}", admin, {"dueAt": new_due})
    dc = sql(f"SELECT count(*) FROM \"IncidentActivity\" WHERE \"incidentId\"='{a1['id']}' AND kind='DUE_CHANGED';")
    check("B4 editar dueAt deja timeline DUE_CHANGED", dc not in ("", "0"), f"n={dc}")

    # === C. Sweeper + destinatarios ===========================================
    # CAPA vencida en una incidencia con owner=admin.
    s, cap_inc = create_incident(admin, type_id, node_id, "SLA — con CAPA vencida", owner=admin_id)
    s, act = call("POST", f"/incidents/{cap_inc['id']}/actions", admin,
                  {"kind": "CORRECTIVE", "title": "Acción vencida de smoke", "mandatory": True, "dueAt": iso(datetime.now(timezone.utc) - timedelta(hours=3))})
    act_id = act.get("id") if isinstance(act, dict) else None
    # Reporte PENDIENTE vencido en una incidencia con owner=admin.
    s, obs = call("GET", "/incidents/obligations", admin)
    ob_id = obs[0]["id"] if isinstance(obs, list) and obs else None
    s, rep_inc = create_incident(admin, type_id, node_id, "SLA — con reporte vencido", owner=admin_id)
    rep_id = None
    if ob_id:
        s, rep = call("POST", f"/incidents/{rep_inc['id']}/reports", admin, {"obligationId": ob_id, "dueAt": iso(datetime.now(timezone.utc) - timedelta(hours=3))})
        rep_id = rep.get("id") if isinstance(rep, dict) else None

    run_worker(admin)
    run_worker(admin)  # 2.ª pasada: dispatch+send de lo recién barrido (evita carrera con el @Cron)

    check("C1 incident.overdue emitido para la vencida", ev_exists("incident.overdue", "incidentId", a2["id"]))
    check("C1 outbox de incident.overdue al responsable (admin)", outbox_for("incident.overdue", "incidentId", a2["id"], admin_id) not in ("", "0"))
    check("C2 incident.sla.breached emitido para la permanencia", ev_exists("incident.sla.breached", "incidentId", a2["id"]))
    check("C2 outbox de incident.sla.breached al responsable (admin)", outbox_for("incident.sla.breached", "incidentId", a2["id"], admin_id) not in ("", "0"))
    if act_id:
        check("C3 incident.action.overdue emitido para la CAPA vencida", ev_exists("incident.action.overdue", "actionId", act_id))
        check("C3 outbox de incident.action.overdue al responsable (admin)", outbox_for("incident.action.overdue", "actionId", act_id, admin_id) not in ("", "0"))
    else:
        check("C3 acción creada", False, "no se creó la acción")
    if rep_id:
        check("C4 incident.report.due emitido para el reporte vencido", ev_exists("incident.report.due", "reportId", rep_id))
        check("C4 outbox de incident.report.due al responsable (admin)", outbox_for("incident.report.due", "reportId", rep_id, admin_id) not in ("", "0"))
    else:
        check("C4 reporte creado", False, "no se creó el reporte")

    # === D. Escalamiento (discriminante: estado inicial sin roles) ============
    s, z_esc = create_incident(admin, type_id, node_id, "SLA — escalada (sin owner)", due=iso(datetime.now(timezone.utc) - timedelta(hours=3)))
    s, z_no = create_incident(admin, type_id, node_id, "SLA — no escalada (sin owner)", due=iso(datetime.now(timezone.utc) - timedelta(minutes=5)))
    run_worker(admin)
    run_worker(admin)
    check("D1 escalada SIN owner ⇒ overdue CON destinatarios (rol de escalamiento)",
          outbox_for("incident.overdue", "incidentId", z_esc["id"]) not in ("", "0"),
          f"n={outbox_for('incident.overdue', 'incidentId', z_esc['id'])}")
    check("D2 NO escalada SIN owner ⇒ overdue emitido pero 0 destinatarios",
          ev_exists("incident.overdue", "incidentId", z_no["id"]) and outbox_for("incident.overdue", "incidentId", z_no["id"]) in ("", "0"),
          f"ev={ev_exists('incident.overdue', 'incidentId', z_no['id'])} out={outbox_for('incident.overdue', 'incidentId', z_no['id'])}")

    # === E. Gates =============================================================
    s, _ = call("POST", "/incidents/types?create=true", operador, {"key": "smoke-sla-no", "name": "x"})
    check("E1 operador NO crea tipo (403)", s == 403, str(s))
    s, _ = call("PATCH", f"/incidents/{a1['id']}", operador, {"dueAt": new_due})
    check("E2 operador NO edita incidencia (403)", s == 403, str(s))

    # === Limpieza =============================================================
    for cid in CREATED:
        sql(f"DELETE FROM \"NotificationOutbox\" o USING \"NotificationEvent\" e WHERE o.\"eventId\"=e.id AND e.payload->>'incidentId'='{cid}';")
        sql(f"DELETE FROM \"NotificationEvent\" WHERE payload->>'incidentId'='{cid}';")
        sql(f"DELETE FROM \"Incident\" WHERE id='{cid}';")
    sql(f"DELETE FROM \"IncidentType\" WHERE key='{SMOKE_TYPE_KEY}';")

    print(f"\n=== {len(OK)} ok · {len(FAIL)} fail ===")
    if FAIL:
        print("FALLARON:\n  - " + "\n  - ".join(FAIL))
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
