#!/usr/bin/env python3
"""Smoke de Órdenes de Trabajo (OT / PTW) — S1 cimientos + S2 PUERTA 1 + S3 PUERTA 2 + S4 PUERTA 3.

Sección 13 (pipeline P3→P2→ejecución, orden ESTÁNDAR reordenado en S4:
planificar → autorizar el permiso → ejecutar): tras aprobar, `planificar` → en_planificacion;
`autorizar_plan` SIN actividades se BLOQUEA (400, Puerta 3 exige ≥1 actividad); se crean
actividades (operador sin permiso → 403); `autorizar_plan` → plan_aprobado + planFrozenAt +
evento PLAN_FROZEN + BASELINE CONGELADA (baseline* == planned*); modificar el plan tras
congelar → 400. Luego `preparar` → en_preparacion (SUGIERE los checklists cuyas reglas
matchean: la regla LOTO obligatoria sembrada); revisar_checklists se BLOQUEA (400) con un
obligatorio sin aprobar; se instancia el checklist como LogEntry vivo (Form Builder), se
sella, se envía a revisión; el responsable NO puede aprobar su propio checklist (403,
segregación); un revisor ≠ responsable aprueba; con el obligatorio aprobado,
revisar_checklists → checklists_ok; `ejecutar` → en_ejecucion (guard "no ejecuta sin plan"
pasa porque la baseline está congelada). + gates 403 del operador.


Verifica el módulo de OT vía API (server-authoritative):
 1) Catálogos: GET types/specialties → 200 + datos sembrados.
 2) Crear TIPO (?create=true) → 2xx; colisión de key → 409; editar → 2xx (mismo id);
    desactivar → fuera de la lista por defecto, dentro de ?includeInactive=true.
 3) Especialidad: crear + colisión + desactivar.
 4) Crear SOLICITUD → 2xx; code "SOL-…"; folio null; NACE EN EL FLUJO (S2):
    lifecycle DRAFT + currentStateKey "borrador" (workflow congelado).
 5) Listar → aparece; filtros typeId / specialtyId / criticality / búsqueda.
 6) Detalle → campos + grafo del flujo (states) + availableTransitions = [enviar].
 7) Editar prioridad → 2xx; asignar/quitar responsable → 2xx.
 8) PUERTA 1 (S2): transición inexistente → 404; transición que no parte del estado
    actual → 400; operador sin permiso → 403; enviar → solicitada (OPEN); aprobar SIN
    firma → 401; con firma (password) → FOLIO OT-YYYY-0001 + approvedAt + evento
    FOLIO_ISSUED; rechazo: sin motivo → 400, con motivo → rechazada + CANCELED +
    rejectReason; folio GAPLESS por tipo (segunda aprobación = …-0002).
 9) Stats → open ≥ 1.
10) Anular con motivo → 2xx + CANCELED; editar tras anular → 400.
11) Validaciones: nodo inexistente → 400; tipo inexistente → 400; motivo corto → 400.
12) Gates: operador (sin permisos de OT) → 403 en GET y POST /work-orders.

Crea y LIMPIA por key/título (psql), incl. FolioCounter del tipo smoke.
API :3000. Clave demo Demo!Pass2026."""
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

TYPE_KEY = "smoke-ot-tipo"
SPEC_KEY = "smoke-ot-especialidad"
WO_TITLE = "OT Smoke — reparación de prueba"
# Reviewer temporal (Puerta 2): revisor ≠ responsable (segregación de funciones).
REV_USER = "smoke-ot-reviewer-user"
REV_EMAIL = "smoke-ot-reviewer@watchlog.local"
# Plantilla de PERMISO sembrada (autorización LOTO) + su regla obligatoria (S3, seed).
CHECKLIST_TEMPLATE = "Permiso de Trabajo — Aislación de energías (LOTO)"
# Plantilla de CIERRE sembrada (S5b, momento CLOSURE) + una regla obligatoria propia del
# smoke (la del seed aplica solo al tipo ptw-alto-riesgo; el smoke usa su tipo propio).
CLOSURE_TEMPLATE = "Cierre de permiso — Retiro de bloqueos y reenergización"
CLOSURE_RULE_NAME = "Cierre smoke — retiro de bloqueos"
# Plantilla de EJECUCIÓN sembrada (S5b Slice B, momento EXECUTION) + una regla obligatoria
# propia del smoke ACOTADA por especialidad (matchea SOLO las actividades de esa disciplina).
EXEC_TEMPLATE = "Aplicación de controles en terreno — Bloqueo físico y toma-5 (LOTO)"
EXEC_RULE_NAME = "Ejecución smoke — bloqueo físico por actividad"


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
    if s != 200 or not isinstance(r, dict):
        return None
    return r.get("accessToken")


def sql(q):
    return subprocess.run(PG + ["-c", q], capture_output=True, text=True).stdout.strip()


def check(name, cond, detail=""):
    (OK if cond else FAIL).append(name)
    print(("  ok  " if cond else "FAIL ") + name + (f"   [{detail}]" if detail else ""))


def cleanup():
    # El contador del tipo smoke primero (referencia el id del tipo aún vivo).
    sql(
        "DELETE FROM \"FolioCounter\" WHERE \"sequenceKey\" LIKE 'workorder|type:' || "
        f"(SELECT id FROM \"WorkOrderType\" WHERE key = '{TYPE_KEY}') || '%';"
    )
    # LogEntries instanciados por checklists de las OT smoke (SetNull no cascada; van
    # ANTES de borrar la OT, que sí cascada el WorkOrderChecklist).
    sql(
        "DELETE FROM \"LogEntry\" WHERE id IN (SELECT \"logEntryId\" FROM \"WorkOrderChecklist\" "
        f"WHERE \"logEntryId\" IS NOT NULL AND \"workOrderId\" IN (SELECT id FROM \"WorkOrder\" WHERE title = '{WO_TITLE}'));"
    )
    sql(f"DELETE FROM \"WorkOrder\" WHERE title = '{WO_TITLE}';")
    # Reglas de checklist propias del smoke (CIERRE + EJECUCIÓN, S5b).
    sql(f"DELETE FROM \"WorkOrderChecklistRule\" WHERE name IN ('{CLOSURE_RULE_NAME}', '{EXEC_RULE_NAME}');")
    sql(f"DELETE FROM \"WorkOrderType\" WHERE key = '{TYPE_KEY}';")
    sql(f"DELETE FROM \"Specialty\" WHERE key = '{SPEC_KEY}';")
    # Reviewer temporal (Puerta 2).
    sql(f"DELETE FROM \"UserRole\" WHERE \"userId\" = '{REV_USER}';")
    sql(f"DELETE FROM \"User\" WHERE id = '{REV_USER}';")


def setup_reviewer():
    """Usuario temporal con el rol admin (copia passwordHash del admin demo DENTRO de
    SQL). Sirve como REVISOR ≠ responsable en la Puerta 2 (segregación de funciones)."""
    sql(f"DELETE FROM \"UserRole\" WHERE \"userId\" = '{REV_USER}';")
    sql(f"DELETE FROM \"User\" WHERE id = '{REV_USER}';")
    sql(
        "INSERT INTO \"User\" (id,email,\"displayName\",\"passwordHash\",status,\"updatedAt\") "
        f"SELECT '{REV_USER}','{REV_EMAIL}',u.\"displayName\",u.\"passwordHash\",'ACTIVE',now() "
        f"FROM \"User\" u WHERE u.email = '{ADMIN}';"
    )
    sql(
        "INSERT INTO \"UserRole\" (\"userId\",\"roleId\",\"assignedAt\") "
        f"SELECT '{REV_USER}', r.id, now() FROM \"Role\" r WHERE r.key = 'admin';"
    )


def create_request(admin, tid, node, spec_id):
    """Crea una solicitud smoke y devuelve (status, body)."""
    return call("POST", "/work-orders", admin, {
        "title": WO_TITLE, "description": "creada por smoke", "typeId": tid,
        "criticality": 4, "priority": "HIGH", "requiresPtw": True,
        "orgNodeId": node, "specialtyIds": [spec_id] if spec_id else [],
    })


def complete_checklist(admin, reviewer, wid, cid):
    """Instancia → llena/sella el LogEntry → envía a revisión → el revisor aprueba.
    Devuelve el status final del checklist (esperado APPROVED). Reusa el Form Builder."""
    _, r = call("POST", f"/work-orders/{wid}/checklists/{cid}/instantiate", admin)
    leid = r.get("logEntryId") if isinstance(r, dict) else None
    if not leid:
        return None
    _, le = call("GET", f"/log-entries/{leid}", admin)
    sec = (le.get("sectionStates") or [{}])[0] if isinstance(le, dict) else {}
    call("PUT", f"/log-entries/{leid}/sections/{sec.get('sectionKey')}", admin,
         {"expectedVersion": sec.get("version", 0), "values": [], "markComplete": True})
    call("POST", f"/log-entries/{leid}/submit", admin, {})
    call("POST", f"/work-orders/{wid}/checklists/{cid}/submit", admin)
    _, r = call("POST", f"/work-orders/{wid}/checklists/{cid}/review", reviewer, {"decision": "APPROVE"})
    return r.get("status") if isinstance(r, dict) else None


def main():
    admin = login(ADMIN)
    if not admin:
        print("FAIL no se pudo iniciar sesión admin")
        sys.exit(1)
    operador = login(OPERADOR)
    cleanup()

    # 1) Catálogos sembrados
    s, types = call("GET", "/work-orders/types", admin)
    check("GET /work-orders/types → 200 + tipos sembrados", s == 200 and isinstance(types, list) and len(types) >= 1, str(s))
    s, specs = call("GET", "/work-orders/specialties", admin)
    check("GET /work-orders/specialties → 200 + especialidades sembradas", s == 200 and isinstance(specs, list) and len(specs) >= 1, str(s))

    # 2) Crear/editar/desactivar TIPO
    s, r = call("POST", "/work-orders/types?create=true", admin, {
        "key": TYPE_KEY, "name": "Tipo OT Smoke", "color": "#06B6D4",
        "requiresPtwDefault": True, "criticalityDefault": 4, "sortOrder": 99,
        # Prefijo de folio propio: aísla el smoke de datos reales (evita colisión con
        # el folio global-único de otras OT; ver BUG folio cross-tipo en BACKLOG).
        "folioScheme": {"prefix": "OTSMK", "scope": "type"},
    })
    check("crear tipo → 2xx + flags", s in (200, 201) and isinstance(r, dict) and r.get("requiresPtwDefault") is True and r.get("criticalityDefault") == 4, str(s))
    tid = r.get("id") if isinstance(r, dict) else None
    s, _ = call("POST", "/work-orders/types?create=true", admin, {"key": TYPE_KEY, "name": "dup"})
    check("crear tipo con key existente → 409", s == 409, str(s))
    s, r = call("POST", "/work-orders/types", admin, {"key": TYPE_KEY, "name": "Tipo OT Smoke EDIT", "criticalityDefault": 4})
    check("editar tipo (upsert) → 2xx + mismo id + nombre nuevo", s in (200, 201) and isinstance(r, dict) and r.get("id") == tid and r.get("name") == "Tipo OT Smoke EDIT", str(s))
    call("POST", "/work-orders/types", admin, {"key": TYPE_KEY, "name": "Tipo OT Smoke EDIT", "active": False})
    _, active = call("GET", "/work-orders/types", admin)
    _, allt = call("GET", "/work-orders/types?includeInactive=true", admin)
    check("tipo inactivo NO en desplegables", not any(t.get("key") == TYPE_KEY for t in active))
    check("tipo inactivo SÍ en ?includeInactive", any(t.get("key") == TYPE_KEY for t in allt))
    # reactivar para usarlo al crear la OT (se re-envía folioScheme: el upsert reemplaza todo el registro)
    call("POST", "/work-orders/types", admin, {"key": TYPE_KEY, "name": "Tipo OT Smoke EDIT", "active": True, "criticalityDefault": 4, "folioScheme": {"prefix": "OTSMK", "scope": "type"}})

    # 3) Especialidad: crear + colisión + desactivar
    s, r = call("POST", "/work-orders/specialties?create=true", admin, {"key": SPEC_KEY, "name": "Especialidad OT Smoke", "sortOrder": 99})
    check("crear especialidad → 2xx", s in (200, 201), str(s))
    s, _ = call("POST", "/work-orders/specialties?create=true", admin, {"key": SPEC_KEY, "name": "dup"})
    check("crear especialidad con key existente → 409", s == 409, str(s))
    call("POST", "/work-orders/specialties", admin, {"key": SPEC_KEY, "name": "Especialidad OT Smoke", "active": False})
    _, spActive = call("GET", "/work-orders/specialties", admin)
    _, spAll = call("GET", "/work-orders/specialties?includeInactive=true", admin)
    check("especialidad inactiva NO en desplegables", not any(x.get("key") == SPEC_KEY for x in spActive))
    check("especialidad inactiva SÍ en ?includeInactive", any(x.get("key") == SPEC_KEY for x in spAll))
    call("POST", "/work-orders/specialties", admin, {"key": SPEC_KEY, "name": "Especialidad OT Smoke", "active": True})

    # nodo + especialidad reales
    node = sql("SELECT id FROM \"OrgNode\" WHERE \"deletedAt\" IS NULL ORDER BY \"createdAt\" LIMIT 1;")
    check("hay un nodo para crear la OT", bool(node), node)
    spec_id = specs[0]["id"] if specs else None

    # 4) Crear SOLICITUD — S2: nace en el FLUJO (borrador / DRAFT), folio null
    s, wo = create_request(admin, tid, node, spec_id)
    check("crear solicitud → 2xx", s in (200, 201), str(s) + (json.dumps(wo) if s not in (200, 201) else ""))
    wid = wo.get("id") if isinstance(wo, dict) else None
    check("solicitud: code SOL-…, folio null, PTW",
          isinstance(wo, dict) and str(wo.get("code", "")).startswith("SOL-") and wo.get("folio") is None
          and wo.get("requiresPtw") is True, json.dumps(wo) if isinstance(wo, dict) else str(wo))
    check("solicitud NACE en el flujo: DRAFT + borrador (workflow congelado)",
          isinstance(wo, dict) and wo.get("lifecycle") == "DRAFT" and wo.get("currentStateKey") == "borrador"
          and bool(wo.get("workflowDefinitionVersionId")), json.dumps({k: wo.get(k) for k in ("lifecycle", "currentStateKey")}) if isinstance(wo, dict) else str(wo))
    check("solicitud: N:N especialidad reflejado",
          isinstance(wo, dict) and (not spec_id or any(sp.get("id") == spec_id for sp in wo.get("specialties", []))))

    # 5) Listar + filtros
    _, lst = call("GET", "/work-orders?lifecycle=DRAFT&pageSize=200", admin)
    check("listar (DRAFT) → aparece la solicitud", isinstance(lst, dict) and any(i.get("id") == wid for i in lst.get("items", [])))
    _, byType = call("GET", f"/work-orders?typeId={tid}", admin)
    check("filtro typeId → la incluye", isinstance(byType, dict) and any(i.get("id") == wid for i in byType.get("items", [])))
    _, bySpec = call("GET", f"/work-orders?specialtyId={spec_id}", admin) if spec_id else (None, {"items": [{"id": wid}]})
    check("filtro specialtyId → la incluye", isinstance(bySpec, dict) and any(i.get("id") == wid for i in bySpec.get("items", [])))
    _, byCrit = call("GET", "/work-orders?criticality=4", admin)
    check("filtro criticality=4 → la incluye", isinstance(byCrit, dict) and any(i.get("id") == wid for i in byCrit.get("items", [])))
    _, bySearch = call("GET", "/work-orders?search=reparaci", admin)
    check("búsqueda por título → la incluye", isinstance(bySearch, dict) and any(i.get("id") == wid for i in bySearch.get("items", [])))

    # 6) Detalle + grafo del flujo
    s, det = call("GET", f"/work-orders/{wid}", admin)
    check("detalle → 200 + campos", s == 200 and isinstance(det, dict) and det.get("id") == wid and det.get("criticality") == 4, str(s))
    states = det.get("states", []) if isinstance(det, dict) else []
    avail = det.get("availableTransitions", []) if isinstance(det, dict) else []
    check("detalle: grafo congelado (≥10 estados, 4 puertas)", len(states) >= 10, str(len(states)))
    check("detalle: desde borrador solo se puede ENVIAR", [t.get("key") for t in avail] == ["enviar"], json.dumps([t.get("key") for t in avail]))
    check("detalle: la fila de la grilla trae nombre/color del estado",
          isinstance(det, dict) and det.get("currentStateName") == "Borrador" and bool(det.get("currentStateColor")))
    check("detalle: timeline con evento CREATED", any(e.get("kind") == "CREATED" for e in det.get("events", [])))

    # 7) Editar / asignar
    s, r = call("PATCH", f"/work-orders/{wid}", admin, {"priority": "CRITICAL"})
    check("editar prioridad → 2xx + CRITICAL", s in (200, 201) and isinstance(r, dict) and r.get("priority") == "CRITICAL", str(s))
    me = sql(f"SELECT id FROM \"User\" WHERE email = '{ADMIN}' LIMIT 1;")
    s, r = call("POST", f"/work-orders/{wid}/assign", admin, {"ownerId": me})
    check("asignar responsable → 2xx + owner", s == 200 and isinstance(r, dict) and r.get("ownerId") == me, str(s))
    s, r = call("POST", f"/work-orders/{wid}/assign", admin, {"ownerId": None})
    check("quitar responsable → 2xx + null", s == 200 and isinstance(r, dict) and r.get("ownerId") is None, str(s))

    # 8) PUERTA 1 — enviar → aprobar (firma + FOLIO) / rechazar (motivo obligatorio)
    s, _ = call("POST", f"/work-orders/{wid}/transitions", admin, {"transitionKey": "no-existe"})
    check("transición inexistente → 404", s == 404, str(s))
    s, _ = call("POST", f"/work-orders/{wid}/transitions", admin, {"transitionKey": "aprobar"})
    check("transición que no parte del estado actual → 400", s == 400, str(s))
    if operador:
        s, _ = call("POST", f"/work-orders/{wid}/transitions", operador, {"transitionKey": "enviar"})
        check("operador sin permiso: transición → 403", s == 403, str(s))
    s, r = call("POST", f"/work-orders/{wid}/transitions", admin, {"transitionKey": "enviar"})
    check("enviar → 200 + solicitada + OPEN (sin folio aún)",
          s == 200 and isinstance(r, dict) and r.get("currentStateKey") == "solicitada" and r.get("lifecycle") == "OPEN" and r.get("folio") is None,
          str(s) + (json.dumps({k: r.get(k) for k in ("currentStateKey", "lifecycle", "folio")}) if isinstance(r, dict) else ""))
    s, _ = call("POST", f"/work-orders/{wid}/transitions", admin, {"transitionKey": "aprobar"})
    check("aprobar SIN firma → 401 (Part 11 exige re-auth)", s == 401, str(s))
    s, _ = call("POST", f"/work-orders/{wid}/transitions", admin, {"transitionKey": "aprobar", "password": "incorrecta"})
    check("aprobar con contraseña inválida → 401", s == 401, str(s))
    s, r = call("POST", f"/work-orders/{wid}/transitions", admin, {"transitionKey": "aprobar", "password": PASS})
    folio1 = r.get("folio") if isinstance(r, dict) else None
    check("aprobar CON firma → 200 + estado aprobada + approvedAt",
          s == 200 and isinstance(r, dict) and r.get("currentStateKey") == "aprobada" and bool(r.get("approvedAt")),
          str(s) + (json.dumps({k: r.get(k) for k in ("currentStateKey", "approvedAt")}) if isinstance(r, dict) else ""))
    check("FOLIO emitido al aprobar: OTSMK-YYYY-0001 (gapless por tipo, reinicio anual)",
          isinstance(folio1, str) and re.fullmatch(r"OTSMK-\d{4}-0001", folio1) is not None, str(folio1))
    check("el code humano pasa de SOL-… al folio oficial", isinstance(r, dict) and r.get("code") == folio1)
    check("timeline: eventos APPROVED + FOLIO_ISSUED",
          isinstance(r, dict) and {"APPROVED", "FOLIO_ISSUED"} <= {e.get("kind") for e in r.get("events", [])})

    # Rechazo (segunda solicitud): motivo OBLIGATORIO; lifecycle queda CANCELED
    s, wo2 = create_request(admin, tid, node, spec_id)
    wid2 = wo2.get("id") if isinstance(wo2, dict) else None
    call("POST", f"/work-orders/{wid2}/transitions", admin, {"transitionKey": "enviar"})
    s, _ = call("POST", f"/work-orders/{wid2}/transitions", admin, {"transitionKey": "rechazar"})
    check("rechazar SIN motivo → 400", s == 400, str(s))
    s, r = call("POST", f"/work-orders/{wid2}/transitions", admin, {"transitionKey": "rechazar", "reason": "no corresponde al alcance del área"})
    check("rechazar CON motivo → 200 + rechazada + CANCELED + rejectReason (sin folio)",
          s == 200 and isinstance(r, dict) and r.get("currentStateKey") == "rechazada" and r.get("lifecycle") == "CANCELED"
          and r.get("rejectReason") == "no corresponde al alcance del área" and r.get("folio") is None,
          str(s) + (json.dumps({k: r.get(k) for k in ("currentStateKey", "lifecycle", "rejectReason")}) if isinstance(r, dict) else ""))
    s, _ = call("POST", f"/work-orders/{wid2}/transitions", admin, {"transitionKey": "enviar"})
    check("transición sobre OT terminada → 400", s == 400, str(s))

    # Gapless por tipo: la SEGUNDA aprobación del mismo tipo toma el correlativo 0002
    s, wo3 = create_request(admin, tid, node, spec_id)
    wid3 = wo3.get("id") if isinstance(wo3, dict) else None
    call("POST", f"/work-orders/{wid3}/transitions", admin, {"transitionKey": "enviar"})
    s, r = call("POST", f"/work-orders/{wid3}/transitions", admin, {"transitionKey": "aprobar", "password": PASS})
    folio3 = r.get("folio") if isinstance(r, dict) else None
    check("folio GAPLESS por tipo: segunda aprobación = …-0002 (mismo año)",
          isinstance(folio1, str) and isinstance(folio3, str) and folio3 == folio1[:-4] + "0002", f"{folio1} → {folio3}")

    # 9) Stats
    s, st = call("GET", "/work-orders/stats", admin)
    check("stats → open ≥ 1", s == 200 and isinstance(st, dict) and st.get("open", 0) >= 1, json.dumps(st) if isinstance(st, dict) else str(s))

    # 10) Anular (la primera OT, ya aprobada)
    s, _ = call("POST", f"/work-orders/{wid}/cancel", admin, {"reason": "no"})
    check("anular con motivo corto (<5) → 400", s == 400, str(s))
    s, r = call("POST", f"/work-orders/{wid}/cancel", admin, {"reason": "duplicada por smoke"})
    check("anular con motivo → 2xx + CANCELED", s == 200 and isinstance(r, dict) and r.get("lifecycle") == "CANCELED", str(s))
    s, _ = call("PATCH", f"/work-orders/{wid}", admin, {"priority": "LOW"})
    check("editar tras anular → 400", s == 400, str(s))

    # 11) Validaciones de creación
    s, _ = call("POST", "/work-orders", admin, {"title": "x nodo malo", "typeId": tid, "criticality": 3, "orgNodeId": "nodo-no-existe"})
    check("crear con nodo inexistente → 400", s == 400, str(s))
    s, _ = call("POST", "/work-orders", admin, {"title": "x tipo malo", "typeId": "tipo-no-existe", "criticality": 3, "orgNodeId": node})
    check("crear con tipo inexistente → 400", s == 400, str(s))

    # 12) Gates del operador (sin permisos de OT)
    if operador:
        s, _ = call("GET", "/work-orders", operador)
        check("operador GET /work-orders → 403", s == 403, str(s))
        s, _ = call("POST", "/work-orders", operador, {"title": "x", "typeId": tid, "criticality": 3, "orgNodeId": node})
        check("operador POST /work-orders → 403", s == 403, str(s))
    else:
        print("  --  (sin usuario operador; se omiten los gates de 403)")

    # 13) PIPELINE P3 (plan) → P2 (permiso) → ejecución (orden estándar reordenado en S4)
    print("\n— Puerta 3 (plan de actividades) + Puerta 2 (permiso) + ejecución —")
    setup_reviewer()
    reviewer = login(REV_EMAIL)
    check("reviewer temporal (segregación) logueado", bool(reviewer))
    # OT nueva: enviar → aprobar (folio) → planificar
    s, wo4 = create_request(admin, tid, node, spec_id)
    wid4 = wo4.get("id") if isinstance(wo4, dict) else None
    call("POST", f"/work-orders/{wid4}/transitions", admin, {"transitionKey": "enviar"})
    call("POST", f"/work-orders/{wid4}/transitions", admin, {"transitionKey": "aprobar", "password": PASS})
    s, r = call("POST", f"/work-orders/{wid4}/transitions", admin, {"transitionKey": "planificar"})
    check("planificar → en_planificacion (2xx)", s == 200 and isinstance(r, dict) and r.get("currentStateKey") == "en_planificacion", str(s))

    # Puerta 3 GUARD: autorizar_plan SIN actividades → 400 (exige ≥1 actividad)
    s, _ = call("POST", f"/work-orders/{wid4}/transitions", admin, {"transitionKey": "autorizar_plan"})
    check("Puerta 3 BLOQUEADA: autorizar_plan sin actividades → 400", s == 400, str(s))

    # Gates 403 del operador sobre actividades (sin workorder:activity:manage)
    if operador:
        s, _ = call("POST", f"/work-orders/{wid4}/activities", operador, {"title": "intento del operador"})
        check("operador POST activities → 403", s == 403, str(s))
        s, _ = call("POST", f"/work-orders/{wid4}/activities/reorder", operador, {"orderedIds": ["x"]})
        check("operador POST activities/reorder → 403", s == 403, str(s))

    # Crear actividades del plan (una obligatoria con fechas para verificar la baseline)
    PS, PE = "2026-08-01T08:00:00.000Z", "2026-08-05T17:00:00.000Z"
    s, a1 = call("POST", f"/work-orders/{wid4}/activities", admin, {
        "title": "Aislar energías y verificar cero energía", "responsibleId": me,
        "specialtyId": spec_id, "plannedStart": PS, "plannedEnd": PE, "mandatory": True,
    })
    check("crear actividad → 2xx + PENDING + secuencia 0", s in (200, 201) and isinstance(a1, dict) and a1.get("status") == "PENDING" and a1.get("sequence") == 0, str(s))
    aid1 = a1.get("id") if isinstance(a1, dict) else None
    s, a2 = call("POST", f"/work-orders/{wid4}/activities", admin, {"title": "Reemplazar rodamiento y montar", "mandatory": True})
    check("crear 2.ª actividad → 2xx + secuencia 1", s in (200, 201) and isinstance(a2, dict) and a2.get("sequence") == 1, str(s))
    aid2 = a2.get("id") if isinstance(a2, dict) else None
    s, acts = call("GET", f"/work-orders/{wid4}/activities", admin)
    check("listar actividades → 2 en el plan", isinstance(acts, list) and len(acts) == 2, str(len(acts) if isinstance(acts, list) else s))

    # Regla de EJECUCIÓN (S5b Slice B) ACOTADA por especialidad: matchea SOLO la actividad
    # 1 (que tiene la especialidad del smoke); la actividad 2 (sin especialidad) NO recibe
    # verificación de ejecución. Se crea ANTES de `preparar` para que el set se materialice.
    exec_tpl_id = sql(f"SELECT id FROM \"Template\" WHERE name = '{EXEC_TEMPLATE}' AND \"deletedAt\" IS NULL LIMIT 1;").strip()
    check("plantilla de EJECUCIÓN sembrada existe", bool(exec_tpl_id), exec_tpl_id or "no encontrada")
    s, _ = call("POST", "/work-orders/checklist-rules", admin, {
        "name": EXEC_RULE_NAME, "templateId": exec_tpl_id, "moment": "EXECUTION",
        "mandatory": True, "appliesToTypeIds": [tid], "specialtyId": spec_id, "sortOrder": 15,
    })
    check("crear regla de checklist EXECUTION (por especialidad) → 2xx", s in (200, 201), str(s))

    # Seguimiento (S5): NO se registra avance antes de autorizar el plan (baseline sin congelar) → 400
    s, _ = call("POST", f"/work-orders/{wid4}/activities/{aid1}/progress", admin, {"status": "IN_PROGRESS", "progressPct": 20})
    check("avance ANTES de autorizar el plan (baseline sin congelar) → 400", s == 400, str(s))

    # Puerta 3: autorizar_plan → plan_aprobado + planFrozenAt + evento PLAN_FROZEN
    s, r = call("POST", f"/work-orders/{wid4}/transitions", admin, {"transitionKey": "autorizar_plan"})
    check("autorizar_plan → 200 + plan_aprobado + planFrozenAt",
          s == 200 and isinstance(r, dict) and r.get("currentStateKey") == "plan_aprobado" and bool(r.get("planFrozenAt")),
          str(s) + (json.dumps({k: r.get(k) for k in ("currentStateKey", "planFrozenAt")}) if isinstance(r, dict) else ""))
    check("timeline: evento PLAN_FROZEN", isinstance(r, dict) and any(e.get("kind") == "PLAN_FROZEN" for e in r.get("events", [])))

    # Baseline CONGELADA: baseline* == planned* (mide desviación en la ejecución)
    s, acts2 = call("GET", f"/work-orders/{wid4}/activities", admin)
    a1f = next((a for a in acts2 if a.get("id") == aid1), None) if isinstance(acts2, list) else None
    check("baseline congelada: baselineStart/End == plannedStart/End",
          a1f is not None and a1f.get("baselineStart") == PS and a1f.get("baselineEnd") == PE,
          json.dumps({k: a1f.get(k) for k in ("plannedStart", "baselineStart", "plannedEnd", "baselineEnd")}) if a1f else str(acts2))

    # Plan congelado ⇒ no se modifica (crear/editar/eliminar) → 400
    s, _ = call("POST", f"/work-orders/{wid4}/activities", admin, {"title": "tarde para el plan"})
    check("crear actividad con plan congelado → 400", s == 400, str(s))
    s, _ = call("PATCH", f"/work-orders/{wid4}/activities/{aid1}", admin, {"title": "editar tras congelar el plan"})
    check("editar actividad con plan congelado → 400", s == 400, str(s))

    # Puerta 2 (permiso) DESPUÉS del plan: preparar → en_preparacion (dispara la sugerencia)
    s, r = call("POST", f"/work-orders/{wid4}/transitions", admin, {"transitionKey": "preparar"})
    check("preparar → en_preparacion (2xx)", s == 200 and isinstance(r, dict) and r.get("currentStateKey") == "en_preparacion", str(s))

    # Sugerencia automática al entrar a preparación (regla obligatoria LOTO sembrada)
    s, cls = call("GET", f"/work-orders/{wid4}/checklists", admin)
    loto = next((c for c in cls if c.get("templateName") == CHECKLIST_TEMPLATE), None) if isinstance(cls, list) else None
    check("sugerencia auto: checklist LOTO obligatorio materializado al preparar",
          loto is not None and loto.get("mandatory") is True and loto.get("status") == "PENDING",
          json.dumps(loto) if loto else str(cls))
    cid = loto.get("id") if loto else None
    # Evento CHECKLIST_ADDED en el timeline de la OT
    _, det4 = call("GET", f"/work-orders/{wid4}", admin)
    check("timeline: evento CHECKLIST_ADDED",
          isinstance(det4, dict) and any(e.get("kind") == "CHECKLIST_ADDED" for e in det4.get("events", [])))

    # SET de EJECUCIÓN (S5b Slice B): materializado POR ACTIVIDAD al preparar. La regla EXEC
    # está acotada por especialidad ⇒ SÓLO la actividad 1 (con especialidad) recibe verificación.
    exec_cls = [c for c in cls if c.get("moment") == "EXECUTION"] if isinstance(cls, list) else []
    exec_a1 = next((c for c in exec_cls if c.get("workActivityId") == aid1), None)
    exec_a2 = next((c for c in exec_cls if c.get("workActivityId") == aid2), None)
    check("set de ejecución: verificación materializada en la actividad 1 (obligatoria, PENDING)",
          exec_a1 is not None and exec_a1.get("mandatory") is True and exec_a1.get("status") == "PENDING",
          json.dumps(exec_a1) if exec_a1 else str(exec_cls))
    check("match por especialidad: la actividad 2 (sin especialidad) NO recibe verificación de ejecución",
          exec_a2 is None, json.dumps(exec_a2) if exec_a2 else "ok")
    exec_cid = exec_a1.get("id") if exec_a1 else None

    # Gate de Puerta 2: revisar_checklists con obligatorio PENDIENTE (firma válida) → 400
    s, _ = call("POST", f"/work-orders/{wid4}/transitions", admin, {"transitionKey": "revisar_checklists", "password": PASS})
    check("Puerta 2 BLOQUEADA: revisar_checklists con obligatorio sin aprobar → 400", s == 400, str(s))

    # Gates 403 del operador sobre checklists (sin workorder:checklist:manage)
    if operador:
        s, _ = call("POST", f"/work-orders/{wid4}/checklists/suggest", operador)
        check("operador POST checklists/suggest → 403", s == 403, str(s))
        s, _ = call("POST", f"/work-orders/{wid4}/checklists/{cid}/instantiate", operador)
        check("operador POST checklists/instantiate → 403", s == 403, str(s))

    # Instanciar el checklist como LogEntry vivo (reusa el Form Builder)
    s, r = call("POST", f"/work-orders/{wid4}/checklists/{cid}/instantiate", admin)
    leid = r.get("logEntryId") if isinstance(r, dict) else None
    check("instanciar → 200 + LogEntry vivo + IN_PROGRESS + responsable",
          s == 200 and isinstance(r, dict) and bool(leid) and r.get("status") == "IN_PROGRESS" and bool(r.get("responsibleId")),
          str(s) + (json.dumps({k: r.get(k) for k in ("status", "logEntryId")}) if isinstance(r, dict) else ""))

    # No se puede enviar a revisión sin sellar el LogEntry
    s, _ = call("POST", f"/work-orders/{wid4}/checklists/{cid}/submit", admin)
    check("enviar a revisión SIN sellar el registro → 400", s == 400, str(s))

    # Llenar + sellar el LogEntry (sección con campos opcionales → markComplete + submit)
    s, le = call("GET", f"/log-entries/{leid}", admin)
    sec = (le.get("sectionStates") or [{}])[0] if isinstance(le, dict) else {}
    skey = sec.get("sectionKey")
    sver = sec.get("version", 0)
    call("PUT", f"/log-entries/{leid}/sections/{skey}", admin, {"expectedVersion": sver, "values": [], "markComplete": True})
    s, ledet = call("POST", f"/log-entries/{leid}/submit", admin, {})
    check("LogEntry del checklist sellado (SUBMITTED)", s in (200, 201) and isinstance(ledet, dict) and ledet.get("status") == "SUBMITTED", str(s))

    # Ahora sí: enviar a revisión → SUBMITTED
    s, r = call("POST", f"/work-orders/{wid4}/checklists/{cid}/submit", admin)
    check("enviar a revisión (registro sellado) → 200 + SUBMITTED", s == 200 and isinstance(r, dict) and r.get("status") == "SUBMITTED", str(s))

    # Segregación: el RESPONSABLE (admin) no puede revisar su propio checklist → 403
    s, _ = call("POST", f"/work-orders/{wid4}/checklists/{cid}/review", admin, {"decision": "APPROVE"})
    check("segregación: responsable revisa su propio checklist → 403", s == 403, str(s))

    # El revisor (≠ responsable) aprueba → APPROVED
    if reviewer:
        s, r = call("POST", f"/work-orders/{wid4}/checklists/{cid}/review", reviewer, {"decision": "APPROVE"})
        check("revisor (≠ responsable) aprueba → 200 + APPROVED", s == 200 and isinstance(r, dict) and r.get("status") == "APPROVED", str(s))

    # GOBIERNO 2 (S5b Slice B): aun con el permiso de AUTORIZACIÓN aprobado, la autorización
    # SIGUE bloqueada hasta que el aprobador CONFIRME el set de verificaciones de ejecución.
    s, _ = call("POST", f"/work-orders/{wid4}/transitions", admin, {"transitionKey": "revisar_checklists", "password": PASS})
    check("Gobierno 2 BLOQUEA: autorizar sin confirmar el set de ejecución → 400", s == 400, str(s))

    # Gate 403 del operador sobre confirmar el set (sin workorder:checklist:manage)
    if operador:
        s, _ = call("POST", f"/work-orders/{wid4}/checklists/execution-set/confirm", operador)
        check("operador POST execution-set/confirm → 403", s == 403, str(s))

    # El aprobador CONFIRMA el set de ejecución → sella executionSetConfirmedAt
    s, _ = call("POST", f"/work-orders/{wid4}/checklists/execution-set/confirm", admin)
    check("confirmar set de ejecución → 2xx", s in (200, 201), str(s))
    _, det_c = call("GET", f"/work-orders/{wid4}", admin)
    check("detalle: executionSetConfirmedAt sellado + confirmante",
          isinstance(det_c, dict) and bool(det_c.get("executionSetConfirmedAt")) and bool(det_c.get("executionSetConfirmedById")),
          json.dumps({k: det_c.get(k) for k in ("executionSetConfirmedAt", "executionSetConfirmedById")}) if isinstance(det_c, dict) else str(s))

    # Curar el set (agregar una verificación de ejecución manual a la actividad 2) INVALIDA
    # la confirmación previa ⇒ Gobierno 2 exige re-confirmar (trazabilidad "lo aplicado = lo autorizado").
    s, _ = call("POST", f"/work-orders/{wid4}/checklists", admin, {"templateId": exec_tpl_id, "workActivityId": aid2})
    check("agregar verificación de ejecución manual a la actividad 2 → 2xx", s in (200, 201), str(s))
    _, det_c2 = call("GET", f"/work-orders/{wid4}", admin)
    check("curar el set limpia la confirmación (executionSetConfirmedAt = null)",
          isinstance(det_c2, dict) and det_c2.get("executionSetConfirmedAt") is None, str(det_c2.get("executionSetConfirmedAt") if isinstance(det_c2, dict) else s))
    s, _ = call("POST", f"/work-orders/{wid4}/transitions", admin, {"transitionKey": "revisar_checklists", "password": PASS})
    check("Gobierno 2 vuelve a BLOQUEAR tras cambiar el set → 400", s == 400, str(s))
    call("POST", f"/work-orders/{wid4}/checklists/execution-set/confirm", admin)  # re-confirmar

    # Con el permiso aprobado Y el set confirmado, la autorización abre: revisar_checklists → checklists_ok
    s, r = call("POST", f"/work-orders/{wid4}/transitions", admin, {"transitionKey": "revisar_checklists", "password": PASS})
    check("Gobierno 2 ABRE: permiso aprobado + set confirmado → 200 + checklists_ok",
          s == 200 and isinstance(r, dict) and r.get("currentStateKey") == "checklists_ok", str(s))

    # Ejecución: guard "no ejecuta sin plan" PASA porque la baseline está congelada
    s, r = call("POST", f"/work-orders/{wid4}/transitions", admin, {"transitionKey": "ejecutar"})
    check("ejecutar → 200 + en_ejecucion (plan congelado ⇒ guard pasa)",
          s == 200 and isinstance(r, dict) and r.get("currentStateKey") == "en_ejecucion", str(s))

    # --- Checklist de CIERRE (S5b, momento CLOSURE) --------------------------------
    # Registra una regla CLOSURE obligatoria para el tipo smoke (la del seed aplica a
    # ptw-alto-riesgo). Se sugerirá al ENTRAR a la revisión de cierre y bloqueará el cierre.
    closure_tpl_id = sql(f"SELECT id FROM \"Template\" WHERE name = '{CLOSURE_TEMPLATE}' AND \"deletedAt\" IS NULL LIMIT 1;").strip()
    check("plantilla de CIERRE sembrada existe", bool(closure_tpl_id), closure_tpl_id or "no encontrada")
    s, _ = call("POST", "/work-orders/checklist-rules", admin, {
        "name": CLOSURE_RULE_NAME, "templateId": closure_tpl_id, "moment": "CLOSURE",
        "mandatory": True, "appliesToTypeIds": [tid], "sortOrder": 20,
    })
    check("crear regla de checklist CLOSURE (momento CLOSURE) → 2xx", s in (200, 201), str(s))

    # 14) SEGUIMIENTO DEL AVANCE (S5 — Puerta 4) + CIERRE punta a punta
    print("\n— Puerta 4 (seguimiento del avance + cierre) —")

    # Registrar avance de la 1.ª actividad (append-only + actualiza la foto vigente)
    s, r = call("POST", f"/work-orders/{wid4}/activities/{aid1}/progress", admin,
                {"status": "IN_PROGRESS", "progressPct": 50, "note": "Energías aisladas; falta verificar cero energía"})
    check("registrar avance → 200 + IN_PROGRESS + 50% + 1 registro",
          s in (200, 201) and isinstance(r, dict) and r.get("status") == "IN_PROGRESS"
          and r.get("progressPct") == 50 and r.get("updatesCount") == 1,
          str(s) + (json.dumps({k: r.get(k) for k in ("status", "progressPct", "updatesCount")}) if isinstance(r, dict) else ""))

    # Avance VACÍO (sin ningún dato) → 400 (refine del contrato)
    s, _ = call("POST", f"/work-orders/{wid4}/activities/{aid1}/progress", admin, {})
    check("avance sin ningún dato → 400", s == 400, str(s))

    # Historial append-only (más reciente primero)
    s, ups = call("GET", f"/work-orders/{wid4}/activities/{aid1}/updates", admin)
    check("historial de avance → 1 registro append-only", isinstance(ups, list) and len(ups) == 1, str(len(ups) if isinstance(ups, list) else s))

    # Gate 403 del operador sobre el avance (sin workorder:activity:manage)
    if operador:
        s, _ = call("POST", f"/work-orders/{wid4}/activities/{aid1}/progress", operador, {"status": "IN_PROGRESS"})
        check("operador POST activity progress → 403", s == 403, str(s))

    # Solicitar cierre → en_revision_cierre (dispara la SUGERENCIA del checklist de CIERRE)
    s, r = call("POST", f"/work-orders/{wid4}/transitions", admin, {"transitionKey": "solicitar_cierre"})
    check("solicitar_cierre → 200 + en_revision_cierre", s == 200 and isinstance(r, dict) and r.get("currentStateKey") == "en_revision_cierre", str(s))

    # Sugerencia automática del checklist de CIERRE al entrar a la revisión de cierre (S5b)
    s, cls_c = call("GET", f"/work-orders/{wid4}/checklists", admin)
    closure_cl = next((c for c in cls_c if c.get("moment") == "CLOSURE"), None) if isinstance(cls_c, list) else None
    check("sugerencia auto: checklist de CIERRE materializado (moment CLOSURE, obligatorio)",
          closure_cl is not None and closure_cl.get("mandatory") is True and closure_cl.get("status") == "PENDING",
          json.dumps(closure_cl) if closure_cl else str(cls_c))
    ccid = closure_cl.get("id") if closure_cl else None

    # Puerta 4 BLOQUEADA: cerrar con actividades obligatorias abiertas → 400 (bloqueo EXPLICADO)
    s, _ = call("POST", f"/work-orders/{wid4}/transitions", admin, {"transitionKey": "cerrar", "password": PASS, "closureSummary": "cierre prematuro"})
    check("Puerta 4 BLOQUEADA: cerrar con obligatorias abiertas → 400", s == 400, str(s))

    # GATE por actividad (S5b Slice B): la actividad 1 NO puede completarse mientras su
    # verificación de EJECUCIÓN obligatoria no esté aprobada (LOTO físico, toma-5).
    s, _ = call("POST", f"/work-orders/{wid4}/activities/{aid1}/progress", admin, {"status": "DONE", "note": "intento prematuro"})
    check("gate por actividad: DONE con verificación de ejecución sin aprobar → 400", s == 400, str(s))

    # La actividad 2 (sin verificación de ejecución obligatoria) SÍ puede completarse libremente
    s, r = call("POST", f"/work-orders/{wid4}/activities/{aid2}/progress", admin, {"status": "DONE"})
    check("marcar actividad 2 DONE (sin verif. obligatoria) → 200 + 100%", s in (200, 201) and isinstance(r, dict) and r.get("status") == "DONE" and r.get("progressPct") == 100, str(s))

    # Aprobar la verificación de EJECUCIÓN de la actividad 1 (instanciar→sellar→enviar→revisor)
    st = complete_checklist(admin, reviewer, wid4, exec_cid) if (exec_cid and reviewer) else None
    check("verificación de ejecución de la actividad 1 aprobada → APPROVED", st == "APPROVED", str(st))

    # Ahora sí: la actividad 1 puede completarse (DONE fuerza 100%)
    s, r = call("POST", f"/work-orders/{wid4}/activities/{aid1}/progress", admin, {"status": "DONE", "note": "Cero energía verificado"})
    check("marcar actividad 1 DONE tras aprobar su verificación → 200 + 100%", s in (200, 201) and isinstance(r, dict) and r.get("status") == "DONE" and r.get("progressPct") == 100, str(s))

    # Puerta 4 SIGUE BLOQUEADA por el checklist de CIERRE obligatorio sin aprobar (S5b)
    s, _ = call("POST", f"/work-orders/{wid4}/transitions", admin, {"transitionKey": "cerrar", "password": PASS, "closureSummary": "sin cerrar el permiso"})
    check("Puerta 4 BLOQUEADA: cerrar con checklist de CIERRE obligatorio sin aprobar → 400", s == 400, str(s))

    # Aprobar el checklist de CIERRE (instanciar → sellar → enviar → revisor aprueba)
    st = complete_checklist(admin, reviewer, wid4, ccid) if (ccid and reviewer) else None
    check("checklist de CIERRE aprobado (instanciar→sellar→enviar→revisor) → APPROVED", st == "APPROVED", str(st))

    # Cerrar (firma Part 11) → cerrada + CLOSED + resumen de cierre
    s, r = call("POST", f"/work-orders/{wid4}/transitions", admin,
                {"transitionKey": "cerrar", "password": PASS, "closureSummary": "Trabajo ejecutado, equipo probado y devuelto a servicio."})
    check("cerrar → 200 + cerrada + CLOSED + closureSummary",
          s == 200 and isinstance(r, dict) and r.get("currentStateKey") == "cerrada"
          and r.get("lifecycle") == "CLOSED" and bool(r.get("closureSummary")),
          str(s) + (json.dumps({k: r.get(k) for k in ("currentStateKey", "lifecycle")}) if isinstance(r, dict) else ""))
    check("timeline: evento CLOSED + ACTIVITY_DONE",
          isinstance(r, dict) and any(e.get("kind") == "CLOSED" for e in r.get("events", []))
          and any(e.get("kind") == "ACTIVITY_DONE" for e in r.get("events", [])))

    # OT cerrada ⇒ ya no se registra avance → 400
    s, _ = call("POST", f"/work-orders/{wid4}/activities/{aid1}/progress", admin, {"status": "IN_PROGRESS"})
    check("avance tras cerrar la OT → 400", s == 400, str(s))

    cleanup()
    print(f"\n{len(OK)}/{len(OK)+len(FAIL)} OK" + ("" if not FAIL else f"   FALLARON: {FAIL}"))
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
