#!/usr/bin/env python3
"""Smoke de INCIDENCIAS · Investigación de causa raíz — Fase 4.2b (5 Porqués).

Verifica el ciclo de investigación + el BLOQUEO de cierre configurable + el enlace
de la causa raíz con las acciones CAPA:
 1) Tipo que EXIGE investigación (seguridad, requiresInvestigation=true): sin
    investigación, cerrar → 400. GET investigación → 200 null.
 2) Upsert de la cadena (problema + porqués), status DRAFT, timeline INVESTIGATION_UPDATED.
 3) Completar SIN causa raíz → 400; con causa raíz marcada → 200 COMPLETED.
 4) Cerrar tras investigación completa → 200 CLOSED.
 5) Tipo que NO la exige (operacional): cerrar sin investigación → 200 CLOSED.
 6) Validación: problema corto → 400; pasos con enunciado < 3 se filtran.
 7) Reabrir (COMPLETED → DRAFT) en una incidencia abierta.
 8) Enlace CAPA ↔ causa raíz: crear acción con investigationStepId → label resuelto;
    paso de OTRA incidencia → 400.
 9) detalle expone typeRequiresInvestigation; gate 403: operador no edita investigación.

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
    for key in ("a_triage", "asignar", "iniciar", "a_verificacion"):
        s, r = call("POST", f"/incidents/{inc_id}/transitions", admin, {"transitionKey": key})
        if s != 200:
            return s, r
    return 200, None


def main():
    admin = login(ADMIN)
    operador = login(OPERADOR)

    node_id = sql("SELECT id FROM \"OrgNode\" WHERE \"deletedAt\" IS NULL ORDER BY \"path\" LIMIT 1;")
    check("contexto: nodo accesible", bool(node_id), node_id)

    s, types = call("GET", "/incidents/types", admin)
    type_inv = next((t["id"] for t in types if t["key"] == "seguridad"), None)       # requiresInvestigation=true
    type_noinv = next((t["id"] for t in types if t["key"] == "operacional"), None)   # requiresInvestigation=false
    check("contexto: tipo seguridad (requiresInvestigation) y operacional", bool(type_inv) and bool(type_noinv))

    # === 1) exige investigación: sin ella, no cierra ===
    s, inc = create_incident(admin, type_inv, node_id, "Investigación smoke — seguridad")
    inc_id = inc["id"]
    check("0 incidencia creada", s in (200, 201), str(s))
    check("1 detalle expone typeRequiresInvestigation=true", inc.get("typeRequiresInvestigation") is True)

    s, got = call("GET", f"/incidents/{inc_id}/investigation", admin)
    check("1 GET investigación → 200 null (aún no existe)", s == 200 and got is None, str(s))

    s, _ = advance_to_verification(admin, inc_id)
    check("1 avanzar a en_verificacion", s == 200, str(s))
    s, r = call("POST", f"/incidents/{inc_id}/transitions", admin, {"transitionKey": "cerrar"})
    check("1 cerrar sin investigación (exigida) → 400", s == 400, str(s))

    # === 2) upsert de la cadena (DRAFT) ===
    s, inv = call("POST", f"/incidents/{inc_id}/investigation", admin, {
        "problemStatement": "Operador expuesto a proyección de fluido a presión",
        "steps": [
            {"statement": "¿Por qué se expuso el operador?", "answer": "La línea estaba presurizada al abrir"},
            {"statement": "¿Por qué estaba presurizada?", "answer": "No se ejecutó bloqueo y despresurización"},
        ],
    })
    check("2 upsert investigación → 200 DRAFT", s in (200, 201) and inv.get("status") == "DRAFT", str(s))
    check("2 cadena con 2 pasos ordenados", len(inv.get("steps", [])) == 2 and inv["steps"][0]["order"] == 1, str(len(inv.get("steps", []))))
    s, det = call("GET", f"/incidents/{inc_id}", admin)
    check("2 timeline INVESTIGATION_UPDATED", any(a["kind"] == "INVESTIGATION_UPDATED" for a in det["activity"]))

    # === 3) completar sin/ con causa raíz ===
    s, r = call("POST", f"/incidents/{inc_id}/investigation/complete", admin, {})
    check("3 completar SIN causa raíz → 400", s == 400, str(s))

    s, inv = call("POST", f"/incidents/{inc_id}/investigation", admin, {
        "problemStatement": "Operador expuesto a proyección de fluido a presión",
        "rootCauseSummary": "Falta de bloqueo/despresurización (LOTO) antes de intervenir",
        "steps": [
            {"statement": "¿Por qué se expuso el operador?", "answer": "La línea estaba presurizada al abrir"},
            {"statement": "¿Por qué estaba presurizada?", "answer": "No se ejecutó bloqueo y despresurización"},
            {"statement": "¿Por qué no se ejecutó el bloqueo?", "answer": "No había procedimiento LOTO exigido", "isRootCause": True},
        ],
    })
    root_step = next((st for st in inv["steps"] if st["isRootCause"]), None)
    check("3 upsert con causa raíz marcada", bool(root_step), str(s))

    s, inv = call("POST", f"/incidents/{inc_id}/investigation/complete", admin, {})
    check("3 completar con causa raíz → 200 COMPLETED", s == 200 and inv.get("status") == "COMPLETED", str(s))
    check("3 completedBy resuelto", bool(inv.get("completedByName")))
    s, det = call("GET", f"/incidents/{inc_id}", admin)
    check("3 timeline INVESTIGATION_COMPLETED", any(a["kind"] == "INVESTIGATION_COMPLETED" for a in det["activity"]))

    # === 8) enlace CAPA ↔ causa raíz (antes de cerrar; acción NO obligatoria) ===
    s, act = call("POST", f"/incidents/{inc_id}/actions", admin, {
        "kind": "CORRECTIVE", "title": "Implementar procedimiento LOTO", "mandatory": False,
        "investigationStepId": root_step["id"],
    })
    check("8 crear acción ligada a causa raíz → 200", s in (200, 201) and act.get("investigationStepId") == root_step["id"], str(s))
    check("8 label de causa raíz resuelto en la acción", bool(act.get("investigationStepLabel")), act.get("investigationStepLabel"))

    # === 4) cerrar tras investigación completa (acción no obligatoria no bloquea) ===
    s, r = call("POST", f"/incidents/{inc_id}/transitions", admin, {"transitionKey": "cerrar"})
    check("4 cerrar tras investigación completa → 200 CLOSED", s == 200 and r.get("lifecycle") == "CLOSED", str(s))

    # === 5) tipo SIN requiresInvestigation: cierra sin investigación ===
    s, inc2 = create_incident(admin, type_noinv, node_id, "Investigación smoke — operacional")
    inc2_id = inc2["id"]
    check("5 detalle typeRequiresInvestigation=false", inc2.get("typeRequiresInvestigation") is False)
    advance_to_verification(admin, inc2_id)
    s, r = call("POST", f"/incidents/{inc2_id}/transitions", admin, {"transitionKey": "cerrar"})
    check("5 cerrar sin investigación (no exigida) → 200 CLOSED", s == 200 and r.get("lifecycle") == "CLOSED", str(s))

    # === 6) validación ===
    s, inc3 = create_incident(admin, type_inv, node_id, "Investigación smoke — validación")
    inc3_id = inc3["id"]
    s, _ = call("POST", f"/incidents/{inc3_id}/investigation", admin, {"problemStatement": "ab", "steps": []})
    check("6 problema corto → 400", s == 400, str(s))
    s, _ = call("POST", f"/incidents/{inc3_id}/investigation", admin, {
        "problemStatement": "Problema válido para validar pasos",
        "steps": [{"statement": "Paso válido aquí", "isRootCause": True}, {"statement": "x"}],
    })
    check("6 paso con enunciado < 3 → 400 (contrato min 3)", s == 400, str(s))
    s, inv3 = call("POST", f"/incidents/{inc3_id}/investigation", admin, {
        "problemStatement": "Problema válido para validar pasos",
        "steps": [{"statement": "Paso válido aquí", "isRootCause": True}],
    })
    check("6 upsert válido → 200 con 1 paso", s in (200, 201) and len(inv3.get("steps", [])) == 1, str(len(inv3.get("steps", []))))

    # === 7) reabrir (COMPLETED → DRAFT) en incidencia abierta ===
    s, inv3 = call("POST", f"/incidents/{inc3_id}/investigation/complete", admin, {})
    check("7 completar (incidencia abierta)", s == 200 and inv3.get("status") == "COMPLETED", str(s))
    s, inv3 = call("POST", f"/incidents/{inc3_id}/investigation/reopen", admin, {})
    check("7 reabrir → 200 DRAFT", s == 200 and inv3.get("status") == "DRAFT", str(s))

    # === 8b) paso de OTRA incidencia → 400 ===
    s, _ = call("POST", f"/incidents/{inc3_id}/actions", admin, {
        "kind": "CORRECTIVE", "title": "Acción con causa ajena", "investigationStepId": root_step["id"],
    })
    check("8 causa raíz de otra incidencia → 400", s == 400, str(s))

    # === 9) gate 403: operador no edita investigación ===
    s, _ = call("POST", f"/incidents/{inc3_id}/investigation", operador, {"problemStatement": "no debería poder", "steps": []})
    check("9 operador upsert investigación → 403", s == 403, str(s))

    # === limpieza ===
    for cid in CREATED:
        sql(f"DELETE FROM \"Incident\" WHERE id='{cid}';")
    print(f"\nlimpieza: {len(CREATED)} incidencias eliminadas (cascade investigación/pasos/acciones).")
    print(f"\n=== {len(OK)} OK · {len(FAIL)} FAIL ===")
    if FAIL:
        for f in FAIL:
            print("  FAIL " + f)
        sys.exit(1)


if __name__ == "__main__":
    main()
