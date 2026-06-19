#!/usr/bin/env python3
"""Smoke de CAMBIO DE TURNO / Shift Handover — Fase 5 (Slice 1).

Verifica el núcleo del cambio de turno SIN IA (resumen determinista), su ciclo FIJO
de 3 pasos (compilar → firma saliente → acuse entrante), la baton que rueda, el
snapshot congelado, la notificación al entrante, el ABAC y los gates:

 A) Compilación (get-or-create): compile crea la entrega del turno (COMPILING, folio
    SH-####, turno y ventana resueltos del calendario); recompilar devuelve la MISMA.
 B) Resumen DETERMINISTA (modo none): regenerar produce un brief con nodo/turno/estado.
 C) Baton: pendiente MANUAL agregado rueda como CARRIED a la entrega del turno siguiente.
 D) Baton de dominio: una incidencia ABIERTA del alcance se auto-incluye como ítem INCIDENT.
 E) Firma saliente (Part 11): clave inválida ⇒ 401; correcta ⇒ SIGNED_OUT + snapshot CONGELADO.
 F) Notificación handover.ready emitida al firmar (NotificationEvent por payload).
 G) Segregación: el MISMO que entregó NO puede reconocer (400).
 H) Acuse entrante (Part 11): otro usuario con permiso ⇒ ACKNOWLEDGED + checks/observaciones.
 I) Inmutable tras acuse: agregar pendiente ⇒ 400.
 J) Historial: GET con filtros + ABAC (el usuario scoped ve solo su nodo).
 K) ABAC: usuario scoped a OTRO nodo ⇒ compile del nodo de prueba 403.
 L) Gates: operador sin permisos de handover ⇒ 403 en compile/list/sign/acknowledge.

Crea y LIMPIA por ID (psql cascade) + usuarios/rol/scope temporales. API :3000. Clave demo Demo!Pass2026."""
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
CREATED_HANDOVERS = []
CREATED_INCIDENTS = []

TMP_ENTRANTE = "smoke-sh-entrante"
TMP_ENTRANTE_EMAIL = "smoke-sh-entrante@watchlog.local"
TMP_SCOPED = "smoke-sh-scoped"
TMP_SCOPED_EMAIL = "smoke-sh-scoped@watchlog.local"
TMP_ROLE = "smoke-sh-role"
TMP_ROLE_SCOPED = "smoke-sh-role-scoped"


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
    return r["accessToken"] if s == 200 else None


def sql(q):
    return subprocess.run(PG + ["-c", q], capture_output=True, text=True).stdout.strip()


def check(name, cond, detail=""):
    (OK if cond else FAIL).append(name)
    print(("  ok  " if cond else "FAIL ") + name + (f"   [{detail}]" if detail else ""))


def iso(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def compile_handover(tok, node, at=None):
    body = {"orgNodeId": node}
    if at:
        body["at"] = at
    s, r = call("POST", "/shift-handover/compile", tok, body)
    if s == 200 and isinstance(r, dict):
        if r["id"] not in CREATED_HANDOVERS:
            CREATED_HANDOVERS.append(r["id"])
    return s, r


def setup_users(scoped_node):
    cleanup_users()
    perms = sql("SELECT id FROM \"Permission\" WHERE key IN "
                "('shifthandover:view','shifthandover:compile','shifthandover:sign','shifthandover:acknowledge');").splitlines()
    # Entrante: rol con TODOS los permisos de handover, SIN scope (ve todo).
    sql("INSERT INTO \"User\" (id,email,\"displayName\",\"passwordHash\",status,\"updatedAt\") "
        f"SELECT '{TMP_ENTRANTE}','{TMP_ENTRANTE_EMAIL}',u.\"displayName\",u.\"passwordHash\",'ACTIVE',now() "
        "FROM \"User\" u WHERE u.email='operador@watchlog.local';")
    sql(f"INSERT INTO \"Role\" (id,key,name,\"updatedAt\") VALUES ('{TMP_ROLE}','{TMP_ROLE}','Smoke SH',now());")
    for p in perms:
        sql(f"INSERT INTO \"RolePermission\" (\"roleId\",\"permissionId\") VALUES ('{TMP_ROLE}','{p}');")
    sql(f"INSERT INTO \"UserRole\" (\"userId\",\"roleId\",\"assignedAt\") VALUES ('{TMP_ENTRANTE}','{TMP_ROLE}',now());")
    # Scoped: mismo rol de permisos pero scoped SOLO a otro nodo.
    sql("INSERT INTO \"User\" (id,email,\"displayName\",\"passwordHash\",status,\"updatedAt\") "
        f"SELECT '{TMP_SCOPED}','{TMP_SCOPED_EMAIL}',u.\"displayName\",u.\"passwordHash\",'ACTIVE',now() "
        "FROM \"User\" u WHERE u.email='operador@watchlog.local';")
    sql(f"INSERT INTO \"UserRole\" (\"userId\",\"roleId\",\"assignedAt\") VALUES ('{TMP_SCOPED}','{TMP_ROLE}',now());")
    sql(f"INSERT INTO \"Scope\" (id,\"userId\",\"orgNodeId\",\"includeDescendants\") "
        f"VALUES ('smoke-sh-scope','{TMP_SCOPED}','{scoped_node}',true);")


def cleanup_users():
    for u in (TMP_ENTRANTE, TMP_SCOPED):
        sql(f"DELETE FROM \"Scope\" WHERE \"userId\"='{u}';")
        sql(f"DELETE FROM \"UserRole\" WHERE \"userId\"='{u}';")
    sql(f"DELETE FROM \"RolePermission\" WHERE \"roleId\"='{TMP_ROLE}';")
    sql(f"DELETE FROM \"Role\" WHERE id IN ('{TMP_ROLE}','{TMP_ROLE_SCOPED}');")
    for u in (TMP_ENTRANTE, TMP_SCOPED):
        sql(f"DELETE FROM \"User\" WHERE id='{u}';")


def cleanup():
    for hid in CREATED_HANDOVERS:
        sql(f"DELETE FROM \"NotificationOutbox\" WHERE \"notificationEventId\" IN "
            f"(SELECT id FROM \"NotificationEvent\" WHERE payload->>'handoverId'='{hid}');")
        sql(f"DELETE FROM \"NotificationEvent\" WHERE payload->>'handoverId'='{hid}';")
        sql(f"DELETE FROM \"ShiftHandover\" WHERE id='{hid}';")
    for iid in CREATED_INCIDENTS:
        sql(f"DELETE FROM \"IncidentActivity\" WHERE \"incidentId\"='{iid}';")
        sql(f"DELETE FROM \"IncidentTransition\" WHERE \"incidentId\"='{iid}';")
        sql(f"DELETE FROM \"Incident\" WHERE id='{iid}';")
    cleanup_users()


def pick_nodes():
    """Nodo de prueba (resuelve turno) + un nodo DISJUNTO para el scope ABAC.
    Prefiere el nodo MÁS PROFUNDO SIN entregas previas, para aislar la baton (rollBaton
    toma la entrega previa más reciente del nodo) de datos de prueba ya existentes."""
    clean = sql(
        'SELECT id FROM "OrgNode" WHERE "deletedAt" IS NULL '
        'AND id NOT IN (SELECT DISTINCT "orgNodeId" FROM "ShiftHandover") '
        'ORDER BY length(path) DESC LIMIT 1;'
    ).splitlines()
    test = clean[0] if clean and clean[0] else sql('SELECT id FROM "OrgNode" WHERE "deletedAt" IS NULL ORDER BY length(path) DESC LIMIT 1;').splitlines()[0]
    tpath = sql(f"SELECT path FROM \"OrgNode\" WHERE id='{test}';")
    other = ""
    rows = sql('SELECT id,path FROM "OrgNode" WHERE "deletedAt" IS NULL;').splitlines()
    for row in rows:
        nid, p = row.split("|")
        if nid == test:
            continue
        # disjunto: ni uno es prefijo del otro
        if not tpath.startswith(p) and not p.startswith(tpath):
            other = nid
            break
    return test, other


def main():
    admin = login(ADMIN)
    check("contexto: login admin", bool(admin))
    if not admin:
        return summary()
    node, other = pick_nodes()
    check("contexto: nodo de prueba + nodo disjunto", bool(node) and bool(other), f"{node} / {other}")
    setup_users(other if other else node)
    entrante = login(TMP_ENTRANTE_EMAIL)
    scoped = login(TMP_SCOPED_EMAIL)
    operador = login(OPERADOR)
    check("contexto: login entrante/scoped/operador", bool(entrante) and bool(scoped) and bool(operador))

    now = datetime.now(timezone.utc)

    # --- C/D: entrega del turno ANTERIOR con un pendiente manual ----------------
    s, prev = compile_handover(admin, node, at=iso(now - timedelta(hours=13)))
    check("A compile turno previo (COMPILING)", s == 200 and prev.get("status") == "COMPILING", f"{s}")
    s, _ = call("POST", f"/shift-handover/{prev['id']}/items", admin,
                {"title": "Reapriete de pernos en polín 14", "detail": "Pendiente del turno previo"})
    check("C add pendiente manual al turno previo", s in (200, 201))

    # Incidencia ABIERTA en el nodo (para la baton de dominio).
    type_id = sql("SELECT id FROM \"IncidentType\" WHERE active=true LIMIT 1;").splitlines()[0]
    s, inc = call("POST", "/incidents", admin, {"title": "Smoke SH incidencia abierta", "typeId": type_id, "severity": 4, "orgNodeId": node})
    if s in (200, 201):
        CREATED_INCIDENTS.append(inc["id"])
    check("D contexto: incidencia abierta creada en el nodo", s in (200, 201), f"{s}")

    # --- A/A2: entrega del turno ACTUAL -----------------------------------------
    s, cur = compile_handover(admin, node, at=iso(now))
    check("A compile turno actual (COMPILING, folio, ventana)",
          s == 200 and cur.get("status") == "COMPILING" and cur.get("code", "").startswith("SH-")
          and cur["cockpit"]["scope"]["windowStart"] and cur["cockpit"]["scope"]["windowEnd"], f"{s}")
    cur_id = cur["id"]
    check("A2 compile idempotente (misma entrega)", compile_handover(admin, node, at=iso(now))[1]["id"] == cur_id)
    check("A turnos distintos previo vs actual", prev["id"] != cur_id)

    # --- C: la baton rodó ------------------------------------------------------
    carried = [i for i in cur["items"] if i["source"] == "MANUAL" and i["status"] == "CARRIED"]
    check("C baton: pendiente manual rodó como CARRIED",
          any("polín 14" in i["title"] for i in carried), f"{len(carried)} carried")

    # --- D: baton de dominio ----------------------------------------------------
    dom = [i for i in cur["items"] if i["source"] == "INCIDENT" and i.get("refId") == (inc["id"] if CREATED_INCIDENTS else None)]
    check("D baton: incidencia abierta auto-incluida (source INCIDENT)", len(dom) >= 1, f"{len(dom)}")
    check("D cockpit incidents refleja la incidencia", cur["cockpit"]["counts"].get("INCIDENTS", 0) >= 1)

    # --- B: resumen determinista ------------------------------------------------
    s, r = call("PATCH", f"/shift-handover/{cur_id}/summary", admin,
                {"generalStatus": "OPERATIONAL_WITH_OBSERVATIONS", "regenerate": True})
    txt = (r or {}).get("summaryText") or ""
    check("B resumen determinista regenerado (provider none)",
          s == 200 and r.get("summaryProvider") == "none" and len(txt) > 20, f"{s}")
    check("B resumen menciona estado/pendientes", "Operativo con observaciones" in txt and "polín 14" in txt)

    # --- L: gates de operador (sin permisos de handover) ------------------------
    check("L gate operador: compile 403", call("POST", "/shift-handover/compile", operador, {"orgNodeId": node})[0] == 403)
    check("L gate operador: list 403", call("GET", "/shift-handover", operador)[0] == 403)
    check("L gate operador: sign-out 403", call("POST", f"/shift-handover/{cur_id}/sign-out", operador, {"password": PASS, "generalStatus": "OPERATIONAL"})[0] == 403)
    check("L gate operador: acknowledge 403", call("POST", f"/shift-handover/{cur_id}/acknowledge", operador, {"password": PASS, "readSummary": True, "reviewedItems": True, "noObservations": True})[0] == 403)

    # --- K: ABAC — usuario scoped a otro nodo no puede compilar el de prueba -----
    if other:
        check("K ABAC: scoped a otro nodo ⇒ compile nodo de prueba 403",
              call("POST", "/shift-handover/compile", scoped, {"orgNodeId": node})[0] == 403)

    # --- E: firma saliente (Part 11) -------------------------------------------
    check("E firma: clave inválida ⇒ 401",
          call("POST", f"/shift-handover/{cur_id}/sign-out", admin, {"password": "incorrecta", "generalStatus": "OPERATIONAL"})[0] == 401)
    s, signed = call("POST", f"/shift-handover/{cur_id}/sign-out", admin, {"password": PASS, "generalStatus": "OPERATIONAL_WITH_OBSERVATIONS"})
    check("E firma correcta ⇒ SIGNED_OUT + snapshot congelado",
          s == 200 and signed.get("status") == "SIGNED_OUT" and signed.get("frozen") is True
          and signed["signOut"]["byName"] and signed["signOut"]["meaning"], f"{s}")

    # --- F: notificación handover.ready -----------------------------------------
    ev = sql(f"SELECT count(*) FROM \"NotificationEvent\" WHERE \"eventKey\"='handover.ready' AND payload->>'handoverId'='{cur_id}';")
    check("F notificación handover.ready emitida", ev not in ("", "0"), f"events={ev}")

    # --- G: segregación ---------------------------------------------------------
    s, r = call("POST", f"/shift-handover/{cur_id}/acknowledge", admin,
                {"password": PASS, "readSummary": True, "reviewedItems": True, "noObservations": True})
    check("G segregación: el saliente NO puede reconocer (400)", s == 400, f"{s}")

    # --- H: acuse entrante ------------------------------------------------------
    s, ack = call("POST", f"/shift-handover/{cur_id}/acknowledge", entrante,
                  {"password": PASS, "readSummary": True, "reviewedItems": True, "noObservations": False,
                   "observations": "Recibido. Vigilar temperatura cada 2 h."})
    check("H acuse entrante ⇒ ACKNOWLEDGED + firma",
          s == 200 and ack.get("status") == "ACKNOWLEDGED" and ack["acknowledgement"]["byName"], f"{s}")
    check("H acuse registra checks + observaciones",
          s == 200 and ack["ackState"]["readSummary"] and ack["ackState"]["reviewedItems"]
          and not ack["ackState"]["noObservations"] and "temperatura" in (ack["ackState"]["observations"] or ""))

    # --- I: inmutable tras acuse ------------------------------------------------
    check("I inmutable: agregar pendiente tras acuse ⇒ 400",
          call("POST", f"/shift-handover/{cur_id}/items", admin, {"title": "tarde tarde"})[0] == 400)

    # --- J: historial + ABAC ----------------------------------------------------
    s, lst = call("GET", f"/shift-handover?orgNodeId={node}", admin)
    check("J historial: lista incluye la entrega", s == 200 and any(it["id"] == cur_id for it in lst["items"]), f"{s}")
    s, lst2 = call("GET", "/shift-handover?status=ACKNOWLEDGED", admin)
    check("J historial: filtro status ACKNOWLEDGED", s == 200 and all(it["status"] == "ACKNOWLEDGED" for it in lst2["items"]))
    if other:
        s, lstS = call("GET", "/shift-handover", scoped)
        check("J ABAC: scoped NO ve la entrega del nodo de prueba",
              s == 200 and all(it["id"] != cur_id for it in lstS["items"]), f"{s}")

    summary()


def summary():
    cleanup()
    print(f"\n{len(OK)}/{len(OK) + len(FAIL)} OK")
    if FAIL:
        print("FALLARON:")
        for f in FAIL:
            print("  - " + f)
        sys.exit(1)


if __name__ == "__main__":
    main()
