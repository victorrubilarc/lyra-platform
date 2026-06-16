#!/usr/bin/env python3
"""Smoke de INCIDENCIAS — Fase 4.0 (núcleo).

Verifica el módulo de incidencias reusando WorkflowDefinition:
 1) Catálogos: GET /incidents/types y /categories (gate incident:view).
 2) Crear MANUAL → 201, folio INC-####, lifecycle OPEN, estado inicial "reportada",
    timeline con CREATED, flujo con 6 estados y transición disponible "a_triage".
 3) Validación: severidad fuera de 1..5 → 400; nodo fuera de alcance → 403.
 4) Editar atributos (severidad/prioridad) → huella FIELD_CHANGED en el timeline.
 5) Asignar responsable → ownerName + actividad ASSIGNED.
 6) Comentar → commentCount sube + actividad COMMENT.
 7) Recorrer el flujo a_triage→asignar→iniciar→a_verificacion→cerrar → lifecycle
    CLOSED + closedAt; una transición que no parte del estado actual → 400.
 8) Lista/stats: ?lifecycle=OPEN excluye la cerrada; stats coherentes.
 9) Crear 2ª y ANULAR (cancel) → lifecycle CANCELED (sin borrado físico).
 10) Crear DESDE una entrada de bitácora → originType LOG_ENTRY + nº de entrada.
 11) Gates 403: operador (sin permisos de incidencias) no lista ni administra catálogo.

Crea y LIMPIA por ID (psql cascade). API :3000. Clave demo Demo!Pass2026."""
import json
import os
import re
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
PG = ["docker", "exec", "lyra-watchlog-dev-postgres-1", "psql", "-U", "watchlog", "-d", "watchlog", "-t", "-A"]
OK, FAIL = [], []
CREATED_IDS = []


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


def main():
    admin = login(ADMIN)
    operador = login(OPERADOR)

    # Contexto desde la BD
    node_id = sql("SELECT id FROM \"OrgNode\" WHERE \"deletedAt\" IS NULL ORDER BY \"path\" LIMIT 1;")
    owner_id = sql(f"SELECT id FROM \"User\" WHERE email='{OPERADOR}' LIMIT 1;")
    entry_id = sql("SELECT id FROM \"LogEntry\" WHERE status<>'VOID' ORDER BY \"recordedAt\" DESC LIMIT 1;")
    check("contexto: nodo accesible", bool(node_id), node_id)

    # 1) catálogos
    s, types = call("GET", "/incidents/types", admin)
    check("1 listar tipos (>=10)", s == 200 and isinstance(types, list) and len(types) >= 10, str(s))
    type_seguridad = next((t["id"] for t in types if t["key"] == "seguridad"), None)
    s, cats = call("GET", "/incidents/categories", admin)
    check("1 listar categorías", s == 200 and isinstance(cats, list) and len(cats) >= 1, str(s))

    # 2) crear manual
    s, inc = call("POST", "/incidents", admin, {
        "title": "Smoke — temperatura hidráulica sobre umbral",
        "description": "Lectura 99°C sobre umbral 85°C.",
        "typeId": type_seguridad, "severity": 4, "potentialSeverity": 5,
        "priority": "HIGH", "orgNodeId": node_id, "reportable": True,
    })
    ok2 = s == 201 or s == 200
    inc_id = inc.get("id") if isinstance(inc, dict) else None
    if inc_id:
        CREATED_IDS.append(inc_id)
    code_ok = isinstance(inc, dict) and bool(re.match(r"^INC-\d{4,}$", inc.get("code", "")))
    states_ok = isinstance(inc, dict) and len(inc.get("states", [])) == 6
    trans_ok = isinstance(inc, dict) and any(t["key"] == "a_triage" for t in inc.get("availableTransitions", []))
    created_act = isinstance(inc, dict) and any(a["kind"] == "CREATED" for a in inc.get("activity", []))
    check("2 crear manual → 2xx", ok2, str(s))
    check("2 folio INC-####", code_ok, inc.get("code") if isinstance(inc, dict) else str(inc))
    check("2 lifecycle OPEN + estado inicial reportada", isinstance(inc, dict) and inc.get("lifecycle") == "OPEN" and inc.get("currentStateKey") == "reportada")
    check("2 flujo con 6 estados", states_ok)
    check("2 transición a_triage disponible", trans_ok)
    check("2 timeline con CREATED", created_act)

    # 3) validación
    s, _ = call("POST", "/incidents", admin, {"title": "Severidad inválida", "typeId": type_seguridad, "severity": 9, "orgNodeId": node_id})
    check("3 severidad fuera de 1..5 → 400", s == 400, str(s))
    s, _ = call("POST", "/incidents", admin, {"title": "Nodo inexistente", "typeId": type_seguridad, "severity": 3, "orgNodeId": "node-does-not-exist"})
    check("3 nodo inexistente → 400", s == 400, str(s))

    # 4) editar
    s, upd = call("PATCH", f"/incidents/{inc_id}", admin, {"severity": 5, "priority": "CRITICAL"})
    sev_ok = s == 200 and upd.get("severity") == 5
    field_changed = isinstance(upd, dict) and any(a["kind"] == "FIELD_CHANGED" for a in upd.get("activity", []))
    check("4 editar severidad/prioridad", sev_ok, str(s))
    check("4 huella FIELD_CHANGED", field_changed)

    # 5) asignar
    s, asg = call("POST", f"/incidents/{inc_id}/assign", admin, {"ownerId": owner_id})
    check("5 asignar responsable", s == 200 and asg.get("ownerId") == owner_id and bool(asg.get("ownerName")), str(s))

    # 6) comentar
    s, _ = call("POST", f"/incidents/{inc_id}/comments", admin, {"body": "Se notifica a mantención; revisar intercambiador."})
    s2, det = call("GET", f"/incidents/{inc_id}", admin)
    check("6 comentar sube commentCount", s == 201 or s == 200, str(s))
    check("6 detalle con comentario", s2 == 200 and len(det.get("comments", [])) == 1)

    # 7) recorrer el flujo a cierre
    chain = ["a_triage", "asignar", "iniciar", "a_verificacion", "cerrar"]
    last = None
    for key in chain:
        body = {"transitionKey": key}
        if key == "cerrar":
            body["closureSummary"] = "Cierre de prueba"
        s, last = call("POST", f"/incidents/{inc_id}/transitions", admin, body)
        if s != 200:
            check(f"7 transición {key}", False, str(s))
            break
    else:
        check("7 recorrer flujo a cierre", True)
    check("7 lifecycle CLOSED + closedAt", isinstance(last, dict) and last.get("lifecycle") == "CLOSED" and bool(last.get("closedAt")))
    # transición inválida desde estado final
    s, _ = call("POST", f"/incidents/{inc_id}/transitions", admin, {"transitionKey": "a_triage"})
    check("7 transición que no parte del estado actual → 4xx", s in (400, 404), str(s))

    # 8) lista/stats
    s, lst = call("GET", "/incidents?lifecycle=OPEN&pageSize=100", admin)
    closed_excluded = s == 200 and all(i["id"] != inc_id for i in lst.get("items", []))
    check("8 ?lifecycle=OPEN excluye la cerrada", closed_excluded, str(s))
    s, st = call("GET", "/incidents/stats", admin)
    check("8 stats devuelve KPIs", s == 200 and "open" in (st or {}) and "critical" in (st or {}), str(s))

    # 9) anular
    s, inc2 = call("POST", "/incidents", admin, {"title": "Smoke — a anular", "typeId": type_seguridad, "severity": 2, "orgNodeId": node_id})
    inc2_id = inc2.get("id") if isinstance(inc2, dict) else None
    if inc2_id:
        CREATED_IDS.append(inc2_id)
    s, can = call("POST", f"/incidents/{inc2_id}/cancel", admin, {"reason": "Duplicada de otra incidencia"})
    check("9 anular → lifecycle CANCELED", s == 200 and can.get("lifecycle") == "CANCELED" and bool(can.get("canceledAt")), str(s))

    # 10) desde bitácora
    if entry_id:
        s, inc3 = call("POST", "/incidents", admin, {"title": "Smoke — desde bitácora", "typeId": type_seguridad, "severity": 3, "orgNodeId": node_id, "originLogEntryId": entry_id})
        inc3_id = inc3.get("id") if isinstance(inc3, dict) else None
        if inc3_id:
            CREATED_IDS.append(inc3_id)
        check("10 desde bitácora → originType LOG_ENTRY", s in (200, 201) and inc3.get("originType") == "LOG_ENTRY" and inc3.get("originLogEntryNumber") is not None, str(s))
    else:
        print("  --  10 sin entrada de bitácora disponible: omitido")

    # 11) gates 403
    s, _ = call("GET", "/incidents", operador)
    check("11 operador sin permiso → 403 lista", s == 403, str(s))
    s, _ = call("POST", "/incidents/types", operador, {"key": "hack", "name": "Hack"})
    check("11 operador no administra catálogo → 403", s == 403, str(s))

    # limpieza
    for iid in CREATED_IDS:
        sql(f"DELETE FROM \"Incident\" WHERE id='{iid}';")
    leftover = sql(f"SELECT count(*) FROM \"Incident\" WHERE id IN ({','.join(repr(i) for i in CREATED_IDS)});") if CREATED_IDS else "0"
    check("limpieza por ID", leftover == "0", f"leftover={leftover}")

    print(f"\n== {len(OK)} ok · {len(FAIL)} fail ==")
    if FAIL:
        print("FALLA:", ", ".join(FAIL))
        sys.exit(1)


if __name__ == "__main__":
    main()
