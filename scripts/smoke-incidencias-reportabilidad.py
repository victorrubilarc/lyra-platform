#!/usr/bin/env python3
"""Smoke de INCIDENCIAS · Reportabilidad configurable — Fase 4.3.

Verifica el catálogo de obligaciones, la materialización de reportes al crear una
incidencia reportable, el BLOQUEO de cierre por reporte OBLIGATORIO pendiente, la
evidencia de envío (folio externo), "no aplica", la derivación de "vencido" y los gates:
 1) Catálogo: GET /obligations trae las semilla; crear vía API (200) + colisión key 409.
 2) Tipo reportable (seguridad, reportableDefault) sev 5: materializa el reporte
    OBLIGATORIO aplicable (minSeverity 4) en PENDING; aparece en GET /reports.
 3) sev 3 del mismo tipo: reportable pero la obligación (minSev 4) NO aplica → 0 reportes.
 4) Cierre BLOQUEADO con reporte obligatorio pendiente → 400; tras enviarlo → 200 CLOSED.
 5) Envío: folio externo + estado SUBMITTED + timeline REPORT_SUBMITTED.
 6) "No aplica": marcar con motivo → NOT_APPLICABLE; motivo corto → 400; desbloquea el cierre.
 7) Materializar idempotente: segunda llamada agrega 0.
 8) Agregar manual: duplicar misma obligación (no anulada) → 409.
 9) Vencido DERIVADO: reporte con dueAt pasado → overdue=true en /reports, reportOverdue
    en el listado, KPI stats.reportOverdue ≥ 1 y filtro reportOverdueOnly.
 10) Tipo NO reportable (operacional): no materializa; cierra sin bloqueo.
 11) Gates: operador (sin incident:edit / incidentcatalog:manage) → 403 en submit y en catálogo.

Crea y LIMPIA por ID (psql cascade). API :3000. Clave demo Demo!Pass2026."""
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
CREATED = []
TEST_OB_KEYS = ["smoke-rep-vencido", "smoke-rep-colision"]


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


def create_incident(admin, type_id, node_id, title, severity):
    s, r = call("POST", "/incidents", admin, {"title": title, "typeId": type_id, "severity": severity, "orgNodeId": node_id})
    if s in (200, 201):
        CREATED.append(r["id"])
    return s, r


def advance_to_verification(admin, inc_id):
    for key in ("a_triage", "asignar", "iniciar", "a_verificacion"):
        call("POST", f"/incidents/{inc_id}/transitions", admin, {"transitionKey": key})


def main():
    admin = login(ADMIN)
    operador = login(OPERADOR)

    node_id = sql("SELECT id FROM \"OrgNode\" WHERE \"deletedAt\" IS NULL ORDER BY \"path\" LIMIT 1;")
    check("contexto: nodo accesible", bool(node_id), node_id)

    s, types = call("GET", "/incidents/types", admin)
    type_norep = next((t["id"] for t in types if t["key"] == "operacional"), None)    # reportableDefault=false, sin inv/capa
    # Tipo de prueba REPORTABLE pero SIN investigación/CAPA (para que el ÚNICO bloqueo
    # de cierre sea el de reportes, no los guards de 4.2a/4.2b). Flujo global por defecto.
    s, type_rep_dto = call("POST", "/incidents/types?create=true", admin, {
        "key": "smoke-rep-tipo", "name": "Reportable smoke", "reportableDefault": True,
        "requiresInvestigation": False, "requiresCapa": False,
    })
    type_rep = type_rep_dto["id"] if isinstance(type_rep_dto, dict) else None
    check("contexto: tipo de prueba reportable (sin inv/CAPA) y operacional", bool(type_rep) and bool(type_norep), str(s))

    # === 1) catálogo de obligaciones ===
    s, obs = call("GET", "/incidents/obligations", admin)
    grave = next((o for o in obs if o["key"] == "reporte-autoridad-grave"), None)
    check("1 GET obligaciones trae la semilla 'reporte-autoridad-grave'", bool(grave), str(s))
    check("1 obligación grave: mandatory + minSeverity 4", grave and grave["mandatory"] and grave["minSeverity"] == 4)

    # Obligación de prueba ACOTADA a 'operacional' (que no se crea reportable) para NO
    # contaminar la materialización del tipo de prueba reportable.
    s, _ = call("POST", "/incidents/obligations?create=true", admin, {
        "key": "smoke-rep-colision", "name": "Colisión smoke", "mandatory": False, "minSeverity": None,
        "appliesToTypeIds": [type_norep],
    })
    check("1 crear obligación vía API → 200/201", s in (200, 201), str(s))
    s, _ = call("POST", "/incidents/obligations?create=true", admin, {"key": "smoke-rep-colision", "name": "Otra"})
    check("1 colisión de key con create=true → 409", s == 409, str(s))

    # === 2) materialización al crear incidencia reportable (sev 5) ===
    s, inc = create_incident(admin, type_rep, node_id, "Reportabilidad smoke — grave", 5)
    inc_id = inc["id"]
    check("2 incidencia reportable creada (reportable=true)", inc.get("reportable") is True, str(inc.get("reportable")))
    s, reports = call("GET", f"/incidents/{inc_id}/reports", admin)
    grave_rep = next((r for r in reports if r["obligationName"] == grave["name"]), None)
    check("2 materializa el reporte obligatorio aplicable (PENDING)", bool(grave_rep) and grave_rep["status"] == "PENDING" and len(reports) == 1, str(len(reports)))
    check("2 el reporte hereda mandatory=true", grave_rep and grave_rep["mandatory"] is True)
    s, det = call("GET", f"/incidents/{inc_id}", admin)
    check("2 timeline REPORT_ADDED", any(a["kind"] == "REPORT_ADDED" for a in det["activity"]))

    # === 3) sev 3: reportable pero la obligación (minSev 4) NO aplica ===
    s, inc_low = create_incident(admin, type_rep, node_id, "Reportabilidad smoke — sev baja", 3)
    s, reports_low = call("GET", f"/incidents/{inc_low['id']}/reports", admin)
    check("3 sev 3: la obligación de minSeverity 4 NO se materializa", len(reports_low) == 0, str(len(reports_low)))

    # === 4) cierre bloqueado por reporte obligatorio pendiente ===
    advance_to_verification(admin, inc_id)
    s, r = call("POST", f"/incidents/{inc_id}/transitions", admin, {"transitionKey": "cerrar"})
    check("4 cerrar con reporte obligatorio pendiente → 400", s == 400, str(s))

    # === 5) envío con folio externo ===
    s, sub = call("POST", f"/incidents/reports/{grave_rep['id']}/submit", admin, {"externalFolio": "FOLIO-SMOKE-9"})
    check("5 marcar enviado → 200 SUBMITTED", s == 200 and sub.get("status") == "SUBMITTED", str(s))
    check("5 folio externo registrado", sub.get("externalFolio") == "FOLIO-SMOKE-9")
    s, det = call("GET", f"/incidents/{inc_id}", admin)
    check("5 timeline REPORT_SUBMITTED", any(a["kind"] == "REPORT_SUBMITTED" for a in det["activity"]))

    # cerrar ahora que el reporte obligatorio está enviado
    s, r = call("POST", f"/incidents/{inc_id}/transitions", admin, {"transitionKey": "cerrar"})
    check("5 cerrar tras enviar el reporte obligatorio → 200 CLOSED", s == 200 and r.get("lifecycle") == "CLOSED", str(s))

    # === 6) "no aplica" desbloquea + validación ===
    s, inc6 = create_incident(admin, type_rep, node_id, "Reportabilidad smoke — no aplica", 5)
    inc6_id = inc6["id"]
    s, reports6 = call("GET", f"/incidents/{inc6_id}/reports", admin)
    rep6 = reports6[0]
    s, _ = call("POST", f"/incidents/reports/{rep6['id']}/not-applicable", admin, {"reason": "x"})
    check("6 'no aplica' con motivo corto → 400", s == 400, str(s))
    s, na = call("POST", f"/incidents/reports/{rep6['id']}/not-applicable", admin, {"reason": "Evento fuera del alcance reportable"})
    check("6 'no aplica' con motivo → 200 NOT_APPLICABLE", s == 200 and na.get("status") == "NOT_APPLICABLE", str(s))
    advance_to_verification(admin, inc6_id)
    s, r = call("POST", f"/incidents/{inc6_id}/transitions", admin, {"transitionKey": "cerrar"})
    check("6 cerrar tras 'no aplica' → 200 CLOSED", s == 200 and r.get("lifecycle") == "CLOSED", str(s))

    # === 7) materializar idempotente ===
    s, inc7 = create_incident(admin, type_rep, node_id, "Reportabilidad smoke — idempotencia", 5)
    inc7_id = inc7["id"]
    s, n = call("POST", f"/incidents/{inc7_id}/reports/materialize", admin, {})
    check("7 re-derivar (ya materializado al crear) agrega 0", s == 200 and n == 0, str(n))

    # === 8) agregar manual: duplicar misma obligación → 409 ===
    s, reports7 = call("GET", f"/incidents/{inc7_id}/reports", admin)
    s, _ = call("POST", f"/incidents/{inc7_id}/reports", admin, {"obligationId": grave["id"]})
    check("8 agregar reporte duplicado de la misma obligación → 409", s == 409, str(s))

    # === 9) vencido DERIVADO ===
    # obligación de prueba NO obligatoria (no bloquea), para colgar un reporte con plazo pasado.
    s, ob_v = call("POST", "/incidents/obligations?create=true", admin, {
        "key": "smoke-rep-vencido", "name": "Vencido smoke", "mandatory": False, "minSeverity": None,
        "appliesToTypeIds": [type_norep],
    })
    past = (datetime.now(timezone.utc) - timedelta(hours=2)).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    s, rep_v = call("POST", f"/incidents/{inc7_id}/reports", admin, {"obligationId": ob_v["id"], "dueAt": past})
    check("9 reporte con plazo pasado creado", s in (200, 201), str(s))
    check("9 overdue derivado = true en el reporte", rep_v.get("overdue") is True, str(rep_v.get("overdue")))
    s, det7 = call("GET", f"/incidents/{inc7_id}", admin)
    s, lst = call("GET", "/incidents?reportOverdueOnly=true&pageSize=200", admin)
    ids = [i["id"] for i in lst["items"]]
    item7 = next((i for i in lst["items"] if i["id"] == inc7_id), None)
    check("9 filtro reportOverdueOnly incluye la incidencia", inc7_id in ids, str(len(ids)))
    check("9 reportOverdue=true en el item del listado", bool(item7) and item7["reportOverdue"] is True)
    s, stats = call("GET", "/incidents/stats", admin)
    check("9 KPI stats.reportOverdue ≥ 1", stats.get("reportOverdue", 0) >= 1, str(stats.get("reportOverdue")))

    # === 10) tipo NO reportable: no materializa, cierra sin bloqueo ===
    s, inc10 = create_incident(admin, type_norep, node_id, "Reportabilidad smoke — no reportable", 5)
    inc10_id = inc10["id"]
    check("10 incidencia de tipo no reportable: reportable=false", inc10.get("reportable") is False)
    s, reports10 = call("GET", f"/incidents/{inc10_id}/reports", admin)
    check("10 no materializa reportes", len(reports10) == 0, str(len(reports10)))
    advance_to_verification(admin, inc10_id)
    s, r = call("POST", f"/incidents/{inc10_id}/transitions", admin, {"transitionKey": "cerrar"})
    check("10 cierra sin bloqueo → 200 CLOSED", s == 200 and r.get("lifecycle") == "CLOSED", str(s))

    # === 11) gates 403 (operador sin incident:edit / incidentcatalog:manage) ===
    s, _ = call("POST", f"/incidents/{inc7_id}/reports", operador, {"obligationId": grave["id"]})
    check("11 operador agregar reporte → 403", s == 403, str(s))
    s, _ = call("POST", "/incidents/obligations?create=true", operador, {"key": "smoke-rep-operador", "name": "x"})
    check("11 operador crear obligación (catálogo) → 403", s == 403, str(s))

    # === limpieza ===
    for cid in CREATED:
        sql(f"DELETE FROM \"Incident\" WHERE id='{cid}';")
    for k in TEST_OB_KEYS:
        sql(f"DELETE FROM \"ReportingObligation\" WHERE key='{k}';")
    sql("DELETE FROM \"IncidentType\" WHERE key='smoke-rep-tipo';")
    print(f"\nlimpieza: {len(CREATED)} incidencias + obligaciones + tipo de prueba eliminados (cascade reportes).")
    print(f"\n=== {len(OK)} OK · {len(FAIL)} FAIL ===")
    if FAIL:
        for f in FAIL:
            print("  FAIL " + f)
        sys.exit(1)


if __name__ == "__main__":
    main()
