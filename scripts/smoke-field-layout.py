#!/usr/bin/env python3
"""Smoke en vivo — Fase 2.1.3: ancho por campo (colSpan, grilla de 12 col).

Verifica el ROUND-TRIP del hint de presentación a través del diseño de plantilla
y de la versión CONGELADA, más el mapeo del detalle de entrada:

  1. crea una plantilla y guarda un borrador con campos de ancho colSpan 6 / 8 / 4 /
     OMITIDO (este último debe resolver a 12 en el backend — preserva lo existente);
  2. GET detalle (versión BORRADOR) ⇒ cada campo trae su colSpan (omitido = 12);
  3. publica ⇒ GET detalle (versión PUBLICADA/congelada) ⇒ el ancho VIAJÓ en la
     versión inmutable (clonado al publicar);
  4. crea una entrada con esa plantilla y GET /log-entries/:id ⇒ el detalle de la
     entrada (que consumen llenado y visor) expone el mismo colSpan por campo.

CREA su propia plantilla + 1 entrada y LIMPIA TODO al final SOLO por ID (el AuditLog
inmutable conserva el rastro). API :3000. Admin demo: demo@watchlog.local / Demo!Pass2026.
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


def widths_by_key(detail):
    """Aplana version.sections.fields → {key: colSpan}."""
    out = {}
    for s in detail["version"]["sections"]:
        for f in s["fields"]:
            out[f["key"]] = f.get("colSpan")
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
        # 1) Plantilla + borrador con anchos HALF / THIRD / OMITIDO(→FULL).
        _, tpl = req("POST", "/templates", atok, {
            "name": f"SMOKE 2.1.3 layout {ts}",
            "nodeAssignments": [{"orgNodeId": node_id, "includeDescendants": False}],
        })
        tpl_id = tpl["id"]
        req("PUT", f"/templates/{tpl_id}/draft", atok, {
            "sections": [{
                "key": "s1", "title": "Operación",
                "fields": [
                    {"key": "ancho_medio", "type": "TEXT", "label": "Media columna", "colSpan": 6},
                    {"key": "ancho_dos_tercios", "type": "NUMBER", "label": "Dos tercios", "colSpan": 8, "config": {"unit": "°C"}},
                    {"key": "ancho_tercio", "type": "TEXT", "label": "Un tercio", "colSpan": 4},
                    {"key": "ancho_default", "type": "TEXT", "label": "Sin ancho (default)"},
                ],
            }],
        })

        # 2) Detalle BORRADOR: el ancho está, omitido = 12 (completo).
        _, draft = req("GET", f"/templates/{tpl_id}", atok)
        w = widths_by_key(draft)
        check("borrador: colSpan 6 persiste", w.get("ancho_medio") == 6, w.get("ancho_medio"))
        check("borrador: colSpan 8 persiste", w.get("ancho_dos_tercios") == 8, w.get("ancho_dos_tercios"))
        check("borrador: colSpan 4 persiste", w.get("ancho_tercio") == 4, w.get("ancho_tercio"))
        check("borrador: omitido ⇒ 12 (cero ruptura)", w.get("ancho_default") == 12, w.get("ancho_default"))

        # 3) Publicar ⇒ el ancho VIAJA en la versión CONGELADA (clonado al publicar).
        req("POST", f"/templates/{tpl_id}/publish", atok, {})
        _, pub = req("GET", f"/templates/{tpl_id}", atok)
        check("publicada: ya no hay borrador", pub.get("hasDraft") is False, pub.get("hasDraft"))
        wp = widths_by_key(pub)
        check("CONGELADA: colSpan 6 viajó", wp.get("ancho_medio") == 6, wp.get("ancho_medio"))
        check("CONGELADA: colSpan 8 viajó", wp.get("ancho_dos_tercios") == 8, wp.get("ancho_dos_tercios"))
        check("CONGELADA: colSpan 4 viajó", wp.get("ancho_tercio") == 4, wp.get("ancho_tercio"))
        check("CONGELADA: default = 12", wp.get("ancho_default") == 12, wp.get("ancho_default"))

        # 4) Detalle de ENTRADA (lo que renderizan llenado y visor) expone el ancho.
        s, nodes = call("GET", f"/log-entries/templates/{tpl_id}/nodes", atok)
        nlist = nodes.get("nodes") if isinstance(nodes, dict) else None
        check("nodos elegibles para la plantilla", bool(nlist), s)
        if nlist:
            s, entry = call("POST", "/log-entries", atok, {"templateId": tpl_id, "orgNodeId": nlist[0]["id"]})
            check("crear entrada (2xx)", s in (200, 201), s)
            if s in (200, 201):
                entry_id = entry["id"]
                _, edet = req("GET", f"/log-entries/{entry_id}", atok)
                we = widths_by_key(edet)
                check("entrada: colSpan 6 en el detalle", we.get("ancho_medio") == 6, we.get("ancho_medio"))
                check("entrada: colSpan 8 en el detalle", we.get("ancho_dos_tercios") == 8, we.get("ancho_dos_tercios"))
                check("entrada: default = 12", we.get("ancho_default") == 12, we.get("ancho_default"))
    finally:
        # Limpieza SOLO por ID (cascada borra versiones/secciones/campos de la plantilla).
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
