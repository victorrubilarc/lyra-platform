#!/usr/bin/env python3
"""Smoke de DOTACIÓN del permiso (OT — S1).

Verifica el ciclo completo de la dotación vía API (server-authoritative):
 A) Catálogo: GET /roster-roles → 3 roles OSHA sembrados (incl. supervisor de entrada).
    Empresa contratista (?create=true); persona PROPIA (fullName "Apellido, Nombre");
    persona CONTRATISTA sin empresa → 400; con empresa → 2xx; filtro ?kind=CONTRACTOR;
    gate: operador (sin worker:manage) GET /persons → 403.
 B) Tipo con rosterEnabled (?create=true) → 2xx + rosterEnabled true; crear OT del tipo;
    GET /roster → enabled true, workers [].
 C) Gobierno 2 (el núcleo): tras aprobar → planificar → 1 actividad → autorizar_plan →
    plan_aprobado → preparar → en_preparacion:
      - operador POST /roster → 403 (workorder:roster:manage).
      - agregar supervisor → 2xx (len 1); duplicado mismo rol → 400; agregar ejecutante →
        len 2; quitar ejecutante → len 1.
      - GATE: revisar_checklists (→ autorizar el permiso) SIN dotación confirmada → 400.
      - confirmar SIN contraseña → 400; con contraseña MALA → 401; con contraseña → 2xx
        (rosterConfirmedAt set, firmada).
      - CURAR tras confirmar: agregar ejecutante → AUTO-LIMPIEZA (confirmedAt null) →
        revisar_checklists → 400 de nuevo → re-confirmar → revisar_checklists → checklists_ok.
 D) Retrocompatibilidad: OT de un tipo SIN dotación → GET /roster enabled false; POST
    /roster → 400 ("no gestiona dotación").

Crea y LIMPIA por marcadores (psql). API :3000. Clave demo Demo!Pass2026.
Requiere `pnpm db:seed` + Redis FLUSHALL previos (permisos nuevos worker:manage / workorder:roster:manage)."""
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
PG = ["docker", "exec", "lyra-watchlog-dev-postgres-1", "psql", "-U", "watchlog", "-d", "watchlog", "-t", "-A"]
OK, FAIL = [], []

TYPE_KEY = "smoke-dot-tipo"
NOROSTER_TYPE_KEY = "smoke-dot-noroster"
WO_TITLE = "OT Smoke Dotación — permiso de prueba"
WO2_TITLE = "OT Smoke Dotación — sin dotación"
COMPANY_KEY = "smoke-dot-empresa"
PERSON_LAST = "SmokeDotApellido"  # marcador para limpieza


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
    return r.get("accessToken") if s == 200 and isinstance(r, dict) else None


def sql(q):
    return subprocess.run(PG + ["-c", q], capture_output=True, text=True).stdout.strip()


def check(name, cond, detail=""):
    (OK if cond else FAIL).append(name)
    print(("  ok  " if cond else "FAIL ") + name + (f"   [{detail}]" if detail else ""))


def cleanup():
    for t in (WO_TITLE, WO2_TITLE):
        sql(f"DELETE FROM \"WorkActivity\" WHERE \"workOrderId\" IN (SELECT id FROM \"WorkOrder\" WHERE title = '{t}');")
        sql(f"DELETE FROM \"WorkOrder\" WHERE title = '{t}';")  # cascada WorkOrderWorker
    sql(f"DELETE FROM \"Person\" WHERE \"lastName\" = '{PERSON_LAST}';")
    sql(f"DELETE FROM \"ContractorCompany\" WHERE key = '{COMPANY_KEY}';")
    sql("DELETE FROM \"FolioCounter\" WHERE \"sequenceKey\" LIKE 'workorder|type:' || (SELECT id FROM \"WorkOrderType\" WHERE key = '" + TYPE_KEY + "') || '%';")
    sql(f"DELETE FROM \"WorkOrderType\" WHERE key IN ('{TYPE_KEY}', '{NOROSTER_TYPE_KEY}');")


def main():
    admin = login(ADMIN)
    operador = login(OPERADOR)
    if not admin:
        print("no admin token"); sys.exit(1)
    cleanup()
    node = sql("SELECT id FROM \"OrgNode\" WHERE \"deletedAt\" IS NULL ORDER BY \"createdAt\" LIMIT 1;")

    # === A) Catálogo de dotación ============================================
    s, roles = call("GET", "/roster-roles", admin)
    sup = next((r for r in roles if r.get("isSupervisorRole")), None) if isinstance(roles, list) else None
    ent = next((r for r in roles if r.get("key") == "authorized_entrant"), None) if isinstance(roles, list) else None
    check("GET /roster-roles → 3 roles OSHA (incl. supervisor de entrada + ejecutante)",
          s == 200 and isinstance(roles, list) and len(roles) >= 3 and sup is not None and ent is not None, str(s))

    s, comp = call("POST", "/contractor-companies?create=true", admin,
                   {"key": COMPANY_KEY, "name": "Contratista Smoke SpA", "taxId": "76.111.222-3", "accreditationStatus": "ACCREDITED", "accreditationGrade": "A"})
    company_id = comp.get("id") if isinstance(comp, dict) else None
    check("crear empresa contratista → 2xx", s in (200, 201) and company_id, str(s))

    s, p1 = call("POST", "/persons", admin, {"kind": "INTERNAL", "firstName": "Juan", "lastName": PERSON_LAST})
    p1_id = p1.get("id") if isinstance(p1, dict) else None
    check("crear persona PROPIA → 2xx + fullName 'Apellido, Nombre'",
          s in (200, 201) and isinstance(p1, dict) and p1.get("fullName") == f"{PERSON_LAST}, Juan", str(s))

    s, _ = call("POST", "/persons", admin, {"kind": "CONTRACTOR", "firstName": "Pedro", "lastName": PERSON_LAST})
    check("persona CONTRATISTA sin empresa → 400", s == 400, str(s))

    s, p2 = call("POST", "/persons", admin, {"kind": "CONTRACTOR", "firstName": "Pedro", "lastName": PERSON_LAST, "contractorCompanyId": company_id})
    p2_id = p2.get("id") if isinstance(p2, dict) else None
    check("persona CONTRATISTA con empresa → 2xx + empresa", s in (200, 201) and isinstance(p2, dict) and p2.get("contractorCompanyName") == "Contratista Smoke SpA", str(s))

    s, lst = call("GET", "/persons?kind=CONTRATISTA".replace("CONTRATISTA", "CONTRACTOR"), admin)
    ids = [x.get("id") for x in lst] if isinstance(lst, list) else []
    check("filtro ?kind=CONTRACTOR → incluye al contratista, excluye al propio", s == 200 and p2_id in ids and p1_id not in ids, str(s))

    if operador:
        s, _ = call("GET", "/persons", operador)
        check("operador GET /persons → 403 (worker:manage)", s == 403, str(s))

    # === B) Tipo con dotación + OT ==========================================
    s, ty = call("POST", "/work-orders/types?create=true", admin,
                 {"key": TYPE_KEY, "name": "Tipo Dotación Smoke", "requiresPtwDefault": True, "rosterEnabled": True, "criticalityDefault": 4, "sortOrder": 99})
    tid = ty.get("id") if isinstance(ty, dict) else None
    check("crear tipo con rosterEnabled → 2xx + rosterEnabled true", s in (200, 201) and isinstance(ty, dict) and ty.get("rosterEnabled") is True, str(s))

    s, wo = call("POST", "/work-orders", admin, {"title": WO_TITLE, "typeId": tid, "criticality": 4, "requiresPtw": True, "orgNodeId": node})
    wid = wo.get("id") if isinstance(wo, dict) else None
    check("crear OT del tipo con dotación → 2xx", s in (200, 201) and wid, str(s))

    s, rost = call("GET", f"/work-orders/{wid}/roster", admin)
    check("GET /roster → enabled true, workers []", s == 200 and isinstance(rost, dict) and rost.get("enabled") is True and rost.get("workers") == [], str(s))

    # === C) Llevar la OT a EN_PREPARACION y probar el Gobierno 2 ============
    call("POST", f"/work-orders/{wid}/transitions", admin, {"transitionKey": "enviar"})
    s, _ = call("POST", f"/work-orders/{wid}/transitions", admin, {"transitionKey": "aprobar", "password": PASS})
    call("POST", f"/work-orders/{wid}/transitions", admin, {"transitionKey": "planificar"})
    call("POST", f"/work-orders/{wid}/activities", admin, {"title": "Tarea del permiso", "mandatory": True})
    call("POST", f"/work-orders/{wid}/transitions", admin, {"transitionKey": "autorizar_plan"})
    s, prep = call("POST", f"/work-orders/{wid}/transitions", admin, {"transitionKey": "preparar"})
    check("OT llevada a en_preparacion (2xx)", s == 200 and isinstance(prep, dict) and prep.get("currentStateKey") == "en_preparacion", str(s))

    sup_id, ent_id = sup.get("id"), ent.get("id")
    if operador:
        s, _ = call("POST", f"/work-orders/{wid}/roster", operador, {"personId": p1_id, "rosterRoleId": sup_id})
        check("operador POST /roster → 403 (workorder:roster:manage)", s == 403, str(s))

    s, r = call("POST", f"/work-orders/{wid}/roster", admin, {"personId": p1_id, "rosterRoleId": sup_id})
    check("agregar supervisor de entrada → 2xx (len 1)", s in (200, 201) and isinstance(r, dict) and len(r.get("workers", [])) == 1, str(s))

    s, _ = call("POST", f"/work-orders/{wid}/roster", admin, {"personId": p1_id, "rosterRoleId": sup_id})
    check("agregar la MISMA persona+rol → 400 (duplicado)", s == 400, str(s))

    s, r = call("POST", f"/work-orders/{wid}/roster", admin, {"personId": p2_id, "rosterRoleId": ent_id})
    worker_ent = next((w for w in r.get("workers", []) if w.get("personId") == p2_id), None) if isinstance(r, dict) else None
    check("agregar ejecutante (contratista) → 2xx (len 2)", s in (200, 201) and isinstance(r, dict) and len(r.get("workers", [])) == 2, str(s))
    # semáforo S1: todos 'ok'
    check("semáforo por persona = 'ok' en S1 (sin causas rojas)", worker_ent is not None and worker_ent.get("status", {}).get("level") == "ok")

    s, r = call("POST", f"/work-orders/{wid}/roster/{worker_ent['id']}/remove", admin, {"reason": "prueba"})
    check("quitar ejecutante (soft) → 2xx (len 1)", s == 200 and isinstance(r, dict) and len(r.get("workers", [])) == 1, str(s))

    # GATE: no se puede autorizar el permiso sin dotación confirmada. Se distingue del gate
    # de checklists por el MENSAJE (la dotación se valida primero).
    s, e = call("POST", f"/work-orders/{wid}/transitions", admin, {"transitionKey": "revisar_checklists", "password": PASS})
    msg = (e or {}).get("message", "") if isinstance(e, dict) else ""
    check("GATE dotación: autorizar permiso SIN dotación confirmada → 400 (mensaje de dotación)", s == 400 and "dotaci" in msg.lower(), f"{s} {msg[:60]}")

    # Confirmación FIRMADA (Part 11).
    s, _ = call("POST", f"/work-orders/{wid}/roster/confirm", admin, {})
    check("confirmar dotación SIN contraseña → 400 (firma requerida)", s == 400, str(s))
    s, _ = call("POST", f"/work-orders/{wid}/roster/confirm", admin, {"password": "incorrecta"})
    check("confirmar dotación con contraseña MALA → 401", s == 401, str(s))
    s, r = call("POST", f"/work-orders/{wid}/roster/confirm", admin, {"password": PASS})
    check("confirmar dotación con contraseña → 2xx + firmada (confirmedAt set)", s == 200 and isinstance(r, dict) and r.get("confirmedAt") and r.get("confirmedByName"), str(s))

    # AUTO-LIMPIEZA al curar tras confirmar.
    s, r = call("POST", f"/work-orders/{wid}/roster", admin, {"personId": p2_id, "rosterRoleId": ent_id})
    check("agregar persona tras confirmar → AUTO-LIMPIEZA (confirmedAt null)", s in (200, 201) and isinstance(r, dict) and r.get("confirmedAt") is None, str(s))

    s, e = call("POST", f"/work-orders/{wid}/transitions", admin, {"transitionKey": "revisar_checklists", "password": PASS})
    msg = (e or {}).get("message", "") if isinstance(e, dict) else ""
    check("GATE dotación de nuevo tras curar → 400 (mensaje de dotación)", s == 400 and "dotaci" in msg.lower(), f"{s} {msg[:60]}")

    # Re-confirmar la dotación ⇒ el gate de DOTACIÓN deja de bloquear y avanzamos al de
    # CHECKLISTS (mensaje distinto: "verificación/aprobar"). Esto prueba que el gate de
    # dotación pasa (la aprobación completa del checklist se cubre en smoke-workorders).
    s, _ = call("POST", f"/work-orders/{wid}/roster/confirm", admin, {"password": PASS})
    s, e = call("POST", f"/work-orders/{wid}/transitions", admin, {"transitionKey": "revisar_checklists", "password": PASS})
    msg2 = (e or {}).get("message", "") if isinstance(e, dict) else ""
    passed_roster_gate = s == 200 or ("dotaci" not in msg2.lower() and ("verificaci" in msg2.lower() or "aprobar" in msg2.lower()))
    check("dotación re-confirmada ⇒ gate de dotación deja de bloquear (avanza al de checklists)", passed_roster_gate, f"{s} {msg2[:60]}")

    # === D) Retrocompatibilidad: tipo SIN dotación ==========================
    call("POST", "/work-orders/types?create=true", admin, {"key": NOROSTER_TYPE_KEY, "name": "Tipo Sin Dotación Smoke", "criticalityDefault": 2, "sortOrder": 98})
    s, ty2 = call("GET", "/work-orders/types", admin)
    tid2 = next((t.get("id") for t in ty2 if t.get("key") == NOROSTER_TYPE_KEY), None) if isinstance(ty2, list) else None
    s, wo2 = call("POST", "/work-orders", admin, {"title": WO2_TITLE, "typeId": tid2, "criticality": 2, "orgNodeId": node})
    wid2 = wo2.get("id") if isinstance(wo2, dict) else None
    s, r = call("GET", f"/work-orders/{wid2}/roster", admin)
    check("OT de tipo SIN dotación → GET /roster enabled false", s == 200 and isinstance(r, dict) and r.get("enabled") is False, str(s))
    s, _ = call("POST", f"/work-orders/{wid2}/roster", admin, {"personId": p1_id, "rosterRoleId": sup_id})
    check("POST /roster en tipo sin dotación → 400 (no gestiona dotación)", s == 400, str(s))

    cleanup()
    print(f"\n== Dotación S1: {len(OK)} ok, {len(FAIL)} fail ==")
    if FAIL:
        for f in FAIL:
            print("  FAIL " + f)
        sys.exit(1)


if __name__ == "__main__":
    main()
