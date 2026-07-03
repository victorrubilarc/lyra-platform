#!/usr/bin/env python3
"""Smoke del enlace Incidencia↔OT bidireccional (OT · Slice 7b).

La incidencia es el ORIGINATOR; la OT creada desde ella es el FOLLOWUP (patrón SAP PM
notification→order / IBM Maximo Related Records). Verifica el enlace EN AMBOS SENTIDOS:

 A) Ida (crear OT desde la incidencia): POST /work-orders con originIncidentId →
    originType=INCIDENT + originIncidentId persistido.
 B) Vista inversa: GET /incidents/:id/work-orders → lista las OT FOLLOWUP con folio/
    estado/criticidad (reusa toListItems). Una OT DIRECT (sin origen) NO aparece; una
    incidencia sin OT devuelve [].
 C) Vuelta (detalle de OT): GET /work-orders/:id resuelve originIncidentCode + Title.
 D) Gate: operador (sin workorder:view) → 403 en la vista inversa.
 E) ABAC: usuario temporal con incident:view + workorder:view scoped SOLO al nodo A:
    - ve la OT de la incidencia A (nodo A);
    - NO ve una OT ligada a A pero ubicada en el nodo B (filtro de nodo de OT);
    - GET de la vista inversa de la incidencia B (nodo fuera de alcance) → 403.

Sin permisos nuevos, sin migración. Crea y LIMPIA por prefijo (psql). API :3000. Clave
demo Demo!Pass2026."""
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

INC_PREFIX = "INC Smoke Enlace"
WO_PREFIX = "OT Smoke Enlace"
TMP_USER = "smoke-enlace-scoped-user"
TMP_EMAIL = "smoke-enlace-scoped@watchlog.local"
TMP_ROLE = "smoke-enlace-scoped-role"
TMP_SCOPE = "smoke-enlace-scoped-scope"


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
    return r.get("accessToken") if s == 200 and isinstance(r, dict) else None


def sql(q):
    return subprocess.run(PG + ["-c", q], capture_output=True, text=True).stdout.strip()


def check(name, cond, detail=""):
    (OK if cond else FAIL).append(name)
    print(("  ok  " if cond else "FAIL ") + name + (f"   [{detail}]" if detail else ""))


def cleanup():
    # OT primero (satélites que no cascadan), luego incidencias (idem).
    sql(f"DELETE FROM \"WorkOrderEvent\" WHERE \"workOrderId\" IN (SELECT id FROM \"WorkOrder\" WHERE title LIKE '{WO_PREFIX}%');")
    sql(f"DELETE FROM \"WorkOrderSpecialty\" WHERE \"workOrderId\" IN (SELECT id FROM \"WorkOrder\" WHERE title LIKE '{WO_PREFIX}%');")
    sql(f"DELETE FROM \"WorkOrder\" WHERE title LIKE '{WO_PREFIX}%';")
    sql(f"DELETE FROM \"IncidentActivity\" WHERE \"incidentId\" IN (SELECT id FROM \"Incident\" WHERE title LIKE '{INC_PREFIX}%');")
    sql(f"DELETE FROM \"IncidentComment\" WHERE \"incidentId\" IN (SELECT id FROM \"Incident\" WHERE title LIKE '{INC_PREFIX}%');")
    sql(f"DELETE FROM \"Incident\" WHERE title LIKE '{INC_PREFIX}%';")
    sql(f"DELETE FROM \"Scope\" WHERE \"userId\"='{TMP_USER}';")
    sql(f"DELETE FROM \"UserRole\" WHERE \"userId\"='{TMP_USER}';")
    sql(f"DELETE FROM \"RolePermission\" WHERE \"roleId\"='{TMP_ROLE}';")
    sql(f"DELETE FROM \"Role\" WHERE id='{TMP_ROLE}';")
    sql(f"DELETE FROM \"User\" WHERE id='{TMP_USER}';")


def setup_scoped_user(node_a):
    """Usuario temporal con incident:view + workorder:view (rol propio) scoped SOLO al
    nodo A. Copia el passwordHash de operador DENTRO de SQL para que el login funcione."""
    p_inc = sql("SELECT id FROM \"Permission\" WHERE key='incident:view';")
    p_wo = sql("SELECT id FROM \"Permission\" WHERE key='workorder:view';")
    sql(
        "INSERT INTO \"User\" (id,email,\"displayName\",\"passwordHash\",status,\"updatedAt\") "
        f"SELECT '{TMP_USER}','{TMP_EMAIL}',u.\"displayName\",u.\"passwordHash\",'ACTIVE',now() "
        "FROM \"User\" u WHERE u.email='operador@watchlog.local';"
    )
    sql(f"INSERT INTO \"Role\" (id,key,name,\"updatedAt\") VALUES ('{TMP_ROLE}','{TMP_ROLE}','Smoke Enlace Scoped',now());")
    sql(f"INSERT INTO \"RolePermission\" (\"roleId\",\"permissionId\") VALUES ('{TMP_ROLE}','{p_inc}'),('{TMP_ROLE}','{p_wo}');")
    sql(f"INSERT INTO \"UserRole\" (\"userId\",\"roleId\",\"assignedAt\") VALUES ('{TMP_USER}','{TMP_ROLE}',now());")
    sql(f"INSERT INTO \"Scope\" (id,\"userId\",\"orgNodeId\",\"includeDescendants\") VALUES ('{TMP_SCOPE}','{TMP_USER}','{node_a}',true);")


def create_incident(admin, title, type_id, node):
    s, r = call("POST", "/incidents", admin, {"title": title, "typeId": type_id, "severity": 3, "orgNodeId": node})
    return (r.get("id"), r.get("code")) if s in (200, 201) and isinstance(r, dict) else (None, None)


def create_wo(admin, title, type_id, node, origin_incident_id=None):
    body = {"title": title, "typeId": type_id, "criticality": 3, "orgNodeId": node}
    if origin_incident_id:
        body["originIncidentId"] = origin_incident_id
    s, r = call("POST", "/work-orders", admin, body)
    return (s, r.get("id") if isinstance(r, dict) else None, r)


def main():
    admin = login(ADMIN)
    if not admin:
        print("FAIL no se pudo iniciar sesión admin")
        sys.exit(1)
    operador = login(OPERADOR)
    cleanup()

    # Contexto: tipo de incidencia + tipo de OT activo + nodo.
    _, itypes = call("GET", "/incidents/types", admin)
    inc_type = next((t["id"] for t in itypes if t.get("key") == "seguridad"), (itypes[0]["id"] if itypes else None))
    _, wtypes = call("GET", "/work-orders/types", admin)
    wo_type = wtypes[0]["id"] if isinstance(wtypes, list) and wtypes else None
    node = sql("SELECT id FROM \"OrgNode\" WHERE \"deletedAt\" IS NULL ORDER BY \"createdAt\" LIMIT 1;")
    check("contexto: tipo incidencia + tipo OT + nodo", bool(inc_type) and bool(wo_type) and bool(node),
          f"inc={inc_type} wo={wo_type} node={node}")
    if not (inc_type and wo_type and node):
        return finish()

    # === A) Ida: crear OT desde la incidencia ================================
    print("\n— A) Crear OT desde la incidencia —")
    inc_title = f"{INC_PREFIX} — origen A"
    inc_id, inc_code = create_incident(admin, inc_title, inc_type, node)
    check("A crear incidencia origen → 2xx + code INC-####", bool(inc_id) and str(inc_code or "").startswith("INC-"), str(inc_code))

    s, wid, wo = create_wo(admin, f"{WO_PREFIX} — desde incidencia", wo_type, node, origin_incident_id=inc_id)
    check("A crear OT con originIncidentId → 2xx", s in (200, 201) and bool(wid), str(s))
    check("A la OT nace con originType=INCIDENT + originIncidentId ligado",
          isinstance(wo, dict) and wo.get("originType") == "INCIDENT" and wo.get("originIncidentId") == inc_id,
          json.dumps({k: wo.get(k) for k in ("originType", "originIncidentId")}) if isinstance(wo, dict) else str(wo))

    # === B) Vista inversa en la incidencia ==================================
    print("\n— B) Vista inversa (OT relacionadas de la incidencia) —")
    s, rev = call("GET", f"/incidents/{inc_id}/work-orders", admin)
    row = next((i for i in rev if i.get("id") == wid), None) if isinstance(rev, list) else None
    check("B GET /incidents/:id/work-orders → 200 + contiene la OT", s == 200 and row is not None, str(s))
    check("B la fila trae code/estado/criticidad (reusa toListItems)",
          isinstance(row, dict) and str(row.get("code", "")).startswith("SOL-")
          and row.get("criticality") == 3 and "slaStatus" in row and "lifecycle" in row,
          json.dumps({k: row.get(k) for k in ("code", "criticality", "lifecycle")}) if isinstance(row, dict) else "—")

    # OT DIRECT (sin origen) NO aparece en la vista inversa.
    _, wid2, _ = create_wo(admin, f"{WO_PREFIX} — directa sin origen", wo_type, node)
    s, rev2 = call("GET", f"/incidents/{inc_id}/work-orders", admin)
    check("B una OT DIRECT (sin origen) NO aparece en la vista inversa",
          isinstance(rev2, list) and not any(i.get("id") == wid2 for i in rev2))

    # Incidencia sin OT → lista vacía.
    inc_empty, _ = create_incident(admin, f"{INC_PREFIX} — sin OT", inc_type, node)
    s, rev3 = call("GET", f"/incidents/{inc_empty}/work-orders", admin)
    check("B incidencia sin OT → [] vacío", s == 200 and isinstance(rev3, list) and len(rev3) == 0, str(rev3))

    # === C) Vuelta: el detalle de OT resuelve la incidencia origen ==========
    print("\n— C) Navegación de vuelta (detalle de OT) —")
    s, det = call("GET", f"/work-orders/{wid}", admin)
    check("C detalle OT resuelve originIncidentCode + Title de la incidencia",
          s == 200 and isinstance(det, dict) and det.get("originIncidentCode") == inc_code
          and det.get("originIncidentTitle") == inc_title,
          json.dumps({k: det.get(k) for k in ("originIncidentCode", "originIncidentTitle")}) if isinstance(det, dict) else str(s))
    s, det2 = call("GET", f"/work-orders/{wid2}", admin)
    check("C OT sin origen → originIncidentCode/Title null (DIRECT)",
          s == 200 and isinstance(det2, dict) and det2.get("originIncidentCode") is None
          and det2.get("originIncidentTitle") is None and det2.get("originType") == "DIRECT")

    # === D) Gate: operador sin workorder:view =============================
    print("\n— D) Gate —")
    if operador:
        s, _ = call("GET", f"/incidents/{inc_id}/work-orders", operador)
        check("D operador (sin workorder:view) → 403 en la vista inversa", s == 403, str(s))
    else:
        check("D operador (sin workorder:view) → 403 en la vista inversa", False, "sin login operador")

    # === E) ABAC scoped al nodo A =========================================
    print("\n— E) ABAC (usuario scoped al nodo A) —")
    leaves = sql("SELECT id FROM \"OrgNode\" WHERE \"deletedAt\" IS NULL AND id NOT IN "
                 "(SELECT \"parentId\" FROM \"OrgNode\" WHERE \"parentId\" IS NOT NULL) "
                 "ORDER BY \"createdAt\" LIMIT 2;")
    parts = [x for x in leaves.splitlines() if x.strip()]
    node_a = parts[0] if len(parts) > 0 else ""
    node_b = parts[1] if len(parts) > 1 else ""
    check("E contexto: dos nodos hoja disjuntos", bool(node_a) and bool(node_b) and node_a != node_b, f"A={node_a} B={node_b}")
    if node_a and node_b:
        inc_a, _ = create_incident(admin, f"{INC_PREFIX} — nodo A", inc_type, node_a)
        inc_b, _ = create_incident(admin, f"{INC_PREFIX} — nodo B", inc_type, node_b)
        _, wo_a, _ = create_wo(admin, f"{WO_PREFIX} — A en nodo A", wo_type, node_a, origin_incident_id=inc_a)
        # OT ligada a la incidencia A pero UBICADA en el nodo B (para el filtro de nodo de OT).
        _, wo_a_at_b, _ = create_wo(admin, f"{WO_PREFIX} — A pero en nodo B", wo_type, node_b, origin_incident_id=inc_a)

        setup_scoped_user(node_a)
        scoped = login(TMP_EMAIL)
        check("E contexto: login del usuario scoped", bool(scoped))
        if scoped:
            # Admin SÍ ve ambas OT de la incidencia A (control).
            _, rev_admin = call("GET", f"/incidents/{inc_a}/work-orders", admin)
            check("E admin ve AMBAS OT de la incidencia A (control)",
                  isinstance(rev_admin, list) and any(i.get("id") == wo_a for i in rev_admin)
                  and any(i.get("id") == wo_a_at_b for i in rev_admin))
            s, rev_s = call("GET", f"/incidents/{inc_a}/work-orders", scoped)
            has_a = isinstance(rev_s, list) and any(i.get("id") == wo_a for i in rev_s)
            has_b = isinstance(rev_s, list) and any(i.get("id") == wo_a_at_b for i in rev_s)
            check("E1 scoped ve la OT de la incidencia A (nodo A)", s == 200 and has_a, str(s))
            check("E2 scoped NO ve la OT ligada a A pero en nodo B (filtro de nodo de OT)", not has_b)
            s, _ = call("GET", f"/incidents/{inc_b}/work-orders", scoped)
            check("E3 scoped → 403 en la vista inversa de la incidencia B (nodo fuera de alcance)", s == 403, str(s))

    return finish()


def finish():
    cleanup()
    print(f"\n{len(OK)}/{len(OK) + len(FAIL)} OK")
    if FAIL:
        print("FALLARON:")
        for f in FAIL:
            print("  - " + f)
        sys.exit(1)


if __name__ == "__main__":
    main()
