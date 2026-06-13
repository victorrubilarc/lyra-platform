#!/usr/bin/env python3
"""Smoke del MODO DE EQUIPO POR PLANTILLA (Fase 2.8.0.2). Verifica la GOBERNANZA del
objeto de referencia EAM: el campo `equipmentMode` de la plantilla (NONE/OPTIONAL/
SUGGESTED/REQUIRED) gobierna cómo se trata el equipo al crear una entrada, y el backend
lo AUTORIZA en `create`/materialización. CREA una plantilla propia (publicada) + un
equipo en un nodo, recorre el matriz de modos y LIMPIA TODO al final SOLO por ID.
API :3000. Admin demo: demo@watchlog.local / Demo!Pass2026.

Limpieza: las entradas persistidas no tienen DELETE por API (VOID diferido 2.8.2), así
que se borran por ID con psql en el contenedor (cascade limpia secciones/valores). El
AuditLog inmutable conserva el rastro de `logentry.created` (esperado, ALCOA+)."""
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
        return e.code, e.read().decode()


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


def main():
    _, login = req("POST", "/auth/login", body=ADMIN)
    atok = login["accessToken"]

    _, tree = req("GET", "/structure/nodes", atok)
    flat = flatten(tree)
    # Nodo hoja (sin hijos) para instalar el equipo de prueba.
    node = next((n for n in flat if not n["children"]), flat[0])
    node_id = node["id"]
    print(f"Nodo de prueba: {node_id} ({node['name']})")

    eq_id = None
    tpl_id = None
    created_entries = []
    try:
        # --- Equipo de prueba en ese nodo (tag único para no chocar) -----------
        ts = os.urandom(3).hex()
        _, eq = req("POST", "/structure/equipment", atok, {"name": f"SMOKE EQ {ts}", "tag": f"SMOKE-{ts}", "orgNodeId": node_id})
        eq_id = eq["id"]

        # --- Plantilla propia, anclada al nodo, con 1 sección/1 campo ----------
        _, tpl = req("POST", "/templates", atok, {
            "name": f"SMOKE 2.8.0.2 {ts}",
            "nodeAssignments": [{"orgNodeId": node_id, "includeDescendants": False}],
        })
        tpl_id = tpl["id"]
        check("plantilla nace con equipmentMode=OPTIONAL (default de migración)", tpl.get("equipmentMode") == "OPTIONAL", tpl.get("equipmentMode"))
        req("PUT", f"/templates/{tpl_id}/draft", atok, {
            "sections": [{"key": "s1", "title": "Operación", "fields": [{"key": "obs", "type": "TEXT", "label": "Observación"}]}],
        })
        req("POST", f"/templates/{tpl_id}/publish", atok, {})

        def set_mode(m):
            return req("PATCH", f"/templates/{tpl_id}", atok, {"equipmentMode": m})

        def eligible():
            return req("GET", f"/log-entries/templates/{tpl_id}/nodes", atok)

        def create(body):
            return call("POST", "/log-entries", atok, body)

        def preview(qs):
            return call("GET", f"/log-entries/new?{qs}", atok)

        def node_equipment(elig):
            n = next((x for x in elig["nodes"] if x["id"] == node_id), None)
            return n["equipment"] if n else []

        # === OPTIONAL (default) ================================================
        _, el = eligible()
        check("eligibleNodes expone equipmentMode=OPTIONAL", el.get("equipmentMode") == "OPTIONAL", el.get("equipmentMode"))
        check("OPTIONAL ofrece el equipo del nodo", any(e["id"] == eq_id for e in node_equipment(el)))
        s, _ = create({"templateId": tpl_id, "orgNodeId": node_id})
        check("OPTIONAL: crear SIN equipo → 201", s == 201, s)
        # capturar el id por listado para limpiar
        s, det = create({"templateId": tpl_id, "orgNodeId": node_id, "equipmentId": eq_id})
        check("OPTIONAL: crear CON equipo → 201", s == 201, s)

        # === REQUIRED ==========================================================
        set_mode("REQUIRED")
        _, el = eligible()
        check("eligibleNodes expone equipmentMode=REQUIRED", el.get("equipmentMode") == "REQUIRED", el.get("equipmentMode"))
        s, _ = create({"templateId": tpl_id, "orgNodeId": node_id})
        check("REQUIRED: crear SIN equipo → 400 (gate duro)", s == 400, s)
        s, _ = preview(f"templateId={tpl_id}&orgNodeId={node_id}")
        check("REQUIRED: preview SIN equipo → 200 (componiendo, no bloquea)", s == 200, s)
        s, det = create({"templateId": tpl_id, "orgNodeId": node_id, "equipmentId": eq_id})
        check("REQUIRED: crear CON equipo válido → 201", s == 201, s)
        if s == 201 and isinstance(det, dict):
            check("REQUIRED: la entrada quedó estampada con el equipo", det.get("equipmentId") == eq_id or det.get("equipmentName") is not None, det.get("equipmentId"))

        # === NONE ==============================================================
        set_mode("NONE")
        _, el = eligible()
        check("eligibleNodes expone equipmentMode=NONE", el.get("equipmentMode") == "NONE", el.get("equipmentMode"))
        check("NONE no ofrece equipos (lista vacía)", node_equipment(el) == [])
        s, _ = create({"templateId": tpl_id, "orgNodeId": node_id, "equipmentId": eq_id})
        check("NONE: crear CON equipo → 400", s == 400, s)
        s, _ = preview(f"templateId={tpl_id}&orgNodeId={node_id}&equipmentId={eq_id}")
        check("NONE: preview CON equipo → 400 (consistencia)", s == 400, s)
        s, _ = create({"templateId": tpl_id, "orgNodeId": node_id})
        check("NONE: crear SIN equipo → 201", s == 201, s)

        # --- Contar las entradas persistidas de esta plantilla (deben ser 4) ----
        out = subprocess.run([*PG, f"SELECT count(*) FROM \"LogEntry\" WHERE \"templateId\"='{tpl_id}';"], capture_output=True, text=True)
        check("se persistieron 4 entradas de prueba (OPTIONAL ×2, REQUIRED ×1, NONE ×1)", out.stdout.strip() == "4", out.stdout.strip())

    finally:
        # Limpieza SOLO por ID de lo creado por este script. Robusta: re-consulta las
        # entradas por templateId (independiente de dónde falle el matriz).
        if tpl_id:
            out = subprocess.run([*PG, f"SELECT id FROM \"LogEntry\" WHERE \"templateId\"='{tpl_id}';"], capture_output=True, text=True)
            for eid in [x.strip() for x in out.stdout.splitlines() if x.strip()]:
                pg(f"DELETE FROM \"LogEntry\" WHERE id='{eid}';")  # cascada de secciones/valores/cambios
            pg(f"DELETE FROM \"Template\" WHERE id='{tpl_id}';")  # cascada de versiones/secciones/asignaciones
            out = subprocess.run([*PG, f"SELECT count(*) FROM \"LogEntry\" WHERE \"templateId\"='{tpl_id}';"], capture_output=True, text=True)
            check("limpieza: 0 entradas de la plantilla de prueba", out.stdout.strip() == "0", out.stdout.strip())
        if eq_id:
            pg(f"DELETE FROM \"Equipment\" WHERE id='{eq_id}';")

    print(f"\nRESUMEN: {len(OK)} ok, {len(FAIL)} fallidos")
    if FAIL:
        print("Fallidos: " + ", ".join(FAIL))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
