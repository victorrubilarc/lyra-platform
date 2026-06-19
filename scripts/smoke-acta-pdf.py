#!/usr/bin/env python3
"""Smoke del ACTA DE ENTREGA DE TURNO en PDF — Fase 5 (Slice 4).

Verifica la exportación del acta de grado auditoría desde el SNAPSHOT congelado:

 A) Gobernanza de estado (fork d): una entrega en COMPILING ⇒ acta 409 (solo firmada).
 B) Entrega firmada ⇒ 200 + Content-Type application/pdf + magic %PDF + tamaño>0.
 C) Nombre de archivo significativo en Content-Disposition (acta-<folio>-<nodo>-<dia>.pdf).
 D) Auditoría (AC-PDF-5): cada export registra `shifthandover.acta.exported` con folio + hash.
 E) Determinismo/inmutable (AC-PDF-1): dos exports de la MISMA entrega firmada ⇒ MISMO hash de
    integridad (el snapshot canónico no cambia; los bytes sí, por el CreationDate de PDFKit).
 F) ABAC (AC-PDF-4): usuario scoped a OTRO nodo ⇒ acta 403.
 G) Gate (AC-PDF-4): operador sin permisos de handover ⇒ acta 403.
 H) Sigue disponible tras el acuse (ACKNOWLEDGED ⇒ 200).

Crea y LIMPIA por ID (psql) + usuarios/rol/scope temporales. API :3000. Clave demo Demo!Pass2026.
La validación VISUAL del PDF (marca, layout, firmas) queda como smoke del dueño."""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE = os.environ.get("WL_BASE", "http://localhost:3000/api")
PASS = os.environ.get("WL_DEMO_PASS", "Demo!Pass2026")
ADMIN = "demo@watchlog.local"
OPERADOR = "operador@watchlog.local"
PG = ["docker", "exec", "lyra-watchlog-dev-postgres-1", "psql", "-U", "watchlog", "-d", "watchlog", "-t", "-A"]
OK, FAIL = [], []
CREATED_HANDOVERS = []

TMP_ENTRANTE = "smoke-acta-entrante"
TMP_ENTRANTE_EMAIL = "smoke-acta-entrante@watchlog.local"
TMP_SCOPED = "smoke-acta-scoped"
TMP_SCOPED_EMAIL = "smoke-acta-scoped@watchlog.local"
TMP_ROLE = "smoke-acta-role"


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


def download(path, tok=None):
    """GET binario: devuelve (status, bytes, headers-dict)."""
    r = urllib.request.Request(BASE + path, method="GET")
    if tok:
        r.add_header("Authorization", "Bearer " + tok)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, resp.read(), {k.lower(): v for k, v in resp.headers.items()}
    except urllib.error.HTTPError as e:
        return e.code, e.read(), {k.lower(): v for k, v in (e.headers.items() if e.headers else [])}


def login(email):
    s, r = call("POST", "/auth/login", body={"email": email, "password": PASS})
    return r["accessToken"] if s == 200 else None


def sql(q):
    return subprocess.run(PG + ["-c", q], capture_output=True, text=True).stdout.strip()


def check(name, cond, detail=""):
    (OK if cond else FAIL).append(name)
    print(("  ok  " if cond else "FAIL ") + name + (f"   [{detail}]" if detail else ""))


def iso(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def compile_handover(tok, node, at=None):
    body = {"orgNodeId": node}
    if at:
        body["at"] = at
    s, r = call("POST", "/shift-handover/compile", tok, body)
    if s == 200 and isinstance(r, dict) and r["id"] not in CREATED_HANDOVERS:
        CREATED_HANDOVERS.append(r["id"])
    return s, r


def setup_users(scoped_node):
    cleanup_users()
    perms = sql("SELECT id FROM \"Permission\" WHERE key IN "
                "('shifthandover:view','shifthandover:compile','shifthandover:sign','shifthandover:acknowledge');").splitlines()
    sql("INSERT INTO \"User\" (id,email,\"displayName\",\"passwordHash\",status,\"updatedAt\") "
        f"SELECT '{TMP_ENTRANTE}','{TMP_ENTRANTE_EMAIL}',u.\"displayName\",u.\"passwordHash\",'ACTIVE',now() "
        "FROM \"User\" u WHERE u.email='operador@watchlog.local';")
    sql(f"INSERT INTO \"Role\" (id,key,name,\"updatedAt\") VALUES ('{TMP_ROLE}','{TMP_ROLE}','Smoke Acta',now());")
    for p in perms:
        sql(f"INSERT INTO \"RolePermission\" (\"roleId\",\"permissionId\") VALUES ('{TMP_ROLE}','{p}');")
    sql(f"INSERT INTO \"UserRole\" (\"userId\",\"roleId\",\"assignedAt\") VALUES ('{TMP_ENTRANTE}','{TMP_ROLE}',now());")
    sql("INSERT INTO \"User\" (id,email,\"displayName\",\"passwordHash\",status,\"updatedAt\") "
        f"SELECT '{TMP_SCOPED}','{TMP_SCOPED_EMAIL}',u.\"displayName\",u.\"passwordHash\",'ACTIVE',now() "
        "FROM \"User\" u WHERE u.email='operador@watchlog.local';")
    sql(f"INSERT INTO \"UserRole\" (\"userId\",\"roleId\",\"assignedAt\") VALUES ('{TMP_SCOPED}','{TMP_ROLE}',now());")
    sql(f"INSERT INTO \"Scope\" (id,\"userId\",\"orgNodeId\",\"includeDescendants\") "
        f"VALUES ('smoke-acta-scope','{TMP_SCOPED}','{scoped_node}',true);")


def cleanup_users():
    for u in (TMP_ENTRANTE, TMP_SCOPED):
        sql(f"DELETE FROM \"Scope\" WHERE \"userId\"='{u}';")
        sql(f"DELETE FROM \"UserRole\" WHERE \"userId\"='{u}';")
    sql(f"DELETE FROM \"RolePermission\" WHERE \"roleId\"='{TMP_ROLE}';")
    sql(f"DELETE FROM \"Role\" WHERE id='{TMP_ROLE}';")
    for u in (TMP_ENTRANTE, TMP_SCOPED):
        sql(f"DELETE FROM \"User\" WHERE id='{u}';")


def cleanup():
    for hid in CREATED_HANDOVERS:
        sql(f"DELETE FROM \"AuditLog\" WHERE \"entityType\"='ShiftHandover' AND \"entityId\"='{hid}';")
        sql(f"DELETE FROM \"NotificationOutbox\" WHERE \"notificationEventId\" IN "
            f"(SELECT id FROM \"NotificationEvent\" WHERE payload->>'handoverId'='{hid}');")
        sql(f"DELETE FROM \"NotificationEvent\" WHERE payload->>'handoverId'='{hid}';")
        sql(f"DELETE FROM \"ShiftHandover\" WHERE id='{hid}';")
    cleanup_users()


def pick_nodes():
    clean = sql(
        'SELECT id FROM "OrgNode" WHERE "deletedAt" IS NULL '
        'AND id NOT IN (SELECT DISTINCT "orgNodeId" FROM "ShiftHandover") '
        'ORDER BY length(path) DESC LIMIT 1;'
    ).splitlines()
    test = clean[0] if clean and clean[0] else sql('SELECT id FROM "OrgNode" WHERE "deletedAt" IS NULL ORDER BY length(path) DESC LIMIT 1;').splitlines()[0]
    tpath = sql(f"SELECT path FROM \"OrgNode\" WHERE id='{test}';")
    other = ""
    for row in sql('SELECT id,path FROM "OrgNode" WHERE "deletedAt" IS NULL;').splitlines():
        nid, p = row.split("|")
        if nid == test:
            continue
        if not tpath.startswith(p) and not p.startswith(tpath):
            other = nid
            break
    return test, other


def main():
    admin = login(ADMIN)
    check("contexto: login admin", bool(admin))
    if not admin:
        return summary()
    node, other = pick_nodes()
    check("contexto: nodo de prueba + nodo disjunto", bool(node) and bool(other), f"{node} / {other}")
    setup_users(other if other else node)
    entrante = login(TMP_ENTRANTE_EMAIL)
    scoped = login(TMP_SCOPED_EMAIL)
    operador = login(OPERADOR)
    check("contexto: login entrante/scoped/operador", bool(entrante) and bool(scoped) and bool(operador))

    now = datetime.now(timezone.utc)
    s, cur = compile_handover(admin, node, at=iso(now))
    check("contexto: compile turno actual (COMPILING)", s == 200 and cur.get("status") == "COMPILING", f"{s}")
    cur_id = cur["id"]

    # --- A: gobernanza — COMPILING no produce acta oficial ----------------------
    st, body, _ = download(f"/shift-handover/{cur_id}/acta.pdf", admin)
    check("A COMPILING ⇒ acta 409 (solo firmada)", st == 409, f"{st}")

    # firmamos para tener snapshot congelado
    call("PATCH", f"/shift-handover/{cur_id}/summary", admin, {"generalStatus": "OPERATIONAL_WITH_OBSERVATIONS", "regenerate": True})
    s, signed = call("POST", f"/shift-handover/{cur_id}/sign-out", admin, {"password": PASS, "generalStatus": "OPERATIONAL_WITH_OBSERVATIONS"})
    check("contexto: firma saliente ⇒ SIGNED_OUT", s == 200 and signed.get("status") == "SIGNED_OUT", f"{s}")
    code = signed.get("code", "")

    # --- B: descarga del acta (firmada) -----------------------------------------
    st, pdf, headers = download(f"/shift-handover/{cur_id}/acta.pdf", admin)
    check("B acta 200 + Content-Type application/pdf",
          st == 200 and "application/pdf" in headers.get("content-type", ""), f"{st} {headers.get('content-type')}")
    check("B magic %PDF + tamaño>0", isinstance(pdf, (bytes, bytearray)) and pdf[:5] == b"%PDF-" and len(pdf) > 1000, f"bytes={len(pdf)}")

    # --- C: nombre de archivo significativo -------------------------------------
    disp = headers.get("content-disposition", "")
    check("C Content-Disposition con nombre significativo",
          "attachment" in disp and code in disp and disp.endswith('.pdf"'), f"{disp}")

    # --- D: auditoría -----------------------------------------------------------
    ev = sql(f"SELECT count(*) FROM \"AuditLog\" WHERE action='shifthandover.acta.exported' AND \"entityId\"='{cur_id}';")
    check("D auditoría: shifthandover.acta.exported registrado", ev not in ("", "0"), f"events={ev}")
    h_audit = sql(f"SELECT after->>'integrityHash' FROM \"AuditLog\" WHERE action='shifthandover.acta.exported' AND \"entityId\"='{cur_id}' LIMIT 1;")
    check("D auditoría incluye folio + hash de integridad", len(h_audit) == 64, f"hash={h_audit[:16]}…")

    # --- E: determinismo / inmutable --------------------------------------------
    st2, pdf2, _ = download(f"/shift-handover/{cur_id}/acta.pdf", admin)
    distinct = sql(f"SELECT count(DISTINCT after->>'integrityHash') FROM \"AuditLog\" WHERE action='shifthandover.acta.exported' AND \"entityId\"='{cur_id}';")
    total = sql(f"SELECT count(*) FROM \"AuditLog\" WHERE action='shifthandover.acta.exported' AND \"entityId\"='{cur_id}';")
    check("E dos exports ⇒ MISMO hash de integridad (contenido inmutable)",
          st2 == 200 and total not in ("", "0", "1") and distinct == "1", f"total={total} distinct={distinct}")
    check("E tamaño consistente entre exports (±5%)",
          abs(len(pdf2) - len(pdf)) <= max(200, len(pdf) // 20), f"{len(pdf)} vs {len(pdf2)}")

    # --- F: ABAC ----------------------------------------------------------------
    if other:
        st, _, _ = download(f"/shift-handover/{cur_id}/acta.pdf", scoped)
        check("F ABAC: scoped a otro nodo ⇒ acta 403", st == 403, f"{st}")

    # --- G: gate operador -------------------------------------------------------
    st, _, _ = download(f"/shift-handover/{cur_id}/acta.pdf", operador)
    check("G gate operador (sin permisos handover) ⇒ acta 403", st == 403, f"{st}")

    # --- H: sigue disponible tras el acuse --------------------------------------
    s, ack = call("POST", f"/shift-handover/{cur_id}/acknowledge", entrante,
                  {"password": PASS, "readSummary": True, "reviewedItems": True, "noObservations": False,
                   "observations": "Recibido; bomba 3 en observación."})
    check("contexto: acuse entrante ⇒ ACKNOWLEDGED", s == 200 and ack.get("status") == "ACKNOWLEDGED", f"{s}")
    st, pdf3, headers3 = download(f"/shift-handover/{cur_id}/acta.pdf", entrante)
    check("H acta disponible tras el acuse (ACKNOWLEDGED ⇒ 200)",
          st == 200 and pdf3[:5] == b"%PDF-" and "application/pdf" in headers3.get("content-type", ""), f"{st}")

    summary()


def summary():
    cleanup()
    print(f"\n{len(OK)}/{len(OK) + len(FAIL)} OK")
    if FAIL:
        print("FALLARON:")
        for f in FAIL:
            print("  - " + f)
        sys.exit(1)


if __name__ == "__main__":
    main()
