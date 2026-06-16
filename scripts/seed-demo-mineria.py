#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Seed de DEMO para CLIENTE — Faena minera + bitácora con MATRIZ + RONDA por turno.

Crea, todo idempotente y listo para mostrar en la app:
 1) Una estructura MINERA realista (Planta Concentradora → áreas → procesos) usando
    los 3 niveles existentes (Planta/Área/Proceso).
 2) Equipos (molinos) en el nodo de Molienda SAG (objeto EAM / ISO 14224).
 3) Una bitácora MENOR «Control de Molienda por Turno» cuyo corazón es una MATRIZ
    (parámetro × momento del turno), anclada a la Planta (y sus procesos).
 4) Una RONDA por turno (LogSchedule SHIFT) en Molienda SAG, con ocurrencias generadas.

NO borra nada: queda para el demo. Re-ejecutable sin duplicar. API :3000.
Admin demo: demo@watchlog.local / Demo!Pass2026.
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
TPL_NAME = "Control de Molienda por Turno — Mina (DEMO)"
PLANT_NAME = "Planta Concentradora — Faena Demo"
LVL = {"planta": "level-planta", "area": "level-area", "proceso": "level-proceso"}


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


# ---------- Estructura ----------
def find_or_create_node(atok, flat, name, level, parent_id):
    for n in flat:
        if n["name"] == name and n["parentId"] == parent_id:
            return n["id"], False
    body = {"name": name, "levelId": LVL[level]}
    if parent_id:
        body["parentId"] = parent_id
    s, node = call("POST", "/structure/nodes", atok, body)
    if s not in (200, 201):
        print(f"FALLO al crear nodo «{name}»:", s, node); sys.exit(1)
    flat.append({"id": node["id"], "name": name, "parentId": parent_id})
    return node["id"], True


def seed_structure(atok):
    s, tree = call("GET", "/structure/nodes", atok)
    flat = flatten(tree)
    created = 0

    def mk(name, level, parent):
        nonlocal created
        nid, isnew = find_or_create_node(atok, flat, name, level, parent)
        created += 1 if isnew else 0
        return nid

    planta = mk(PLANT_NAME, "planta", None)
    a_mol = mk("Chancado y Molienda", "area", planta)
    mk("Chancado Primario", "proceso", a_mol)
    molienda_sag = mk("Molienda SAG", "proceso", a_mol)
    molienda_bol = mk("Molienda de Bolas", "proceso", a_mol)
    a_flot = mk("Flotación", "area", planta)
    mk("Flotación Rougher", "proceso", a_flot)
    mk("Flotación Cleaner", "proceso", a_flot)
    a_rel = mk("Espesado y Relaves", "area", planta)
    mk("Espesador de Concentrado", "proceso", a_rel)
    mk("Manejo de Relaves", "proceso", a_rel)

    print(f"✅ Estructura minera lista bajo «{PLANT_NAME}» ({created} nodo(s) nuevos).")
    return planta, molienda_sag, molienda_bol


# ---------- Equipos ----------
def seed_equipment(atok, node_id, items):
    s, existing = call("GET", f"/structure/equipment?orgNodeId={node_id}", atok)
    tags = {e.get("tag") for e in existing} if isinstance(existing, list) else set()
    for it in items:
        if it["tag"] in tags:
            continue
        s, _ = call("POST", "/structure/equipment", atok, {**it, "orgNodeId": node_id})
        if s in (200, 201):
            print(f"   • Equipo «{it['tag']} · {it['name']}» creado.")


# ---------- Plantilla (MATRIZ) ----------
def build_sections():
    return [
        {
            "key": "molienda",
            "title": "Control de molienda",
            "description": "Registra cada parámetro de la línea de molienda en tres momentos del turno. "
                           "Las filas (parámetros) y columnas (momentos) son fijas; solo completas las celdas.",
            "fields": [
                {"key": "h_mol", "type": "HEADING", "label": "Parámetros de molienda por momento del turno",
                 "config": {"level": 2}, "colSpan": 12},
                {"key": "aviso_mol", "type": "NOTICE", "label": "Cómo registrar",
                 "config": {"variant": "info",
                            "text": "Anota la lectura de cada parámetro al inicio, a la mitad y al final del turno. "
                                    "Deja en blanco las celdas que no apliquen."}, "colSpan": 12},
                {"key": "lecturas_molienda", "type": "MATRIX",
                 "label": "Lecturas de molienda (parámetro × momento)",
                 "help": "Cada celda es una lectura numérica del parámetro en ese momento del turno.",
                 "required": True, "colSpan": 12,
                 "config": {
                     "rowHeaderLabel": "Parámetro",
                     "rows": [
                         {"key": "tonelaje", "label": "Tonelaje de alimentación (t/h)"},
                         {"key": "presion_hc", "label": "Presión hidrociclón (psi)"},
                         {"key": "solidos", "label": "% sólidos en pulpa"},
                         {"key": "granulometria", "label": "Granulometría (% +malla #100)"},
                         {"key": "ley_cu", "label": "Ley de Cu alimentación (%)"},
                     ],
                     "columns": [
                         {"key": "inicio", "label": "Inicio de turno"},
                         {"key": "medio", "label": "Mitad de turno"},
                         {"key": "fin", "label": "Fin de turno"},
                     ],
                     "cell": {"type": "NUMBER", "config": {"min": 0, "max": 100000, "decimals": 2}},
                 }},
                {"key": "observaciones", "type": "TEXTAREA", "label": "Observaciones del turno",
                 "help": "Eventos relevantes: detenciones, atollos, cambios de set-point, etc.",
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


def seed_template(atok, planta_id):
    existing = existing_template(atok)
    if existing:
        print(f"⏭  Plantilla ya existe (id={existing}); no se duplica.")
        return existing
    s, tpl = call("POST", "/templates", atok, {
        "name": TPL_NAME,
        "description": "Bitácora menor de minería: control de molienda por turno con matriz parámetro × momento.",
        "nodeAssignments": [{"orgNodeId": planta_id, "includeDescendants": True}],
    })
    if s not in (200, 201):
        print("FALLO al crear plantilla:", s, tpl); return None
    tpl_id = tpl["id"]
    s, body = call("PUT", f"/templates/{tpl_id}/draft", atok, {"sections": build_sections()})
    if s not in (200, 201):
        print("FALLO al guardar borrador:", s, body); return None
    s, body = call("POST", f"/templates/{tpl_id}/publish", atok, {})
    if s not in (200, 201):
        print("FALLO al publicar:", s, body); return None
    call("PATCH", f"/templates/{tpl_id}", atok, {"gridFieldKeys": ["observaciones"]})
    return tpl_id


# ---------- Ronda ----------
def seed_schedule(atok, tpl_id, node_id):
    s, lst = call("GET", "/schedules", atok)
    for sc in (lst or []):
        if sc.get("templateId") == tpl_id and sc.get("orgNodeId") == node_id:
            print(f"⏭  Ronda ya existe (id={sc['id']}); no se duplica.")
            return sc["id"]
    s, sc = call("POST", "/schedules", atok, {
        "name": "Ronda de molienda por turno",
        "templateId": tpl_id, "orgNodeId": node_id,
        "recurrenceKind": "SHIFT", "recurrenceConfig": {},
        "dueWindowMinutes": 720, "horizonDays": 3, "active": True,
    })
    if s not in (200, 201):
        print("FALLO al crear ronda:", s, sc); return None
    return sc["id"]


def main():
    s, login = call("POST", "/auth/login", body=ADMIN)
    if s != 200:
        print("No se pudo iniciar sesión (¿dev arriba?):", s, login); sys.exit(1)
    atok = login["accessToken"]

    planta, molienda_sag, molienda_bol = seed_structure(atok)
    seed_equipment(atok, molienda_sag, [
        {"name": "Molino SAG 36 x 17 pies", "tag": "ML-SAG-01", "criticality": 5, "manufacturer": "Metso"},
    ])
    seed_equipment(atok, molienda_bol, [
        {"name": "Molino de Bolas 22 x 36 pies", "tag": "ML-BOL-01", "criticality": 4, "manufacturer": "FLSmidth"},
    ])

    tpl_id = seed_template(atok, planta)
    if not tpl_id:
        sys.exit(1)
    print(f"✅ Plantilla publicada: {tpl_id}  ·  «{TPL_NAME}»")

    sched_id = seed_schedule(atok, tpl_id, molienda_sag)
    if not sched_id:
        sys.exit(1)
    call("POST", "/schedules/generate", atok, {"scheduleId": sched_id})
    s, occ = call("GET", f"/schedules/occurrences?scheduleId={sched_id}", atok)
    n = len(occ) if isinstance(occ, list) else 0
    s, stats = call("GET", "/schedules/occurrences/stats", atok)
    print(f"✅ Ronda programada en «Molienda SAG»: {sched_id}  ·  {n} ocurrencia(s)  ·  stats={stats}")

    print("\n──────────── DEMO LISTO (web :5173) ────────────")
    print(f" • Estructura: menú «Estructura» → «{PLANT_NAME}» → Chancado y Molienda / Flotación / Espesado y Relaves.")
    print("   En «Molienda SAG» verás el molino ML-SAG-01 (equipo / activo EAM).")
    print(" • Rondas: menú «Rondas» → contadores Pendientes/Vencidas/Hoy + la ronda de molienda.")
    print("     - «Iniciar» → crea la entrada y abre la MATRIZ para llenarla por turno.")
    print("     - Al sellar, la ronda queda «Cumplida»; si vence sin llenar, sale en el badge de Bitácoras.")
    print(" • Nueva entrada suelta: «Nueva entrada» → elige la plantilla → nodo de la Planta Concentradora.")
    if n == 0:
        print("\n⚠  0 ocurrencias: el nodo no resuelve un calendario con turnos. Asígnale uno en /calendario-operacional.")


if __name__ == "__main__":
    main()
