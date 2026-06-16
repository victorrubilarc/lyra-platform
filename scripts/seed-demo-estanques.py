#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Seed de DEMO — 5 ESTANQUES de combustible como EQUIPOS + ronda CADA HORA por estanque.

Caso de uso: en un Patio de Combustible hay 5 estanques; un operador debe chequear el
NIVEL (litros) de cada uno CADA HORA. Modelado con los estanques como EQUIPOS (activos
EAM / ISO 14224), con UMBRAL de nivel bajo y datos extra propios de este chequeo.

Crea, idempotente (re-ejecutable sin duplicar):
 1) Estructura: «Servicios Auxiliares» ▸ «Patio de Combustible» bajo la faena demo.
 2) 5 estanques como EQUIPOS (TK-01..TK-05), categoría/criticidad/capacidad.
 3) Plantilla «Lectura de Estanque de Combustible — (DEMO)» con NIVEL (umbral bajo),
    temperatura (umbral alto), estado de válvula, drenaje de agua, fuga visible y notas.
    Modo de equipo = REQUIRED (cada lectura queda atada a su estanque).
 4) 5 horarios de ronda (uno por estanque), recurrencia CADA 60 MIN, plazo 60 min.
    (Mientras no exista «Route» = fan-out por equipo, BACKLOG, es 1 horario por estanque.)

NO borra nada: queda para el demo. API :3000. Admin: demo@watchlog.local / Demo!Pass2026.
"""
import json
import os
import sys
import urllib.error
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE = os.environ.get("WL_BASE", "http://localhost:3000/api")
PASS = os.environ.get("WL_DEMO_PASS", "Demo!Pass2026")
ADMIN = {"email": os.environ.get("WL_ADMIN_EMAIL", "demo@watchlog.local"), "password": PASS}
TPL_NAME = "Lectura de Estanque de Combustible — (DEMO)"
PLANT_NAME = "Planta Concentradora — Faena Demo"
LVL = {"planta": "level-planta", "area": "level-area", "proceso": "level-proceso"}

TANKS = [
    {"tag": "TK-01", "name": "Estanque Diésel A1", "criticality": 5, "model": "30.000 L", "description": "Diésel · capacidad 30.000 L · estación de carga norte"},
    {"tag": "TK-02", "name": "Estanque Diésel A2", "criticality": 5, "model": "30.000 L", "description": "Diésel · capacidad 30.000 L · estación de carga norte"},
    {"tag": "TK-03", "name": "Estanque Diésel B1", "criticality": 4, "model": "20.000 L", "description": "Diésel · capacidad 20.000 L · estación de carga sur"},
    {"tag": "TK-04", "name": "Estanque Bencina 95", "criticality": 4, "model": "15.000 L", "description": "Bencina 95 · capacidad 15.000 L · vehículos livianos"},
    {"tag": "TK-05", "name": "Estanque Aceite Hidráulico", "criticality": 3, "model": "10.000 L", "description": "Aceite hidráulico · capacidad 10.000 L · taller"},
]


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


def flatten(nodes, parent=None, out=None):
    if out is None:
        out = []
    for n in nodes:
        out.append({"id": n["id"], "name": n["name"], "parentId": parent})
        flatten(n.get("children", []), n["id"], out)
    return out


def find_or_create_node(atok, flat, name, level, parent_id):
    for n in flat:
        if n["name"] == name and n["parentId"] == parent_id:
            return n["id"]
    body = {"name": name, "levelId": LVL[level]}
    if parent_id:
        body["parentId"] = parent_id
    s, node = call("POST", "/structure/nodes", atok, body)
    if s not in (200, 201):
        print(f"FALLO al crear nodo «{name}»:", s, node); sys.exit(1)
    flat.append({"id": node["id"], "name": name, "parentId": parent_id})
    print(f"   • Nodo «{name}» creado.")
    return node["id"]


def seed_structure(atok):
    s, tree = call("GET", "/structure/nodes", atok)
    flat = flatten(tree)
    planta = find_or_create_node(atok, flat, PLANT_NAME, "planta", None)
    serv = find_or_create_node(atok, flat, "Servicios Auxiliares", "area", planta)
    patio = find_or_create_node(atok, flat, "Patio de Combustible", "proceso", serv)
    print(f"✅ Estructura lista: «{PLANT_NAME}» ▸ Servicios Auxiliares ▸ Patio de Combustible.")
    return patio


def seed_equipment(atok, node_id):
    s, existing = call("GET", f"/structure/equipment?orgNodeId={node_id}", atok)
    by_tag = {e.get("tag"): e.get("id") for e in (existing if isinstance(existing, list) else [])}
    ids = {}
    for i, t in enumerate(TANKS):
        if t["tag"] in by_tag:
            ids[t["tag"]] = by_tag[t["tag"]]
            continue
        s, eq = call("POST", "/structure/equipment", atok, {**t, "orgNodeId": node_id, "reportOrder": i})
        if s in (200, 201):
            ids[t["tag"]] = eq["id"]
            print(f"   • Equipo «{t['tag']} · {t['name']}» creado.")
        else:
            print(f"FALLO equipo {t['tag']}:", s, eq); sys.exit(1)
    return ids


def build_sections():
    return [
        {
            "key": "lectura",
            "title": "Lectura del estanque",
            "description": "Chequeo horario del estanque de combustible. El estanque (equipo) se elige al iniciar la ronda.",
            "fields": [
                {"key": "h1", "type": "HEADING", "label": "Lectura del estanque de combustible",
                 "config": {"level": 2}, "colSpan": 12},
                {"key": "aviso", "type": "NOTICE", "label": "Cómo registrar",
                 "config": {"variant": "info",
                            "text": "Registra el NIVEL del estanque cada hora. Si el nivel cae bajo el umbral, el "
                                    "registro se marca como excepción para reposición. Revisa también fugas y drenaje."},
                 "colSpan": 12},
                {"key": "nivel", "type": "NUMBER", "label": "Nivel actual",
                 "help": "Lectura del medidor de nivel, en litros.", "required": True, "colSpan": 6,
                 "config": {"unit": "L", "decimals": 0, "min": 0, "max": 50000,
                            "warnLow": 5000, "critLow": 1500}},
                {"key": "temperatura", "type": "NUMBER", "label": "Temperatura del combustible",
                 "help": "Temperatura superficial del estanque.", "colSpan": 6,
                 "config": {"unit": "°C", "decimals": 1, "min": -10, "max": 80,
                            "warnHigh": 35, "critHigh": 45}},
                {"key": "valvula", "type": "SELECT", "label": "Estado de la válvula principal",
                 "required": True, "colSpan": 6,
                 "config": {"displayAs": "segmented", "optionSource": {"kind": "inline", "items": [
                     {"code": "abierta", "label": "Abierta"},
                     {"code": "cerrada", "label": "Cerrada"},
                     {"code": "loto", "label": "Bloqueada (LOTO)"},
                 ]}}},
                {"key": "agua_fondo", "type": "CONFORMITY", "label": "Drenaje de agua / sedimento del fondo",
                 "help": "Conforme = sin agua. No conforme = se detectó agua y se drenó.",
                 "required": True, "colSpan": 6, "config": {"allowNa": True}},
                {"key": "fuga", "type": "BOOLEAN", "label": "¿Se observa fuga o derrame?",
                 "required": True, "colSpan": 6,
                 "config": {"trueLabel": "Sí, hay fuga/derrame", "falseLabel": "Sin fugas"}},
                {"key": "observaciones", "type": "TEXTAREA", "label": "Observaciones",
                 "help": "Anomalías, olor, reposiciones, acciones tomadas.",
                 "config": {"maxLength": 1000}, "colSpan": 12},
            ],
        },
    ]


def existing_template(atok):
    s, lst = call("GET", "/templates", atok)
    items = lst.get("items") if isinstance(lst, dict) else (lst if isinstance(lst, list) else [])
    for t in items or []:
        if t.get("name") == TPL_NAME and not t.get("deletedAt"):
            return t.get("id")
    return None


def seed_template(atok, patio_id):
    existing = existing_template(atok)
    if existing:
        print(f"⏭  Plantilla ya existe (id={existing}); no se duplica.")
        return existing
    s, tpl = call("POST", "/templates", atok, {
        "name": TPL_NAME,
        "description": "Chequeo horario de nivel de estanques de combustible, con los estanques como equipos (EAM).",
        "nodeAssignments": [{"orgNodeId": patio_id, "includeDescendants": False}],
    })
    if s not in (200, 201):
        print("FALLO al crear plantilla:", s, tpl); sys.exit(1)
    tpl_id = tpl["id"]
    s, body = call("PUT", f"/templates/{tpl_id}/draft", atok, {"sections": build_sections()})
    if s not in (200, 201):
        print("FALLO al guardar borrador:", s, body); sys.exit(1)
    s, body = call("POST", f"/templates/{tpl_id}/publish", atok, {})
    if s not in (200, 201):
        print("FALLO al publicar:", s, body); sys.exit(1)
    # Gobernanza viva: cada lectura atada a un estanque (equipo) + columnas de resumen.
    s, body = call("PATCH", f"/templates/{tpl_id}", atok,
                   {"equipmentMode": "REQUIRED", "gridFieldKeys": ["nivel", "temperatura", "fuga"]})
    if s not in (200, 201):
        print("⚠ No se pudo aplicar config (equipmentMode/grid):", s, body)
    return tpl_id


def seed_schedules(atok, tpl_id, patio_id, equip_ids):
    s, lst = call("GET", "/schedules", atok)
    existing = {(sc.get("templateId"), sc.get("equipmentId")) for sc in (lst or [])}
    created = 0
    for t in TANKS:
        eqid = equip_ids[t["tag"]]
        if (tpl_id, eqid) in existing:
            continue
        s, sc = call("POST", "/schedules", atok, {
            "name": f"Nivel {t['tag']} — cada hora",
            "templateId": tpl_id, "orgNodeId": patio_id, "equipmentId": eqid,
            "recurrenceKind": "INTERVAL", "recurrenceConfig": {"everyMinutes": 60, "anchorTime": "00:00"},
            "dueWindowMinutes": 60, "horizonDays": 1, "active": True,
        })
        if s in (200, 201):
            call("POST", "/schedules/generate", atok, {"scheduleId": sc["id"]})
            created += 1
            print(f"   • Ronda «Nivel {t['tag']} — cada hora» creada (id={sc['id']}).")
        else:
            print(f"FALLO ronda {t['tag']}:", s, sc); sys.exit(1)
    return created


def main():
    s, login = call("POST", "/auth/login", body=ADMIN)
    if s != 200:
        print("No se pudo iniciar sesión (¿dev arriba?):", s, login); sys.exit(1)
    atok = login["accessToken"]

    patio = seed_structure(atok)
    equip_ids = seed_equipment(atok, patio)
    print(f"✅ {len(equip_ids)} estanques (equipos) en «Patio de Combustible».")

    tpl_id = seed_template(atok, patio)
    print(f"✅ Plantilla publicada: {tpl_id}  ·  «{TPL_NAME}»  (Modo de equipo = Requerido)")

    created = seed_schedules(atok, tpl_id, patio, equip_ids)
    s, stats = call("GET", "/schedules/occurrences/stats", atok)
    print(f"✅ {created} horario(s) nuevos · cada hora · 1 por estanque · stats globales={stats}")

    print("\n──────────── DEMO LISTO (web :5173) ────────────")
    print(" • Estructura → Planta Concentradora — Faena Demo → Servicios Auxiliares → Patio de Combustible:")
    print("     verás los 5 estanques TK-01..TK-05 como EQUIPOS (criticidad, capacidad en la descripción).")
    print(" • Programación de rondas: 5 horarios «Nivel TK-xx — cada hora» (uno por estanque), recurrencia cada 60 min.")
    print(" • Mis rondas (con permiso round:execute): cada hora aparecen las lecturas pendientes, con el TAG del estanque.")
    print("     - «Iniciar» → abre la entrada YA ligada a ese estanque → registra Nivel/Temp/Válvula/Agua/Fuga/Notas.")
    print("     - Nivel < 5.000 L = advertencia · < 1.500 L = crítico ⇒ el registro sale como EXCEPCIÓN en Bitácoras.")
    print(" • Bitácoras: filtra por equipo para ver la historia de un estanque (trazabilidad EAM / ISO 14224).")
    print("\nNota: «1 horario por estanque» es el modelo actual; el fan-out por equipo (Route) está en BACKLOG.")


if __name__ == "__main__":
    main()
