#!/usr/bin/env python3
"""Smoke de PERMISOS POR SECCIÓN / CAMPO en el llenado de bitácoras.

Guard de comportamiento (regresión histórica v3–v11: el builder dejó de persistir
los roles de SECCIÓN al publicar, desactivando la autorización por sección). Verifica
el CICLO COMPLETO contra la API real:
 1) Crear plantilla + borrador con una sección asignada a un rol (Mantenedor) y un
    campo con override a OTRO rol (Operador de Molienda); publicar.
 2) Round-trip: la versión PUBLICADA conserva los roleIds (sección y campo).
 3) Crear una entrada sobre esa versión.
 4) Un usuario SIN el rol de la sección (admin = solo Administrador) → saveSection 403.
 5) El usuario CON el rol de la sección (mantenedor) → saveSection del campo libre 200.
 6) Override por campo: el mismo mantenedor NO puede tocar el campo reservado a
    Operador de Molienda → 403.

Crea y LIMPIA por ID (psql cascade). API :3000. Clave demo Demo!Pass2026."""
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
ADMIN = "demo@watchlog.local"        # rol Administrador (NO Mantenedor/Operador)
MANTENEDOR = "mantenedor@watchlog.local"  # rol Mantenedor
PG = ["docker", "exec", "lyra-watchlog-dev-postgres-1", "psql", "-U", "watchlog", "-d", "watchlog", "-t", "-A"]
OK, FAIL = [], []
CREATED_TPL, CREATED_ENTRY = [], []


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


def section_version(detail, key):
    for s in detail.get("sectionStates", []):
        if s["sectionKey"] == key:
            return s["version"]
    return 0


def main():
    admin = login(ADMIN)
    mantenedor = login(MANTENEDOR)

    node_id = sql("SELECT id FROM \"OrgNode\" WHERE \"deletedAt\" IS NULL ORDER BY \"path\" LIMIT 1;")
    role_mant = sql("SELECT id FROM \"Role\" WHERE name='Mantenedor' LIMIT 1;")
    role_oper = sql("SELECT id FROM \"Role\" WHERE name='Operador de Molienda' LIMIT 1;")
    check("contexto: nodo + roles Mantenedor/Operador", bool(node_id) and bool(role_mant) and bool(role_oper))

    # === 1) crear plantilla + borrador con roles + publicar ===
    s, tpl = call("POST", "/templates", admin, {"name": "Smoke permisos sección"})
    check("1 crear plantilla", s in (200, 201), str(s))
    tid = tpl["id"]
    CREATED_TPL.append(tid)

    draft = {
        "name": "Smoke permisos sección",
        "sections": [
            {
                "key": "datos", "title": "Datos del turno", "roleIds": [role_mant],
                "fields": [
                    {"key": "libre", "type": "TEXT", "label": "Campo libre"},
                    {"key": "reservado", "type": "TEXT", "label": "Reservado a Operador", "roleIds": [role_oper]},
                ],
            },
        ],
    }
    s, _ = call("PUT", f"/templates/{tid}/draft", admin, draft)
    check("1 guardar borrador con roles", s in (200, 201), str(s))
    s, _ = call("POST", f"/templates/{tid}/publish", admin, {})
    check("1 publicar", s in (200, 201), str(s))

    # === 2) round-trip: la versión publicada conserva los roleIds ===
    s, det = call("GET", f"/templates/{tid}", admin)
    sec = next((x for x in det["version"]["sections"] if x["key"] == "datos"), None)
    fld = next((f for f in sec["fields"] if f["key"] == "reservado"), None) if sec else None
    check("2 versión publicada conserva roleIds de SECCIÓN", bool(sec) and sec["roleIds"] == [role_mant], str(sec["roleIds"] if sec else None))
    check("2 versión publicada conserva override de CAMPO", bool(fld) and fld["roleIds"] == [role_oper], str(fld["roleIds"] if fld else None))

    # === 3) crear entrada sobre esa versión ===
    s, entry = call("POST", "/log-entries", admin, {"templateId": tid, "orgNodeId": node_id})
    check("3 crear entrada", s in (200, 201), str(s))
    eid = entry["id"]
    CREATED_ENTRY.append(eid)
    ver = section_version(entry, "datos")

    # === 4) usuario SIN el rol de la sección (admin) → 403 ===
    s, r = call("PUT", f"/log-entries/{eid}/sections/datos", admin,
                {"expectedVersion": ver, "values": [{"fieldKey": "libre", "value": "x"}]})
    check("4 admin (sin rol Mantenedor) → 403 en la sección", s == 403, str(s))

    # === 5) usuario CON el rol (mantenedor) llena el campo libre → 200 ===
    s, r = call("PUT", f"/log-entries/{eid}/sections/datos", mantenedor,
                {"expectedVersion": ver, "values": [{"fieldKey": "libre", "value": "lectura ok"}]})
    check("5 mantenedor llena campo libre → 200", s == 200, str(s))

    # === 6) override por campo: mantenedor NO puede tocar el reservado a Operador → 403 ===
    s, det2 = call("GET", f"/log-entries/{eid}", mantenedor)
    ver2 = section_version(det2, "datos")
    s, r = call("PUT", f"/log-entries/{eid}/sections/datos", mantenedor,
                {"expectedVersion": ver2, "values": [{"fieldKey": "reservado", "value": "no debería"}]})
    check("6 mantenedor NO edita el campo reservado a Operador → 403", s == 403, str(s))

    # === limpieza ===
    for cid in CREATED_ENTRY:
        sql(f"DELETE FROM \"LogEntry\" WHERE id='{cid}';")
    for tid in CREATED_TPL:
        sql(f"DELETE FROM \"Template\" WHERE id='{tid}';")
    print(f"\nlimpieza: {len(CREATED_ENTRY)} entrada(s) + {len(CREATED_TPL)} plantilla(s) eliminadas (cascade).")
    print(f"\n=== {len(OK)} OK · {len(FAIL)} FAIL ===")
    if FAIL:
        for f in FAIL:
            print("  FAIL " + f)
        sys.exit(1)


if __name__ == "__main__":
    main()
