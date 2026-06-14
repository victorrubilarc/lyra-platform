#!/usr/bin/env python3
"""Smoke del MOTOR DE REGLAS DE NEGOCIO — primer corte (Req-7).

Verifica de punta a punta:
  (1) Campos FORMULADOS: valor DERIVADO/estampado por el SERVIDOR (autoritativo);
      división por cero / input nulo ⇒ VACÍO; campo formulado es READ-ONLY (rechaza
      valor del cliente); el cálculo del servidor MANDA (ignora lo que envíe el cliente).
  (2) Validación CRUZADA: una regla ERROR (salida > entrada) BLOQUEA completar; con
      valores válidos NO bloquea. WARN no bloquea.
  (3) Umbral ISA-18.2 sobre el valor CALCULADO (banda WARN sobre la eficiencia).
  (4) Validación de DISEÑO: referencia circular entre formulados / ref a campo
      inexistente ⇒ 400 al guardar el borrador (fallar en diseño, nunca en llenado).
  (5) Las reglas viajan en la versión INMUTABLE (el detalle publicado las expone).

CREA su propia plantilla (publicada) + 1 entrada y LIMPIA TODO al final SOLO por ID.
API :3000. Admin demo: demo@watchlog.local / Demo!Pass2026. El AuditLog inmutable
conserva el rastro (esperado, ALCOA+)."""
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


# --- AST helpers ------------------------------------------------------------
def var(k):
    return {"kind": "var", "key": k}


def lit(v):
    return {"kind": "lit", "value": v}


def op(o, *args):
    return {"kind": "op", "op": o, "args": list(args)}


def values_of(detail):
    return {v["fieldKey"]: v.get("value") for v in detail.get("values", [])}


def get_detail(tok, eid):
    s, d = call("GET", f"/log-entries/{eid}", tok)
    return d if isinstance(d, dict) else {}


def section_version(detail, key="s1"):
    return next((x["version"] for x in detail.get("sectionStates", []) if x["sectionKey"] == key), 0)


# Campos del borrador VÁLIDO (entrada/salida/lecturas + 2 formulados).
def valid_sections():
    return [{
        "key": "s1", "title": "Producción",
        "fields": [
            {"key": "entrada", "type": "NUMBER", "label": "Entrada", "config": {"unit": "t"}},
            {"key": "salida", "type": "NUMBER", "label": "Salida", "config": {"unit": "t"}},
            {"key": "lect_ini", "type": "NUMBER", "label": "Lectura inicial", "config": {"unit": "kWh"}},
            {"key": "lect_fin", "type": "NUMBER", "label": "Lectura final", "config": {"unit": "kWh"}},
            # consumo = lect_fin − lect_ini
            {"key": "consumo", "type": "NUMBER", "label": "Consumo", "config": {"unit": "kWh"},
             "computed": {"expression": op("sub", var("lect_fin"), var("lect_ini"))}},
            # eficiencia = salida / entrada (÷0 ⇒ vacío); umbral WARN bajo 0.5 sobre el CALCULADO
            {"key": "eficiencia", "type": "NUMBER", "label": "Eficiencia",
             "config": {"decimals": 4, "warnLow": 0.5},
             "computed": {"expression": op("div", var("salida"), var("entrada"))}},
        ],
    }]


def valid_rules():
    return [{
        "key": "salida_mayor",
        "when": op("gt", var("salida"), var("entrada")),
        "severity": "ERROR",
        "message": "La salida no puede superar a la entrada",
    }]


def main():
    _, login = req("POST", "/auth/login", body=ADMIN)
    atok = login["accessToken"]
    _, tree = req("GET", "/structure/nodes", atok)
    flat = flatten(tree)
    node = next((n for n in flat if not n["children"]), flat[0])
    node_id = node["id"]
    print(f"Nodo de prueba: {node_id} ({node['name']})")

    tpl_id = None
    try:
        ts = os.urandom(3).hex()
        _, tpl = req("POST", "/templates", atok, {
            "name": f"SMOKE REGLAS {ts}",
            "nodeAssignments": [{"orgNodeId": node_id, "includeDescendants": False}],
        })
        tpl_id = tpl["id"]

        # === (4) Validación de DISEÑO (fallar en diseño) ======================
        # Referencia circular entre formulados a↔b.
        s, _ = call("PUT", f"/templates/{tpl_id}/draft", atok, {"sections": [{
            "key": "s1", "title": "X", "fields": [
                {"key": "a", "type": "NUMBER", "label": "A", "computed": {"expression": op("add", var("b"), lit(1))}},
                {"key": "b", "type": "NUMBER", "label": "B", "computed": {"expression": op("add", var("a"), lit(1))}},
            ]}]})
        check("diseño: referencia circular entre formulados ⇒ 400", s == 400, s)
        # Referencia a un campo inexistente.
        s, _ = call("PUT", f"/templates/{tpl_id}/draft", atok, {"sections": [{
            "key": "s1", "title": "X", "fields": [
                {"key": "a", "type": "NUMBER", "label": "A", "computed": {"expression": var("fantasma")}},
            ]}]})
        check("diseño: referencia a campo inexistente ⇒ 400", s == 400, s)
        # Regla cruzada que referencia un campo inexistente.
        s, _ = call("PUT", f"/templates/{tpl_id}/draft", atok, {
            "sections": [{"key": "s1", "title": "X", "fields": [{"key": "a", "type": "NUMBER", "label": "A"}]}],
            "rules": [{"key": "r", "when": op("gt", var("a"), var("fantasma")), "severity": "ERROR", "message": "x"}]})
        check("diseño: regla con campo inexistente ⇒ 400", s == 400, s)

        # === Guardar el borrador VÁLIDO + publicar ============================
        s, _ = call("PUT", f"/templates/{tpl_id}/draft", atok, {"sections": valid_sections(), "rules": valid_rules()})
        check("diseño válido (formulados + regla) ⇒ 200", s == 200, s)
        s, det = call("POST", f"/templates/{tpl_id}/publish", atok, {})
        check("publicar plantilla ⇒ 200/201", s in (200, 201), s)
        # (5) reglas + formulados viajan en la versión inmutable publicada.
        ver = det.get("version", {}) if isinstance(det, dict) else {}
        rules = ver.get("rules", [])
        fields = {f["key"]: f for sec in ver.get("sections", []) for f in sec["fields"]}
        check("versión publicada expone la regla cruzada", any(r["key"] == "salida_mayor" for r in rules), rules)
        check("versión publicada expone el campo formulado (computed)", fields.get("eficiencia", {}).get("computed") is not None, list(fields))

        # === Crear entrada ====================================================
        s, entry = call("POST", "/log-entries", atok, {"templateId": tpl_id, "orgNodeId": node_id})
        check("crear entrada ⇒ 201", s == 201, s)
        eid = entry["id"]
        v0 = section_version(entry)

        # === (1) div/0 ⇒ vacío + consumo derivado por el servidor =============
        s, _ = call("PUT", f"/log-entries/{eid}/sections/s1", atok, {
            "expectedVersion": v0,
            "values": [
                {"fieldKey": "entrada", "value": 0}, {"fieldKey": "salida", "value": 80},
                {"fieldKey": "lect_ini", "value": 10}, {"fieldKey": "lect_fin", "value": 25},
            ]})
        check("guardar inputs (entrada=0) ⇒ 200", s == 200, s)
        d = get_detail(atok, eid)
        vals = values_of(d)
        check("consumo derivado por el servidor = 15 (lect_fin − lect_ini)", vals.get("consumo") == 15, vals.get("consumo"))
        check("eficiencia con ÷0 ⇒ VACÍO (null / ausente)", vals.get("eficiencia") in (None,), vals.get("eficiencia"))

        # === (1) campo formulado es READ-ONLY (rechaza valor del cliente) =====
        d = get_detail(atok, eid)
        s, _ = call("PUT", f"/log-entries/{eid}/sections/s1", atok, {
            "expectedVersion": section_version(d),
            "values": [{"fieldKey": "consumo", "value": 9999}]})
        check("enviar valor a un campo formulado ⇒ 400 (solo lectura)", s == 400, s)

        # === (1)(3) el cálculo del servidor MANDA + umbral sobre el calculado =
        d = get_detail(atok, eid)
        s, _ = call("PUT", f"/log-entries/{eid}/sections/s1", atok, {
            "expectedVersion": section_version(d),
            "values": [{"fieldKey": "entrada", "value": 100}, {"fieldKey": "salida", "value": 40}]})
        check("guardar inputs (40/100) ⇒ 200", s == 200, s)
        d = get_detail(atok, eid)
        vals = values_of(d)
        check("eficiencia derivada por el servidor = 0.4 (40/100)", vals.get("eficiencia") == 0.4, vals.get("eficiencia"))
        # banda de umbral estampada sobre el VALOR CALCULADO (warnLow 0.5 ⇒ WARN)
        s, items = call("GET", f"/log-entries?templateId={tpl_id}&take=10", atok)
        row = next((it for it in (items.get("items", []) if isinstance(items, dict) else []) if it["id"] == eid), None)
        sv = {v["fieldKey"]: v for v in (row.get("summaryValues", []) if row else [])}
        # eficiencia no está en gridFieldKeys (no se publicó), así que validamos la banda vía indicador worst:
        check("umbral ISA-18.2 aplica al valor CALCULADO (worstThresholdBand WARN)",
              (row or {}).get("indicators", {}).get("worstThresholdBand") == "WARN", (row or {}).get("indicators", {}).get("worstThresholdBand"))

        # === (2) la regla cruzada ERROR BLOQUEA completar =====================
        d = get_detail(atok, eid)
        s, resp = call("PUT", f"/log-entries/{eid}/sections/s1", atok, {
            "expectedVersion": section_version(d),
            "values": [{"fieldKey": "entrada", "value": 100}, {"fieldKey": "salida", "value": 120}],
            "markComplete": True})
        blocked = s == 400 and "superar" in str(resp)
        check("regla cruzada (salida>entrada) BLOQUEA completar ⇒ 400 con su mensaje", blocked, f"{s} {str(resp)[:80]}")

        # === (2) con valores válidos NO bloquea (completa) ====================
        d = get_detail(atok, eid)
        s, _ = call("PUT", f"/log-entries/{eid}/sections/s1", atok, {
            "expectedVersion": section_version(d),
            "values": [{"fieldKey": "entrada", "value": 100}, {"fieldKey": "salida", "value": 40}],
            "markComplete": True})
        check("con salida ≤ entrada la regla NO bloquea ⇒ completa 200", s == 200, s)
        d = get_detail(atok, eid)
        st = next((x for x in d.get("sectionStates", []) if x["sectionKey"] == "s1"), {})
        check("sección quedó COMPLETED", st.get("state") == "COMPLETED", st.get("state"))
        vals = values_of(d)
        check("formulados presentes al completar (consumo=15, eficiencia=0.4)",
              vals.get("consumo") == 15 and vals.get("eficiencia") == 0.4, {"consumo": vals.get("consumo"), "eficiencia": vals.get("eficiencia")})

    finally:
        if tpl_id:
            out = subprocess.run([*PG, f"SELECT id FROM \"LogEntry\" WHERE \"templateId\"='{tpl_id}';"], capture_output=True, text=True)
            for x in [l.strip() for l in out.stdout.splitlines() if l.strip()]:
                pg(f"DELETE FROM \"LogEntry\" WHERE id='{x}';")
            pg(f"DELETE FROM \"Template\" WHERE id='{tpl_id}';")
            out = subprocess.run([*PG, f"SELECT count(*) FROM \"LogEntry\" WHERE \"templateId\"='{tpl_id}';"], capture_output=True, text=True)
            check("limpieza: 0 entradas de la plantilla de prueba", out.stdout.strip() == "0", out.stdout.strip())

    print(f"\n=== {len(OK)} ok / {len(FAIL)} fail ===")
    if FAIL:
        for f in FAIL:
            print("  FAIL " + f)
        sys.exit(1)


if __name__ == "__main__":
    main()
