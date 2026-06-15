#!/usr/bin/env python3
"""Smoke en vivo — Catálogo de objetos premium · Ola 1.

Verifica el ROUND-TRIP de los objetos nuevos por las TRES capas (diseño →
versión CONGELADA → detalle de entrada) y su VALIDACIÓN en servidor:

  1. crea una plantilla y guarda un borrador con un campo de CADA tipo nuevo
     (CONFORMITY, RATING, TIME, DURATION, RANGE, TEXT+rut, NUMBER+percent,
     NUMBER+currency, SELECT displayAs=radio, MULTISELECT displayAs=modal) +
     objetos de PRESENTACIÓN (HEADING, NOTICE, DIVIDER);
  2. publica ⇒ GET detalle (versión CONGELADA) ⇒ el tipo + su config (format/
     displayAs/style/etc.) VIAJARON en la versión inmutable (clonado al publicar);
  3. crea una entrada y guarda la sección:
     - VALORES VÁLIDOS ⇒ 2xx; los objetos de presentación NO generan LogEntryValue;
     - VALORES INVÁLIDOS (RUT mal, %>100, conformidad fuera de catálogo, rango
       invertido, hora mala) ⇒ 400 con errores.

CREA su propia plantilla + 1 entrada y LIMPIA TODO por ID (el AuditLog inmutable
conserva el rastro). API :3000. Admin demo: demo@watchlog.local / Demo!Pass2026.
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


def pg_q(sql):
    return subprocess.run([*PG, sql], capture_output=True, text=True).stdout.strip()


def fields_by_key(detail):
    out = {}
    for s in detail["version"]["sections"]:
        for f in s["fields"]:
            out[f["key"]] = f
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
    OPTS = {"optionSource": {"kind": "inline", "items": [
        {"code": "a", "label": "A"}, {"code": "b", "label": "B"}]}}
    try:
        _, tpl = req("POST", "/templates", atok, {
            "name": f"SMOKE Ola1 {ts}",
            "nodeAssignments": [{"orgNodeId": node_id, "includeDescendants": False}],
        })
        tpl_id = tpl["id"]
        req("PUT", f"/templates/{tpl_id}/draft", atok, {
            "sections": [{
                "key": "s1", "title": "Inspección",
                "fields": [
                    {"key": "conf", "type": "CONFORMITY", "label": "Estado mecánico", "config": {"allowNa": True}},
                    {"key": "valor", "type": "RATING", "label": "Calidad", "config": {"style": "stars", "max": 5}},
                    {"key": "hora", "type": "TIME", "label": "Hora de lectura"},
                    {"key": "dur", "type": "DURATION", "label": "Duración de la tarea"},
                    {"key": "rango", "type": "RANGE", "label": "Rango de presión", "config": {"unit": "bar", "min": 0, "max": 100}},
                    {"key": "rut", "type": "TEXT", "label": "RUT operador", "config": {"format": "rut"}},
                    {"key": "pct", "type": "NUMBER", "label": "Avance", "config": {"format": "percent"}},
                    {"key": "costo", "type": "NUMBER", "label": "Costo", "config": {"format": "currency", "currency": "CLP"}},
                    {"key": "modo", "type": "SELECT", "label": "Modo", "config": {"displayAs": "radio", **OPTS}},
                    {"key": "causas", "type": "MULTISELECT", "label": "Causas", "config": {"displayAs": "modal", **OPTS}},
                    {"key": "enc", "type": "HEADING", "label": "Sección de cierre", "config": {"level": 2}},
                    {"key": "aviso", "type": "NOTICE", "label": "Use EPP", "config": {"variant": "warning", "text": "Casco y guantes"}},
                    {"key": "sep", "type": "DIVIDER", "label": "—"},
                ],
            }],
        })

        # Publicar ⇒ versión CONGELADA.
        s, _ = call("POST", f"/templates/{tpl_id}/publish", atok, {})
        check("publicar (2xx)", s in (200, 201), s)
        _, pub = req("GET", f"/templates/{tpl_id}", atok)
        f = fields_by_key(pub)
        check("CONGELADA: CONFORMITY → dataType CODE", f["conf"]["type"] == "CONFORMITY" and f["conf"]["dataType"] == "CODE", f["conf"]["dataType"])
        check("CONGELADA: RATING config (style/max) viajó", f["valor"]["config"].get("style") == "stars" and f["valor"]["config"].get("max") == 5)
        check("CONGELADA: TIME → dataType TIME", f["hora"]["dataType"] == "TIME", f["hora"]["dataType"])
        check("CONGELADA: DURATION → dataType NUMBER", f["dur"]["dataType"] == "NUMBER", f["dur"]["dataType"])
        check("CONGELADA: RANGE → dataType RANGE + config", f["rango"]["dataType"] == "RANGE" and f["rango"]["config"].get("unit") == "bar", f["rango"]["dataType"])
        check("CONGELADA: TEXT format=rut viajó", f["rut"]["config"].get("format") == "rut")
        check("CONGELADA: NUMBER format=percent viajó", f["pct"]["config"].get("format") == "percent")
        check("CONGELADA: NUMBER format=currency+CLP viajó", f["costo"]["config"].get("format") == "currency" and f["costo"]["config"].get("currency") == "CLP")
        check("CONGELADA: SELECT displayAs=radio viajó", f["modo"]["config"].get("displayAs") == "radio")
        check("CONGELADA: MULTISELECT displayAs=modal viajó", f["causas"]["config"].get("displayAs") == "modal")
        check("CONGELADA: HEADING → dataType LAYOUT", f["enc"]["dataType"] == "LAYOUT", f["enc"]["dataType"])
        check("CONGELADA: NOTICE → LAYOUT + config", f["aviso"]["dataType"] == "LAYOUT" and f["aviso"]["config"].get("variant") == "warning")
        check("CONGELADA: DIVIDER → LAYOUT", f["sep"]["dataType"] == "LAYOUT", f["sep"]["dataType"])

        # Crear entrada.
        _, nodes = req("GET", f"/log-entries/templates/{tpl_id}/nodes", atok)
        nlist = nodes.get("nodes") or []
        s, entry = call("POST", "/log-entries", atok, {"templateId": tpl_id, "orgNodeId": nlist[0]["id"] if nlist else node_id})
        check("crear entrada (2xx)", s in (200, 201), s)
        entry_id = entry["id"] if s in (200, 201) else None

        if entry_id:
            _, edet = req("GET", f"/log-entries/{entry_id}", atok)
            sect = edet["sectionStates"][0]
            ver = sect["version"]

            # Valores VÁLIDOS (incluye un valor para un campo de presentación, que el
            # backend debe IGNORAR / no persistir).
            ok_vals = [
                {"fieldKey": "conf", "value": "CONFORME"},
                {"fieldKey": "valor", "value": 4},
                {"fieldKey": "hora", "value": "08:30"},
                {"fieldKey": "dur", "value": 90},
                {"fieldKey": "rango", "value": {"from": 10, "to": 40}},
                {"fieldKey": "rut", "value": "11.111.111-1"},
                {"fieldKey": "pct", "value": 75},
                {"fieldKey": "costo", "value": 15000},
                {"fieldKey": "modo", "value": "a"},
                {"fieldKey": "causas", "value": ["a", "b"]},
                {"fieldKey": "aviso", "value": "intruso"},  # presentación: debe ignorarse
            ]
            s, _ = call("PUT", f"/log-entries/{entry_id}/sections/s1", atok, {"expectedVersion": ver, "values": ok_vals})
            check("guardar valores válidos (2xx)", s in (200, 201), s)

            # La presentación NO generó LogEntryValue.
            n_pres = pg_q(f"SELECT count(*) FROM \"LogEntryValue\" WHERE \"logEntryId\"='{entry_id}' AND \"fieldKey\" IN ('aviso','enc','sep');")
            check("presentación NO persiste valor", n_pres == "0", n_pres)
            n_data = pg_q(f"SELECT count(*) FROM \"LogEntryValue\" WHERE \"logEntryId\"='{entry_id}';")
            check("se persisten los 10 valores de dato", n_data == "10", n_data)

            # Valores INVÁLIDOS ⇒ 400.
            _, edet2 = req("GET", f"/log-entries/{entry_id}", atok)
            ver2 = edet2["sectionStates"][0]["version"]
            bad = [
                {"fieldKey": "rut", "value": "11.111.111-2"},
                {"fieldKey": "pct", "value": 120},
                {"fieldKey": "conf", "value": "QUIZAS"},
                {"fieldKey": "rango", "value": {"from": 50, "to": 10}},
                {"fieldKey": "hora", "value": "25:00"},
            ]
            s, body = call("PUT", f"/log-entries/{entry_id}/sections/s1", atok, {"expectedVersion": ver2, "values": bad})
            check("valores inválidos ⇒ 400", s == 400, s)
            errs = []
            if isinstance(body, str):
                try:
                    errs = json.loads(body).get("errors", [])
                except Exception:
                    errs = []
            check("400 detalla ≥5 errores (rut/%/conf/rango/hora)", len(errs) >= 5, len(errs))
    finally:
        if entry_id:
            for tbl in ("LogEntryFieldChange", "LogEntryValue", "LogEntrySignature",
                        "LogEntryTransition", "LogEntrySection"):
                pg(f'DELETE FROM "{tbl}" WHERE "logEntryId" = \'{entry_id}\';')
            pg(f'DELETE FROM "LogEntry" WHERE id = \'{entry_id}\';')
        if tpl_id:
            pg(f"DELETE FROM \"Template\" WHERE id='{tpl_id}';")

    # Confirmar limpieza.
    if tpl_id:
        left = pg_q(f"SELECT count(*) FROM \"Template\" WHERE id='{tpl_id}';")
        check("limpieza: plantilla eliminada", left == "0", left)

    print(f"\n=== {len(OK)} ok · {len(FAIL)} fail ===")
    if FAIL:
        print("FALLAS: " + ", ".join(FAIL))
        sys.exit(1)


if __name__ == "__main__":
    main()
