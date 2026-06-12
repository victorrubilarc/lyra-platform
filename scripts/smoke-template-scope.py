#!/usr/bin/env python3
"""Smoke del ALCANCE por PLANTILLA (Fase 2.8). Verifica el 2.º eje ABAC sobre la
demo: filtra el picker (GET /log-entries/templates) y la grilla (/bitacoras),
gatea getDetail por plantilla, NO toca el admin /plantillas, y suma scope por rol.
LIMPIA al final (restaura scopes vacíos = permisivo). Requiere la API en :3000."""
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

    # Universo de plantillas (admin) y la demo.
    _, all_tpls = req("GET", "/templates", atok)
    demo = next((t for t in all_tpls if t["name"] == DEMO_TPL), None)
    if not demo:
        print("No existe la plantilla demo; corre scripts/demo-bitacora.py primero.")
        return
    demo_id = demo["id"]
    other = next((t for t in all_tpls if t["id"] != demo_id and t["status"] == "PUBLISHED"), None)
    print(f"Plantillas admin: {len(all_tpls)} · demo={demo_id} · otra={other['id'] if other else None}")

    # Opciones del selector (gate user:assign-scope/role:manage).
    sc, opts = call("GET", "/security/template-scope/options", atok)
    check("options endpoint responde al admin", sc == 200 and isinstance(opts, list), f"{sc} n={len(opts) if isinstance(opts,list) else '-'}")

    # Usuario operador.
    _, users = req("GET", "/security/users", atok)
    op = next((u for u in users if u["email"] == "operador@watchlog.local"), None)
    if not op:
        print("No existe operador@watchlog.local; corre la demo.")
        return
    op_id = op["id"]

    # Login operador y picker ANTES (sin restricción de plantilla).
    _, oplogin = req("POST", "/auth/login", body={"email": "operador@watchlog.local", "password": PASS})
    otok = oplogin["accessToken"]
    _, picker_before = req("GET", "/log-entries/templates", otok)
    n_before = len(picker_before)
    check("picker sin scope ve >1 plantilla (permisivo)", n_before >= 1, f"n={n_before}")

    # operador no puede ver opciones de scope (no tiene user:assign-scope).
    sc, _ = call("GET", "/security/template-scope/options", otok)
    check("operador 403 en options (sin permiso de scope)", sc == 403, str(sc))

    # --- Asignar scope de plantilla al USUARIO operador = solo la demo --------
    sc, ud = call("PUT", f"/security/users/{op_id}/template-scope", atok, {"templateIds": [demo_id]})
    check("PUT user template-scope 200", sc == 200, str(sc))
    check("userDetail.templateScopes refleja la demo", isinstance(ud, dict) and ud.get("templateScopes") == [demo_id], str(ud.get("templateScopes") if isinstance(ud, dict) else ud))

    _, picker_after = req("GET", "/log-entries/templates", otok)
    ids_after = {t["id"] for t in picker_after}
    check("picker ahora SOLO la demo", ids_after == {demo_id}, f"ids={ids_after}")

    # Grilla /bitacoras: todas las entradas visibles son de la demo.
    _, grid = req("GET", "/log-entries?take=100", otok)
    grid_rows = grid.get("items", grid) if isinstance(grid, dict) else grid
    grid_tpls = {r.get("templateId") for r in grid_rows} if grid_rows else set()
    check("grilla solo entradas de la demo", grid_tpls <= {demo_id}, f"tpls={grid_tpls}")

    # getDetail de una entrada de OTRA plantilla (admin la ve) => 403 al operador.
    _, adm_grid = req("GET", "/log-entries?take=100", atok)
    adm_rows = adm_grid.get("items", adm_grid) if isinstance(adm_grid, dict) else adm_grid
    foreign = next((r for r in (adm_rows or []) if r.get("templateId") != demo_id), None)
    if foreign:
        sc, _ = call("GET", f"/log-entries/{foreign['id']}", otok)
        check("getDetail de entrada fuera de scope => 403", sc == 403, str(sc))
        # Una entrada de la demo SÍ se ve.
        own = next((r for r in (adm_rows or []) if r.get("templateId") == demo_id), None)
        if own:
            sc, _ = call("GET", f"/log-entries/{own['id']}", otok)
            check("getDetail de entrada en scope => 200", sc == 200, str(sc))
    else:
        print("  (no hay entradas de otra plantilla; se omite el 403 de getDetail)")

    # Admin /plantillas NO se ve afectado (sigue viendo todas).
    _, all_tpls2 = req("GET", "/templates", atok)
    check("admin /plantillas intacto (ve todas)", len(all_tpls2) == len(all_tpls), f"{len(all_tpls2)} vs {len(all_tpls)}")

    # --- Limpiar el scope del usuario y probar por ROL -----------------------
    call("PUT", f"/security/users/{op_id}/template-scope", atok, {"templateIds": []})
    _, picker_restored = req("GET", "/log-entries/templates", otok)
    check("picker vuelve a permisivo tras limpiar usuario", len(picker_restored) == n_before, f"{len(picker_restored)} vs {n_before}")

    # Scope por ROL: op-molienda = solo la demo => operador restringido vía rol.
    _, roles = req("GET", "/security/roles", atok)
    role = next((r for r in roles if r["key"] == "op-molienda"), None)
    if role:
        sc, rd = call("PUT", f"/security/roles/{role['id']}/template-scope", atok, {"templateIds": [demo_id]})
        check("PUT role template-scope 200", sc == 200, str(sc))
        _, picker_role = req("GET", "/log-entries/templates", otok)
        check("scope por ROL restringe al operador (solo demo)", {t["id"] for t in picker_role} == {demo_id}, f"ids={[t['id'] for t in picker_role]}")
        # Limpiar el rol.
        call("PUT", f"/security/roles/{role['id']}/template-scope", atok, {"templateIds": []})
        _, picker_role_clr = req("GET", "/log-entries/templates", otok)
        check("picker permisivo tras limpiar el rol", len(picker_role_clr) == n_before, f"{len(picker_role_clr)} vs {n_before}")
    else:
        print("  (no existe rol op-molienda; se omite la prueba por rol)")

    print(f"\nRESULTADO: {len(OK)} ok · {len(FAIL)} fail")
    if FAIL:
        print("FALLARON: " + ", ".join(FAIL))


if __name__ == "__main__":
    main()
