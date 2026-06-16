#!/usr/bin/env python3
"""Smoke de EXCEPCIONES operacionales — Fase 4.1.

Verifica la capa Bitácora → Excepción → Incidencia de punta a punta:
  (1) GENERACIÓN gobernada por campo: una lectura CRIT materializa excepción SIEMPRE;
      una WARN solo si el campo opta-in (`warnRaisesException`). WARN opt-out → NADA.
  (2) Contexto CONGELADO: originalValue, bandsSnapshot, nodo/turno/operador, thresholdType.
  (3) IDEMPOTENCIA: re-guardar el mismo campo no duplica (actualiza la provisional OPEN).
  (4) RETIRO de la provisional: corregir el valor a rango BORRA la excepción OPEN.
  (5) Resumen para el panel (críticas/advertencias/total/abiertas).
  (6) TRIAGE: acknowledge · dismiss (crítica) · correct (preserva el original, GxP) ·
      convert (crea incidencia originType EXCEPTION + link + status CONVERTED) ·
      associate (a incidencia existente) · dedupe-suggestions sugiere la incidencia abierta.
  (7) Registro MANUAL del operador.
  (8) SELLADO: entrySealedAt se estampa en las excepciones al sellar.
  (9) Gates 403: el operador (sin permisos de excepción) no lista ni tría.

CREA su propia plantilla (publicada) + entrada + incidencia y LIMPIA TODO por ID.
API :3000. Admin demo: demo@watchlog.local / Demo!Pass2026. El AuditLog conserva el rastro."""
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
ADMIN = "demo@watchlog.local"
OPERADOR = "operador@watchlog.local"
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
        b = e.read().decode()
        try:
            return e.code, json.loads(b)
        except Exception:
            return e.code, b


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


def pg1(sql):
    return subprocess.run([*PG, sql], capture_output=True, text=True).stdout.strip()


def sections():
    return [{
        "key": "s1", "title": "Lecturas",
        "fields": [
            # CRIT siempre + WARN opt-in (warnRaisesException true)
            {"key": "presion", "type": "NUMBER", "label": "Presión", "config": {
                "unit": "bar", "warnLow": 2, "warnHigh": 8, "critLow": 1, "critHigh": 10, "warnRaisesException": True}},
            # WARN opt-out (default): una WARN NO genera excepción
            {"key": "temp", "type": "NUMBER", "label": "Temperatura", "config": {
                "unit": "C", "warnHigh": 80, "critHigh": 100}},
            # CRIT low, para la corrección
            {"key": "nivel", "type": "NUMBER", "label": "Nivel", "config": {"warnLow": 30, "critLow": 10}},
            # CRIT high, excepción FRESCA para dedupe + associate
            {"key": "caudal", "type": "NUMBER", "label": "Caudal", "config": {"unit": "m3/h", "critHigh": 50}},
        ],
    }]


def exceptions_of(tok, eid):
    s, r = call("GET", f"/exceptions?logEntryId={eid}&pageSize=50", tok)
    return r if isinstance(r, dict) else {"items": [], "total": 0}


def by_field(items, key):
    return next((x for x in items if x["fieldKey"] == key), None)


def sec_ver(detail, key="s1"):
    return next((x["version"] for x in detail.get("sectionStates", []) if x["sectionKey"] == key), 0)


def save(tok, eid, values, complete=False):
    d = call("GET", f"/log-entries/{eid}", tok)[1]
    return call("PUT", f"/log-entries/{eid}/sections/s1", tok, {
        "expectedVersion": sec_ver(d if isinstance(d, dict) else {}),
        "values": values, **({"markComplete": True} if complete else {})})


def main():
    atok = req("POST", "/auth/login", body={"email": ADMIN, "password": PASS})[1]["accessToken"]
    optok = req("POST", "/auth/login", body={"email": OPERADOR, "password": PASS})[1]["accessToken"]
    flat = flatten(req("GET", "/structure/nodes", atok)[1])
    node = next((n for n in flat if not n["children"]), flat[0])
    node_id = node["id"]
    print(f"Nodo de prueba: {node_id} ({node['name']})")

    tpl_id = None
    incident_ids = []
    try:
        ts = os.urandom(3).hex()
        tpl_id = req("POST", "/templates", atok, {
            "name": f"SMOKE EXCEPCIONES {ts}",
            "nodeAssignments": [{"orgNodeId": node_id, "includeDescendants": False}]})[1]["id"]
        s, _ = call("PUT", f"/templates/{tpl_id}/draft", atok, {"sections": sections()})
        check("diseño plantilla con umbrales ⇒ 200", s == 200, s)
        s, _ = call("POST", f"/templates/{tpl_id}/publish", atok, {})
        check("publicar plantilla ⇒ 200/201", s in (200, 201), s)
        eid = call("POST", "/log-entries", atok, {"templateId": tpl_id, "orgNodeId": node_id})[1]["id"]

        # === (1) GENERACIÓN gobernada por campo =================================
        s, _ = save(atok, eid, [
            {"fieldKey": "presion", "value": 10.5},  # > critHigh 10 ⇒ CRIT
            {"fieldKey": "temp", "value": 85},        # > warnHigh 80, < critHigh ⇒ WARN (opt-out)
            {"fieldKey": "nivel", "value": 5},        # < critLow 10 ⇒ CRIT
        ])
        check("guardar lecturas ⇒ 200", s == 200, s)
        exc = exceptions_of(atok, eid)
        items = exc["items"]
        check("CRIT materializa excepción (presión + nivel) = 2", exc["total"] == 2, exc["total"])
        check("WARN opt-out NO genera excepción (temp ausente)", by_field(items, "temp") is None)
        pres = by_field(items, "presion")
        check("excepción de presión: thresholdType=critical", pres and pres["thresholdType"] == "critical", pres and pres["thresholdType"])
        check("excepción de presión: triggerKind=THRESHOLD_CRIT", pres and pres["triggerKind"] == "THRESHOLD_CRIT")
        check("excepción de presión: status OPEN (provisional)", pres and pres["status"] == "OPEN")

        # === (2) contexto CONGELADO ============================================
        check("congelado: originalValue=10.5", pres and pres["originalValue"] == 10.5, pres and pres["originalValue"])
        check("congelado: bandsSnapshot con critHigh=10", pres and (pres.get("bandsSnapshot") or {}).get("critHigh") == 10, pres and pres.get("bandsSnapshot"))
        check("congelado: unidad=bar", pres and pres["unit"] == "bar", pres and pres["unit"])
        check("congelado: nodo + operador resueltos", pres and pres["orgNodeId"] == node_id and pres["operatorId"], pres and pres["operatorId"])
        check("congelado: code EXC-####", pres and pres["code"].startswith("EXC-"), pres and pres["code"])

        # === (3) IDEMPOTENCIA ==================================================
        save(atok, eid, [{"fieldKey": "presion", "value": 10.8}])
        exc = exceptions_of(atok, eid)
        check("re-guardar NO duplica (sigue 2)", exc["total"] == 2, exc["total"])
        check("la provisional se ACTUALIZÓ (originalValue=10.8)", by_field(exc["items"], "presion")["originalValue"] == 10.8)

        # === WARN opt-in (campo presión a banda WARN) ===========================
        save(atok, eid, [{"fieldKey": "presion", "value": 9}])  # entre warnHigh 8 y critHigh 10 ⇒ WARN, opt-in
        exc = exceptions_of(atok, eid)
        pres = by_field(exc["items"], "presion")
        check("WARN opt-in mantiene la excepción (thresholdType=warning)", pres and pres["thresholdType"] == "warning", pres and pres["thresholdType"])

        # === (4) RETIRO de la provisional al volver a rango =====================
        save(atok, eid, [{"fieldKey": "presion", "value": 5}])  # en rango
        exc = exceptions_of(atok, eid)
        check("corregir a rango RETIRA la provisional OPEN (queda 1: nivel)", exc["total"] == 1 and by_field(exc["items"], "presion") is None, exc["total"])
        # recrea la de presión CRIT para las pruebas de triage
        save(atok, eid, [{"fieldKey": "presion", "value": 11}])
        exc = exceptions_of(atok, eid)
        check("re-materializa la excepción de presión CRIT", exc["total"] == 2)

        # === (5) RESUMEN del panel =============================================
        s, summ = call("GET", f"/exceptions/summary?logEntryId={eid}", atok)
        check("resumen: 2 críticas, 0 advertencias, 2 abiertas", s == 200 and summ["critical"] == 2 and summ["warning"] == 0 and summ["open"] == 2, summ)

        # === (9) Gates 403 del operador ========================================
        s, _ = call("GET", f"/exceptions?logEntryId={eid}", optok)
        check("operador sin module:incidents:view ⇒ 403 al listar", s == 403, s)
        pres = by_field(exceptions_of(atok, eid)["items"], "presion")
        nivel = by_field(exceptions_of(atok, eid)["items"], "nivel")
        s, _ = call("POST", f"/exceptions/{pres['id']}/acknowledge", optok, {})
        check("operador ⇒ 403 al reconocer", s == 403, s)

        # === (6) TRIAGE: acknowledge ===========================================
        s, r = call("POST", f"/exceptions/{pres['id']}/acknowledge", atok, {"note": "revisada"})
        check("acknowledge ⇒ status ACKNOWLEDGED", s == 200 and r["status"] == "ACKNOWLEDGED", f"{s} {r if isinstance(r, str) else r.get('status')}")

        # === (6) TRIAGE: correct (GxP, preserva original) ======================
        s, r = call("POST", f"/exceptions/{nivel['id']}/correct", atok, {"correctedValue": 50, "reason": "lectura mal tomada"})
        check("correct ⇒ status CORRECTED", s == 200 and r["status"] == "CORRECTED", f"{s} {r if isinstance(r, str) else r.get('status')}")
        check("correct preserva el original (5) y guarda el corregido (50)", r["originalValue"] == 5 and r["correctedValue"] == 50, {"o": r.get("originalValue"), "c": r.get("correctedValue")})
        d = call("GET", f"/log-entries/{eid}", atok)[1]
        nivel_val = next((v.get("value") for v in d.get("values", []) if v["fieldKey"] == "nivel"), None)
        check("correct ESCRIBE el valor en la entrada (nivel=50)", nivel_val == 50, nivel_val)

        # === (6) TRIAGE: dismiss de una crítica ================================
        # crea otra crítica (temp a CRIT) para descartarla
        save(atok, eid, [{"fieldKey": "temp", "value": 120}])  # > critHigh 100 ⇒ CRIT
        temp_exc = by_field(exceptions_of(atok, eid)["items"], "temp")
        s, r = call("POST", f"/exceptions/{temp_exc['id']}/dismiss", atok, {"reason": "falla de sensor conocida"})
        check("dismiss de crítica (admin con dismiss-critical) ⇒ DISMISSED", s == 200 and r["status"] == "DISMISSED", f"{s} {r if isinstance(r, str) else r.get('status')}")

        # === (6) TRIAGE: convert → incidencia ==================================
        type_id = next((t["id"] for t in call("GET", "/incidents/types", atok)[1] if t.get("active")), None)
        s, r = call("POST", "/exceptions/convert", atok, {
            "exceptionIds": [pres["id"]], "title": "Sobrepresión detectada", "typeId": type_id, "severity": 4})
        check("convert ⇒ 200 + incidentId", s == 200 and r.get("incidentId"), f"{s} {r}")
        inc_id = r.get("incidentId") if isinstance(r, dict) else None
        if inc_id:
            incident_ids.append(inc_id)
        pres2 = call("GET", f"/exceptions/{pres['id']}", atok)[1]
        check("excepción convertida ⇒ status CONVERTED + incidentId", pres2["status"] == "CONVERTED" and pres2["incidentId"] == inc_id, pres2["status"])
        check("excepción muestra el folio de la incidencia (INC-####)", (pres2.get("incidentCode") or "").startswith("INC-"), pres2.get("incidentCode"))
        inc = call("GET", f"/incidents/{inc_id}", atok)[1]
        check("incidencia con originType=EXCEPTION", inc.get("originType") == "EXCEPTION", inc.get("originType"))
        link_n = pg1(f"SELECT count(*) FROM \"IncidentExceptionLink\" WHERE \"incidentId\"='{inc_id}';")
        check("link incidencia↔excepción creado", link_n == "1", link_n)

        # === (6) TRIAGE: dedupe-suggestions + associate ========================
        # Una excepción CONVERTED congela el slot (entrada,campo); usamos un campo
        # FRESCO (caudal) con su propia excepción OPEN para dedupe + asociar.
        save(atok, eid, [{"fieldKey": "caudal", "value": 99}])  # > critHigh 50 ⇒ CRIT
        caudal_exc = by_field(exceptions_of(atok, eid)["items"], "caudal")
        check("excepción FRESCA de caudal OPEN", caudal_exc and caudal_exc["status"] == "OPEN", caudal_exc and caudal_exc["status"])
        s, sug = call("GET", f"/exceptions/{caudal_exc['id']}/dedupe-suggestions", atok)
        check("dedupe sugiere la incidencia abierta del mismo nodo", s == 200 and any(x["incidentId"] == inc_id for x in sug), f"{s} {sug}")
        s, r = call("POST", "/exceptions/associate", atok, {"exceptionIds": [caudal_exc["id"]], "incidentId": inc_id})
        check("associate ⇒ 200", s == 200 and r.get("incidentId") == inc_id, f"{s} {r}")
        caudal2 = call("GET", f"/exceptions/{caudal_exc['id']}", atok)[1]
        check("excepción asociada ⇒ CONVERTED + incidentId", caudal2["status"] == "CONVERTED" and caudal2["incidentId"] == inc_id)

        # === (7) Registro MANUAL ===============================================
        s, r = call("POST", "/exceptions/manual", atok, {
            "logEntryId": eid, "sectionKey": "s1", "fieldKey": "presion", "detail": "Ruido anómalo en la bomba"})
        check("registro manual ⇒ triggerKind MANUAL", s in (200, 201) and r["triggerKind"] == "MANUAL", f"{s} {r if isinstance(r, str) else r.get('triggerKind')}")

        # === (8) SELLADO estampa entrySealedAt =================================
        s, _ = save(atok, eid, [], complete=True)
        s2, _ = call("POST", f"/log-entries/{eid}/submit", atok, {})
        check("sellar la entrada (submit) ⇒ 200/201", s2 in (200, 201), s2)
        sealed_n = pg1(f"SELECT count(*) FROM \"LogEntryException\" WHERE \"logEntryId\"='{eid}' AND \"entrySealedAt\" IS NULL;")
        check("al sellar, entrySealedAt estampado en TODAS (0 sin sellar)", sealed_n == "0", sealed_n)

    finally:
        # Limpieza por ID: incidencias (cascade links/activities), excepciones de la
        # entrada (cascade sus links), entradas y plantilla.
        for inc in incident_ids:
            pg(f"DELETE FROM \"Incident\" WHERE id='{inc}';")
        if tpl_id:
            ents = pg1(f"SELECT id FROM \"LogEntry\" WHERE \"templateId\"='{tpl_id}';").splitlines()
            for e in [x.strip() for x in ents if x.strip()]:
                pg(f"DELETE FROM \"LogEntryException\" WHERE \"logEntryId\"='{e}';")
                pg(f"DELETE FROM \"LogEntry\" WHERE id='{e}';")
            pg(f"DELETE FROM \"Template\" WHERE id='{tpl_id}';")
            left = pg1(f"SELECT count(*) FROM \"LogEntry\" WHERE \"templateId\"='{tpl_id}';")
            check("limpieza: 0 entradas de la plantilla de prueba", left == "0", left)

    print(f"\n=== {len(OK)} ok / {len(FAIL)} fail ===")
    if FAIL:
        for f in FAIL:
            print("  FAIL " + f)
        sys.exit(1)


if __name__ == "__main__":
    main()
