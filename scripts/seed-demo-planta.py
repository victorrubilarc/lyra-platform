#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Seed de DEMO QA — "Faena Demo QA": concentradora de cobre de punta a punta.

Escenario completo para la VALIDACIÓN end-to-end de Lyra WatchLog (sesión QA previa
a la Fase 5). Crea, todo idempotente y re-ejecutable:

  a/b) Estructura Faena → Áreas → Procesos → Líneas (con códigos ERP/CMMS) + equipos.
  c)   3 listas de referencia (motivos de detención, tipos de falla, EPP).
  d)   Calendario operacional (turnos A/B 12h) + calendario fiscal (mensual).
  e)   Plantilla publicada multi-sección/multi-actor con tipos de campo variados,
       umbral que dispara excepción, lógica condicional y una REGLA que abre incidencia.
  f)   Flujo de bitácora publicado (transiciones role-gated, firma Part 11, MFA, SLA).
  g)   Catálogo de incidencias con SLA + escalamiento (obligaciones ya en el seed base).
  i)   Programación de rondas por turno (con ocurrencias, algunas vencidas).
  j)   ~8 semanas de incidencias históricas "envejecidas" por SQL (cerradas/vencidas/
       reincidencia + CAPA + reportes) para que el dashboard/KPIs no salgan en cero.
  k)   Roster de 9 usuarios @planta.local (rol + alcance ABAC).

TODO lo creado lleva marcadores DEMO QA para que `--clean` lo borre sin tocar nada más:
  · OrgNode.externalCode  → empieza con "DEMOQA-"
  · Equipment.tag         → empieza con "DQ-"
  · ReferenceList.key / OperationalCalendar.key / FiscalCalendar.key / Workflow.key
    / Role.key            → empieza con "demoqa-"
  · Template.name         → empieza con "[DEMO QA] "
  · LogSchedule.name      → empieza con "[DEMO QA] "
  · User.email            → termina con "@planta.local"
  · Incident.title        → empieza con "[DQA] "  (id histórico: "demoqa-h-*")

Uso:
  python scripts/seed-demo-planta.py            # crea/actualiza todo el escenario
  python scripts/seed-demo-planta.py --clean    # borra SOLO lo del escenario demo
  python scripts/seed-demo-planta.py --no-history  # omite el histórico envejecido

Requisitos: dev arriba (API :3000, Postgres en docker), admin demo@watchlog.local.
"""
import json
import os
import random
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE = os.environ.get("WL_BASE", "http://localhost:3000/api")
PASS = os.environ.get("WL_DEMO_PASS", "Demo!Pass2026")
ADMIN = {"email": os.environ.get("WL_ADMIN_EMAIL", "demo@watchlog.local"), "password": PASS}
DB_CONTAINER = os.environ.get("WL_DB_CONTAINER", "lyra-watchlog-dev-postgres-1")
DB_USER = os.environ.get("WL_DB_USER", "watchlog")
DB_NAME = os.environ.get("WL_DB_NAME", "watchlog")
TZ = "America/Santiago"

random.seed(20260618)  # reproducible


# ============================ HTTP helper ===================================
def call(method, path, tok=None, body=None, ok=(200, 201)):
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


def sqlstr(v):
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"


# ============================ Roles =========================================
# Conjuntos de permisos por rol (claves del catálogo existente; sin claves nuevas).
ROLE_DEFS = {
    "demoqa-jefe-planta": {
        "name": "Jefe de Planta (DEMO QA)", "requireMfa": True,
        "perms": [
            "module:incidents:view", "module:logbook:view", "module:structure:view",
            "module:notifications:view", "module:settings:view",
            "incident:view", "incident:create", "incident:edit", "incident:assign",
            "incident:comment", "incident:transition", "incident:cancel",
            "incident:action:manage", "incident:action:verify",
            "exception:triage", "exception:dismiss", "exception:dismiss-critical", "exception:correct",
            "logentry:view", "logentry:transition", "schedule:view",
            "opsperiod:view", "audit:read",
        ],
    },
    "demoqa-supervisor": {
        "name": "Supervisor de Área (DEMO QA)", "requireMfa": False,
        "perms": [
            "module:incidents:view", "module:logbook:view", "module:structure:view",
            "incident:view", "incident:create", "incident:edit", "incident:assign",
            "incident:comment", "incident:transition", "incident:action:manage",
            "exception:triage", "exception:dismiss", "exception:correct",
            "logentry:view", "logentry:fill", "logentry:create", "logentry:transition",
            "schedule:view", "round:execute",
        ],
    },
    "demoqa-operador": {
        "name": "Operador (DEMO QA)", "requireMfa": False,
        "perms": [
            "module:logbook:view", "module:incidents:view",
            "logentry:view", "logentry:create", "logentry:fill", "logentry:transition",
            "round:execute",
            "incident:view", "incident:create", "incident:comment", "incident:action:manage",
            "exception:triage",
        ],
    },
    "demoqa-mantenedor": {
        "name": "Mantenedor (DEMO QA)", "requireMfa": False,
        "perms": [
            "module:structure:view", "module:incidents:view",
            "equipment:view", "equipment:edit",
            "incident:view", "incident:comment", "incident:action:manage",
            "logentry:view",
        ],
    },
    "demoqa-hse": {
        "name": "Prevención / HSE (DEMO QA)", "requireMfa": False,
        "perms": [
            "module:incidents:view", "module:logbook:view",
            "incident:view", "incident:create", "incident:edit", "incident:assign",
            "incident:comment", "incident:transition",
            "incident:action:manage", "incident:action:verify",
            "incidentcatalog:manage",
            "exception:triage", "exception:dismiss", "exception:dismiss-critical", "exception:correct",
            "logentry:view", "audit:read",
        ],
    },
    "demoqa-auditor": {
        "name": "Auditor — solo lectura (DEMO QA)", "requireMfa": False,
        "perms": [
            "module:incidents:view", "module:logbook:view", "module:structure:view",
            "module:templates:view", "module:workflows:view", "module:referencedata:view",
            "module:opscalendar:view", "module:security:view", "module:notifications:view",
            "incident:view", "logentry:view", "template:view", "workflow:view",
            "referencelist:view", "opscalendar:view", "opsperiod:view",
            "schedule:view", "role:read", "user:read", "audit:read",
            "notification:view-outbox",
        ],
    },
    "demoqa-configurador": {
        "name": "Configurador (DEMO QA)", "requireMfa": False,
        "perms": [
            "module:templates:view", "module:templates:manage",
            "module:workflows:view", "module:workflows:manage",
            "module:referencedata:view", "module:referencedata:manage",
            "module:structure:view", "module:structure:manage",
            "module:opscalendar:view", "module:opscalendar:manage",
            "module:incidents:view",
            "template:view", "template:create", "template:edit", "template:publish", "template:delete",
            "workflow:view", "workflow:manage",
            "referencelist:view", "referencelist:manage",
            "opscalendar:view", "opscalendar:manage",
            "opsperiod:view", "opsperiod:close", "opsperiod:reopen",
            "orgnode:read", "orgnode:create", "orgnode:edit", "orglevel:manage",
            "equipment:view", "equipment:create", "equipment:edit", "equipmentcategory:manage",
            "schedule:view", "schedule:manage",
            "incident:view", "incidentcatalog:manage",
        ],
    },
}

USERS = [
    ("admin@planta.local", "Ana Admin — Faena", ["__admin__"], "__faena__"),
    ("jefe.planta@planta.local", "Jorge Jefe de Planta", ["demoqa-jefe-planta"], "__faena__"),
    ("sup.molienda@planta.local", "Sofía Supervisora Molienda", ["demoqa-supervisor"], "Chancado y Molienda"),
    ("sup.flotacion@planta.local", "Felipe Supervisor Flotación", ["demoqa-supervisor"], "Flotación"),
    ("op.molienda@planta.local", "Olivia Operadora Molienda", ["demoqa-operador"], "Molienda SAG"),
    ("mantenedor@planta.local", "Mauricio Mantenedor", ["demoqa-mantenedor"], "__mant__"),
    ("hse@planta.local", "Helena HSE", ["demoqa-hse"], "__faena__"),
    ("auditor@planta.local", "Augusto Auditor", ["demoqa-auditor"], "__faena__"),
    ("configurador@planta.local", "Camila Configuradora", ["demoqa-configurador"], "__faena__"),
]


# ============================ Estructura ====================================
ROOT = "Faena Demo QA"
# (nombre, externalCode, [hijos]) — el nivel se deriva por profundidad.
STRUCTURE = (ROOT, "DEMOQA-FAENA", [
    ("Chancado y Molienda", "DEMOQA-A-CHM", [
        ("Chancado Primario", "DEMOQA-P-CHP", []),
        ("Molienda SAG", "DEMOQA-P-MSAG", [
            ("Línea SAG 1", "DEMOQA-L-SAG1", []),
            ("Línea SAG 2", "DEMOQA-L-SAG2", []),
        ]),
        ("Molienda de Bolas", "DEMOQA-P-MBOL", []),
    ]),
    ("Flotación", "DEMOQA-A-FLOT", [
        ("Flotación Rougher", "DEMOQA-P-ROUG", []),
        ("Flotación Cleaner", "DEMOQA-P-CLEA", []),
        ("Flotación Columnar", "DEMOQA-P-COLU", []),
    ]),
    ("Espesamiento", "DEMOQA-A-ESP", [
        ("Espesador de Concentrado", "DEMOQA-P-ESPC", []),
        ("Espesador de Relaves", "DEMOQA-P-ESPR", []),
    ]),
    ("Servicios", "DEMOQA-A-SERV", [
        ("Suministro de Agua", "DEMOQA-P-AGUA", []),
        ("Aire Comprimido", "DEMOQA-P-AIRE", []),
    ]),
])

# Equipos por nombre de nodo: (name, tag, criticality, manufacturer)
EQUIPMENT = {
    "Chancado Primario": [("Chancador Giratorio 60x113", "DQ-CHP-01", 5, "Metso")],
    "Molienda SAG": [("Molino SAG 36x17 pies", "DQ-MSAG-01", 5, "Metso")],
    "Línea SAG 1": [("Bomba de pulpa GIW 1", "DQ-SAG1-BP01", 3, "KSB")],
    "Línea SAG 2": [("Bomba de pulpa GIW 2", "DQ-SAG2-BP02", 3, "KSB")],
    "Molienda de Bolas": [("Molino de Bolas 22x36 pies", "DQ-MBOL-01", 4, "FLSmidth")],
    "Flotación Rougher": [("Celda Rougher RCS-100 #1", "DQ-ROUG-01", 4, "Metso"),
                          ("Celda Rougher RCS-100 #2", "DQ-ROUG-02", 3, "Metso")],
    "Flotación Cleaner": [("Celda Cleaner RCS-50 #1", "DQ-CLEA-01", 3, "Metso")],
    "Flotación Columnar": [("Columna de flotación CF-3", "DQ-COLU-01", 3, "Eriez")],
    "Espesador de Concentrado": [("Espesador Hi-Rate 25m", "DQ-ESPC-01", 4, "Outotec")],
    "Espesador de Relaves": [("Espesador de cono profundo 40m", "DQ-ESPR-01", 5, "Outotec")],
    "Suministro de Agua": [("Bomba de agua fresca VTP-300", "DQ-AGUA-01", 3, "Goulds")],
    "Aire Comprimido": [("Compresor de tornillo GA-160", "DQ-AIRE-01", 2, "Atlas Copco")],
}

REF_LISTS = [
    ("demoqa-motivos-detencion", "Motivos de detención (DEMO QA)",
     [("mecanica", "Falla mecánica"), ("electrica", "Falla eléctrica"),
      ("operacional", "Causa operacional"), ("atollo", "Atollo / atascamiento"),
      ("externa", "Causa externa (energía/agua)"), ("programada", "Mantención programada")]),
    ("demoqa-tipos-falla", "Tipos de falla (DEMO QA)",
     [("desgaste", "Desgaste"), ("fatiga", "Fatiga de material"), ("corrosion", "Corrosión"),
      ("sobrecarga", "Sobrecarga"), ("lubricacion", "Falla de lubricación"), ("sensor", "Falla de sensor/instrumento")]),
    ("demoqa-epp", "EPP requerido (DEMO QA)",
     [("casco", "Casco"), ("lentes", "Lentes de seguridad"), ("guantes", "Guantes"),
      ("calzado", "Calzado de seguridad"), ("respirador", "Respirador"), ("arnes", "Arnés")]),
]


# ============================ Plantilla =====================================
def build_sections(role_op, role_sup, role_jefe):
    return [
        {
            "key": "operacion", "title": "Operación del turno",
            "description": "Lo completa el OPERADOR durante el turno.",
            "roleIds": [role_op, role_sup],
            "fields": [
                {"key": "h_op", "type": "HEADING", "label": "Parámetros de proceso",
                 "config": {"level": 2}, "colSpan": 12},
                {"key": "aviso_op", "type": "NOTICE", "label": "Cómo registrar",
                 "config": {"variant": "info", "text": "Registra las lecturas del turno. "
                            "Una temperatura ≥ 90 °C marca advertencia; ≥ 100 °C es crítica y abre una excepción."},
                 "colSpan": 12},
                {"key": "temp_molino", "type": "NUMBER", "label": "Temperatura de descanso del molino",
                 "required": True, "colSpan": 6,
                 "config": {"unit": "°C", "min": 0, "max": 150, "decimals": 1,
                            "warnHigh": 90, "critHigh": 100, "warnRaisesException": True}},
                {"key": "vibracion_molino", "type": "NUMBER", "label": "Vibración del molino",
                 "colSpan": 6,
                 "config": {"unit": "mm/s", "min": 0, "max": 30, "decimals": 1, "warnHigh": 11, "critHigh": 18}},
                {"key": "hubo_detencion", "type": "BOOLEAN", "label": "¿Hubo detención no planificada?",
                 "colSpan": 6, "config": {"trueLabel": "Sí", "falseLabel": "No"}},
                {"key": "motivo_detencion", "type": "SELECT", "label": "Motivo de la detención",
                 "colSpan": 6, "visibleWhen": {"fieldKey": "hubo_detencion", "equals": True},
                 "config": {"optionSource": {"kind": "referenceList", "listKey": "demoqa-motivos-detencion"}}},
                {"key": "epp_usado", "type": "MULTISELECT", "label": "EPP utilizado en la ronda",
                 "colSpan": 6,
                 "config": {"optionSource": {"kind": "referenceList", "listKey": "demoqa-epp"}}},
                {"key": "equipo_critico", "type": "REFERENCE", "label": "Equipo inspeccionado",
                 "colSpan": 6, "config": {"entity": "equipment"}},
                {"key": "lecturas", "type": "MATRIX", "label": "Lecturas por momento del turno",
                 "help": "Cada celda es una lectura del parámetro.", "colSpan": 12,
                 "config": {
                     "rowHeaderLabel": "Parámetro",
                     "rows": [
                         {"key": "tonelaje", "label": "Tonelaje (t/h)"},
                         {"key": "presion", "label": "Presión hidrociclón (psi)"},
                         {"key": "solidos", "label": "% sólidos"},
                     ],
                     "columns": [
                         {"key": "inicio", "label": "Inicio"},
                         {"key": "medio", "label": "Mitad"},
                         {"key": "fin", "label": "Fin"},
                     ],
                     "cell": {"type": "NUMBER", "config": {"min": 0, "max": 100000, "decimals": 1}},
                 }},
                {"key": "registro_paradas", "type": "TABLE", "label": "Registro de paradas",
                 "colSpan": 12,
                 "config": {
                     "layout": "table", "minRows": 0, "addRowLabel": "Agregar parada",
                     "columns": [
                         {"key": "hora", "label": "Hora", "type": "TEXT"},
                         {"key": "motivo", "label": "Motivo", "type": "TEXT"},
                         {"key": "duracion", "label": "Duración (min)", "type": "NUMBER", "config": {"min": 0}},
                     ],
                 }},
                {"key": "foto_evidencia", "type": "ATTACHMENT", "label": "Foto de evidencia",
                 "colSpan": 6, "config": {"kind": "photo", "multiple": True, "maxCount": 5}},
                {"key": "obs_op", "type": "TEXTAREA", "label": "Observaciones del operador",
                 "colSpan": 12, "config": {"maxLength": 1000}},
            ],
        },
        {
            "key": "revision", "title": "Revisión del supervisor",
            "description": "Lo completa el SUPERVISOR al revisar la entrada (estado «enviado»).",
            "roleIds": [role_sup, role_jefe], "editableInStateKey": "enviado",
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


def build_workflow_transitions(role_op, role_sup, role_jefe):
    return [
        {"key": "enviar", "label": "Enviar a revisión", "fromStateKey": "borrador", "toStateKey": "enviado",
         "roleIds": [role_op, role_sup]},
        {"key": "devolver", "label": "Devolver a borrador", "fromStateKey": "enviado", "toStateKey": "borrador",
         "roleIds": [role_sup, role_jefe]},
        {"key": "revisar", "label": "Revisar y firmar", "fromStateKey": "enviado", "toStateKey": "revisado",
         "roleIds": [role_sup, role_jefe], "requireSignature": True, "signatureMeaning": "Revisado"},
        {"key": "aprobar", "label": "Aprobar y cerrar", "fromStateKey": "revisado", "toStateKey": "cerrado",
         "roleIds": [role_jefe], "requireMfa": True, "requireSignature": True, "signatureMeaning": "Aprobado"},
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


def seed_levels(atok):
    s, levels = call("GET", "/structure/levels", atok)
    by_order = {lv["order"]: lv["id"] for lv in levels}
    # Aseguramos un 4º nivel "Línea" (order 3) para probar alcance por subárbol.
    if 3 not in by_order:
        st, lv = call("POST", "/structure/levels", atok, {"name": "Línea", "order": 3})
        if st in (200, 201):
            by_order[3] = lv["id"]
            print("   ✓ Nivel «Línea» (order 3) creado.")
    return by_order


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
    cal_id = by_key.get("demoqa-faena")
    if not cal_id:
        st, cal = call("POST", "/operational-calendars", atok, {
            "key": "demoqa-faena", "name": "Faena Demo QA (turnos A/B 12h)",
            "timezone": TZ, "dayStartShiftCode": "A",
            "shifts": [
                {"code": "A", "label": "Turno A (día)", "startTime": "08:00", "durationMinutes": 720, "sortOrder": 0},
                {"code": "B", "label": "Turno B (noche)", "startTime": "20:00", "durationMinutes": 720, "sortOrder": 1},
            ],
        })
        must(st, cal, "crear calendario operacional")
        cal_id = cal["id"]
    # Asignar TODOS los nodos demo al calendario (resolución de turnos por nodo).
    call("POST", f"/operational-calendars/{cal_id}/nodes", atok,
         {"orgNodeIds": list(name_to_id.values())})
    # Calendario fiscal mensual.
    s, fcals = call("GET", "/fiscal-calendars", atok)
    fkeys = {c["key"] for c in fcals} if isinstance(fcals, list) else set()
    if "demoqa-fiscal" not in fkeys:
        call("POST", "/fiscal-calendars", atok, {
            "key": "demoqa-fiscal", "name": "Fiscal Demo QA (mensual)",
            "timezone": TZ, "periodKind": "MONTH", "periodAnchorDay": 1,
        })
    print("   ✓ Calendarios operacional (A/B) y fiscal (mensual).")
    return cal_id


def seed_workflow(atok, roles):
    s, wfs = call("GET", "/workflows", atok)
    items = wfs if isinstance(wfs, list) else (wfs.get("items") if isinstance(wfs, dict) else [])
    wf = next((w for w in (items or []) if w.get("key") == "demoqa-bitacora-turno"), None)
    if wf:
        wid = wf["id"]
    else:
        st, w = call("POST", "/workflows", atok,
                     {"key": "demoqa-bitacora-turno", "name": "Bitácora de turno (DEMO QA)",
                      "description": "Flujo de revisión y cierre de la bitácora de turno."})
        must(st, w, "crear flujo")
        wid = w["id"]
    st, _ = call("PUT", f"/workflows/{wid}/draft", atok, {
        "states": build_workflow_states(),
        "transitions": build_workflow_transitions(roles["demoqa-operador"], roles["demoqa-supervisor"], roles["demoqa-jefe-planta"]),
    })
    must(st, _, "guardar borrador del flujo")
    st, pub = call("POST", f"/workflows/{wid}/publish", atok, {"note": "Demo QA"})
    # publish puede devolver 200/201 o 409 si ya está publicado idéntico; toleramos.
    s, detail = call("GET", f"/workflows/{wid}", atok)
    ver_id = (detail.get("currentVersionId") or (detail.get("version") or {}).get("id"))
    print(f"   ✓ Flujo de bitácora publicado (versión {ver_id}).")
    return wid, ver_id


def seed_template(atok, name_to_id, wf_id, wf_ver_id, roles, type_mant_id):
    name = "[DEMO QA] Bitácora de Turno — Molienda"
    s, lst = call("GET", "/templates", atok)
    items = lst.get("items") if isinstance(lst, dict) else (lst if isinstance(lst, list) else [])
    tpl = next((t for t in (items or []) if t.get("name") == name and not t.get("deletedAt")), None)
    if tpl:
        tpl_id = tpl["id"]
    else:
        faena = name_to_id[ROOT]
        st, t = call("POST", "/templates", atok, {
            "name": name,
            "description": "Bitácora de turno multi-actor: operador llena, supervisor revisa y firma.",
            "nodeAssignments": [{"orgNodeId": faena, "includeDescendants": True}],
        })
        must(st, t, "crear plantilla")
        tpl_id = t["id"]
    body = {
        "sections": build_sections(roles["demoqa-operador"], roles["demoqa-supervisor"], roles["demoqa-jefe-planta"]),
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


def seed_incident_catalog_sla(atok, roles, types_by_key):
    # Set SLA + escalamiento (al Jefe de Planta) en tipos clave. upsert SIN ?create = update.
    jefe = roles["demoqa-jefe-planta"]
    plans = [
        ("mantenimiento", 2880, 720),   # 48 h plazo, escala 12 h tras vencer
        ("seguridad", 1440, 480),       # 24 h, escala 8 h
        ("operacional", 4320, None),    # 72 h, sin escalamiento
    ]
    for key, due, esc in plans:
        t = types_by_key.get(key)
        if not t:
            continue
        body = {"key": key, "name": t["name"], "resolutionDueMinutes": due}
        if esc:
            body["escalationAfterMinutes"] = esc
            body["escalationRoleId"] = jefe
        st, r = call("POST", "/incidents/types", atok, body)
        if st not in (200, 201):
            print(f"   ⚠ SLA en tipo {key}: {st} {r}")
    print("   ✓ SLA + escalamiento configurado en tipos clave.")


def seed_schedules(atok, name_to_id, tpl_id, roles):
    targets = [
        ("Molienda SAG", "[DEMO QA] Ronda de molienda por turno", roles["demoqa-operador"]),
        ("Flotación Rougher", "[DEMO QA] Ronda de flotación por turno", roles["demoqa-supervisor"]),
    ]
    s, lst = call("GET", "/schedules", atok)
    existing = lst if isinstance(lst, list) else []
    for node_name, sched_name, role_id in targets:
        node_id = name_to_id.get(node_name)
        sc = next((x for x in existing if x.get("name") == sched_name), None)
        if sc:
            sid = sc["id"]
        else:
            st, sc = call("POST", "/schedules", atok, {
                "name": sched_name, "templateId": tpl_id, "orgNodeId": node_id,
                "recurrenceKind": "SHIFT", "recurrenceConfig": {},
                "dueWindowMinutes": 720, "horizonDays": 3, "active": True,
                "responsibleRoleId": role_id,
            })
            if st not in (200, 201):
                print(f"   ⚠ crear ronda {sched_name}: {st} {sc}")
                continue
            sid = sc["id"]
        call("POST", "/schedules/generate", atok, {"scheduleId": sid})
    print("   ✓ Programación de rondas + ocurrencias generadas.")


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
        # Roles
        rk = role_keys[0]
        if rk == "__admin__":
            role_ids = [role_id_by_key["admin"]]
        else:
            role_ids = [role_id_by_key[k] for k in role_keys if k in role_id_by_key]
        call("PUT", f"/security/users/{uid}/roles", atok, {"roleIds": role_ids})
        # Alcance (ABAC por nodo)
        if scope == "__faena__":
            scope_nodes = [name_to_id[ROOT]]
        elif scope == "__mant__":
            scope_nodes = [name_to_id["Chancado y Molienda"], name_to_id["Servicios"]]
        else:
            scope_nodes = [name_to_id[scope]]
        call("PUT", f"/security/users/{uid}/scope", atok,
             {"scopes": [{"orgNodeId": nid, "includeDescendants": True} for nid in scope_nodes]})
    # Activar + quitar cambio forzado de contraseña (login directo en la demo).
    run_sql("UPDATE \"User\" SET \"forcePasswordChange\"=false, status='ACTIVE' "
            "WHERE email LIKE '%@planta.local';", "activar usuarios demo")
    print(f"   ✓ Usuarios: {n} nuevo(s); roles y alcance asignados; activos sin cambio forzado.")


# ============================ Incidencias en vivo ===========================
def seed_live_incidents(atok, name_to_id, types_by_key, user_ids):
    """Un puñado de incidencias RECIENTES (vía API) para el recorrido manual."""
    sag = name_to_id["Molienda SAG"]
    roug = name_to_id["Flotación Rougher"]
    samples = [
        {"title": "[DQA] Vibración elevada en molino SAG", "typeId": types_by_key["mantenimiento"]["id"],
         "severity": 3, "orgNodeId": sag, "description": "Vibración 14 mm/s sostenida en turno A.",
         "ownerId": user_ids.get("mantenedor@planta.local")},
        {"title": "[DQA] Derrame menor de pulpa en Rougher", "typeId": types_by_key["medio-ambiente"]["id"],
         "severity": 2, "orgNodeId": roug, "description": "Derrame contenido en pretil; sin llegar a canaleta."},
        {"title": "[DQA] Casi-accidente: resbalón en pasarela", "typeId": types_by_key["seguridad"]["id"],
         "severity": 4, "orgNodeId": sag, "description": "Operador resbaló; sin lesión. Requiere investigación."},
    ]
    s, existing = call("GET", "/incidents?search=%5BDQA%5D", atok)
    have_titles = set()
    if isinstance(existing, dict):
        for it in existing.get("items", []):
            have_titles.add(it.get("title"))
    n = 0
    for sm in samples:
        if sm["title"] in have_titles:
            continue
        st, r = call("POST", "/incidents", atok, sm)
        if st in (200, 201):
            n += 1
        else:
            print(f"   ⚠ crear incidencia en vivo: {st} {r}")
    print(f"   ✓ Incidencias en vivo: {n} nueva(s).")


# ============================ Histórico envejecido (SQL) ====================
def seed_history(atok, name_to_id, types_by_key):
    # Datos auxiliares desde la BD.
    wf_id, wf_ver, state_closed = None, None, "cerrada"
    out = run_sql("SELECT id, \"currentVersionId\" FROM \"WorkflowDefinition\" "
                  "WHERE key='incidencia-operacional';", "leer flujo incidencias")
    parts = out.strip().split("|") if out.strip() else []
    if len(parts) >= 2:
        wf_id, wf_ver = parts[0].strip(), parts[1].strip()

    out = run_sql("SELECT id FROM \"ReportingObligation\" WHERE key='reporte-autoridad-grave';", "leer obligación")
    oblig_id = out.strip() or None

    # Usuarios (reporter/owner) e ids de equipos por nodo.
    s, users = call("GET", "/security/users", atok)
    uid = {u["email"]: u["id"] for u in users} if isinstance(users, list) else {}
    reporters = [uid.get(e) for e in ("op.molienda@planta.local", "sup.molienda@planta.local",
                                      "sup.flotacion@planta.local") if uid.get(e)]
    owners = [uid.get(e) for e in ("mantenedor@planta.local", "hse@planta.local",
                                   "jefe.planta@planta.local") if uid.get(e)]

    # Equipos por nodo (id list) para ligar incidencias a activos.
    equip_by_node = {}
    for node_name in EQUIPMENT:
        nid = name_to_id.get(node_name)
        if not nid:
            continue
        s, eqs = call("GET", f"/structure/equipment?orgNodeId={nid}", atok)
        equip_by_node[nid] = [e["id"] for e in eqs] if isinstance(eqs, list) else []

    proceso_nodes = [name_to_id[n] for n in EQUIPMENT.keys() if n in name_to_id]
    type_keys = ["mantenimiento", "operacional", "seguridad", "medio-ambiente", "calidad", "geomecanica"]
    type_ids = {k: types_by_key[k]["id"] for k in type_keys if k in types_by_key}
    sev_weights = [1, 2, 2, 3, 3, 3, 4, 4, 5]

    now = datetime.now(timezone.utc)
    rows = []          # incident rows
    action_rows = []
    report_rows = []
    N = 64
    # Para reincidencia: forzamos pares (mismo tipo+equipo).
    recurrence_pairs = [("mantenimiento", "Molienda SAG"), ("operacional", "Flotación Rougher")]

    def pick_node_equip(node_name=None):
        if node_name and node_name in name_to_id:
            nid = name_to_id[node_name]
        else:
            nid = random.choice(proceso_nodes)
        eqs = equip_by_node.get(nid) or []
        eid = random.choice(eqs) if eqs and random.random() < 0.8 else None
        return nid, eid

    for i in range(N):
        days_ago = random.randint(1, 56)
        created = now - timedelta(days=days_ago, hours=random.randint(0, 23))
        # Reincidencia forzada en ~6 casos
        forced = None
        if i < len(recurrence_pairs) * 3:
            forced = recurrence_pairs[i % len(recurrence_pairs)]
        if forced:
            tkey = forced[0]
            nid, eid = pick_node_equip(forced[1])
        else:
            tkey = random.choice(list(type_ids.keys()))
            nid, eid = pick_node_equip()
        tid = type_ids[tkey]
        sev = random.choice(sev_weights)
        shift = random.choice(["A", "B"])
        closed = random.random() < 0.68
        iid = f"demoqa-h-{i:04d}"
        title = f"[DQA] Evento histórico #{i:04d} ({tkey})"
        reporter = random.choice(reporters) if reporters else None
        owner = random.choice(owners) if owners else None
        occurred = created - timedelta(hours=random.randint(0, 6))
        if closed:
            mttr_h = random.choice([3, 6, 8, 12, 18, 24, 36, 48, 72, 96])
            closed_at = created + timedelta(hours=mttr_h)
            if closed_at > now:
                closed_at = now - timedelta(hours=1)
            lifecycle, state, since = "CLOSED", state_closed, closed_at
            due = created + timedelta(hours=48)
        else:
            closed_at = None
            lifecycle = "OPEN"
            state = random.choice(["asignada", "en_progreso", "en_verificacion"])
            # Algunas con permanencia excedida (entró al estado hace mucho) y/o plazo vencido.
            since = created + timedelta(hours=random.randint(1, 10))
            overdue = random.random() < 0.45
            due = (now - timedelta(hours=random.randint(2, 40))) if overdue else (now + timedelta(hours=random.randint(4, 72)))
        rows.append({
            "id": iid, "title": title, "typeId": tid, "severity": sev, "orgNodeId": nid,
            "equipmentId": eid, "shiftCode": shift, "lifecycle": lifecycle, "state": state,
            "since": since, "created": created, "occurred": occurred, "due": due,
            "closed_at": closed_at, "reporter": reporter, "owner": owner,
            "reportable": sev >= 4,
        })

    # CAPA: una acción en ~14 incidencias (estados variados).
    capa_targets = rows[:14]
    capa_status_cycle = ["OPEN", "IN_PROGRESS", "DONE", "VERIFIED"]
    for j, inc in enumerate(capa_targets):
        st = capa_status_cycle[j % len(capa_status_cycle)]
        aid = f"demoqa-a-{j:04d}"
        a_due = inc["created"] + timedelta(days=7)
        overdue = (st in ("OPEN", "IN_PROGRESS")) and random.random() < 0.5
        if overdue:
            a_due = now - timedelta(days=random.randint(1, 10))
        comp_at = inc["created"] + timedelta(days=random.randint(2, 6)) if st in ("DONE", "VERIFIED") else None
        ver_at = (comp_at + timedelta(days=1)) if st == "VERIFIED" and comp_at else None
        action_rows.append({
            "id": aid, "incidentId": inc["id"], "kind": random.choice(["CORRECTIVE", "PREVENTIVE", "IMMEDIATE"]),
            "title": "Acción correctiva/preventiva (histórica)", "mandatory": True, "dueAt": a_due,
            "status": st, "completedAt": comp_at, "verifiedAt": ver_at,
            "outcome": "EFFECTIVE" if st == "VERIFIED" else None,
            "responsible": inc["owner"], "created": inc["created"],
        })

    # Reportes: para incidencias sev>=4 (obligación grave), variados.
    if oblig_id:
        rep_targets = [r for r in rows if r["severity"] >= 4][:12]
        for k, inc in enumerate(rep_targets):
            rid = f"demoqa-r-{k:04d}"
            submitted = inc["lifecycle"] == "CLOSED" and random.random() < 0.6
            if submitted:
                status, sub_at, folio = "SUBMITTED", inc["created"] + timedelta(hours=12), f"AUT-{1000+k}"
                r_due = inc["created"] + timedelta(hours=24)
            else:
                status, sub_at, folio = "PENDING", None, None
                # plazo vencido en la mitad
                r_due = (now - timedelta(hours=random.randint(2, 30))) if k % 2 == 0 else (now + timedelta(hours=24))
            report_rows.append({
                "id": rid, "incidentId": inc["id"], "obligationId": oblig_id,
                "status": status, "dueAt": r_due, "submittedAt": sub_at, "folio": folio,
                "created": inc["created"], "reporter": inc["reporter"],
            })

    # --- Construir SQL idempotente ---
    def ts(dt):
        return sqlstr(dt.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S+00")) if dt else "NULL"

    sql = ["BEGIN;"]
    # Limpieza previa de histórico demo (idempotencia).
    sql.append("DELETE FROM \"IncidentReport\" WHERE id LIKE 'demoqa-r-%';")
    sql.append("DELETE FROM \"IncidentAction\" WHERE id LIKE 'demoqa-a-%';")
    sql.append("DELETE FROM \"Incident\" WHERE id LIKE 'demoqa-h-%';")
    for r in rows:
        wf_cols = ""
        wf_vals = ""
        if wf_id and wf_ver:
            wf_cols = ", \"workflowDefinitionId\", \"workflowDefinitionVersionId\", \"currentStateKey\""
            wf_vals = f", {sqlstr(wf_id)}, {sqlstr(wf_ver)}, {sqlstr(r['state'])}"
        sql.append(
            "INSERT INTO \"Incident\" (id, title, \"typeId\", severity, priority, \"originType\", "
            "lifecycle, \"currentStateSince\", \"orgNodeId\", \"equipmentId\", \"shiftCode\", "
            "occurredAt_placeholder, reportable, \"createdAt\", \"updatedAt\", \"reporterId\", "
            "\"ownerId\", \"dueAt\", \"closedAt\", \"createdById\""
            + wf_cols + ") VALUES ("
            f"{sqlstr(r['id'])}, {sqlstr(r['title'])}, {sqlstr(r['typeId'])}, {r['severity']}, "
            f"'MEDIUM', 'MANUAL', {sqlstr(r['lifecycle'])}, {ts(r['since'])}, {sqlstr(r['orgNodeId'])}, "
            f"{sqlstr(r['equipmentId'])}, {sqlstr(r['shiftCode'])}, {ts(r['occurred'])}, "
            f"{'true' if r['reportable'] else 'false'}, {ts(r['created'])}, {ts(r['created'])}, "
            f"{sqlstr(r['reporter'])}, {sqlstr(r['owner'])}, {ts(r['due'])}, {ts(r['closed_at'])}, "
            f"{sqlstr(r['reporter'])}"
            + wf_vals + ");"
        )
    for a in action_rows:
        sql.append(
            "INSERT INTO \"IncidentAction\" (id, \"incidentId\", kind, title, mandatory, "
            "\"responsibleId\", \"dueAt\", status, \"completedAt\", \"verifiedAt\", "
            "\"effectivenessOutcome\", \"createdAt\", \"updatedAt\") VALUES ("
            f"{sqlstr(a['id'])}, {sqlstr(a['incidentId'])}, {sqlstr(a['kind'])}, {sqlstr(a['title'])}, "
            f"{'true' if a['mandatory'] else 'false'}, {sqlstr(a['responsible'])}, {ts(a['dueAt'])}, "
            f"{sqlstr(a['status'])}, {ts(a['completedAt'])}, {ts(a['verifiedAt'])}, "
            f"{sqlstr(a['outcome']) if a['outcome'] else 'NULL'}, {ts(a['created'])}, {ts(a['created'])});"
        )
    for rep in report_rows:
        sql.append(
            "INSERT INTO \"IncidentReport\" (id, \"incidentId\", \"obligationId\", \"obligationName\", "
            "\"authorityName\", mandatory, status, \"dueAt\", \"submittedAt\", \"externalFolio\", "
            "\"createdAt\", \"updatedAt\", \"createdById\") VALUES ("
            f"{sqlstr(rep['id'])}, {sqlstr(rep['incidentId'])}, {sqlstr(rep['obligationId'])}, "
            f"{sqlstr('Reporte a la autoridad — evento grave (ejemplo)')}, {sqlstr('Autoridad competente')}, "
            f"true, {sqlstr(rep['status'])}, {ts(rep['dueAt'])}, {ts(rep['submittedAt'])}, "
            f"{sqlstr(rep['folio'])}, {ts(rep['created'])}, {ts(rep['created'])}, {sqlstr(rep['reporter'])});"
        )
    # Envejecer ocurrencias de ronda: forzar algunas vencidas.
    sql.append(
        "UPDATE \"RoundOccurrence\" SET \"dueAt\" = now() - interval '6 hours' WHERE id IN ("
        "SELECT ro.id FROM \"RoundOccurrence\" ro "
        "JOIN \"LogSchedule\" ls ON ro.\"scheduleId\" = ls.id "
        "WHERE ls.name LIKE '[DEMO QA]%' AND ro.status = 'PENDING' "
        "ORDER BY ro.\"scheduledFor\" LIMIT 3);")
    sql.append("COMMIT;")

    # placeholder fix: la columna real es occurredAt (sin comillas en Prisma => "occurredAt")
    full = "\n".join(sql).replace("occurredAt_placeholder", '"occurredAt"')
    run_sql(full, "histórico envejecido")
    print(f"   ✓ Histórico: {len(rows)} incidencias ({sum(1 for r in rows if r['lifecycle']=='CLOSED')} cerradas), "
          f"{len(action_rows)} CAPA, {len(report_rows)} reportes; rondas vencidas.")


# ============================ Workers =======================================
def run_workers(atok):
    for path in ("/notifications/run", "/rule-actions/run"):
        st, r = call("POST", path, atok, {})
        flag = "✓" if st in (200, 201) else "⚠"
        print(f"   {flag} worker {path}: {st}")


# ============================ Limpieza ======================================
CLEAN_SQL = r"""
BEGIN;
-- Incidencias del escenario (históricas + en vivo [DQA]) y sus dependientes.
CREATE TEMP TABLE _demo_inc AS
  SELECT id FROM "Incident" WHERE id LIKE 'demoqa-h-%' OR title LIKE '[DQA]%';
DELETE FROM "IncidentReport"        WHERE "incidentId" IN (SELECT id FROM _demo_inc);
DELETE FROM "IncidentAction"        WHERE "incidentId" IN (SELECT id FROM _demo_inc);
DELETE FROM "IncidentInvestigationStep" WHERE "investigationId" IN
  (SELECT id FROM "IncidentInvestigation" WHERE "incidentId" IN (SELECT id FROM _demo_inc));
DELETE FROM "IncidentInvestigation" WHERE "incidentId" IN (SELECT id FROM _demo_inc);
DELETE FROM "IncidentExceptionLink" WHERE "incidentId" IN (SELECT id FROM _demo_inc);
DELETE FROM "IncidentComment"       WHERE "incidentId" IN (SELECT id FROM _demo_inc);
DELETE FROM "IncidentActivity"      WHERE "incidentId" IN (SELECT id FROM _demo_inc);
DELETE FROM "IncidentTransition"    WHERE "incidentId" IN (SELECT id FROM _demo_inc);
DELETE FROM "Incident"              WHERE id IN (SELECT id FROM _demo_inc);

-- Entradas de bitácora y rondas del escenario (por plantilla/horarios demo).
CREATE TEMP TABLE _demo_tpl AS SELECT id FROM "Template" WHERE name LIKE '[DEMO QA]%';
CREATE TEMP TABLE _demo_entry AS
  SELECT le.id FROM "LogEntry" le
  JOIN "TemplateVersion" tv ON le."templateVersionId" = tv.id
  WHERE tv."templateId" IN (SELECT id FROM _demo_tpl);
DELETE FROM "LogEntryException"  WHERE "logEntryId" IN (SELECT id FROM _demo_entry);
DELETE FROM "LogEntryValue"      WHERE "logEntryId" IN (SELECT id FROM _demo_entry);
DELETE FROM "LogEntrySignature"  WHERE "logEntryId" IN (SELECT id FROM _demo_entry);
DELETE FROM "RoundOccurrence"    WHERE "scheduleId" IN (SELECT id FROM "LogSchedule" WHERE name LIKE '[DEMO QA]%');
DELETE FROM "LogEntry"           WHERE id IN (SELECT id FROM _demo_entry);
DELETE FROM "LogSchedule"        WHERE name LIKE '[DEMO QA]%';

-- Plantillas demo (versiones + secciones + campos + asignaciones).
DELETE FROM "Template" WHERE id IN (SELECT id FROM _demo_tpl);

-- Flujos demo.
DELETE FROM "WorkflowDefinition" WHERE key LIKE 'demoqa-%';

-- Listas de referencia demo.
DELETE FROM "ReferenceList" WHERE key LIKE 'demoqa-%';

-- Calendarios demo (asignaciones + turnos).
DELETE FROM "OperationalCalendar" WHERE key LIKE 'demoqa-%';
DELETE FROM "FiscalCalendar"      WHERE key LIKE 'demoqa-%';

-- Revertir SLA/escalamiento en tipos (no se borran: son del seed base).
UPDATE "IncidentType" SET "resolutionDueMinutes"=NULL, "escalationAfterMinutes"=NULL, "escalationRoleId"=NULL
  WHERE key IN ('mantenimiento','seguridad','operacional');

-- Equipos demo.
DELETE FROM "Equipment" WHERE tag LIKE 'DQ-%';

-- Estructura demo (nodos por externalCode DEMOQA-* y por subárbol del root).
DELETE FROM "OrgNode" WHERE "externalCode" LIKE 'DEMOQA-%';

-- Usuarios demo (roles, scopes, sesiones primero).
CREATE TEMP TABLE _demo_user AS SELECT id FROM "User" WHERE email LIKE '%@planta.local';
DELETE FROM "Scope"       WHERE "userId" IN (SELECT id FROM _demo_user);
DELETE FROM "UserRole"    WHERE "userId" IN (SELECT id FROM _demo_user);
DELETE FROM "Session"     WHERE "userId" IN (SELECT id FROM _demo_user);
DELETE FROM "User"        WHERE id IN (SELECT id FROM _demo_user);

-- Roles demo.
DELETE FROM "RolePermission" WHERE "roleId" IN (SELECT id FROM "Role" WHERE key LIKE 'demoqa-%');
DELETE FROM "Role" WHERE key LIKE 'demoqa-%';
COMMIT;
"""


def do_clean():
    print("⚠  Limpiando el escenario DEMO QA…")
    run_sql(CLEAN_SQL, "limpieza")
    print("✓ Escenario DEMO QA eliminado. (Catálogos base/usuarios reales intactos.)")


# ============================ main ==========================================
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


def main():
    do_history = "--no-history" not in sys.argv
    s, login = call("POST", "/auth/login", body=ADMIN)
    if s != 200:
        print("No se pudo iniciar sesión (¿dev arriba?):", s, login)
        sys.exit(1)
    atok = login["accessToken"]

    print("▶ Sembrando escenario DEMO QA — Faena Demo QA (concentradora de cobre)…")
    roles = seed_roles(atok)
    levels = seed_levels(atok)
    name_to_id = seed_structure(atok, levels)
    seed_equipment(atok, name_to_id)
    seed_reference_lists(atok)
    seed_calendars(atok, name_to_id)
    wf_id, wf_ver = seed_workflow(atok, roles)

    s, types = call("GET", "/incidents/types", atok)
    types_by_key = {t["key"]: t for t in types} if isinstance(types, list) else {}

    tpl_id = seed_template(atok, name_to_id, wf_id, wf_ver, roles, types_by_key["mantenimiento"]["id"])
    seed_incident_catalog_sla(atok, roles, types_by_key)
    seed_schedules(atok, name_to_id, tpl_id, roles)
    seed_users(atok, name_to_id)

    s, users = call("GET", "/security/users", atok)
    user_ids = {u["email"]: u["id"] for u in users} if isinstance(users, list) else {}
    seed_live_incidents(atok, name_to_id, types_by_key, user_ids)

    if do_history:
        seed_history(atok, name_to_id, types_by_key)
    run_workers(atok)

    print("\n──────────── DEMO QA LISTO (web :5173) ────────────")
    print(" Estructura: «Faena Demo QA» → Chancado y Molienda / Flotación / Espesamiento / Servicios.")
    print(" Credenciales: todas con contraseña  Demo!Pass2026")
    for (email, name, _r, _s) in USERS:
        print(f"   • {email:32s} {name}")
    print(" Dashboard de incidencias: /incidencias/dashboard (rango 8 semanas para ver KPIs).")


if __name__ == "__main__":
    if "--clean" in sys.argv:
        do_clean()
    else:
        main()
