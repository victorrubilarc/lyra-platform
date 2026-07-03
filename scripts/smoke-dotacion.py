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
 E) S2: competencias con vigencia (verde/ámbar/rojo), restricción (Eje B), override firmado
    por persona, avisos worker.competency.expiring/.expired (Bloque N).
 F) S3: GATE de acreditación de EMPRESA. Tipo con requireCompanyAccreditation ⇒ empresa NONE
    → contratista ROJO (COMPANY_NOT_ACCREDITED) + gate bloquea; acreditar con vigencia → verde;
    condicional/por-vencer → ámbar; vencida → rojo; override firmado por persona desbloquea;
    avisos contractor.accreditation.expired/.expiring (Bloque N).

Crea y LIMPIA por marcadores (psql). API :3000. Clave demo Demo!Pass2026.
S3 NO agrega permisos (worker:manage gobierna empresas; workordercatalog:manage la config): sin
FLUSHALL. Requiere `pnpm db:seed` para las plantillas de correo nuevas (contractor.accreditation.*)."""
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

TYPE_KEY = "smoke-dot-tipo"
NOROSTER_TYPE_KEY = "smoke-dot-noroster"
S2_TYPE_KEY = "smoke-dot-s2"  # tipo NO-PTW, aislado de las reglas sembradas
S3_TYPE_KEY = "smoke-dot-s3"  # tipo NO-PTW con requireCompanyAccreditation (gate de empresa)
WO_TITLE = "OT Smoke Dotación — permiso de prueba"
WO2_TITLE = "OT Smoke Dotación — sin dotación"
WO3_TITLE = "OT Smoke Dotación — competencias S2"
WO4_TITLE = "OT Smoke Dotación — acreditación S3"
COMPANY_KEY = "smoke-dot-empresa"
COMPANY2_KEY = "smoke-dot-empresa2"  # empresa del gate de acreditación (S3)
ROLE_KEY = "smoke-dot-rol"  # rol de dotación creado por CRUD (UX enterprise)
COMP_KEY = "smoke-dot-comp"  # tipo de competencia S2
RULE_NAME = "Regla Smoke Competencia S2"
PERSON_LAST = "SmokeDotApellido"  # marcador para limpieza


def iso(days):
    # Formato UTC con sufijo Z (z.string().datetime() rechaza el offset +00:00).
    return (datetime.now(timezone.utc) + timedelta(days=days)).replace(tzinfo=None).isoformat(timespec="milliseconds") + "Z"


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
    titles = (WO_TITLE, WO2_TITLE, WO3_TITLE, WO4_TITLE)
    intitles = ", ".join(f"'{t}'" for t in titles)
    # Avisos del Bloque N emitidos para las OT del smoke (por payload workOrderId).
    sql(f"DELETE FROM \"NotificationOutbox\" o USING \"NotificationEvent\" e WHERE o.\"eventId\"=e.id AND e.payload->>'workOrderId' IN (SELECT id FROM \"WorkOrder\" WHERE title IN ({intitles}));")
    sql(f"DELETE FROM \"NotificationEvent\" WHERE payload->>'workOrderId' IN (SELECT id FROM \"WorkOrder\" WHERE title IN ({intitles}));")
    for t in titles:
        sql(f"DELETE FROM \"WorkActivity\" WHERE \"workOrderId\" IN (SELECT id FROM \"WorkOrder\" WHERE title = '{t}');")
        sql(f"DELETE FROM \"WorkOrder\" WHERE title = '{t}';")  # cascada WorkOrderWorker
    # Regla de competencia (referencia el tipo con Restrict) ANTES que el tipo de competencia.
    sql(f"DELETE FROM \"WorkOrderCompetencyRule\" WHERE name = '{RULE_NAME}';")
    sql(f"DELETE FROM \"Person\" WHERE \"lastName\" = '{PERSON_LAST}';")  # cascada PersonCompetency/Restriction
    sql(f"DELETE FROM \"CompetencyType\" WHERE key = '{COMP_KEY}';")
    sql(f"DELETE FROM \"ContractorCompany\" WHERE key IN ('{COMPANY_KEY}', '{COMPANY2_KEY}');")
    sql(f"DELETE FROM \"RosterRole\" WHERE key = '{ROLE_KEY}';")
    sql("DELETE FROM \"FolioCounter\" WHERE \"sequenceKey\" LIKE 'workorder|type:' || (SELECT id FROM \"WorkOrderType\" WHERE key = '" + TYPE_KEY + "') || '%';")
    sql(f"DELETE FROM \"WorkOrderType\" WHERE key IN ('{TYPE_KEY}', '{NOROSTER_TYPE_KEY}', '{S2_TYPE_KEY}', '{S3_TYPE_KEY}');")


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
                   {"key": COMPANY_KEY, "name": "Contratista Smoke SpA", "taxId": "76.111.222-8", "accreditationStatus": "ACCREDITED", "accreditationGrade": "A"})
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

    # Otorgar las competencias que las reglas SEMBRADAS exigen (inducción a todo PTW;
    # examen preocupacional al ejecutante de alto riesgo) para que el semáforo quede VERDE
    # en la sección C. Prueba de paso: competencia vigente = verde. (S2)
    s, ctypes = call("GET", "/competency-types", admin)
    ind = next((c for c in ctypes if c.get("key") == "induccion_faena"), None) if isinstance(ctypes, list) else None
    exa = next((c for c in ctypes if c.get("key") == "examen_preocupacional"), None) if isinstance(ctypes, list) else None
    check("GET /competency-types → catálogo sembrado (inducción + examen)", s == 200 and ind is not None and exa is not None, str(s))
    if ind and exa and p1_id and p2_id:
        for pid, cid in ((p1_id, ind["id"]), (p2_id, ind["id"]), (p2_id, exa["id"])):
            call("POST", f"/persons/{pid}/competencies", admin, {"competencyTypeId": cid, "issuedAt": iso(-10), "expiresAt": iso(180), "markVerified": True})
        s, comps = call("GET", f"/persons/{p1_id}/competencies", admin)
        check("POST /persons/:id/competencies → competencia registrada y vigente",
              s == 200 and isinstance(comps, list) and len(comps) == 1 and comps[0].get("validity") == "valid", str(s))

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
    # semáforo S2: 'ok' porque el ejecutante tiene inducción + examen vigentes.
    check("semáforo por persona = 'ok' (competencias requeridas vigentes)", worker_ent is not None and worker_ent.get("status", {}).get("level") == "ok",
          str(worker_ent.get("status") if worker_ent else None))

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

    # === E) S2: competencias con vigencia, causas rojas, override, avisos ====
    # Tipo de competencia + regla (endpoints S2). Regla acotada a un tipo NO-PTW criticidad
    # baja ⇒ AISLADA de las reglas sembradas (solo esta regla aplica a las OT de ese tipo).
    s, sct = call("POST", "/competency-types", admin, {"key": COMP_KEY, "name": "Competencia Smoke S2", "category": "CERTIFICATION", "defaultValidityDays": 365, "warningLeadDays": 30})
    comp_id = sct.get("id") if isinstance(sct, dict) else None
    check("POST /competency-types → crear tipo de competencia (2xx)", s in (200, 201) and comp_id, str(s))
    call("POST", "/work-orders/types?create=true", admin, {"key": S2_TYPE_KEY, "name": "Tipo Dotación S2 Smoke", "requiresPtwDefault": False, "rosterEnabled": True, "criticalityDefault": 2, "sortOrder": 97})
    s, tylist = call("GET", "/work-orders/types", admin)
    tid_s2 = next((t.get("id") for t in tylist if t.get("key") == S2_TYPE_KEY), None) if isinstance(tylist, list) else None
    s, srule = call("POST", "/work-order-competency-rules", admin, {"name": RULE_NAME, "competencyTypeId": comp_id, "mandatory": True, "appliesToTypeIds": [tid_s2]})
    check("POST /work-order-competency-rules → crear regla mandatoria (2xx)", s in (200, 201) and isinstance(srule, dict) and srule.get("id"), str(s))

    # OT del tipo S2 → en_preparacion.
    s, wo3 = call("POST", "/work-orders", admin, {"title": WO3_TITLE, "typeId": tid_s2, "criticality": 2, "requiresPtw": False, "orgNodeId": node})
    wid3 = wo3.get("id") if isinstance(wo3, dict) else None
    call("POST", f"/work-orders/{wid3}/transitions", admin, {"transitionKey": "enviar"})
    call("POST", f"/work-orders/{wid3}/transitions", admin, {"transitionKey": "aprobar", "password": PASS})
    call("POST", f"/work-orders/{wid3}/transitions", admin, {"transitionKey": "planificar"})
    call("POST", f"/work-orders/{wid3}/activities", admin, {"title": "Tarea S2", "mandatory": True})
    call("POST", f"/work-orders/{wid3}/transitions", admin, {"transitionKey": "autorizar_plan"})
    call("POST", f"/work-orders/{wid3}/transitions", admin, {"transitionKey": "preparar"})

    s, p3 = call("POST", "/persons", admin, {"kind": "INTERNAL", "firstName": "Nadia", "lastName": PERSON_LAST})
    p3_id = p3.get("id") if isinstance(p3, dict) else None

    def worker_of(rost_dto, pid):
        return next((w for w in rost_dto.get("workers", []) if w.get("personId") == pid), None) if isinstance(rost_dto, dict) else None

    # E2. p1 SIN la competencia smoke → ROJO (COMPETENCY_MISSING).
    s, r = call("POST", f"/work-orders/{wid3}/roster", admin, {"personId": p1_id, "rosterRoleId": ent_id})
    w = worker_of(r, p1_id)
    check("persona sin competencia requerida → ROJO (COMPETENCY_MISSING)",
          w is not None and w["status"]["level"] == "blocked" and "COMPETENCY_MISSING" in w["status"]["reasons"], str(w and w["status"]))

    # E3. confirmar con persona en ROJO SIN override → 400 (impedimentos).
    s, e = call("POST", f"/work-orders/{wid3}/roster/confirm", admin, {"password": PASS})
    msg = (e or {}).get("message", "") if isinstance(e, dict) else ""
    check("confirmar con persona en ROJO sin override → 400", s == 400 and "impediment" in msg.lower(), f"{s} {msg[:50]}")

    # E4. otorgar competencia VIGENTE → VERDE.
    call("POST", f"/persons/{p1_id}/competencies", admin, {"competencyTypeId": comp_id, "issuedAt": iso(-10), "expiresAt": iso(180), "markVerified": True})
    s, r = call("GET", f"/work-orders/{wid3}/roster", admin)
    w = worker_of(r, p1_id)
    check("otorgar competencia vigente → VERDE (ok)", w is not None and w["status"]["level"] == "ok", str(w and w["status"]))

    # E5. p3 con competencia VENCIDA → ROJO (COMPETENCY_EXPIRED).
    call("POST", f"/persons/{p3_id}/competencies", admin, {"competencyTypeId": comp_id, "issuedAt": iso(-400), "expiresAt": iso(-5)})
    s, r = call("POST", f"/work-orders/{wid3}/roster", admin, {"personId": p3_id, "rosterRoleId": ent_id})
    w = worker_of(r, p3_id)
    check("competencia VENCIDA → ROJO (COMPETENCY_EXPIRED)",
          w is not None and w["status"]["level"] == "blocked" and "COMPETENCY_EXPIRED" in w["status"]["reasons"], str(w and w["status"]))

    # E6. restricción activa sobre p1 (que estaba verde) → ROJO (RESTRICTION_ACTIVE, Eje B).
    call("POST", f"/persons/{p1_id}/restrictions", admin, {"type": "MEDICAL", "reason": "No apto (smoke)"})
    s, r = call("GET", f"/work-orders/{wid3}/roster", admin)
    w = worker_of(r, p1_id)
    check("restricción activa → ROJO (RESTRICTION_ACTIVE, Eje B ortogonal)",
          w is not None and w["status"]["level"] == "blocked" and "RESTRICTION_ACTIVE" in w["status"]["reasons"], str(w and w["status"]))
    # Quitar la restricción de p1 ⇒ vuelve a verde (solo p3 queda rojo, para override selectivo).
    s, rl = call("GET", f"/persons/{p1_id}/restrictions", admin)
    rid = rl[0]["id"] if isinstance(rl, list) and rl else None
    if rid:
        call("DELETE", f"/persons/{p1_id}/restrictions/{rid}", admin)

    # E7. override firmado POR PERSONA (p3 sigue rojo por vencida): sin override → 400; con → 2xx.
    s, r = call("GET", f"/work-orders/{wid3}/roster", admin)
    w3 = worker_of(r, p3_id)
    s, _ = call("POST", f"/work-orders/{wid3}/roster/confirm", admin, {"password": PASS})
    check("confirmar con override faltante para la persona en rojo → 400", s == 400, str(s))
    s, r = call("POST", f"/work-orders/{wid3}/roster/confirm", admin, {"password": PASS, "overrides": [{"workerId": w3["id"], "reason": "Riesgo aceptado con medida compensatoria (smoke)"}]})
    w3 = worker_of(r, p3_id)
    check("override firmado por persona → confirmar 2xx + override registrado",
          s == 200 and isinstance(r, dict) and r.get("confirmedAt") and w3 and w3.get("override") and (w3["override"] or {}).get("reason"), str(s))

    # E8. avisos de vencimiento (Bloque N): p3 vencida + p1 por vencer, ambas en roster de OT
    # abierta ⇒ POST /notifications/run encola worker.competency.expired / .expiring.
    call("POST", f"/persons/{p1_id}/competencies", admin, {"competencyTypeId": comp_id, "issuedAt": iso(-10), "expiresAt": iso(10)})
    call("POST", "/notifications/run", admin)
    n_exp = sql(f"SELECT count(*) FROM \"NotificationEvent\" WHERE \"eventKey\"='worker.competency.expired' AND payload->>'workOrderId'='{wid3}';")
    check("aviso worker.competency.expired encolado tras /notifications/run", n_exp.isdigit() and int(n_exp) >= 1, n_exp)
    n_soon = sql(f"SELECT count(*) FROM \"NotificationEvent\" WHERE \"eventKey\"='worker.competency.expiring' AND payload->>'workOrderId'='{wid3}';")
    check("aviso worker.competency.expiring encolado tras /notifications/run", n_soon.isdigit() and int(n_soon) >= 1, n_soon)

    # === F) S3: acreditación de EMPRESA contratista como GATE =================
    # Tipo NO-PTW con requireCompanyAccreditation ⇒ el ÚNICO origen de rojo es la empresa
    # (sin reglas de competencia para este tipo). Traza Ley 16.744 art.66 bis + ISN/Avetta.
    s, ty3 = call("POST", "/work-orders/types?create=true", admin,
                  {"key": S3_TYPE_KEY, "name": "Tipo Acreditación S3 Smoke", "requiresPtwDefault": False, "rosterEnabled": True, "requireCompanyAccreditation": True, "criticalityDefault": 2, "sortOrder": 96})
    tid_s3 = ty3.get("id") if isinstance(ty3, dict) else None
    check("crear tipo con requireCompanyAccreditation → 2xx + flag true", s in (200, 201) and isinstance(ty3, dict) and ty3.get("requireCompanyAccreditation") is True, str(s))

    # Empresa SIN acreditar (NONE) + persona contratista suya.
    s, co2 = call("POST", "/contractor-companies?create=true", admin, {"key": COMPANY2_KEY, "name": "Contratista NoAcreditada SpA", "accreditationStatus": "NONE"})
    co2_id = co2.get("id") if isinstance(co2, dict) else None
    s, pco = call("POST", "/persons", admin, {"kind": "CONTRACTOR", "firstName": "Rodrigo", "lastName": PERSON_LAST, "contractorCompanyId": co2_id})
    pco_id = pco.get("id") if isinstance(pco, dict) else None
    check("empresa NONE + persona contratista creadas", co2_id and pco_id, str(s))

    def upd_company(**over):
        # El name es obligatorio en el DTO de upsert; se reenvía en cada actualización.
        call("POST", "/contractor-companies", admin, {"id": co2_id, "name": "Contratista NoAcreditada SpA", **over})

    # OT del tipo S3 → en_preparacion.
    s, wo4 = call("POST", "/work-orders", admin, {"title": WO4_TITLE, "typeId": tid_s3, "criticality": 2, "requiresPtw": False, "orgNodeId": node})
    wid4 = wo4.get("id") if isinstance(wo4, dict) else None
    call("POST", f"/work-orders/{wid4}/transitions", admin, {"transitionKey": "enviar"})
    call("POST", f"/work-orders/{wid4}/transitions", admin, {"transitionKey": "aprobar", "password": PASS})
    call("POST", f"/work-orders/{wid4}/transitions", admin, {"transitionKey": "planificar"})
    call("POST", f"/work-orders/{wid4}/activities", admin, {"title": "Tarea S3", "mandatory": True})
    call("POST", f"/work-orders/{wid4}/transitions", admin, {"transitionKey": "autorizar_plan"})
    call("POST", f"/work-orders/{wid4}/transitions", admin, {"transitionKey": "preparar"})

    # F2. empresa NO acreditada ⇒ persona contratista ROJO (COMPANY_NOT_ACCREDITED).
    s, r = call("POST", f"/work-orders/{wid4}/roster", admin, {"personId": pco_id, "rosterRoleId": ent_id})
    w = worker_of(r, pco_id)
    check("empresa no acreditada (NONE) → contratista ROJO (COMPANY_NOT_ACCREDITED)",
          w is not None and w["status"]["level"] == "blocked" and "COMPANY_NOT_ACCREDITED" in w["status"]["reasons"], str(w and w["status"]))

    # F3. GATE: confirmar con la persona en rojo SIN override → 400.
    s, e = call("POST", f"/work-orders/{wid4}/roster/confirm", admin, {"password": PASS})
    msg = (e or {}).get("message", "") if isinstance(e, dict) else ""
    check("gate empresa: confirmar con empresa no acreditada sin override → 400", s == 400 and "impediment" in msg.lower(), f"{s} {msg[:50]}")

    # F4. acreditar la empresa con vigencia futura → VERDE.
    upd_company(accreditationStatus="ACCREDITED", accreditationGrade="A", accreditedUntil=iso(180))
    s, r = call("GET", f"/work-orders/{wid4}/roster", admin)
    w = worker_of(r, pco_id)
    check("acreditar empresa (vigente) → VERDE (ok)", w is not None and w["status"]["level"] == "ok", str(w and w["status"]))

    # F5. acreditación CONDICIONAL → ÁMBAR (pasa marcada, no bloquea).
    upd_company(accreditationStatus="CONDITIONAL", accreditedUntil=iso(200))
    s, r = call("GET", f"/work-orders/{wid4}/roster", admin)
    w = worker_of(r, pco_id)
    check("acreditación CONDICIONAL → ÁMBAR (COMPANY_ACCREDITATION_CONDITIONAL)",
          w is not None and w["status"]["level"] == "warning" and "COMPANY_ACCREDITATION_CONDITIONAL" in w["status"]["reasons"], str(w and w["status"]))

    # F6. acreditación por vencer (dentro de 90 d) → ÁMBAR.
    upd_company(accreditationStatus="ACCREDITED", accreditedUntil=iso(30))
    s, r = call("GET", f"/work-orders/{wid4}/roster", admin)
    w = worker_of(r, pco_id)
    check("acreditación por vencer (≤90 d) → ÁMBAR (COMPANY_ACCREDITATION_EXPIRING)",
          w is not None and w["status"]["level"] == "warning" and "COMPANY_ACCREDITATION_EXPIRING" in w["status"]["reasons"], str(w and w["status"]))

    # F7. acreditación VENCIDA → ROJO.
    upd_company(accreditationStatus="ACCREDITED", accreditedUntil=iso(-5))
    s, r = call("GET", f"/work-orders/{wid4}/roster", admin)
    w = worker_of(r, pco_id)
    check("acreditación VENCIDA → ROJO (COMPANY_NOT_ACCREDITED)",
          w is not None and w["status"]["level"] == "blocked" and "COMPANY_NOT_ACCREDITED" in w["status"]["reasons"], str(w and w["status"]))

    # F8. override firmado POR PERSONA desbloquea (reusa el flujo de S2).
    s, _ = call("POST", f"/work-orders/{wid4}/roster/confirm", admin, {"password": PASS})
    check("gate empresa: confirmar sin override (vencida) → 400", s == 400, str(s))
    s, r = call("POST", f"/work-orders/{wid4}/roster/confirm", admin, {"password": PASS, "overrides": [{"workerId": w["id"], "reason": "Acreditación en trámite; riesgo aceptado (smoke)"}]})
    wov = worker_of(r, pco_id)
    check("override firmado por persona (empresa no acreditada) → confirmar 2xx + override registrado",
          s == 200 and isinstance(r, dict) and r.get("confirmedAt") and wov and wov.get("override") and (wov["override"] or {}).get("reason"), str(s))

    # F9. avisos de acreditación (Bloque N): empresa vencida (iso -5) con personal en OT abierta
    # cuyo tipo la exige ⇒ contractor.accreditation.expired; por vencer (iso 30) ⇒ .expiring.
    call("POST", "/notifications/run", admin)
    n_accexp = sql(f"SELECT count(*) FROM \"NotificationEvent\" WHERE \"eventKey\"='contractor.accreditation.expired' AND payload->>'workOrderId'='{wid4}';")
    check("aviso contractor.accreditation.expired encolado tras /notifications/run", n_accexp.isdigit() and int(n_accexp) >= 1, n_accexp)
    upd_company(accreditationStatus="ACCREDITED", accreditedUntil=iso(30))
    call("POST", "/notifications/run", admin)
    n_accsoon = sql(f"SELECT count(*) FROM \"NotificationEvent\" WHERE \"eventKey\"='contractor.accreditation.expiring' AND payload->>'workOrderId'='{wid4}';")
    check("aviso contractor.accreditation.expiring encolado tras /notifications/run", n_accsoon.isdigit() and int(n_accsoon) >= 1, n_accsoon)

    # === G) UX enterprise: validación de RUT + datos personales + CRUD de roles =====
    # G1. persona con RUT INVÁLIDO → 400; con RUT VÁLIDO → 2xx y guardado NORMALIZADO
    # (sin puntos ni guion en BD; la UI lo formatea). Contempla documento extranjero.
    s, _ = call("POST", "/persons", admin, {"kind": "INTERNAL", "firstName": "Rut", "lastName": PERSON_LAST, "nationalIdType": "RUT", "nationalId": "12.345.678-9"})
    check("persona con RUT inválido (DV) → 400", s == 400, str(s))
    s, prut = call("POST", "/persons", admin, {"kind": "INTERNAL", "firstName": "Rut", "lastName": PERSON_LAST, "nationalIdType": "RUT", "nationalId": "11.111.111-1",
                                               "birthDate": iso(-9000), "gender": "MALE", "nationality": "Chilena"})
    prut_id = prut.get("id") if isinstance(prut, dict) else None
    nat = sql(f"SELECT \"nationalId\" FROM \"Person\" WHERE id = '{prut_id}';") if prut_id else ""
    check("persona con RUT válido → 2xx + datos personales (género/nacionalidad/nacimiento)",
          s in (200, 201) and isinstance(prut, dict) and prut.get("gender") == "MALE" and prut.get("nationality") == "Chilena" and prut.get("birthDate"), str(s))
    check("RUT guardado NORMALIZADO (sin puntos/guion en BD)", nat == "11111111-1", nat)
    s, pext = call("POST", "/persons", admin, {"kind": "INTERNAL", "firstName": "Ext", "lastName": PERSON_LAST, "nationalIdType": "PASSPORT", "nationalId": "AB-EXTRANJERO-123"})
    check("persona EXTRANJERA (pasaporte, sin validación RUT) → 2xx", s in (200, 201), str(s))

    # G2. empresa con RUT inválido → 400.
    s, _ = call("POST", "/contractor-companies?create=true", admin, {"key": COMPANY_KEY + "-bad", "name": "RUT malo SpA", "taxId": "76.111.222-3"})
    check("empresa con RUT inválido → 400", s == 400, str(s))

    # G3. CRUD de roles de dotación (gate workordercatalog:manage; el operador no puede).
    if operador:
        s, _ = call("POST", "/roster-roles?create=true", operador, {"key": ROLE_KEY, "name": "Rol Smoke"})
        check("operador crear rol de dotación → 403 (workordercatalog:manage)", s == 403, str(s))
    s, role = call("POST", "/roster-roles?create=true", admin, {"key": ROLE_KEY, "name": "Rol Smoke", "isSupervisorRole": True})
    role_id = role.get("id") if isinstance(role, dict) else None
    check("crear rol de dotación → 2xx + isSupervisorRole", s in (200, 201) and isinstance(role, dict) and role.get("isSupervisorRole") is True, str(s))
    s, roles2 = call("GET", "/roster-roles", admin)
    check("el rol nuevo aparece en el catálogo", isinstance(roles2, list) and any(r.get("key") == ROLE_KEY for r in roles2), str(s))
    s, _ = call("POST", "/roster-roles", admin, {"id": role_id, "name": "Rol Smoke (editado)"})
    check("editar rol de dotación → 2xx", s in (200, 201), str(s))
    s, _ = call("DELETE", f"/roster-roles/{role_id}", admin)
    check("eliminar rol de dotación (sin uso) → 2xx", s in (200, 204), str(s))

    # G4. AUDITORÍA e HISTORIAL: quitar una competencia = soft-delete (queda archivada y
    # visible con ?includeArchived) + AuditLog con el ANTES (qué se quitó). Traza CLAUDE.md.
    if ind and prut_id:
        s, comps = call("POST", f"/persons/{prut_id}/competencies", admin, {"competencyTypeId": ind["id"], "issuedAt": iso(-10), "expiresAt": iso(180)})
        comp_del_id = comps[0]["id"] if isinstance(comps, list) and comps else None
        call("DELETE", f"/persons/{prut_id}/competencies/{comp_del_id}", admin)
        s, live = call("GET", f"/persons/{prut_id}/competencies", admin)
        s2, arch = call("GET", f"/persons/{prut_id}/competencies?includeArchived=true", admin)
        arch_row = next((c for c in arch if c.get("id") == comp_del_id), None) if isinstance(arch, list) else None
        check("competencia quitada NO aparece en el listado vivo", isinstance(live, list) and all(c.get("id") != comp_del_id for c in live), str(len(live) if isinstance(live, list) else live))
        check("con ?includeArchived la competencia archivada SÍ aparece con archivedAt", arch_row is not None and arch_row.get("archivedAt"), str(arch_row and arch_row.get("archivedAt")))
        bef = sql(f"SELECT (before IS NOT NULL)::text FROM \"AuditLog\" WHERE action='personcompetency.deleted' AND \"entityId\"='{comp_del_id}' LIMIT 1;")
        check("AuditLog del borrado guarda el ANTES (snapshot de lo quitado)", bef == "true", bef)

    # G5. levantar un veto queda auditado con el ANTES (no apto → apto con traza).
    if prut_id:
        s, rl = call("POST", f"/persons/{prut_id}/restrictions", admin, {"type": "MEDICAL", "reason": "No apto smoke audit ascii"})
        rid = rl[0]["id"] if isinstance(rl, list) and rl else None
        call("DELETE", f"/persons/{prut_id}/restrictions/{rid}", admin)
        befr = sql(f"SELECT (before->>'reason') FROM \"AuditLog\" WHERE action='personrestriction.deleted' AND \"entityId\"='{rid}' LIMIT 1;")
        check("levantar veto → AuditLog guarda el motivo que tenía (antes)", befr == "No apto smoke audit ascii", befr)

    cleanup()
    print(f"\n== Dotación S1+S2+S3 + UX: {len(OK)} ok, {len(FAIL)} fail ==")
    if FAIL:
        for f in FAIL:
            print("  FAIL " + f)
        sys.exit(1)


if __name__ == "__main__":
    main()
