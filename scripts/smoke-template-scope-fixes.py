#!/usr/bin/env python3
"""Smoke de las correcciones 2.8: (A) filtro de Bitácoras con alcance
(GET /log-entries/filter-templates) y (D) acceso por rol desde la plantilla
(GET/PUT /templates/:id/role-scope) — incluida la garantía de que editar el
acceso de UNA plantilla NO toca el resto del alcance del rol. LIMPIA al final."""
import json
import os
import urllib.request
import urllib.error

# Configurable por entorno; defaults = credenciales de DEMO/dev (no producción).
BASE = os.environ.get("WL_BASE", "http://localhost:3000/api")
PASS = os.environ.get("WL_DEMO_PASS", "Demo!Pass2026")
ADMIN = {"email": os.environ.get("WL_ADMIN_EMAIL", "demo@watchlog.local"), "password": PASS}
DEMO_TPL = "Bitácora de Turno — Demo Completa"
OK, FAIL = [], []


def req(method, path, tok=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
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
    print(("  ok " if cond else "FAIL ") + name + (f"  [{detail}]" if detail else ""))


def main():
    _, login = req("POST", "/auth/login", body=ADMIN)
    atok = login["accessToken"]
    _, all_tpls = req("GET", "/templates", atok)
    demo = next((t for t in all_tpls if t["name"] == DEMO_TPL), None)
    other = next((t for t in all_tpls if t.get("id") != (demo or {}).get("id")), None)
    if not demo or not other:
        print("Faltan plantillas demo/otra; corre scripts/demo-bitacora.py.")
        return
    demo_id, other_id = demo["id"], other["id"]

    # (A) filter-templates (lectura, con alcance). Admin sin scope = todas.
    sc, ft = call("GET", "/log-entries/filter-templates", atok)
    check("GET filter-templates admin 200 (todas)", sc == 200 and isinstance(ft, list) and len(ft) == len(all_tpls), f"{sc} n={len(ft) if isinstance(ft,list) else '-'}")

    # (D) role-scope desde la plantilla.
    _, roles = req("GET", "/security/roles", atok)
    role = next((r for r in roles if r["key"] == "op-molienda"), None)
    if not role:
        print("No existe rol op-molienda; corre la demo.")
        return
    role_id = role["id"]

    sc, rs = call("GET", f"/templates/{demo_id}/role-scope", atok)
    check("GET template role-scope 200 (roles + asignados)", sc == 200 and isinstance(rs, dict) and "roles" in rs and "assignedRoleIds" in rs, str(sc))

    # Precondición: el rol parte SIN alcance de plantilla. Le ponemos [other] por el
    # lado del ROL para luego verificar que tocar 'demo' NO borra 'other'.
    call("PUT", f"/security/roles/{role_id}/template-scope", atok, {"templateIds": [other_id]})

    # Asignar 'demo' al rol DESDE la plantilla (debe AÑADIR, no reemplazar 'other').
    sc, rs2 = call("PUT", f"/templates/{demo_id}/role-scope", atok, {"roleIds": [role_id]})
    check("PUT template demo role-scope 200", sc == 200 and role_id in rs2.get("assignedRoleIds", []), str(sc))

    _, rd = req("GET", f"/security/roles/{role_id}", atok)
    ts = set(rd.get("templateScopes", []))
    check("rol conserva 'other' Y gana 'demo' (no se sacó lo existente)", ts == {other_id, demo_id}, f"scope={ts}")

    # Operador (rol op-molienda) ahora ve solo {demo, other} en picker/filtro.
    _, oplogin = req("POST", "/auth/login", body={"email": "operador@watchlog.local", "password": PASS})
    otok = oplogin["accessToken"]
    _, picker = req("GET", "/log-entries/templates", otok)
    check("picker del operador acotado por scope de rol", {t["id"] for t in picker} == {demo_id, other_id}, f"ids={[t['id'] for t in picker]}")
    _, opft = req("GET", "/log-entries/filter-templates", otok)
    check("filter-templates del operador = mismas con alcance", {t["id"] for t in opft} == {demo_id, other_id}, f"ids={[t['id'] for t in opft]}")

    # Quitar 'demo' DESDE la plantilla: debe sacar solo 'demo' del rol, conservar 'other'.
    call("PUT", f"/templates/{demo_id}/role-scope", atok, {"roleIds": []})
    _, rd2 = req("GET", f"/security/roles/{role_id}", atok)
    ts2 = set(rd2.get("templateScopes", []))
    check("quitar demo desde la plantilla conserva 'other' en el rol", ts2 == {other_id}, f"scope={ts2}")

    # Limpieza total del rol.
    call("PUT", f"/security/roles/{role_id}/template-scope", atok, {"templateIds": []})
    _, rd3 = req("GET", f"/security/roles/{role_id}", atok)
    check("limpieza: rol sin alcance de plantilla", rd3.get("templateScopes", []) == [], str(rd3.get("templateScopes")))

    print(f"\nRESULTADO: {len(OK)} ok · {len(FAIL)} fail")
    if FAIL:
        print("FALLARON: " + ", ".join(FAIL))


if __name__ == "__main__":
    main()
