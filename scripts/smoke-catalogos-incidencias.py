#!/usr/bin/env python3
"""Smoke del MANTENEDOR de catálogos de incidencias (Tipos + Categorías) — UI/API.

Verifica el CRUD de catálogos vía API (la pantalla es server-authoritative):
 1) Crear TIPO (?create=true) → 200 + key; flags/orden/color persistidos.
 2) Colisión de key: crear de nuevo (?create=true) la MISMA key → 409 (no sobrescribe).
 3) Editar (upsert sin create) → 200 + nombre cambiado (mismo id).
 4) Flujo por defecto inexistente → 400; flujo NO publicado (DRAFT) → 400 (si hay uno).
 5) Desactivar (active=false) → NO aparece en GET /types (desplegables) pero SÍ en
    ?includeInactive=true (mantenedor).
 6) Crear CATEGORÍA transversal (?create=true) → 200; colisión key → 409; asociar a un
    tipo (upsert typeId) → 200; typeId inexistente → 400.
 7) Categoría desactivada: fuera de /categories, dentro de ?includeInactive=true.
 8) Gates: operador (sin permisos de incidencias) → 403 en GET /types y POST /types.

Crea y LIMPIA por key (psql). API :3000. Clave demo Demo!Pass2026."""
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
PG = ["docker", "exec", "lyra-watchlog-dev-postgres-1", "psql", "-U", "watchlog", "-d", "watchlog", "-t", "-A"]
OK, FAIL = [], []

TYPE_KEY = "smoke-tipo-cat"
CAT_KEY = "smoke-cat-cat"


def call(method, path, tok=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    if tok:
        r.add_header("Authorization", "Bearer " + tok)
    if data is not None:
        r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r) as resp:
            txt = resp.read().decode()
            return resp.status, (json.loads(txt) if txt else None)
    except urllib.error.HTTPError as e:
        b = e.read().decode()
        try:
            return e.code, json.loads(b)
        except Exception:
            return e.code, b


def login(email):
    s, r = call("POST", "/auth/login", body={"email": email, "password": PASS})
    return r["accessToken"]


def sql(q):
    return subprocess.run(PG + ["-c", q], capture_output=True, text=True).stdout.strip()


def check(name, cond, detail=""):
    (OK if cond else FAIL).append(name)
    print(("  ok  " if cond else "FAIL ") + name + (f"   [{detail}]" if detail else ""))


def cleanup():
    sql(f"DELETE FROM \"IncidentCategory\" WHERE key='{CAT_KEY}';")
    sql(f"DELETE FROM \"IncidentType\" WHERE key='{TYPE_KEY}';")


def main():
    admin = login(ADMIN)
    operador = login(OPERADOR)
    cleanup()  # idempotencia ante corridas previas

    # 1) Crear tipo
    s, r = call("POST", "/incidents/types?create=true", admin, {
        "key": TYPE_KEY, "name": "Tipo Smoke", "description": "creado por smoke",
        "color": "#06B6D4", "requiresInvestigation": True, "requiresCapa": False,
        "reportableDefault": True, "sortOrder": 99,
    })
    check("crear tipo → 2xx", s in (200, 201), str(s))
    tid = r.get("id") if isinstance(r, dict) else None
    check("tipo persistido (key/flags/color/orden)", isinstance(r, dict)
          and r.get("key") == TYPE_KEY and r.get("requiresInvestigation") is True
          and r.get("reportableDefault") is True and r.get("color") == "#06B6D4"
          and r.get("sortOrder") == 99, json.dumps(r) if not tid else "")

    # 2) Colisión de key al crear
    s, r = call("POST", "/incidents/types?create=true", admin, {"key": TYPE_KEY, "name": "Otro"})
    check("crear tipo con key existente → 409", s == 409, str(s))

    # 3) Editar (upsert sin create)
    s, r = call("POST", "/incidents/types", admin, {
        "key": TYPE_KEY, "name": "Tipo Smoke EDIT", "requiresInvestigation": True,
        "requiresCapa": False, "reportableDefault": True, "sortOrder": 99, "color": "#06B6D4",
    })
    check("editar tipo (upsert) → 2xx + mismo id + nombre nuevo",
          s in (200, 201) and isinstance(r, dict) and r.get("id") == tid and r.get("name") == "Tipo Smoke EDIT", str(s))

    # 4) Flujo por defecto inválido
    s, r = call("POST", "/incidents/types", admin, {"key": TYPE_KEY, "name": "Tipo Smoke EDIT", "defaultWorkflowId": "wf-no-existe-xyz"})
    check("flujo por defecto inexistente → 400", s == 400, str(s))

    draft = sql("SELECT id FROM \"WorkflowDefinition\" WHERE status='DRAFT' AND \"deletedAt\" IS NULL LIMIT 1;")
    if draft:
        s, r = call("POST", "/incidents/types", admin, {"key": TYPE_KEY, "name": "Tipo Smoke EDIT", "defaultWorkflowId": draft})
        check("flujo por defecto NO publicado (DRAFT) → 400", s == 400, str(s))
    else:
        print("  --  (sin workflow DRAFT en BD; se omite el caso 'flujo no publicado')")

    # 5) Desactivar tipo
    s, r = call("POST", "/incidents/types", admin, {
        "key": TYPE_KEY, "name": "Tipo Smoke EDIT", "requiresInvestigation": True,
        "requiresCapa": False, "reportableDefault": True, "sortOrder": 99, "color": "#06B6D4", "active": False,
    })
    check("desactivar tipo → 2xx + active=false", s in (200, 201) and isinstance(r, dict) and r.get("active") is False, str(s))
    _, active = call("GET", "/incidents/types", admin)
    _, allt = call("GET", "/incidents/types?includeInactive=true", admin)
    in_active = any(t.get("key") == TYPE_KEY for t in active)
    in_all = any(t.get("key") == TYPE_KEY for t in allt)
    check("tipo inactivo NO aparece en desplegables (GET /types)", not in_active)
    check("tipo inactivo SÍ aparece en mantenedor (?includeInactive)", in_all)

    # 6) Categoría
    s, r = call("POST", "/incidents/categories?create=true", admin, {"key": CAT_KEY, "name": "Cat Smoke", "sortOrder": 50})
    check("crear categoría transversal → 2xx + typeId null", s in (200, 201) and isinstance(r, dict) and r.get("typeId") is None, str(s))
    s, r = call("POST", "/incidents/categories?create=true", admin, {"key": CAT_KEY, "name": "dup"})
    check("crear categoría con key existente → 409", s == 409, str(s))
    s, r = call("POST", "/incidents/categories", admin, {"key": CAT_KEY, "name": "Cat Smoke", "typeId": tid, "sortOrder": 50})
    check("asociar categoría a un tipo → 2xx + typeId", s in (200, 201) and isinstance(r, dict) and r.get("typeId") == tid, str(s))
    s, r = call("POST", "/incidents/categories", admin, {"key": CAT_KEY, "name": "Cat Smoke", "typeId": "tipo-no-existe"})
    check("categoría con typeId inexistente → 400", s == 400, str(s))

    # 7) Desactivar categoría
    call("POST", "/incidents/categories", admin, {"key": CAT_KEY, "name": "Cat Smoke", "typeId": tid, "sortOrder": 50, "active": False})
    _, cactive = call("GET", "/incidents/categories", admin)
    _, call_ = call("GET", "/incidents/categories?includeInactive=true", admin)
    check("categoría inactiva NO en /categories", not any(c.get("key") == CAT_KEY for c in cactive))
    check("categoría inactiva SÍ en ?includeInactive", any(c.get("key") == CAT_KEY for c in call_))

    # 8) Gates del operador (sin permisos de incidencias)
    s, _ = call("GET", "/incidents/types", operador)
    check("operador GET /types → 403", s == 403, str(s))
    s, _ = call("POST", "/incidents/types?create=true", operador, {"key": "x-op", "name": "x"})
    check("operador POST /types → 403", s == 403, str(s))

    cleanup()
    print(f"\n{len(OK)}/{len(OK)+len(FAIL)} OK" + ("" if not FAIL else f"   FALLARON: {FAIL}"))
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
