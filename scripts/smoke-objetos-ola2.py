#!/usr/bin/env python3
"""Smoke en vivo — Catálogo de objetos premium · Ola 2 (objetos de REFERENCIA).

Round-trip por las TRES capas (diseño → versión CONGELADA → detalle de entrada) y
VALIDACIÓN server-side con ABAC:

  1. crea una plantilla con un campo de cada objeto nuevo: selectores de
     REFERENCE (equipment/user/orgNode/shift), NÚMERO con tolerancia
     (expected ± tol → bandas derivadas), NÚMERO contador y MATRIZ DE RIESGO;
  2. publica ⇒ GET detalle: el tipo + dataType (REFERENCE/RISK) + config
     (entity/matrix/tolerance) VIAJARON en la versión inmutable (clonado al publicar);
  3. endpoint de opciones de referencia (ABAC) responde por entidad;
  4. crea una entrada y guarda la sección:
     - VALORES VÁLIDOS (equipo del nodo, usuario, nodo, turno, tolerancia, contador,
       riesgo dentro de la matriz) ⇒ 2xx; `counterPreviousValues` viaja en el detalle;
     - REFERENCIA fuera de alcance (equipo de OTRO nodo) ⇒ 400;
     - RIESGO fuera de los ejes de la matriz ⇒ 400.

CREA su propia plantilla + 2 equipos + 1 entrada y LIMPIA TODO por ID (el AuditLog
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


def pg_q(sql):
    return subprocess.run([*PG, sql], capture_output=True, text=True).stdout.strip()


def fields_by_key(detail):
    out = {}
    for s in detail["version"]["sections"]:
        for f in s["fields"]:
            out[f["key"]] = f
    return out


MATRIX = {
    "probabilityLabels": ["Baja", "Media", "Alta"],
    "consequenceLabels": ["Leve", "Moderada", "Grave"],
    "cells": [[1, 2, 3], [2, 3, 4], [3, 4, 5]],
}


def main():
    _, login = req("POST", "/auth/login", body=ADMIN)
    atok = login["accessToken"]

    _, tree = req("GET", "/structure/nodes", atok)
    flat = flatten(tree)
    leaves = [n for n in flat if not n["children"]]
    node = leaves[0] if leaves else flat[0]
    other = next((n for n in leaves if n["id"] != node["id"]), None) or next((n for n in flat if n["id"] != node["id"]), None)
    node_id = node["id"]
    other_id = other["id"] if other else node_id
    print(f"Nodo de prueba: {node_id} ({node['name']}) · otro nodo: {other_id}")

    tpl_id = entry_id = eqA = eqB = None
    ts = os.urandom(3).hex()
    try:
        # Equipos: uno en el nodo de la entrada (válido) y otro en distinto nodo (fuera de alcance).
        _, e1 = req("POST", "/structure/equipment", atok, {"name": f"SMOKE EqA {ts}", "tag": f"SMK-A-{ts}", "orgNodeId": node_id})
        eqA = e1["id"]
        _, e2 = req("POST", "/structure/equipment", atok, {"name": f"SMOKE EqB {ts}", "tag": f"SMK-B-{ts}", "orgNodeId": other_id})
        eqB = e2["id"]

        _, tpl = req("POST", "/templates", atok, {
            "name": f"SMOKE Ola2 {ts}",
            "nodeAssignments": [{"orgNodeId": node_id, "includeDescendants": False}],
        })
        tpl_id = tpl["id"]
        req("PUT", f"/templates/{tpl_id}/draft", atok, {
            "sections": [{
                "key": "s1", "title": "Referencias",
                "fields": [
                    {"key": "equipo", "type": "REFERENCE", "label": "Equipo", "config": {"entity": "equipment", "display": "dropdown"}},
                    {"key": "resp", "type": "REFERENCE", "label": "Responsable", "config": {"entity": "user", "display": "dropdown"}},
                    {"key": "nodo", "type": "REFERENCE", "label": "Nodo", "config": {"entity": "orgNode", "display": "dropdown"}},
                    {"key": "turno", "type": "REFERENCE", "label": "Turno", "config": {"entity": "shift", "display": "dropdown"}},
                    {"key": "presion", "type": "NUMBER", "label": "Presión", "config": {"unit": "bar", "expected": 100, "tolerance": 5, "critTolerance": 10}},
                    {"key": "horometro", "type": "NUMBER", "label": "Horómetro", "config": {"counter": True, "counterNonDecreasing": True}},
                    {"key": "riesgo", "type": "RISK_MATRIX", "label": "Riesgo", "config": MATRIX},
                ],
            }],
        })

        s, _ = call("POST", f"/templates/{tpl_id}/publish", atok, {})
        check("publicar (2xx)", s in (200, 201), s)
        _, pub = req("GET", f"/templates/{tpl_id}", atok)
        f = fields_by_key(pub)
        check("CONGELADA: REFERENCE → dataType REFERENCE", f["equipo"]["dataType"] == "REFERENCE", f["equipo"]["dataType"])
        check("CONGELADA: config.entity viajó (equipment)", f["equipo"]["config"].get("entity") == "equipment")
        check("CONGELADA: entity user/orgNode/shift", {f["resp"]["config"].get("entity"), f["nodo"]["config"].get("entity"), f["turno"]["config"].get("entity")} == {"user", "orgNode", "shift"})
        check("CONGELADA: tolerancia (expected/tolerance) viajó", f["presion"]["config"].get("expected") == 100 and f["presion"]["config"].get("tolerance") == 5)
        check("CONGELADA: contador (counter) viajó", f["horometro"]["config"].get("counter") is True)
        check("CONGELADA: RISK_MATRIX → dataType RISK + cells", f["riesgo"]["dataType"] == "RISK" and f["riesgo"]["config"].get("cells") == MATRIX["cells"], f["riesgo"]["dataType"])

        # Endpoint de opciones de referencia (ABAC).
        s, opt_eq = call("GET", f"/log-entries/references/equipment/options?nodeId={node_id}", atok)
        check("opciones equipment (2xx)", s == 200, s)
        eq_ids = {o["id"] for o in (opt_eq.get("options") if isinstance(opt_eq, dict) else [])}
        check("opciones equipment incluyen el equipo del nodo", eqA in eq_ids)
        check("opciones equipment NO incluyen el de otro nodo", eqB not in eq_ids)
        s, opt_u = call("GET", "/log-entries/references/user/options", atok)
        check("opciones user (2xx, ≥1)", s == 200 and len(opt_u.get("options", [])) >= 1, s)
        user_id = opt_u["options"][0]["id"]
        s, opt_sh = call("GET", f"/log-entries/references/shift/options?nodeId={node_id}", atok)
        check("opciones shift (2xx)", s == 200, s)
        shift_id = opt_sh["options"][0]["id"] if opt_sh.get("options") else None
        s, opt_bad = call("GET", "/log-entries/references/cualquiera/options", atok)
        check("kind desconocido ⇒ 404", s == 404, s)

        # Crear entrada.
        _, nodes = req("GET", f"/log-entries/templates/{tpl_id}/nodes", atok)
        nlist = nodes.get("nodes") or []
        ent_node = nlist[0]["id"] if nlist else node_id
        s, entry = call("POST", "/log-entries", atok, {"templateId": tpl_id, "orgNodeId": ent_node})
        check("crear entrada (2xx)", s in (200, 201), s)
        entry_id = entry["id"] if s in (200, 201) else None
        check("detalle trae counterPreviousValues", isinstance(entry, dict) and "counterPreviousValues" in entry)

        if entry_id:
            _, edet = req("GET", f"/log-entries/{entry_id}", atok)
            ver = edet["sectionStates"][0]["version"]
            ok_vals = [
                {"fieldKey": "equipo", "value": eqA},
                {"fieldKey": "resp", "value": user_id},
                {"fieldKey": "nodo", "value": ent_node},
                {"fieldKey": "presion", "value": 108},  # fuera de ±5 ⇒ WARN (no bloquea)
                {"fieldKey": "horometro", "value": 1200},
                {"fieldKey": "riesgo", "value": {"probability": 2, "consequence": 3}},
            ]
            if shift_id:
                ok_vals.append({"fieldKey": "turno", "value": shift_id})
            s, body = call("PUT", f"/log-entries/{entry_id}/sections/s1", atok, {"expectedVersion": ver, "values": ok_vals})
            check("guardar referencias válidas + tolerancia/contador/riesgo (2xx)", s in (200, 201), f"{s} {body if s not in (200,201) else ''}")

            # La presión 108 (fuera de ±5) se estampó con banda WARN.
            band = pg_q(f"SELECT \"thresholdBand\" FROM \"LogEntryValue\" WHERE \"logEntryId\"='{entry_id}' AND \"fieldKey\"='presion';")
            check("tolerancia: 108 fuera de ±5 ⇒ banda WARN estampada", band == "WARN", band)

            # Referencia fuera de alcance (equipo de OTRO nodo) ⇒ 400.
            _, edet2 = req("GET", f"/log-entries/{entry_id}", atok)
            ver2 = edet2["sectionStates"][0]["version"]
            s, body = call("PUT", f"/log-entries/{entry_id}/sections/s1", atok, {"expectedVersion": ver2, "values": [{"fieldKey": "equipo", "value": eqB}]})
            check("equipo de otro nodo ⇒ 400 (fuera de alcance)", s == 400, s)

            _, edet3 = req("GET", f"/log-entries/{entry_id}", atok)
            ver3 = edet3["sectionStates"][0]["version"]
            s, body = call("PUT", f"/log-entries/{entry_id}/sections/s1", atok, {"expectedVersion": ver3, "values": [{"fieldKey": "riesgo", "value": {"probability": 9, "consequence": 1}}]})
            check("riesgo fuera de la matriz ⇒ 400", s == 400, s)

            # Referencia inexistente ⇒ 400.
            _, edet4 = req("GET", f"/log-entries/{entry_id}", atok)
            ver4 = edet4["sectionStates"][0]["version"]
            s, body = call("PUT", f"/log-entries/{entry_id}/sections/s1", atok, {"expectedVersion": ver4, "values": [{"fieldKey": "resp", "value": "usuario-inexistente-xyz"}]})
            check("usuario inexistente ⇒ 400", s == 400, s)
    finally:
        if entry_id:
            for tbl in ("LogEntryFieldChange", "LogEntryValue", "LogEntrySignature", "LogEntryTransition", "LogEntrySection"):
                pg(f'DELETE FROM "{tbl}" WHERE "logEntryId" = \'{entry_id}\';')
            pg(f'DELETE FROM "LogEntry" WHERE id = \'{entry_id}\';')
        if tpl_id:
            pg(f"DELETE FROM \"Template\" WHERE id='{tpl_id}';")
        for eid in (eqA, eqB):
            if eid:
                pg(f"DELETE FROM \"ExternalReference\" WHERE \"equipmentId\"='{eid}';")
                pg(f"DELETE FROM \"Equipment\" WHERE id='{eid}';")

    if tpl_id:
        left = pg_q(f"SELECT count(*) FROM \"Template\" WHERE id='{tpl_id}';")
        check("limpieza: plantilla eliminada", left == "0", left)
    if eqA:
        left = pg_q(f"SELECT count(*) FROM \"Equipment\" WHERE id IN ('{eqA}','{eqB}');")
        check("limpieza: equipos eliminados", left == "0", left)

    print(f"\n=== {len(OK)} ok · {len(FAIL)} fail ===")
    if FAIL:
        print("FALLAS: " + ", ".join(FAIL))
        sys.exit(1)


if __name__ == "__main__":
    main()
