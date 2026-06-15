#!/usr/bin/env python3
"""Smoke en vivo — Fase 2.1.7: geometría del lienzo (gridX/gridY/gridH + colSpan=w).

Verifica el ROUND-TRIP de la geometría EXPLÍCITA del lienzo de posicionamiento libre
a través del diseño, la versión CONGELADA y el detalle de entrada (lo que renderizan
llenado y visor):

  1. crea plantilla + borrador con campos que llevan geometría {gridX,gridY,gridH,colSpan}
     y uno SIN geometría (legacy → el backend guarda null; el editor la deriva al abrir);
  2. GET detalle BORRADOR ⇒ cada campo trae su geometría; el legacy = null;
  3. publica ⇒ GET detalle CONGELADO ⇒ la geometría VIAJÓ en la versión inmutable;
  4. crea entrada + GET /log-entries/:id ⇒ el detalle expone la misma geometría.

CREA su plantilla + 1 entrada y LIMPIA por ID. API :3000. Admin: demo@watchlog.local.
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


def geom_by_key(detail):
    """version.sections.fields → {key: (gridX, gridY, gridH, colSpan)}."""
    out = {}
    for s in detail["version"]["sections"]:
        for f in s["fields"]:
            out[f["key"]] = (f.get("gridX"), f.get("gridY"), f.get("gridH"), f.get("colSpan"))
    return out


def main():
    _, login = req("POST", "/auth/login", body=ADMIN)
    atok = login["accessToken"]

    _, tree = req("GET", "/structure/nodes", atok)
    flat = flatten(tree)
    node = next((n for n in flat if not n["children"]), flat[0])
    node_id = node["id"]
    print(f"Nodo de prueba: {node_id} ({node['name']})")

    tpl_id = None
    entry_id = None
    ts = os.urandom(3).hex()
    try:
        _, tpl = req("POST", "/templates", atok, {
            "name": f"SMOKE 2.1.7 geometria {ts}",
            "nodeAssignments": [{"orgNodeId": node_id, "includeDescendants": False}],
        })
        tpl_id = tpl["id"]
        req("PUT", f"/templates/{tpl_id}/draft", atok, {
            "sections": [{
                "key": "s1", "title": "Lienzo",
                "fields": [
                    # Dos campos lado a lado en la fila 0 (8/4), uno alto en la fila 1, y uno legacy (sin geometría).
                    {"key": "izq", "type": "TEXT", "label": "Izquierda", "colSpan": 8, "gridX": 0, "gridY": 0, "gridH": 1},
                    {"key": "der", "type": "NUMBER", "label": "Derecha", "colSpan": 4, "gridX": 8, "gridY": 0, "gridH": 1, "config": {"unit": "bar"}},
                    {"key": "alto", "type": "TEXTAREA", "label": "Alto", "colSpan": 12, "gridX": 0, "gridY": 1, "gridH": 2},
                    {"key": "legacy", "type": "TEXT", "label": "Sin geometría"},
                ],
            }],
        })

        _, draft = req("GET", f"/templates/{tpl_id}", atok)
        g = geom_by_key(draft)
        check("borrador: izq (0,0,1,8)", g.get("izq") == (0, 0, 1, 8), g.get("izq"))
        check("borrador: der (8,0,1,4)", g.get("der") == (8, 0, 1, 4), g.get("der"))
        check("borrador: alto (0,1,2,12)", g.get("alto") == (0, 1, 2, 12), g.get("alto"))
        check("borrador: legacy geometría null (deriva en editor)", g.get("legacy") == (None, None, None, 12), g.get("legacy"))

        req("POST", f"/templates/{tpl_id}/publish", atok, {})
        _, pub = req("GET", f"/templates/{tpl_id}", atok)
        check("publicada: sin borrador", pub.get("hasDraft") is False, pub.get("hasDraft"))
        gp = geom_by_key(pub)
        check("CONGELADA: izq viajó", gp.get("izq") == (0, 0, 1, 8), gp.get("izq"))
        check("CONGELADA: der viajó", gp.get("der") == (8, 0, 1, 4), gp.get("der"))
        check("CONGELADA: alto viajó", gp.get("alto") == (0, 1, 2, 12), gp.get("alto"))
        check("CONGELADA: legacy sigue null", gp.get("legacy") == (None, None, None, 12), gp.get("legacy"))

        s, nodes = call("GET", f"/log-entries/templates/{tpl_id}/nodes", atok)
        nlist = nodes.get("nodes") if isinstance(nodes, dict) else None
        check("nodos elegibles", bool(nlist), s)
        if nlist:
            s, entry = call("POST", "/log-entries", atok, {"templateId": tpl_id, "orgNodeId": nlist[0]["id"]})
            check("crear entrada (2xx)", s in (200, 201), s)
            if s in (200, 201):
                entry_id = entry["id"]
                _, edet = req("GET", f"/log-entries/{entry_id}", atok)
                ge = geom_by_key(edet)
                check("entrada: izq geometría", ge.get("izq") == (0, 0, 1, 8), ge.get("izq"))
                check("entrada: der geometría", ge.get("der") == (8, 0, 1, 4), ge.get("der"))
                check("entrada: alto geometría", ge.get("alto") == (0, 1, 2, 12), ge.get("alto"))
    finally:
        if entry_id:
            for tbl in ("LogEntryFieldChange", "LogEntryValue", "LogEntrySignature",
                        "LogEntryTransition", "LogEntrySection"):
                pg(f'DELETE FROM "{tbl}" WHERE "logEntryId" = \'{entry_id}\';')
            pg(f'DELETE FROM "LogEntry" WHERE id = \'{entry_id}\';')
        if tpl_id:
            pg(f"DELETE FROM \"Template\" WHERE id='{tpl_id}';")

    print(f"\n=== {len(OK)} ok · {len(FAIL)} fail ===")
    if FAIL:
        print("FALLAS: " + ", ".join(FAIL))
        sys.exit(1)


if __name__ == "__main__":
    main()
