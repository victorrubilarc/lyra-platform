#!/usr/bin/env python3
"""Smoke de ACCIÓN del motor de reglas — Fase 4.1.2.

Verifica que una regla de negocio cruzada, al SELLAR la entrada, materialice —de
forma DIFERIDA vía outbox— una excepción RULE o abra una incidencia:
  (1) DISEÑO server-authoritative: una regla con acción debe ser WARN (ERROR ⇒ 400);
      openIncident con tipo inexistente ⇒ 400.
  (2) EMISIÓN al sellar: tras submit, hay órdenes PENDING en RuleActionOutbox.
  (3) WORKER (POST /rule-actions/run): raiseException ⇒ excepción triggerKind=RULE,
      fieldKey null, thresholdType=warning, OPEN; openIncident ⇒ excepción CONVERTED
      + incidencia originType=RULE + link.
  (4) IDEMPOTENCIA: re-correr el worker no duplica (mismo dedupeKey).
  (5) GATE 403: el operador no puede correr el worker.

CREA su propia plantilla (publicada) + entrada + incidencia y LIMPIA TODO por ID.
API :3000. Admin demo: demo@watchlog.local / Demo!Pass2026."""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE = os.environ.get("WL_BASE", "http://localhost:3000/api")
PASS = os.environ.get("WL_DEMO_PASS", "Demo!Pass2026")
ADMIN = "demo@watchlog.local"
OPERADOR = "operador@watchlog.local"
PG = ("docker", "exec", "lyra-watchlog-dev-postgres-1", "psql", "-U", "watchlog", "-d", "watchlog", "-tAc")
OK, FAIL = [], []


def req(method, path, tok=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    if body is not None:
        r.add_header("Content-Type", "application/json")
    if tok:
        r.add_header("Authorization", "Bearer " + tok)
    with urllib.request.urlopen(r) as resp:
        txt = resp.read().decode()
        return resp.status, (json.loads(txt) if txt else None)


def call(method, path, tok=None, body=None):
    try:
        return req(method, path, tok, body)
    except urllib.error.HTTPError as e:
        b = e.read().decode()
        try:
            return e.code, json.loads(b)
        except Exception:
            return e.code, b


def check(name, cond, detail=""):
    (OK if cond else FAIL).append(name)
    print(("  ok  " if cond else "FAIL ") + name + (f"   [{detail}]" if detail else ""))


def flatten(nodes, out=None):
    if out is None:
        out = []
    for n in nodes:
        out.append({"id": n["id"], "name": n["name"], "children": n.get("children", [])})
        flatten(n.get("children", []), out)
    return out


def pg(sql):
    subprocess.run([*PG, sql], capture_output=True, text=True)


def pg1(sql):
    return subprocess.run([*PG, sql], capture_output=True, text=True).stdout.strip()


def var(key):
    return {"kind": "var", "key": key}


def lit(v):
    return {"kind": "lit", "value": v}


def op(o, *args):
    return {"kind": "op", "op": o, "args": list(args)}


def sections():
    return [{
        "key": "s1", "title": "Lecturas",
        "fields": [
            {"key": "entrada", "type": "NUMBER", "label": "Entrada (t)", "config": {"unit": "t"}},
            {"key": "salida", "type": "NUMBER", "label": "Salida (t)", "config": {"unit": "t"}},
        ],
    }]


def exceptions_of(tok, eid):
    s, r = call("GET", f"/exceptions?logEntryId={eid}&pageSize=50", tok)
    return r if isinstance(r, dict) else {"items": [], "total": 0}


def by_rule(items, rule_key):
    return next((x for x in items if x.get("ruleKey") == rule_key), None)


def sec_ver(detail, key="s1"):
    return next((x["version"] for x in detail.get("sectionStates", []) if x["sectionKey"] == key), 0)


def save(tok, eid, values, complete=False):
    d = call("GET", f"/log-entries/{eid}", tok)[1]
    return call("PUT", f"/log-entries/{eid}/sections/s1", tok, {
        "expectedVersion": sec_ver(d if isinstance(d, dict) else {}),
        "values": values, **({"markComplete": True} if complete else {})})


def wait_api():
    for _ in range(60):
        try:
            s, _ = call("POST", "/auth/login", body={"email": ADMIN, "password": PASS})
            if s in (200, 201):
                return True
        except Exception:
            pass
        time.sleep(2)
    return False


def main():
    if not wait_api():
        print("API no respondió en :3000"); sys.exit(2)
    atok = req("POST", "/auth/login", body={"email": ADMIN, "password": PASS})[1]["accessToken"]
    optok = req("POST", "/auth/login", body={"email": OPERADOR, "password": PASS})[1]["accessToken"]
    flat = flatten(req("GET", "/structure/nodes", atok)[1])
    node = next((n for n in flat if not n["children"]), flat[0])
    node_id = node["id"]
    type_id = next((t["id"] for t in call("GET", "/incidents/types", atok)[1] if t.get("active")), None)
    print(f"Nodo: {node_id} ({node['name']}) · tipo incidencia: {type_id}")

    # Reglas con acción: r_exc (genera excepción), r_inc (abre incidencia).
    r_exc = {"key": "r_exc", "name": "Entrada alta", "when": op("gt", var("entrada"), lit(100)),
             "severity": "WARN", "message": "La entrada supera 100 t", "enabled": True,
             "action": {"kind": "raiseException"}}
    r_inc = {"key": "r_inc", "name": "Salida mayor que entrada", "when": op("gt", var("salida"), var("entrada")),
             "severity": "WARN", "message": "La salida no puede superar la entrada", "enabled": True,
             "action": {"kind": "openIncident", "incidentTypeId": type_id, "severity": 4}}

    tpl_id = None
    incident_ids = []
    eid = None
    try:
        ts = os.urandom(3).hex()
        tpl_id = req("POST", "/templates", atok, {
            "name": f"SMOKE REGLAS-ACCION {ts}",
            "nodeAssignments": [{"orgNodeId": node_id, "includeDescendants": False}]})[1]["id"]

        # === (1) DISEÑO server-authoritative ====================================
        bad_sev = {**r_exc, "severity": "ERROR"}
        s, _ = call("PUT", f"/templates/{tpl_id}/draft", atok, {"sections": sections(), "rules": [bad_sev]})
        check("regla con acción + severidad ERROR ⇒ 400", s == 400, s)
        bad_type = {**r_inc, "action": {"kind": "openIncident", "incidentTypeId": "noexiste", "severity": 4}}
        s, _ = call("PUT", f"/templates/{tpl_id}/draft", atok, {"sections": sections(), "rules": [bad_type]})
        check("openIncident con tipo inexistente ⇒ 400", s == 400, s)

        # Diseño VÁLIDO
        s, _ = call("PUT", f"/templates/{tpl_id}/draft", atok, {"sections": sections(), "rules": [r_exc, r_inc]})
        check("diseño válido (2 reglas con acción WARN) ⇒ 200", s == 200, s)
        s, _ = call("POST", f"/templates/{tpl_id}/publish", atok, {})
        check("publicar ⇒ 200/201", s in (200, 201), s)

        # === (2) EMISIÓN al sellar =============================================
        eid = call("POST", "/log-entries", atok, {"templateId": tpl_id, "orgNodeId": node_id})[1]["id"]
        save(atok, eid, [{"fieldKey": "entrada", "value": 150}, {"fieldKey": "salida", "value": 200}], complete=True)
        s, _ = call("POST", f"/log-entries/{eid}/submit", atok, {})
        check("sellar (submit) con 2 reglas disparadas ⇒ 200/201", s in (200, 201), s)
        pend = pg1(f"SELECT count(*) FROM \"RuleActionOutbox\" WHERE \"logEntryId\"='{eid}' AND status='PENDING';")
        check("al sellar: 2 órdenes PENDING en el outbox", pend == "2", pend)

        # === (3) WORKER materializa ============================================
        s, r = call("POST", "/rule-actions/run", atok, {})
        check("worker run ⇒ 200/201", s in (200, 201), f"{s} {r}")
        exc = exceptions_of(atok, eid)
        rexc = by_rule(exc["items"], "r_exc")
        rinc = by_rule(exc["items"], "r_inc")
        check("raiseException ⇒ excepción triggerKind=RULE", rexc and rexc["triggerKind"] == "RULE", rexc and rexc.get("triggerKind"))
        check("excepción de regla SIN campo (fieldKey null)", rexc and rexc["fieldKey"] is None, rexc and rexc.get("fieldKey"))
        check("excepción de regla: thresholdType=warning", rexc and rexc["thresholdType"] == "warning", rexc and rexc.get("thresholdType"))
        check("excepción de regla: muestra el mensaje en detail", rexc and rexc["detail"] == "La entrada supera 100 t", rexc and rexc.get("detail"))
        check("raiseException ⇒ status OPEN (sin incidencia)", rexc and rexc["status"] == "OPEN" and rexc["incidentId"] is None, rexc and rexc.get("status"))

        check("openIncident ⇒ excepción CONVERTED + incidentId", rinc and rinc["status"] == "CONVERTED" and rinc["incidentId"], rinc and rinc.get("status"))
        inc_id = rinc["incidentId"] if rinc else None
        if inc_id:
            incident_ids.append(inc_id)
            inc = call("GET", f"/incidents/{inc_id}", atok)[1]
            check("incidencia automática con originType=RULE", inc.get("originType") == "RULE", inc.get("originType"))
            check("incidencia con severidad/título del default de la regla", inc.get("severity") == 4, inc.get("severity"))
            link_n = pg1(f"SELECT count(*) FROM \"IncidentExceptionLink\" WHERE \"incidentId\"='{inc_id}';")
            check("link incidencia↔excepción creado", link_n == "1", link_n)

        # === (4) IDEMPOTENCIA ==================================================
        call("POST", "/rule-actions/run", atok, {})  # vuelve a barrer (no debería haber PENDING)
        exc2 = exceptions_of(atok, eid)
        check("re-correr el worker NO duplica (siguen 2 excepciones)", exc2["total"] == 2, exc2["total"])
        done = pg1(f"SELECT count(*) FROM \"RuleActionOutbox\" WHERE \"logEntryId\"='{eid}' AND status='DONE';")
        check("ambas órdenes quedaron DONE", done == "2", done)
        inc_n = pg1(f"SELECT count(*) FROM \"Incident\" WHERE \"originType\"='RULE' AND \"originLogEntryId\"='{eid}';")
        check("una sola incidencia (no se duplica al re-correr)", inc_n == "1", inc_n)

        # === (5) GATE 403 =====================================================
        s, _ = call("POST", "/rule-actions/run", optok, {})
        check("operador (sin incident:create) ⇒ 403 al correr el worker", s == 403, s)

    finally:
        for inc in incident_ids:
            pg(f"DELETE FROM \"Incident\" WHERE id='{inc}';")
        if eid:
            pg(f"DELETE FROM \"RuleActionOutbox\" WHERE \"logEntryId\"='{eid}';")
        if tpl_id:
            ents = pg1(f"SELECT id FROM \"LogEntry\" WHERE \"templateId\"='{tpl_id}';").splitlines()
            for e in [x.strip() for x in ents if x.strip()]:
                pg(f"DELETE FROM \"LogEntryException\" WHERE \"logEntryId\"='{e}';")
                pg(f"DELETE FROM \"RuleActionOutbox\" WHERE \"logEntryId\"='{e}';")
                pg(f"DELETE FROM \"LogEntry\" WHERE id='{e}';")
            pg(f"DELETE FROM \"Template\" WHERE id='{tpl_id}';")
            left = pg1(f"SELECT count(*) FROM \"LogEntry\" WHERE \"templateId\"='{tpl_id}';")
            check("limpieza: 0 entradas de la plantilla de prueba", left == "0", left)

    print(f"\n=== {len(OK)} ok / {len(FAIL)} fail ===")
    if FAIL:
        for f in FAIL:
            print("  FAIL " + f)
        sys.exit(1)


if __name__ == "__main__":
    main()
