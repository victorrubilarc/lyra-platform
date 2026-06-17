#!/usr/bin/env python3
"""Smoke de INCIDENCIAS · CAPA — Fase 4.2a (acciones correctivas/preventivas).

Verifica el ciclo de acciones + el BLOQUEO de cierre + la verificación de eficacia:
 1) Crear acción → 201, folio ACT-####, status OPEN, timeline ACTION_CREATED.
 2) Validación: título corto → 400; tipo inválido → 400.
 3) Bloqueo de cierre (tipo requiresCapa=calidad): con acción obligatoria abierta,
    avanzar a en_verificacion y CERRAR → 400; completar (DONE) y cerrar → SIGUE 400
    (requiere verificación); verificar EFICAZ → VERIFIED; cerrar → 200 CLOSED.
 4) Tipo SIN requiresCapa (operacional): acción obligatoria; DONE BASTA para cerrar.
 5) Verificación NO eficaz → reabre la acción a IN_PROGRESS.
 6) Acción NO obligatoria nunca bloquea el cierre.
 7) Editar / anular acción (sin borrado físico).
 8) Gates 403: operador (sin permisos CAPA) no crea ni verifica acciones.

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
ADMIN = "demo@watchlog.local"
OPERADOR = "operador@watchlog.local"
PG = ["docker", "exec", "lyra-watchlog-dev-postgres-1", "psql", "-U", "watchlog", "-d", "watchlog", "-t", "-A"]
OK, FAIL = [], []
CREATED = []


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


def create_incident(admin, type_id, node_id, title):
    s, r = call("POST", "/incidents", admin, {"title": title, "typeId": type_id, "severity": 3, "orgNodeId": node_id})
    if s in (200, 201):
        CREATED.append(r["id"])
    return s, r


def advance_to_verification(admin, inc_id):
    """reportada → en_triage → asignada → en_progreso → en_verificacion."""
    for key in ("a_triage", "asignar", "iniciar", "a_verificacion"):
        s, r = call("POST", f"/incidents/{inc_id}/transitions", admin, {"transitionKey": key})
        if s != 200:
            return s, r
    return 200, None


def main():
    admin = login(ADMIN)
    operador = login(OPERADOR)

    node_id = sql("SELECT id FROM \"OrgNode\" WHERE \"deletedAt\" IS NULL ORDER BY \"path\" LIMIT 1;")
    owner_id = sql(f"SELECT id FROM \"User\" WHERE email='{OPERADOR}' LIMIT 1;")
    check("contexto: nodo accesible", bool(node_id), node_id)

    s, types = call("GET", "/incidents/types", admin)
    type_capa = next((t["id"] for t in types if t["key"] == "calidad"), None)        # requiresCapa=true
    type_nocapa = next((t["id"] for t in types if t["key"] == "operacional"), None)  # requiresCapa=false
    check("contexto: tipo calidad (requiresCapa) y operacional", bool(type_capa) and bool(type_nocapa))

    # === 1) crear acción ===
    s, inc = create_incident(admin, type_capa, node_id, "CAPA smoke — calidad")
    check("0 incidencia creada", s in (200, 201), str(s))
    inc_id = inc["id"]

    s, act = call("POST", f"/incidents/{inc_id}/actions", admin,
                  {"kind": "CORRECTIVE", "title": "Reemplazar sello defectuoso", "mandatory": True, "responsibleId": owner_id})
    check("1 crear acción → 201 + folio ACT", s in (200, 201) and act.get("code", "").startswith("ACT-"), str(s))
    check("1 status inicial OPEN + mandatory", act.get("status") == "OPEN" and act.get("mandatory") is True)
    act_id = act["id"]
    s, det = call("GET", f"/incidents/{inc_id}", admin)
    check("1 timeline ACTION_CREATED", any(a["kind"] == "ACTION_CREATED" for a in det["activity"]))

    # === 2) validación ===
    s, _ = call("POST", f"/incidents/{inc_id}/actions", admin, {"kind": "CORRECTIVE", "title": "ab"})
    check("2 título corto → 400", s == 400, str(s))
    s, _ = call("POST", f"/incidents/{inc_id}/actions", admin, {"kind": "NOPE", "title": "válida pero kind malo"})
    check("2 kind inválido → 400", s == 400, str(s))

    # === 3) bloqueo de cierre (requiresCapa) ===
    s, _ = advance_to_verification(admin, inc_id)
    check("3 avanzar a en_verificacion", s == 200, str(s))
    s, r = call("POST", f"/incidents/{inc_id}/transitions", admin, {"transitionKey": "cerrar"})
    check("3 cerrar con acción obligatoria abierta → 400", s == 400, str(s))

    s, act = call("POST", f"/incidents/actions/{act_id}/complete", admin, {"completionNote": "Sello reemplazado"})
    check("3 completar acción → DONE", s == 200 and act.get("status") == "DONE", str(s))
    s, r = call("POST", f"/incidents/{inc_id}/transitions", admin, {"transitionKey": "cerrar"})
    check("3 cerrar con DONE pero sin verificar (requiresCapa) → 400", s == 400, str(s))

    s, act = call("POST", f"/incidents/actions/{act_id}/verify", admin, {"effectivenessOutcome": "EFFECTIVE"})
    check("3 verificar EFICAZ → VERIFIED", s == 200 and act.get("status") == "VERIFIED", str(s))
    s, r = call("POST", f"/incidents/{inc_id}/transitions", admin, {"transitionKey": "cerrar"})
    check("3 cerrar tras verificar → 200 CLOSED", s == 200 and r.get("lifecycle") == "CLOSED", str(s))

    # === 4) tipo SIN requiresCapa: DONE basta ===
    s, inc2 = create_incident(admin, type_nocapa, node_id, "CAPA smoke — operacional")
    inc2_id = inc2["id"]
    s, act2 = call("POST", f"/incidents/{inc2_id}/actions", admin, {"kind": "PREVENTIVE", "title": "Ajustar lazo de control", "mandatory": True})
    a2 = act2["id"]
    advance_to_verification(admin, inc2_id)
    s, r = call("POST", f"/incidents/{inc2_id}/transitions", admin, {"transitionKey": "cerrar"})
    check("4 sin requiresCapa: cerrar con acción abierta → 400", s == 400, str(s))
    call("POST", f"/incidents/actions/{a2}/complete", admin, {})
    s, r = call("POST", f"/incidents/{inc2_id}/transitions", admin, {"transitionKey": "cerrar"})
    check("4 sin requiresCapa: DONE basta → 200 CLOSED", s == 200 and r.get("lifecycle") == "CLOSED", str(s))

    # === 5) verificación NO eficaz reabre ===
    s, inc3 = create_incident(admin, type_capa, node_id, "CAPA smoke — no eficaz")
    inc3_id = inc3["id"]
    s, act3 = call("POST", f"/incidents/{inc3_id}/actions", admin, {"kind": "CORRECTIVE", "title": "Acción a reabrir", "mandatory": True})
    a3 = act3["id"]
    call("POST", f"/incidents/actions/{a3}/complete", admin, {})
    s, act3 = call("POST", f"/incidents/actions/{a3}/verify", admin, {"effectivenessOutcome": "NOT_EFFECTIVE"})
    check("5 verificar NO eficaz → reabre IN_PROGRESS", s == 200 and act3.get("status") == "IN_PROGRESS", str(s))

    # === 6) acción NO obligatoria no bloquea ===
    s, inc4 = create_incident(admin, type_nocapa, node_id, "CAPA smoke — opcional")
    inc4_id = inc4["id"]
    call("POST", f"/incidents/{inc4_id}/actions", admin, {"kind": "IMMEDIATE", "title": "Aviso no obligatorio", "mandatory": False})
    advance_to_verification(admin, inc4_id)
    s, r = call("POST", f"/incidents/{inc4_id}/transitions", admin, {"transitionKey": "cerrar"})
    check("6 acción NO obligatoria no bloquea → 200 CLOSED", s == 200 and r.get("lifecycle") == "CLOSED", str(s))

    # === 7) editar / anular ===
    s, inc5 = create_incident(admin, type_nocapa, node_id, "CAPA smoke — editar/anular")
    inc5_id = inc5["id"]
    s, act5 = call("POST", f"/incidents/{inc5_id}/actions", admin, {"kind": "CORRECTIVE", "title": "Editable"})
    a5 = act5["id"]
    s, act5 = call("PATCH", f"/incidents/actions/{a5}", admin, {"title": "Editada", "status": "IN_PROGRESS"})
    check("7 editar acción → título + IN_PROGRESS", s == 200 and act5.get("title") == "Editada" and act5.get("status") == "IN_PROGRESS", str(s))
    s, act5 = call("POST", f"/incidents/actions/{a5}/cancel", admin, {"reason": "Ya no aplica"})
    check("7 anular acción → CANCELED", s == 200 and act5.get("status") == "CANCELED", str(s))
    s, _ = call("POST", f"/incidents/actions/{a5}/complete", admin, {})
    check("7 completar una CANCELED → 400", s == 400, str(s))

    # === 8) gates 403 operador ===
    s, _ = call("POST", f"/incidents/{inc5_id}/actions", operador, {"kind": "CORRECTIVE", "title": "no debería"})
    check("8 operador crear acción → 403", s == 403, str(s))
    s, _ = call("POST", f"/incidents/actions/{a3}/verify", operador, {"effectivenessOutcome": "EFFECTIVE"})
    check("8 operador verificar → 403", s == 403, str(s))

    # === limpieza ===
    for cid in CREATED:
        sql(f"DELETE FROM \"Incident\" WHERE id='{cid}';")
    print(f"\nlimpieza: {len(CREATED)} incidencias eliminadas (cascade acciones/timeline).")
    print(f"\n=== {len(OK)} OK · {len(FAIL)} FAIL ===")
    if FAIL:
        for f in FAIL:
            print("  FAIL " + f)
        sys.exit(1)


if __name__ == "__main__":
    main()
