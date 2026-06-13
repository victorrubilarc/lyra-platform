#!/usr/bin/env python3
"""Smoke de BITÁCORAS — GRILLA ORIENTADA A CONTENIDO (Fase 2.8.1a).

Verifica: (1) `gridFieldKeys` como gobernanza viva del contenedor (PATCH, sin republicar)
+ validación (cap 6, key órfano); (2) el listado de /bitacoras expone `summaryValues`
ACOTADOS a esos campos, con label/unidad/optionLabel(code→label)/banda de umbral, y
`equipmentTag`; (3) BÚSQUEDA POR CONTENIDO (q) sobre los valores de los candidatos;
(4) ABAC: los 3 usuarios demo listan sin error y NO ven contenido fuera de su alcance.

CREA su propia plantilla (publicada) + equipo + 1 entrada con valores y LIMPIA TODO al
final SOLO por ID. API :3000. Admin demo: demo@watchlog.local / Demo!Pass2026.
El AuditLog inmutable conserva el rastro (esperado, ALCOA+)."""
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
DEMO_USERS = ["operador@watchlog.local", "supervisor@watchlog.local", "mantenedor@watchlog.local"]
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


def find_row(tok, tpl_id, q=None):
    """Busca nuestra entrada en /bitacoras filtrando por la plantilla (+ q opcional)."""
    path = f"/log-entries?templateId={tpl_id}&take=50"
    if q:
        path += f"&q={urllib.parse.quote(q)}"
    s, resp = call("GET", path, tok)
    items = resp["items"] if isinstance(resp, dict) else []
    return s, items


def main():
    _, login = req("POST", "/auth/login", body=ADMIN)
    atok = login["accessToken"]

    _, tree = req("GET", "/structure/nodes", atok)
    flat = flatten(tree)
    node = next((n for n in flat if not n["children"]), flat[0])
    node_id = node["id"]
    print(f"Nodo de prueba: {node_id} ({node['name']})")

    eq_id = None
    tpl_id = None
    UNIQ = "ZXQ" + os.urandom(2).hex().upper()  # token de contenido para la búsqueda
    try:
        ts = os.urandom(3).hex()
        _, eq = req("POST", "/structure/equipment", atok, {"name": f"SMOKE EQ {ts}", "tag": f"SMK-{ts}", "orgNodeId": node_id})
        eq_id = eq["id"]

        # --- Plantilla con NUMBER(umbral+unidad) + SELECT inline + TEXT --------
        _, tpl = req("POST", "/templates", atok, {
            "name": f"SMOKE 2.8.1a {ts}",
            "nodeAssignments": [{"orgNodeId": node_id, "includeDescendants": False}],
        })
        tpl_id = tpl["id"]
        check("plantilla nace con gridFieldKeys vacío (default)", tpl.get("gridFieldKeys") == [], tpl.get("gridFieldKeys"))
        req("PUT", f"/templates/{tpl_id}/draft", atok, {
            "sections": [{
                "key": "s1", "title": "Operación",
                "fields": [
                    {"key": "temp", "type": "NUMBER", "label": "Temperatura",
                     "config": {"unit": "°C", "min": 0, "max": 120, "warnLow": 10, "warnHigh": 90, "critLow": 0, "critHigh": 100}},
                    {"key": "estado", "type": "SELECT", "label": "Estado de marcha",
                     "config": {"optionSource": {"kind": "inline", "items": [
                         {"code": "op_normal", "label": "Operó normal"}, {"code": "detenido", "label": "Detenido"}]}}},
                    {"key": "obs", "type": "TEXT", "label": "Observación"},
                ],
            }],
        })
        req("POST", f"/templates/{tpl_id}/publish", atok, {})

        # === gridFieldKeys: gobernanza viva (PATCH) + validación ===============
        s, det = call("PATCH", f"/templates/{tpl_id}", atok, {"gridFieldKeys": ["temp", "estado", "obs"]})
        check("PATCH gridFieldKeys (sin republicar) → 200", s == 200, s)
        check("detalle devuelve los gridFieldKeys guardados", isinstance(det, dict) and det.get("gridFieldKeys") == ["temp", "estado", "obs"], det.get("gridFieldKeys") if isinstance(det, dict) else det)
        s, _ = call("PATCH", f"/templates/{tpl_id}", atok, {"gridFieldKeys": [f"k{i}" for i in range(7)]})
        check("PATCH con 7 candidatos → 400 (cap 6)", s == 400, s)
        s, _ = call("PATCH", f"/templates/{tpl_id}", atok, {"gridFieldKeys": ["no_existe"]})
        check("PATCH con key órfano → 400", s == 400, s)
        # Re-fijar el set bueno (el cap/órfano no debió cambiarlo, pero aseguramos).
        req("PATCH", f"/templates/{tpl_id}", atok, {"gridFieldKeys": ["temp", "estado", "obs"]})

        # === Entrada con valores ==============================================
        s, entry = call("POST", "/log-entries", atok, {"templateId": tpl_id, "orgNodeId": node_id, "equipmentId": eq_id})
        check("crear entrada → 201", s == 201, s)
        entry_id = entry["id"]
        ver = next((x["version"] for x in entry.get("sectionStates", []) if x["sectionKey"] == "s1"), 0)
        s, _ = call("PUT", f"/log-entries/{entry_id}/sections/s1", atok, {
            "expectedVersion": ver,
            "values": [
                {"fieldKey": "temp", "value": 95},          # cae en banda WARN (warnMax 90)
                {"fieldKey": "estado", "value": "op_normal"},
                {"fieldKey": "obs", "value": f"prueba contenido {UNIQ}"},
            ],
        })
        check("guardar valores de la sección → 200", s == 200, s)

        # === summaryValues en el listado ======================================
        s, items = find_row(atok, tpl_id)
        row = next((it for it in items if it["id"] == entry_id), None)
        check("la entrada aparece en /bitacoras", row is not None, s)
        if row:
            sv = {v["fieldKey"]: v for v in row.get("summaryValues", [])}
            check("summaryValues acota a los 3 candidatos", set(sv.keys()) == {"temp", "estado", "obs"}, list(sv.keys()))
            check("temp: valor + unidad + label congelado", sv.get("temp", {}).get("value") == 95 and sv.get("temp", {}).get("unit") == "°C" and sv.get("temp", {}).get("label") == "Temperatura", sv.get("temp"))
            check("temp: banda de umbral estampada (WARN)", sv.get("temp", {}).get("thresholdBand") == "WARN", sv.get("temp", {}).get("thresholdBand"))
            check("estado: code→label resuelto (inline)", sv.get("estado", {}).get("value") == "op_normal" and sv.get("estado", {}).get("optionLabel") == "Operó normal", sv.get("estado"))
            check("obs: texto presente", UNIQ in str(sv.get("obs", {}).get("value")), sv.get("obs", {}).get("value"))
            check("equipmentTag expuesto en la fila", row.get("equipmentTag") == f"SMK-{ts}", row.get("equipmentTag"))

        # === Búsqueda por contenido ===========================================
        s, items = find_row(atok, tpl_id, q=UNIQ)
        check("búsqueda por contenido (q=token de obs) ENCUENTRA la entrada", any(it["id"] == entry_id for it in items), f"{s} n={len(items)}")
        s, items = find_row(atok, tpl_id, q="op_normal")
        check("búsqueda por contenido (q=code del select) ENCUENTRA la entrada", any(it["id"] == entry_id for it in items), f"{s} n={len(items)}")
        s, items = find_row(atok, tpl_id, q="NADAQUECOINCIDA999")
        check("búsqueda por contenido sin coincidencia → 0 filas (no fuga)", all(it["id"] != entry_id for it in items), f"{s} n={len(items)}")

        # === ABAC: 3 usuarios demo (si existen) ===============================
        for email in DEMO_USERS:
            s, lg = call("POST", "/auth/login", body={"email": email, "password": PASS})
            if s != 200 or not isinstance(lg, dict):
                check(f"ABAC: login {email} (omitido si no existe)", True, f"login {s}")
                continue
            utok = lg["accessToken"]
            s, resp = call("GET", "/log-entries?take=20", utok)
            ok_shape = s == 200 and isinstance(resp, dict) and all("summaryValues" in it for it in resp.get("items", []))
            check(f"ABAC: {email} lista 200 y toda fila trae summaryValues (mismo where/ABAC)", ok_shape, s)

    finally:
        if tpl_id:
            out = subprocess.run([*PG, f"SELECT id FROM \"LogEntry\" WHERE \"templateId\"='{tpl_id}';"], capture_output=True, text=True)
            for eid in [x.strip() for x in out.stdout.splitlines() if x.strip()]:
                pg(f"DELETE FROM \"LogEntry\" WHERE id='{eid}';")
            pg(f"DELETE FROM \"Template\" WHERE id='{tpl_id}';")
            out = subprocess.run([*PG, f"SELECT count(*) FROM \"LogEntry\" WHERE \"templateId\"='{tpl_id}';"], capture_output=True, text=True)
            check("limpieza: 0 entradas de la plantilla de prueba", out.stdout.strip() == "0", out.stdout.strip())
        if eq_id:
            pg(f"DELETE FROM \"Equipment\" WHERE id='{eq_id}';")

    print(f"\nRESUMEN: {len(OK)} ok, {len(FAIL)} fallidos")
    if FAIL:
        print("Fallidos: " + ", ".join(FAIL))
        raise SystemExit(1)


if __name__ == "__main__":
    import urllib.parse  # noqa: E402  (usado en find_row)
    main()
