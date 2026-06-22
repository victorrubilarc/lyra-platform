#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Seed DEMO LITE — "Planta Demo Andina": un DÍA DE OPERACIÓN, liviano.

Escenario MÍNIMO y realista para que el dueño pruebe Lyra WatchLog de punta a
punta SIN abrumarse (mucho más chico que «Faena Demo QA»/DEMOQA). Acompaña al
guion `docs/QA_DIA_OPERACION.md`. Crea, todo idempotente y re-ejecutable:

  · Estructura: Planta → Concentradora → {Molienda, Flotación}  (4 nodos).
  · Equipos: Molino SAG (Molienda) + Celda Rougher (Flotación).
  · 2 listas de referencia (motivos de detención, EPP).
  · Calendario operacional (turnos A/B 12 h) + calendario fiscal (mensual).
  · 1 plantilla publicada con 2 SECCIONES y PRIVILEGIOS por sección (operador
    llena · supervisor revisa), umbral que dispara EXCEPCIÓN y una REGLA que
    abre INCIDENCIA al superar 100 °C.
  · 1 flujo publicado (borrador→enviado→revisado→cerrado) con FIRMA Part 11 en
    revisar y cerrar + SLA de permanencia. SIN MFA (prueba manual sin fricción).
  · 1 ronda programada en Molienda (responsable = rol operador) + 1 vencida.
  · 7 usuarios @demolite.local con roles reales y alcance ABAC.
  · 2 incidencias en vivo para que la lista/kanban/dashboard no salgan vacíos.

NO toca el escenario DEMOQA ni los catálogos compartidos: NO modifica las SLA de
los IncidentType base (eso se demuestra en DEMOQA), reutiliza los tipos solo para
clasificar. Todo lo creado lleva marcadores DEMO LITE para que `--clean` lo borre
sin tocar nada más:
  · OrgNode.externalCode  → empieza con "DEMOLITE-"
  · Equipment.tag         → empieza con "DL-"
  · ReferenceList.key / OperationalCalendar.key / FiscalCalendar.key /
    WorkflowDefinition.key / Role.key  → empieza con "demolite-"
  · Template.name / LogSchedule.name  → empieza con "[DEMO LITE] "
  · User.email            → termina con "@demolite.local"
  · Incident.title        → empieza con "[DLITE] "  (+ incidencias en nodos DEMOLITE)

Uso:
  python scripts/seed-demo-lite.py          # crea/actualiza el escenario liviano
  python scripts/seed-demo-lite.py --clean  # borra SOLO lo del escenario liviano

Requisitos: dev arriba (API :3000, Postgres en docker), admin demo@watchlog.local.
"""
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
ADMIN = {"email": os.environ.get("WL_ADMIN_EMAIL", "demo@watchlog.local"), "password": PASS}
DB_CONTAINER = os.environ.get("WL_DB_CONTAINER", "lyra-watchlog-dev-postgres-1")
DB_USER = os.environ.get("WL_DB_USER", "watchlog")
DB_NAME = os.environ.get("WL_DB_NAME", "watchlog")
TZ = "America/Santiago"


# ============================ HTTP helper ===================================
def call(method, path, tok=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    if body is not None:
        r.add_header("Content-Type", "application/json")
    if tok:
        r.add_header("Authorization", "Bearer " + tok)
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


def must(status, payload, what):
    if status not in (200, 201):
        print(f"   ✖ FALLO {what}: {status} {payload}")
        sys.exit(1)
    return payload


# ============================ SQL helper ====================================
def run_sql(sql, label="SQL"):
    p = subprocess.run(
        ["docker", "exec", "-i", DB_CONTAINER, "psql", "-U", DB_USER, "-d", DB_NAME,
         "-v", "ON_ERROR_STOP=1", "-q", "-t", "-A"],
        input=sql.encode("utf-8"), capture_output=True,
    )
    if p.returncode != 0:
        print(f"   ✖ {label} falló:\n{p.stderr.decode(errors='replace')}")
        sys.exit(1)
    return p.stdout.decode(errors="replace")


# ============================ Roles =========================================
# Conjuntos de permisos por rol (claves del catálogo existente; sin claves nuevas).
# requireMfa=False en TODOS: la prueba manual no exige enrolar TOTP. Para probar
# MFA, ver el apéndice del guion (se activa por rol/transición desde la app).
ROLE_DEFS = {
    "demolite-supervisor": {
        "name": "Supervisor de Turno (DEMO LITE)", "requireMfa": False,
        "perms": [
            "module:incidents:view", "module:logbook:view", "module:structure:view",
            "module:notifications:view",
            "incident:view", "incident:create", "incident:edit", "incident:assign",
            "incident:comment", "incident:transition", "incident:action:manage",
            "exception:triage", "exception:dismiss", "exception:correct",
            "logentry:view", "logentry:fill", "logentry:create", "logentry:transition",
            "schedule:view", "round:execute",
            # Cambio de turno (Fase 5): el supervisor es el actor del relevo.
            "module:handover:view", "shifthandover:view", "shifthandover:compile",
            "shifthandover:sign", "shifthandover:acknowledge",
        ],
    },
    "demolite-operador": {
        "name": "Operador (DEMO LITE)", "requireMfa": False,
        "perms": [
            "module:logbook:view", "module:incidents:view",
            "logentry:view", "logentry:create", "logentry:fill", "logentry:transition",
            "round:execute",
            "incident:view", "incident:create", "incident:comment",
            "exception:triage",
        ],
    },
    "demolite-mantenedor-hse": {
        "name": "Mantención / HSE (DEMO LITE)", "requireMfa": False,
        "perms": [
            "module:structure:view", "module:incidents:view", "module:logbook:view",
            "equipment:view", "equipment:edit",
            "incident:view", "incident:create", "incident:edit", "incident:assign",
            "incident:comment", "incident:transition",
            "incident:action:manage", "incident:action:verify",
            "exception:triage", "exception:dismiss", "exception:dismiss-critical", "exception:correct",
            "logentry:view", "audit:read",
        ],
    },
    "demolite-auditor": {
        "name": "Auditor — solo lectura (DEMO LITE)", "requireMfa": False,
        "perms": [
            "module:incidents:view", "module:logbook:view", "module:structure:view",
            "module:templates:view", "module:workflows:view", "module:security:view",
            "incident:view", "logentry:view", "template:view", "workflow:view",
            "schedule:view", "audit:read",
        ],
    },
}

# (email, displayName, [role_keys], scope) — scope: nombre de nodo, o marcador.
USERS = [
    ("admin.demo@demolite.local", "Ana Admin — Planta Demo", ["__admin__"], "__root__"),
    ("sup.saliente@demolite.local", "Sergio Supervisor (saliente)", ["demolite-supervisor"], "Concentradora"),
    ("sup.entrante@demolite.local", "Sara Supervisora (entrante)", ["demolite-supervisor"], "Concentradora"),
    ("op.molienda@demolite.local", "Olivia Operadora Molienda", ["demolite-operador"], "Molienda"),
    ("op.flotacion@demolite.local", "Óscar Operador Flotación", ["demolite-operador"], "Flotación"),
    ("hse@demolite.local", "Helena HSE / Mantención", ["demolite-mantenedor-hse"], "Concentradora"),
    ("auditor@demolite.local", "Augusto Auditor", ["demolite-auditor"], "__root__"),
]


# ============================ Estructura ====================================
ROOT = "Planta Demo Andina"
# (nombre, externalCode, [hijos]) — el nivel se deriva por profundidad.
STRUCTURE = (ROOT, "DEMOLITE-PLANTA", [
    ("Concentradora", "DEMOLITE-A-CONC", [
        ("Molienda", "DEMOLITE-P-MOL", []),
        ("Flotación", "DEMOLITE-P-FLOT", []),
    ]),
])

# Equipos por nombre de nodo: (name, tag, criticality, manufacturer)
EQUIPMENT = {
    "Molienda": [("Molino SAG 36x17 pies", "DL-MOL-01", 5, "Metso")],
    "Flotación": [("Celda Rougher RCS-100 #1", "DL-FLOT-01", 4, "Metso")],
}

REF_LISTS = [
    ("demolite-motivos-detencion", "Motivos de detención (DEMO LITE)",
     [("mecanica", "Falla mecánica"), ("electrica", "Falla eléctrica"),
      ("operacional", "Causa operacional"), ("programada", "Mantención programada")]),
    ("demolite-epp", "EPP requerido (DEMO LITE)",
     [("casco", "Casco"), ("lentes", "Lentes de seguridad"),
      ("guantes", "Guantes"), ("calzado", "Calzado de seguridad")]),
]


# ============================ Plantilla =====================================
def build_sections(role_op, role_sup):
    return [
        {
            "key": "operacion", "title": "Operación del turno",
            "description": "Lo completa el OPERADOR durante el turno.",
            "roleIds": [role_op, role_sup],
            "fields": [
                {"key": "h_op", "type": "HEADING", "label": "Parámetros de proceso",
                 "config": {"level": 2}, "colSpan": 12},
                {"key": "aviso_op", "type": "NOTICE", "label": "Cómo registrar",
                 "config": {"variant": "info", "text": "Registra las lecturas del turno. Una temperatura "
                            "≥ 90 °C marca advertencia; ≥ 100 °C es crítica, abre una excepción y "
                            "una incidencia de mantenimiento."},
                 "colSpan": 12},
                {"key": "temp_molino", "type": "NUMBER", "label": "Temperatura de descanso del molino",
                 "required": True, "colSpan": 6,
                 "config": {"unit": "°C", "min": 0, "max": 150, "decimals": 1,
                            "warnHigh": 90, "critHigh": 100, "warnRaisesException": True}},
                {"key": "hubo_detencion", "type": "BOOLEAN", "label": "¿Hubo detención no planificada?",
                 "colSpan": 6, "config": {"trueLabel": "Sí", "falseLabel": "No"}},
                {"key": "motivo_detencion", "type": "SELECT", "label": "Motivo de la detención",
                 "colSpan": 6, "visibleWhen": {"fieldKey": "hubo_detencion", "equals": True},
                 "config": {"optionSource": {"kind": "referenceList", "listKey": "demolite-motivos-detencion"}}},
                {"key": "epp_usado", "type": "MULTISELECT", "label": "EPP utilizado en la ronda",
                 "colSpan": 6,
                 "config": {"optionSource": {"kind": "referenceList", "listKey": "demolite-epp"}}},
                {"key": "equipo_inspeccionado", "type": "REFERENCE", "label": "Equipo inspeccionado",
                 "colSpan": 6, "config": {"entity": "equipment"}},
                {"key": "foto_evidencia", "type": "ATTACHMENT", "label": "Foto de evidencia",
                 "colSpan": 6, "config": {"kind": "photo", "multiple": True, "maxCount": 5}},
                {"key": "obs_op", "type": "TEXTAREA", "label": "Observaciones del operador",
                 "colSpan": 12, "config": {"maxLength": 1000}},
            ],
        },
        {
            "key": "revision", "title": "Revisión del supervisor",
            "description": "Lo completa el SUPERVISOR al revisar la entrada (estado «enviado»).",
            "roleIds": [role_sup], "editableInStateKey": "enviado",
            "fields": [
                {"key": "conforme", "type": "CONFORMITY", "label": "Revisión conforme",
                 "colSpan": 6, "config": {"allowNa": True}},
                {"key": "obs_sup", "type": "TEXTAREA", "label": "Comentarios del supervisor",
                 "colSpan": 12, "config": {"maxLength": 1000}},
            ],
        },
    ]


def build_rules(type_mant_id):
    # Regla CRUZADA: temperatura crítica ⇒ abre incidencia (debe ser WARN para tener acción).
    return [{
        "key": "temp_molino_critica",
        "name": "Temperatura de molino crítica",
        "when": {"kind": "op", "op": "gt",
                 "args": [{"kind": "var", "key": "temp_molino"}, {"kind": "lit", "value": 100}]},
        "severity": "WARN",
        "message": "La temperatura del molino superó 100 °C: se abre una incidencia de mantenimiento.",
        "action": {"kind": "openIncident", "incidentTypeId": type_mant_id, "severity": 4},
    }]


# ============================ Flujo de bitácora =============================
def build_workflow_states():
    return [
        {"key": "borrador", "name": "Borrador", "isInitial": True, "isFinal": False, "color": "#6B7280"},
        {"key": "enviado", "name": "Enviado a revisión", "isFinal": False, "color": "#06B6D4",
         "maxStayMinutes": 720},
        {"key": "revisado", "name": "Revisado", "isFinal": False, "color": "#84CC16"},
        {"key": "cerrado", "name": "Cerrado", "isFinal": True, "color": "#22C55E"},
    ]


def build_workflow_transitions(role_op, role_sup):
    # SIN MFA (requireMfa) para no forzar enrolamiento de TOTP en la prueba manual.
    return [
        {"key": "enviar", "label": "Enviar a revisión", "fromStateKey": "borrador", "toStateKey": "enviado",
         "roleIds": [role_op, role_sup]},
        {"key": "devolver", "label": "Devolver a borrador", "fromStateKey": "enviado", "toStateKey": "borrador",
         "roleIds": [role_sup]},
        {"key": "revisar", "label": "Revisar y firmar", "fromStateKey": "enviado", "toStateKey": "revisado",
         "roleIds": [role_sup], "requireSignature": True, "signatureMeaning": "Revisado"},
        {"key": "aprobar", "label": "Aprobar y cerrar", "fromStateKey": "revisado", "toStateKey": "cerrado",
         "roleIds": [role_sup], "requireSignature": True, "signatureMeaning": "Aprobado y cerrado"},
    ]


# ============================ Helpers de estructura =========================
def flatten(nodes, parent=None, out=None):
    if out is None:
        out = []
    for n in nodes:
        out.append({"id": n["id"], "name": n["name"], "parentId": parent,
                    "externalCode": n.get("externalCode")})
        flatten(n.get("children", []), n["id"], out)
    return out


def seed_levels(atok):
    s, levels = call("GET", "/structure/levels", atok)
    by_order = {lv["order"]: lv["id"] for lv in levels}
    return by_order


def seed_structure(atok, levels_by_order):
    s, tree = call("GET", "/structure/nodes", atok)
    flat = flatten(tree)
    by_extcode = {n["externalCode"]: n["id"] for n in flat if n.get("externalCode")}
    name_to_id = {}
    created = [0]

    def mk(name, extcode, depth, parent_id):
        if extcode in by_extcode:
            nid = by_extcode[extcode]
        else:
            level_id = levels_by_order[min(depth, max(levels_by_order))]
            body = {"name": name, "levelId": level_id, "externalCode": extcode}
            if parent_id:
                body["parentId"] = parent_id
            st, node = call("POST", "/structure/nodes", atok, body)
            must(st, node, f"crear nodo {name}")
            nid = node["id"]
            by_extcode[extcode] = nid
            created[0] += 1
        name_to_id[name] = nid
        return nid

    def walk(node, depth, parent_id):
        name, extcode, children = node
        nid = mk(name, extcode, depth, parent_id)
        for ch in children:
            walk(ch, depth + 1, nid)

    walk(STRUCTURE, 0, None)
    print(f"   ✓ Estructura: {created[0]} nodo(s) nuevo(s); {len(name_to_id)} en total.")
    return name_to_id


def seed_equipment(atok, name_to_id):
    n = 0
    for node_name, items in EQUIPMENT.items():
        node_id = name_to_id.get(node_name)
        if not node_id:
            continue
        s, existing = call("GET", f"/structure/equipment?orgNodeId={node_id}", atok)
        tags = {e.get("tag") for e in existing} if isinstance(existing, list) else set()
        for (name, tag, crit, maker) in items:
            if tag in tags:
                continue
            st, _ = call("POST", "/structure/equipment", atok,
                         {"name": name, "tag": tag, "criticality": crit,
                          "manufacturer": maker, "orgNodeId": node_id})
            if st in (200, 201):
                n += 1
    print(f"   ✓ Equipos: {n} nuevo(s).")


def seed_reference_lists(atok):
    s, existing = call("GET", "/reference-lists", atok)
    keys = {l["key"]: l["id"] for l in existing} if isinstance(existing, list) else {}
    for (key, name, items) in REF_LISTS:
        lid = keys.get(key)
        if not lid:
            st, lst = call("POST", "/reference-lists", atok,
                           {"key": key, "name": name, "source": "MANUAL"})
            must(st, lst, f"crear lista {key}")
            lid = lst["id"]
        s, detail = call("GET", f"/reference-lists/{lid}", atok)
        have = {it["code"] for it in (detail.get("items") or [])} if isinstance(detail, dict) else set()
        for i, (code, label) in enumerate(items):
            if code in have:
                continue
            call("POST", f"/reference-lists/{lid}/items", atok,
                 {"code": code, "label": label, "sortOrder": i})
    print(f"   ✓ Listas de referencia: {len(REF_LISTS)}.")


def seed_calendars(atok, name_to_id):
    s, cals = call("GET", "/operational-calendars", atok)
    by_key = {c["key"]: c["id"] for c in cals} if isinstance(cals, list) else {}
    cal_id = by_key.get("demolite-planta")
    if not cal_id:
        st, cal = call("POST", "/operational-calendars", atok, {
            "key": "demolite-planta", "name": "Planta Demo Andina (turnos A/B 12h)",
            "timezone": TZ, "dayStartShiftCode": "A",
            "shifts": [
                {"code": "A", "label": "Turno A (día)", "startTime": "08:00", "durationMinutes": 720, "sortOrder": 0},
                {"code": "B", "label": "Turno B (noche)", "startTime": "20:00", "durationMinutes": 720, "sortOrder": 1},
            ],
        })
        must(st, cal, "crear calendario operacional")
        cal_id = cal["id"]
    call("POST", f"/operational-calendars/{cal_id}/nodes", atok,
         {"orgNodeIds": list(name_to_id.values())})
    s, fcals = call("GET", "/fiscal-calendars", atok)
    fkeys = {c["key"] for c in fcals} if isinstance(fcals, list) else set()
    if "demolite-fiscal" not in fkeys:
        call("POST", "/fiscal-calendars", atok, {
            "key": "demolite-fiscal", "name": "Fiscal Demo Lite (mensual)",
            "timezone": TZ, "periodKind": "MONTH", "periodAnchorDay": 1,
        })
    print("   ✓ Calendarios operacional (A/B) y fiscal (mensual).")
    return cal_id


def seed_workflow(atok, roles):
    s, wfs = call("GET", "/workflows", atok)
    items = wfs if isinstance(wfs, list) else (wfs.get("items") if isinstance(wfs, dict) else [])
    wf = next((w for w in (items or []) if w.get("key") == "demolite-bitacora-turno"), None)
    if wf:
        wid = wf["id"]
    else:
        st, w = call("POST", "/workflows", atok,
                     {"key": "demolite-bitacora-turno", "name": "Bitácora de turno (DEMO LITE)",
                      "description": "Flujo de revisión y cierre de la bitácora de turno."})
        must(st, w, "crear flujo")
        wid = w["id"]
    st, r = call("PUT", f"/workflows/{wid}/draft", atok, {
        "states": build_workflow_states(),
        "transitions": build_workflow_transitions(roles["demolite-operador"], roles["demolite-supervisor"]),
    })
    must(st, r, "guardar borrador del flujo")
    call("POST", f"/workflows/{wid}/publish", atok, {"note": "Demo Lite"})
    s, detail = call("GET", f"/workflows/{wid}", atok)
    ver_id = (detail.get("currentVersionId") or (detail.get("version") or {}).get("id"))
    print(f"   ✓ Flujo de bitácora publicado (versión {ver_id}).")
    return wid, ver_id


def seed_template(atok, name_to_id, wf_id, wf_ver_id, roles, type_mant_id):
    name = "[DEMO LITE] Bitácora de Turno — Molienda"
    s, lst = call("GET", "/templates", atok)
    items = lst.get("items") if isinstance(lst, dict) else (lst if isinstance(lst, list) else [])
    tpl = next((t for t in (items or []) if t.get("name") == name and not t.get("deletedAt")), None)
    if tpl:
        tpl_id = tpl["id"]
    else:
        root = name_to_id[ROOT]
        st, t = call("POST", "/templates", atok, {
            "name": name,
            "description": "Bitácora de turno multi-actor: operador llena, supervisor revisa y firma.",
            "nodeAssignments": [{"orgNodeId": root, "includeDescendants": True}],
        })
        must(st, t, "crear plantilla")
        tpl_id = t["id"]
    body = {
        "sections": build_sections(roles["demolite-operador"], roles["demolite-supervisor"]),
        "rules": build_rules(type_mant_id),
        "workflowDefinitionId": wf_id,
        "workflowDefinitionVersionId": wf_ver_id,
        "equipmentMode": "OPTIONAL",
    }
    st, r = call("PUT", f"/templates/{tpl_id}/draft", atok, body)
    must(st, r, "guardar borrador de plantilla")
    st, r = call("POST", f"/templates/{tpl_id}/publish", atok, {})
    if st not in (200, 201):
        print(f"   ⚠ publicar plantilla devolvió {st} {r} (¿ya publicada sin cambios?).")
    call("PATCH", f"/templates/{tpl_id}", atok, {"gridFieldKeys": ["temp_molino", "obs_op"]})
    print(f"   ✓ Plantilla publicada: {tpl_id}")
    return tpl_id


def seed_schedules(atok, name_to_id, tpl_id, roles):
    node_name = "Molienda"
    sched_name = "[DEMO LITE] Ronda de molienda por turno"
    node_id = name_to_id.get(node_name)
    s, lst = call("GET", "/schedules", atok)
    existing = lst if isinstance(lst, list) else []
    sc = next((x for x in existing if x.get("name") == sched_name), None)
    if sc:
        sid = sc["id"]
    else:
        st, sc = call("POST", "/schedules", atok, {
            "name": sched_name, "templateId": tpl_id, "orgNodeId": node_id,
            "recurrenceKind": "SHIFT", "recurrenceConfig": {},
            "dueWindowMinutes": 720, "horizonDays": 3, "active": True,
            "responsibleRoleId": roles["demolite-operador"],
        })
        if st not in (200, 201):
            print(f"   ⚠ crear ronda {sched_name}: {st} {sc}")
            return
        sid = sc["id"]
    call("POST", "/schedules/generate", atok, {"scheduleId": sid})
    # Envejecer 1 ocurrencia (vencida) para mostrar el aviso de ronda vencida.
    run_sql(
        "UPDATE \"RoundOccurrence\" SET \"dueAt\" = now() - interval '6 hours' WHERE id IN ("
        "SELECT ro.id FROM \"RoundOccurrence\" ro "
        "JOIN \"LogSchedule\" ls ON ro.\"scheduleId\" = ls.id "
        "WHERE ls.name = '[DEMO LITE] Ronda de molienda por turno' AND ro.status = 'PENDING' "
        "ORDER BY ro.\"scheduledFor\" LIMIT 1);", "envejecer ronda")
    print("   ✓ Programación de rondas + ocurrencias (1 vencida).")


def seed_roles(atok):
    s, existing = call("GET", "/security/roles", atok)
    by_key = {r["key"]: r["id"] for r in existing} if isinstance(existing, list) else {}
    ids = {}
    for key, d in ROLE_DEFS.items():
        if key in by_key:
            rid = by_key[key]
            call("PATCH", f"/security/roles/{rid}", atok,
                 {"name": d["name"], "permissionKeys": d["perms"], "requireMfa": d["requireMfa"]})
        else:
            st, r = call("POST", "/security/roles", atok,
                         {"key": key, "name": d["name"], "permissionKeys": d["perms"],
                          "requireMfa": d["requireMfa"]})
            must(st, r, f"crear rol {key}")
            rid = r["id"]
        ids[key] = rid
    print(f"   ✓ Roles demo: {len(ids)}.")
    return ids


def seed_users(atok, name_to_id):
    s, existing = call("GET", "/security/users", atok)
    by_email = {u["email"]: u["id"] for u in existing} if isinstance(existing, list) else {}
    s, roles_list = call("GET", "/security/roles", atok)
    role_id_by_key = {r["key"]: r["id"] for r in roles_list} if isinstance(roles_list, list) else {}
    n = 0
    for (email, name, role_keys, scope) in USERS:
        uid = by_email.get(email)
        if not uid:
            st, u = call("POST", "/security/users", atok,
                         {"email": email, "displayName": name, "password": PASS, "roleIds": []})
            must(st, u, f"crear usuario {email}")
            uid = u["id"]
            n += 1
        rk = role_keys[0]
        if rk == "__admin__":
            role_ids = [role_id_by_key["admin"]]
        else:
            role_ids = [role_id_by_key[k] for k in role_keys if k in role_id_by_key]
        call("PUT", f"/security/users/{uid}/roles", atok, {"roleIds": role_ids})
        if scope == "__root__":
            scope_nodes = [name_to_id[ROOT]]
        else:
            scope_nodes = [name_to_id[scope]]
        call("PUT", f"/security/users/{uid}/scope", atok,
             {"scopes": [{"orgNodeId": nid, "includeDescendants": True} for nid in scope_nodes]})
    run_sql("UPDATE \"User\" SET \"forcePasswordChange\"=false, status='ACTIVE' "
            "WHERE email LIKE '%@demolite.local';", "activar usuarios demo lite")
    print(f"   ✓ Usuarios: {n} nuevo(s); roles y alcance asignados; activos sin cambio forzado.")


def seed_live_incidents(atok, name_to_id, types_by_key, user_ids):
    """Un par de incidencias RECIENTES para que lista/kanban/dashboard no salgan vacíos."""
    mol = name_to_id["Molienda"]
    flot = name_to_id["Flotación"]
    samples = []
    if "mantenimiento" in types_by_key:
        samples.append({"title": "[DLITE] Vibración elevada en Molino SAG",
                        "typeId": types_by_key["mantenimiento"]["id"], "severity": 3, "orgNodeId": mol,
                        "description": "Vibración 14 mm/s sostenida en turno A.",
                        "ownerId": user_ids.get("hse@demolite.local")})
    if "seguridad" in types_by_key:
        samples.append({"title": "[DLITE] Casi-accidente: resbalón en pasarela",
                        "typeId": types_by_key["seguridad"]["id"], "severity": 4, "orgNodeId": flot,
                        "description": "Operador resbaló; sin lesión. Requiere investigación."})
    s, existing = call("GET", "/incidents?search=%5BDLITE%5D", atok)
    have = set()
    if isinstance(existing, dict):
        for it in existing.get("items", []):
            have.add(it.get("title"))
    n = 0
    for sm in samples:
        if sm["title"] in have:
            continue
        st, r = call("POST", "/incidents", atok, sm)
        if st in (200, 201):
            n += 1
        else:
            print(f"   ⚠ crear incidencia en vivo: {st} {r}")
    print(f"   ✓ Incidencias en vivo: {n} nueva(s).")


def run_workers(atok):
    for path in ("/notifications/run", "/rule-actions/run"):
        st, r = call("POST", path, atok, {})
        flag = "✓" if st in (200, 201) else "⚠"
        print(f"   {flag} worker {path}: {st}")


# ============================ Limpieza ======================================
CLEAN_SQL = r"""
BEGIN;
-- Incidencias del escenario: por título [DLITE] o por estar en un nodo DEMOLITE
-- (cubre las creadas a mano o por la regla durante la prueba) + dependientes.
CREATE TEMP TABLE _lite_node AS
  SELECT id FROM "OrgNode" WHERE "externalCode" LIKE 'DEMOLITE-%';
CREATE TEMP TABLE _lite_inc AS
  SELECT id FROM "Incident"
  WHERE title LIKE '[DLITE]%' OR "orgNodeId" IN (SELECT id FROM _lite_node);
DELETE FROM "IncidentReport"            WHERE "incidentId" IN (SELECT id FROM _lite_inc);
DELETE FROM "IncidentAction"            WHERE "incidentId" IN (SELECT id FROM _lite_inc);
DELETE FROM "IncidentInvestigationStep" WHERE "investigationId" IN
  (SELECT id FROM "IncidentInvestigation" WHERE "incidentId" IN (SELECT id FROM _lite_inc));
DELETE FROM "IncidentInvestigation" WHERE "incidentId" IN (SELECT id FROM _lite_inc);
DELETE FROM "IncidentExceptionLink" WHERE "incidentId" IN (SELECT id FROM _lite_inc);
DELETE FROM "IncidentComment"       WHERE "incidentId" IN (SELECT id FROM _lite_inc);
DELETE FROM "IncidentActivity"      WHERE "incidentId" IN (SELECT id FROM _lite_inc);
DELETE FROM "IncidentTransition"    WHERE "incidentId" IN (SELECT id FROM _lite_inc);
DELETE FROM "Incident"              WHERE id IN (SELECT id FROM _lite_inc);

-- Entradas de bitácora y rondas del escenario (por plantilla/horarios demo).
CREATE TEMP TABLE _lite_tpl AS SELECT id FROM "Template" WHERE name LIKE '[DEMO LITE]%';
CREATE TEMP TABLE _lite_entry AS
  SELECT le.id FROM "LogEntry" le
  JOIN "TemplateVersion" tv ON le."templateVersionId" = tv.id
  WHERE tv."templateId" IN (SELECT id FROM _lite_tpl);
DELETE FROM "RuleActionOutbox"   WHERE "logEntryId" IN (SELECT id FROM _lite_entry);
DELETE FROM "LogEntryException"  WHERE "logEntryId" IN (SELECT id FROM _lite_entry);
DELETE FROM "LogEntryValue"      WHERE "logEntryId" IN (SELECT id FROM _lite_entry);
DELETE FROM "LogEntrySignature"  WHERE "logEntryId" IN (SELECT id FROM _lite_entry);
DELETE FROM "RoundOccurrence"    WHERE "scheduleId" IN (SELECT id FROM "LogSchedule" WHERE name LIKE '[DEMO LITE]%');
DELETE FROM "LogEntry"           WHERE id IN (SELECT id FROM _lite_entry);
DELETE FROM "LogSchedule"        WHERE name LIKE '[DEMO LITE]%';

-- Plantillas demo (versiones + secciones + campos + asignaciones por cascada).
DELETE FROM "Template" WHERE id IN (SELECT id FROM _lite_tpl);

-- Flujos / listas / calendarios demo.
DELETE FROM "WorkflowDefinition" WHERE key LIKE 'demolite-%';
DELETE FROM "ReferenceList" WHERE key LIKE 'demolite-%';
DELETE FROM "OperationalCalendar" WHERE key LIKE 'demolite-%';
DELETE FROM "FiscalCalendar"      WHERE key LIKE 'demolite-%';

-- Equipos demo.
DELETE FROM "Equipment" WHERE tag LIKE 'DL-%';

-- Estructura demo (nodos por externalCode DEMOLITE-*).
DELETE FROM "OrgNode" WHERE "externalCode" LIKE 'DEMOLITE-%';

-- Notificaciones generadas para usuarios demo (refs blandas, se limpian por marca).
DELETE FROM "NotificationOutbox" WHERE "recipientEmail" LIKE '%@demolite.local';

-- Usuarios demo (preferencias, roles, scopes, sesiones primero).
CREATE TEMP TABLE _lite_user AS SELECT id FROM "User" WHERE email LIKE '%@demolite.local';
DELETE FROM "NotificationPreference" WHERE "userId" IN (SELECT id FROM _lite_user);
DELETE FROM "Scope"       WHERE "userId" IN (SELECT id FROM _lite_user);
DELETE FROM "UserRole"    WHERE "userId" IN (SELECT id FROM _lite_user);
DELETE FROM "Session"     WHERE "userId" IN (SELECT id FROM _lite_user);
DELETE FROM "User"        WHERE id IN (SELECT id FROM _lite_user);

-- Roles demo.
DELETE FROM "RolePermission" WHERE "roleId" IN (SELECT id FROM "Role" WHERE key LIKE 'demolite-%');
DELETE FROM "Role" WHERE key LIKE 'demolite-%';
COMMIT;
"""


def do_clean():
    print("⚠  Limpiando el escenario DEMO LITE…")
    run_sql(CLEAN_SQL, "limpieza")
    print("✓ Escenario DEMO LITE eliminado. (DEMOQA, catálogos base y usuarios reales intactos.)")


# ============================ main ==========================================
def main():
    s, login = call("POST", "/auth/login", body=ADMIN)
    if s != 200:
        print("No se pudo iniciar sesión (¿dev arriba?):", s, login)
        sys.exit(1)
    atok = login["accessToken"]

    print("▶ Sembrando escenario DEMO LITE — Planta Demo Andina (un día de operación)…")
    roles = seed_roles(atok)
    levels = seed_levels(atok)
    name_to_id = seed_structure(atok, levels)
    seed_equipment(atok, name_to_id)
    seed_reference_lists(atok)
    seed_calendars(atok, name_to_id)
    wf_id, wf_ver = seed_workflow(atok, roles)

    s, types = call("GET", "/incidents/types", atok)
    types_by_key = {t["key"]: t for t in types} if isinstance(types, list) else {}
    if "mantenimiento" not in types_by_key:
        print("   ✖ No existe el tipo de incidencia base 'mantenimiento'. Corre `pnpm db:seed` primero.")
        sys.exit(1)

    tpl_id = seed_template(atok, name_to_id, wf_id, wf_ver, roles, types_by_key["mantenimiento"]["id"])
    seed_schedules(atok, name_to_id, tpl_id, roles)
    seed_users(atok, name_to_id)

    s, users = call("GET", "/security/users", atok)
    user_ids = {u["email"]: u["id"] for u in users} if isinstance(users, list) else {}
    seed_live_incidents(atok, name_to_id, types_by_key, user_ids)
    run_workers(atok)

    print("\n──────────── DEMO LITE LISTO (web :5173) ────────────")
    print(" Estructura: «Planta Demo Andina» → Concentradora → {Molienda, Flotación}.")
    print(" Credenciales: todas con contraseña  Demo!Pass2026")
    for (email, name, _r, _s) in USERS:
        print(f"   • {email:30s} {name}")
    print(" Guion paso a paso: docs/QA_DIA_OPERACION.md")


if __name__ == "__main__":
    if "--clean" in sys.argv:
        do_clean()
    else:
        main()
