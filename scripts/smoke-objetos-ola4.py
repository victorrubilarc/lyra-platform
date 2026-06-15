#!/usr/bin/env python3
"""Smoke en vivo — Catálogo de objetos premium · Ola 4 (objetos ESTRUCTURADOS).

Round-trip por las tres capas (diseño → versión CONGELADA → detalle) + validación
POR CELDA server-side + completitud generalizada, SIN infraestructura nueva:

  1. crea una plantilla con: TABLE (layout table, columnas hora TIME req / temp
     NUMBER req {min0 max100 warnHigh80} / estado SELECT inline OK·MAL), un 2.º TABLE
     (layout cards = grupo repetible: titulo TEXT req / detalle TEXTAREA) y una MATRIX
     (filas Presión/Caudal × columnas Turno A/B, celda NUMBER {min0 max10}); "lecturas"
     es OBLIGATORIA;
  2. publica ⇒ GET detalle: dataType TABLE/MATRIX + config.columns/rows/cell VIAJARON
     en la versión inmutable (clonado al publicar);
  3. crea una entrada y guarda "lecturas" con 2 filas válidas ⇒ 2xx; el array JSONB
     persiste; agregar/quitar/reordenar filas persiste;
  4. negativos POR CELDA: temp fuera de rango ⇒ 400; estado fuera de catálogo ⇒ 400;
     hora inválida ⇒ 400; columna required vacía en fila NO vacía ⇒ 400;
  5. matriz: celdas válidas ⇒ 2xx; celda > max ⇒ 400;
  6. completitud: markComplete con "lecturas" vacía ⇒ 400 (obligatorio sin filas);
     con ≥1 fila completa ⇒ 2xx.

CREA su propia plantilla + 1 entrada y LIMPIA TODO por ID. API :3000.
Admin demo: demo@watchlog.local / Demo!Pass2026.
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


def pg(sql):
    subprocess.run([*PG, sql], capture_output=True, text=True)


def pg_q(sql):
    return subprocess.run([*PG, sql], capture_output=True, text=True).stdout.strip()


def flatten(nodes, out=None):
    if out is None:
        out = []
    for n in nodes:
        out.append({"id": n["id"], "name": n["name"], "children": n.get("children", [])})
        flatten(n.get("children", []), out)
    return out


def fields_by_key(detail):
    out = {}
    for s in detail["version"]["sections"]:
        for f in s["fields"]:
            out[f["key"]] = f
    return out


def section_version(atok, entry_id):
    _, d = req("GET", f"/log-entries/{entry_id}", atok)
    return d["sectionStates"][0]["version"]


def save(atok, entry_id, ver, values, complete=False):
    body = {"expectedVersion": ver, "values": values}
    if complete:
        body["markComplete"] = True
    return call("PUT", f"/log-entries/{entry_id}/sections/s1", atok, body)


def check(name, cond, detail=""):
    (OK if cond else FAIL).append(name)
    print(("  ok  " if cond else "FAIL ") + name + (f"   [{detail}]" if detail else ""))


def main():
    _, login = req("POST", "/auth/login", body=ADMIN)
    atok = login["accessToken"]

    _, tree = req("GET", "/structure/nodes", atok)
    flat = flatten(tree)
    leaves = [n for n in flat if not n["children"]]
    node = leaves[0] if leaves else flat[0]
    node_id = node["id"]
    print(f"Nodo de prueba: {node_id} ({node['name']})")

    tpl_id = entry_id = None
    ts = os.urandom(3).hex()
    try:
        _, tpl = req("POST", "/templates", atok, {
            "name": f"SMOKE Ola4 {ts}",
            "nodeAssignments": [{"orgNodeId": node_id, "includeDescendants": False}],
        })
        tpl_id = tpl["id"]
        s, _ = call("PUT", f"/templates/{tpl_id}/draft", atok, {
            "sections": [{
                "key": "s1", "title": "Estructurados",
                "fields": [
                    {"key": "lecturas", "type": "TABLE", "label": "Lecturas horarias", "required": True, "config": {
                        "layout": "table", "maxRows": 4,
                        "columns": [
                            {"key": "hora", "label": "Hora", "type": "TIME", "required": True},
                            {"key": "temp", "label": "Temp", "type": "NUMBER", "required": True, "config": {"min": 0, "max": 100, "warnHigh": 80, "unit": "°C"}},
                            {"key": "estado", "label": "Estado", "type": "SELECT", "config": {"optionSource": {"kind": "inline", "items": [{"code": "OK", "label": "OK"}, {"code": "MAL", "label": "Mal"}]}}},
                        ],
                    }},
                    {"key": "hallazgos", "type": "TABLE", "label": "Hallazgos", "config": {
                        "layout": "cards", "addRowLabel": "Agregar hallazgo",
                        "columns": [
                            {"key": "titulo", "label": "Título", "type": "TEXT", "required": True},
                            {"key": "detalle", "label": "Detalle", "type": "TEXTAREA"},
                        ],
                    }},
                    {"key": "matriz", "type": "MATRIX", "label": "Lecturas por turno", "config": {
                        "rows": [{"key": "presion", "label": "Presión"}, {"key": "caudal", "label": "Caudal"}],
                        "columns": [{"key": "t_a", "label": "Turno A"}, {"key": "t_b", "label": "Turno B"}],
                        "cell": {"type": "NUMBER", "config": {"min": 0, "max": 10}},
                    }},
                ],
            }],
        })
        check("guardar borrador con TABLE/MATRIX (2xx)", s in (200, 201), s)
        s, _ = call("POST", f"/templates/{tpl_id}/publish", atok, {})
        check("publicar (2xx)", s in (200, 201), s)

        _, pub = req("GET", f"/templates/{tpl_id}", atok)
        f = fields_by_key(pub)
        check("CONGELADA: TABLE → dataType TABLE", f["lecturas"]["dataType"] == "TABLE", f["lecturas"]["dataType"])
        check("CONGELADA: MATRIX → dataType MATRIX", f["matriz"]["dataType"] == "MATRIX", f["matriz"]["dataType"])
        cols = f["lecturas"]["config"].get("columns") or []
        check("CONGELADA: 3 columnas con tipo/required viajaron", len(cols) == 3 and cols[0]["type"] == "TIME" and cols[1].get("required") is True)
        check("CONGELADA: estado SELECT con opciones inline", (cols[2].get("config") or {}).get("optionSource", {}).get("kind") == "inline")
        check("CONGELADA: layout cards en hallazgos", f["hallazgos"]["config"].get("layout") == "cards")
        mc = f["matriz"]["config"]
        check("CONGELADA: matriz rows/columns/cell viajaron", len(mc.get("rows", [])) == 2 and len(mc.get("columns", [])) == 2 and mc.get("cell", {}).get("type") == "NUMBER")

        # --- Entrada: round-trip de llenado ---
        _, nodes = req("GET", f"/log-entries/templates/{tpl_id}/nodes", atok)
        ent_node = (nodes.get("nodes") or [{"id": node_id}])[0]["id"]
        s, entry = call("POST", "/log-entries", atok, {"templateId": tpl_id, "orgNodeId": ent_node})
        entry_id = entry["id"] if s in (200, 201) else None
        check("crear entrada (2xx)", s in (200, 201), s)

        rowA = {"hora": "08:00", "temp": 50, "estado": "OK"}
        rowB = {"hora": "09:00", "temp": 60, "estado": "MAL"}

        ver = section_version(atok, entry_id)
        s, body = save(atok, entry_id, ver, [{"fieldKey": "lecturas", "value": [rowA, rowB]}])
        check("guardar TABLE con 2 filas válidas (2xx)", s in (200, 201), f"{s} {body if s not in (200,201) else ''}")
        persisted = pg_q(f"SELECT value::text FROM \"LogEntryValue\" WHERE \"logEntryId\"='{entry_id}' AND \"fieldKey\"='lecturas';")
        check("array de filas persistido en JSONB", '"hora"' in persisted and '"08:00"' in persisted and '"MAL"' in persisted, persisted[:80])

        # Reordenar / quitar fila persiste.
        ver = section_version(atok, entry_id)
        s, _ = save(atok, entry_id, ver, [{"fieldKey": "lecturas", "value": [rowB]}])
        persisted = pg_q(f"SELECT value::text FROM \"LogEntryValue\" WHERE \"logEntryId\"='{entry_id}' AND \"fieldKey\"='lecturas';")
        check("quitar fila persiste (queda solo 09:00)", s in (200, 201) and "08:00" not in persisted and "09:00" in persisted, persisted[:80])

        # --- Negativos POR CELDA ---
        ver = section_version(atok, entry_id)
        s, _ = save(atok, entry_id, ver, [{"fieldKey": "lecturas", "value": [{"hora": "08:00", "temp": 250, "estado": "OK"}]}])
        check("celda NUMBER fuera de rango ⇒ 400", s == 400, s)
        s, _ = save(atok, entry_id, ver, [{"fieldKey": "lecturas", "value": [{"hora": "08:00", "temp": 50, "estado": "XX"}]}])
        check("celda SELECT fuera de catálogo ⇒ 400", s == 400, s)
        s, _ = save(atok, entry_id, ver, [{"fieldKey": "lecturas", "value": [{"hora": "25:00", "temp": 50}]}])
        check("celda TIME inválida ⇒ 400", s == 400, s)
        s, _ = save(atok, entry_id, ver, [{"fieldKey": "lecturas", "value": [{"temp": 50}]}])
        check("columna required vacía en fila NO vacía ⇒ 400", s == 400, s)

        # --- MATRIX ---
        ver = section_version(atok, entry_id)
        s, _ = save(atok, entry_id, ver, [{"fieldKey": "matriz", "value": {"presion": {"t_a": 5, "t_b": 6}, "caudal": {"t_a": 1}}}])
        check("guardar MATRIX con celdas válidas (2xx)", s in (200, 201), s)
        ver = section_version(atok, entry_id)
        s, _ = save(atok, entry_id, ver, [{"fieldKey": "matriz", "value": {"presion": {"t_a": 99}}}])
        check("celda de MATRIX > max ⇒ 400", s == 400, s)

        # --- Completitud (obligatorio) ---
        ver = section_version(atok, entry_id)
        s, body = save(atok, entry_id, ver, [{"fieldKey": "lecturas", "value": []}], complete=True)
        is400 = s == 400 and (("fila" in str(body)) or ("obligator" in str(body).lower()))
        check("markComplete con TABLE obligatoria vacía ⇒ 400", is400, s)
        ver = section_version(atok, entry_id)
        s, body = save(atok, entry_id, ver, [
            {"fieldKey": "lecturas", "value": [rowA]},
            {"fieldKey": "matriz", "value": {"presion": {"t_a": 5, "t_b": 6}, "caudal": {"t_a": 1, "t_b": 2}}},
        ], complete=True)
        check("markComplete con ≥1 fila completa ⇒ 2xx", s in (200, 201), f"{s} {body if s not in (200,201) else ''}")

    finally:
        if entry_id:
            for tbl in ("LogEntryFieldChange", "LogEntryValue", "LogEntrySignature", "LogEntryTransition", "LogEntrySection"):
                pg(f'DELETE FROM "{tbl}" WHERE "logEntryId" = \'{entry_id}\';')
            pg(f'DELETE FROM "LogEntry" WHERE id = \'{entry_id}\';')
        if tpl_id:
            pg(f"DELETE FROM \"Template\" WHERE id='{tpl_id}';")

    if tpl_id:
        check("limpieza: plantilla eliminada", pg_q(f"SELECT count(*) FROM \"Template\" WHERE id='{tpl_id}';") == "0")
    if entry_id:
        check("limpieza: entrada eliminada", pg_q(f"SELECT count(*) FROM \"LogEntry\" WHERE id='{entry_id}';") == "0")

    print(f"\n=== {len(OK)} ok · {len(FAIL)} fail ===")
    if FAIL:
        print("FALLAS: " + ", ".join(FAIL))
        sys.exit(1)


if __name__ == "__main__":
    main()
