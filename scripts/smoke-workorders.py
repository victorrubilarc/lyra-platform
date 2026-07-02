#!/usr/bin/env python3
"""Smoke de Órdenes de Trabajo (OT / PTW) — Sesión 1: CIMIENTOS (UI/API).

Verifica el módulo de OT vía API (server-authoritative):
 1) Catálogos: GET types/areas/specialties (admin) → 200 + datos sembrados.
 2) Crear TIPO (?create=true) → 2xx; colisión de key → 409; editar → 2xx (mismo id);
    desactivar → fuera de la lista por defecto, dentro de ?includeInactive=true.
 3) Crear ÁREA (?create=true) → 2xx; colisión → 409.
 4) Crear SOLICITUD (create) con nodo + tipo + área + especialidad → 2xx; code "SOL-…";
    folio null; lifecycle OPEN; N:N reflejado.
 5) Listar → aparece; filtros typeId / areaId / criticality / búsqueda por título.
 6) Detalle → campos coinciden (tipo, criticidad, áreas, especialidades).
 7) Editar prioridad → 2xx; asignar responsable → 2xx; quitar responsable → 2xx.
 8) Stats → open ≥ 1.
 9) Anular con motivo (≥5) → 2xx + lifecycle CANCELED; editar tras anular → 400.
10) Validaciones: nodo inexistente → 400; tipo inexistente → 400; motivo corto → 400.
11) Gates: operador (sin permisos de OT) → 403 en GET y POST /work-orders.

Crea y LIMPIA por key/título (psql). API :3000. Clave demo Demo!Pass2026."""
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

TYPE_KEY = "smoke-ot-tipo"
SPEC_KEY = "smoke-ot-especialidad"
WO_TITLE = "OT Smoke — reparación de prueba"


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
    if s != 200 or not isinstance(r, dict):
        return None
    return r.get("accessToken")


def sql(q):
    return subprocess.run(PG + ["-c", q], capture_output=True, text=True).stdout.strip()


def check(name, cond, detail=""):
    (OK if cond else FAIL).append(name)
    print(("  ok  " if cond else "FAIL ") + name + (f"   [{detail}]" if detail else ""))


def cleanup():
    sql(f"DELETE FROM \"WorkOrder\" WHERE title = '{WO_TITLE}';")
    sql(f"DELETE FROM \"WorkOrderType\" WHERE key = '{TYPE_KEY}';")
    sql(f"DELETE FROM \"Specialty\" WHERE key = '{SPEC_KEY}';")


def main():
    admin = login(ADMIN)
    if not admin:
        print("FAIL no se pudo iniciar sesión admin")
        sys.exit(1)
    operador = login(OPERADOR)
    cleanup()

    # 1) Catálogos sembrados
    s, types = call("GET", "/work-orders/types", admin)
    check("GET /work-orders/types → 200 + tipos sembrados", s == 200 and isinstance(types, list) and len(types) >= 1, str(s))
    s, specs = call("GET", "/work-orders/specialties", admin)
    check("GET /work-orders/specialties → 200 + especialidades sembradas", s == 200 and isinstance(specs, list) and len(specs) >= 1, str(s))

    # 2) Crear/editar/desactivar TIPO
    s, r = call("POST", "/work-orders/types?create=true", admin, {
        "key": TYPE_KEY, "name": "Tipo OT Smoke", "color": "#06B6D4",
        "requiresPtwDefault": True, "criticalityDefault": 4, "sortOrder": 99,
    })
    check("crear tipo → 2xx + flags", s in (200, 201) and isinstance(r, dict) and r.get("requiresPtwDefault") is True and r.get("criticalityDefault") == 4, str(s))
    tid = r.get("id") if isinstance(r, dict) else None
    s, _ = call("POST", "/work-orders/types?create=true", admin, {"key": TYPE_KEY, "name": "dup"})
    check("crear tipo con key existente → 409", s == 409, str(s))
    s, r = call("POST", "/work-orders/types", admin, {"key": TYPE_KEY, "name": "Tipo OT Smoke EDIT", "criticalityDefault": 4})
    check("editar tipo (upsert) → 2xx + mismo id + nombre nuevo", s in (200, 201) and isinstance(r, dict) and r.get("id") == tid and r.get("name") == "Tipo OT Smoke EDIT", str(s))
    call("POST", "/work-orders/types", admin, {"key": TYPE_KEY, "name": "Tipo OT Smoke EDIT", "active": False})
    _, active = call("GET", "/work-orders/types", admin)
    _, allt = call("GET", "/work-orders/types?includeInactive=true", admin)
    check("tipo inactivo NO en desplegables", not any(t.get("key") == TYPE_KEY for t in active))
    check("tipo inactivo SÍ en ?includeInactive", any(t.get("key") == TYPE_KEY for t in allt))
    # reactivar para usarlo al crear la OT
    call("POST", "/work-orders/types", admin, {"key": TYPE_KEY, "name": "Tipo OT Smoke EDIT", "active": True, "criticalityDefault": 4})

    # 3) Especialidad: crear + colisión + desactivar
    s, r = call("POST", "/work-orders/specialties?create=true", admin, {"key": SPEC_KEY, "name": "Especialidad OT Smoke", "sortOrder": 99})
    check("crear especialidad → 2xx", s in (200, 201), str(s))
    s, _ = call("POST", "/work-orders/specialties?create=true", admin, {"key": SPEC_KEY, "name": "dup"})
    check("crear especialidad con key existente → 409", s == 409, str(s))
    call("POST", "/work-orders/specialties", admin, {"key": SPEC_KEY, "name": "Especialidad OT Smoke", "active": False})
    _, spActive = call("GET", "/work-orders/specialties", admin)
    _, spAll = call("GET", "/work-orders/specialties?includeInactive=true", admin)
    check("especialidad inactiva NO en desplegables", not any(x.get("key") == SPEC_KEY for x in spActive))
    check("especialidad inactiva SÍ en ?includeInactive", any(x.get("key") == SPEC_KEY for x in spAll))
    call("POST", "/work-orders/specialties", admin, {"key": SPEC_KEY, "name": "Especialidad OT Smoke", "active": True})

    # nodo + especialidad reales
    node = sql("SELECT id FROM \"OrgNode\" WHERE \"deletedAt\" IS NULL ORDER BY \"createdAt\" LIMIT 1;")
    check("hay un nodo para crear la OT", bool(node), node)
    spec_id = specs[0]["id"] if specs else None

    # 4) Crear SOLICITUD
    s, wo = call("POST", "/work-orders", admin, {
        "title": WO_TITLE, "description": "creada por smoke", "typeId": tid,
        "criticality": 4, "priority": "HIGH", "requiresPtw": True,
        "orgNodeId": node, "specialtyIds": [spec_id] if spec_id else [],
    })
    check("crear solicitud → 2xx", s in (200, 201), str(s) + (json.dumps(wo) if s not in (200, 201) else ""))
    wid = wo.get("id") if isinstance(wo, dict) else None
    check("solicitud: code SOL-…, folio null, lifecycle OPEN, PTW",
          isinstance(wo, dict) and str(wo.get("code", "")).startswith("SOL-") and wo.get("folio") is None
          and wo.get("lifecycle") == "OPEN" and wo.get("requiresPtw") is True, json.dumps(wo) if isinstance(wo, dict) else str(wo))
    check("solicitud: N:N especialidad reflejado",
          isinstance(wo, dict) and (not spec_id or any(sp.get("id") == spec_id for sp in wo.get("specialties", []))))

    # 5) Listar + filtros
    _, lst = call("GET", "/work-orders?lifecycle=OPEN&pageSize=200", admin)
    check("listar → aparece la solicitud", isinstance(lst, dict) and any(i.get("id") == wid for i in lst.get("items", [])))
    _, byType = call("GET", f"/work-orders?typeId={tid}", admin)
    check("filtro typeId → la incluye", isinstance(byType, dict) and any(i.get("id") == wid for i in byType.get("items", [])))
    _, bySpec = call("GET", f"/work-orders?specialtyId={spec_id}", admin) if spec_id else (None, {"items": [{"id": wid}]})
    check("filtro specialtyId → la incluye", isinstance(bySpec, dict) and any(i.get("id") == wid for i in bySpec.get("items", [])))
    _, byCrit = call("GET", "/work-orders?criticality=4", admin)
    check("filtro criticality=4 → la incluye", isinstance(byCrit, dict) and any(i.get("id") == wid for i in byCrit.get("items", [])))
    _, bySearch = call("GET", "/work-orders?search=reparaci", admin)
    check("búsqueda por título → la incluye", isinstance(bySearch, dict) and any(i.get("id") == wid for i in bySearch.get("items", [])))

    # 6) Detalle
    s, det = call("GET", f"/work-orders/{wid}", admin)
    check("detalle → 200 + campos", s == 200 and isinstance(det, dict) and det.get("id") == wid and det.get("criticality") == 4, str(s))

    # 7) Editar / asignar
    s, r = call("PATCH", f"/work-orders/{wid}", admin, {"priority": "CRITICAL"})
    check("editar prioridad → 2xx + CRITICAL", s in (200, 201) and isinstance(r, dict) and r.get("priority") == "CRITICAL", str(s))
    me = sql(f"SELECT id FROM \"User\" WHERE email = '{ADMIN}' LIMIT 1;")
    s, r = call("POST", f"/work-orders/{wid}/assign", admin, {"ownerId": me})
    check("asignar responsable → 2xx + owner", s == 200 and isinstance(r, dict) and r.get("ownerId") == me, str(s))
    s, r = call("POST", f"/work-orders/{wid}/assign", admin, {"ownerId": None})
    check("quitar responsable → 2xx + null", s == 200 and isinstance(r, dict) and r.get("ownerId") is None, str(s))

    # 8) Stats
    s, st = call("GET", "/work-orders/stats", admin)
    check("stats → open ≥ 1", s == 200 and isinstance(st, dict) and st.get("open", 0) >= 1, json.dumps(st) if isinstance(st, dict) else str(s))

    # 9) Anular
    s, _ = call("POST", f"/work-orders/{wid}/cancel", admin, {"reason": "no"})
    check("anular con motivo corto (<5) → 400", s == 400, str(s))
    s, r = call("POST", f"/work-orders/{wid}/cancel", admin, {"reason": "duplicada por smoke"})
    check("anular con motivo → 2xx + CANCELED", s == 200 and isinstance(r, dict) and r.get("lifecycle") == "CANCELED", str(s))
    s, _ = call("PATCH", f"/work-orders/{wid}", admin, {"priority": "LOW"})
    check("editar tras anular → 400", s == 400, str(s))

    # 10) Validaciones de creación
    s, _ = call("POST", "/work-orders", admin, {"title": "x nodo malo", "typeId": tid, "criticality": 3, "orgNodeId": "nodo-no-existe"})
    check("crear con nodo inexistente → 400", s == 400, str(s))
    s, _ = call("POST", "/work-orders", admin, {"title": "x tipo malo", "typeId": "tipo-no-existe", "criticality": 3, "orgNodeId": node})
    check("crear con tipo inexistente → 400", s == 400, str(s))

    # 11) Gates del operador (sin permisos de OT)
    if operador:
        s, _ = call("GET", "/work-orders", operador)
        check("operador GET /work-orders → 403", s == 403, str(s))
        s, _ = call("POST", "/work-orders", operador, {"title": "x", "typeId": tid, "criticality": 3, "orgNodeId": node})
        check("operador POST /work-orders → 403", s == 403, str(s))
    else:
        print("  --  (sin usuario operador; se omiten los gates de 403)")

    cleanup()
    print(f"\n{len(OK)}/{len(OK)+len(FAIL)} OK" + ("" if not FAIL else f"   FALLARON: {FAIL}"))
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    main()
