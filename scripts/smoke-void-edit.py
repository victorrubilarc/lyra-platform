"""
Smoke en vivo — Fase 2.8.2: VOID de borradores + ruta de edición.

Recorre el ciclo real contra la API (:3000):
  - login operador/mantenedor/admin (Bearer)
  - crea un borrador con una plantilla elegible + nodo elegible (GET .../nodes)
  - el AUTOR anula su propio borrador (motivo) ⇒ status VOID + huella
  - la grilla por defecto NO lo lista; con ?status=VOID SÍ; detalle expone
    voidedByName/voidReason/voidedAt; el timeline trae el evento VOIDED
  - guardas: re-anular ⇒ 400; motivo <5 ⇒ 400 (validación)
  - autorización: un NO-autor sin `logentry:void` ⇒ 403; el admin (con el
    permiso) anula un borrador ajeno ⇒ 200
Crea y LIMPIA por ID (hard-delete vía psql; el AuditLog inmutable conserva el rastro).
"""
import json
import subprocess
import sys
import urllib.error
import urllib.request

try:
    sys.stdout.reconfigure(encoding="utf-8")  # consola Windows cp1252 no soporta ⇒/°C
except Exception:
    pass

BASE = "http://localhost:3000/api"
PASS = "Demo!Pass2026"
OPER = "operador@watchlog.local"
MANT = "mantenedor@watchlog.local"
ADMIN = "demo@watchlog.local"

ok = 0
fail = 0
created_ids = []


def check(name, cond):
    global ok, fail
    if cond:
        ok += 1
        print(f"  OK  {name}")
    else:
        fail += 1
        print(f" FAIL {name}")


def req(method, path, token=None, body=None, expect=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    if token:
        headers["Authorization"] = "Bearer " + token
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            code = resp.status
            payload = json.loads(resp.read() or "null")
    except urllib.error.HTTPError as e:
        code = e.code
        try:
            payload = json.loads(e.read() or "null")
        except Exception:
            payload = None
    if expect is not None and code != expect:
        print(f"   ! {method} {path} -> {code} (esperaba {expect}): {payload}")
    return code, payload


def login(email):
    code, payload = req("POST", "/auth/login", body={"email": email, "password": PASS})
    assert code == 200 and payload.get("result") == "authenticated", f"login {email}: {code} {payload}"
    return payload["accessToken"]


def psql(sql):
    subprocess.run(
        ["docker", "exec", "-e", "PGPASSWORD=watchlog", "lyra-watchlog-dev-postgres-1",
         "psql", "-U", "watchlog", "-d", "watchlog", "-c", sql],
        check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def cleanup():
    for eid in created_ids:
        for tbl in ("LogEntryFieldChange", "LogEntryValue", "LogEntrySignature",
                    "LogEntryTransition", "LogEntrySection"):
            psql(f'DELETE FROM "{tbl}" WHERE "logEntryId" = \'{eid}\';')
        psql(f'DELETE FROM "LogEntry" WHERE id = \'{eid}\';')


def create_draft(token):
    code, templates = req("GET", "/log-entries/templates", token)
    assert code == 200 and templates, f"templates: {code}"
    for tpl in templates:
        tid = tpl["id"]
        c, nodes = req("GET", f"/log-entries/templates/{tid}/nodes", token)
        if c != 200 or not nodes.get("nodes"):
            continue
        node = nodes["nodes"][0]
        mode = nodes.get("equipmentMode", "OPTIONAL")
        body = {"templateId": tid, "orgNodeId": node["id"]}
        if mode == "REQUIRED" and node.get("equipment"):
            body["equipmentId"] = node["equipment"][0]["id"]
        c, entry = req("POST", "/log-entries", token, body=body)
        if c == 201 or c == 200:
            created_ids.append(entry["id"])
            return entry
    raise AssertionError("no se pudo crear un borrador con ninguna plantilla elegible")


def main():
    op = login(OPER)
    mant = login(MANT)
    admin = login(ADMIN)
    print("Sesiones OK (operador, mantenedor, admin)")

    # 1) El AUTOR anula su propio borrador.
    e1 = create_draft(op)
    check("crear borrador (operador)", e1["status"] == "DRAFT")
    code, voided = req("POST", f"/log-entries/{e1['id']}/void", op, body={"reason": "borrador de prueba - smoke 2.8.2"})
    check("anular propio borrador (2xx)", code in (200, 201))
    check("status pasa a VOID", voided and voided.get("status") == "VOID")
    check("huella voidedByName", bool(voided and voided.get("voidedByName")))
    check("huella voidReason", voided and voided.get("voidReason", "").startswith("borrador de prueba"))
    check("huella voidedAt", bool(voided and voided.get("voidedAt")))

    # 2) Sale de la grilla por defecto; aparece con ?status=VOID.
    code, lst = req("GET", "/log-entries?take=100", op)
    default_ids = [r["id"] for r in (lst.get("items") if lst else [])]
    check("la grilla por defecto NO lista el anulado", e1["id"] not in default_ids)
    code, lstv = req("GET", "/log-entries?take=100&status=VOID", op)
    void_ids = [r["id"] for r in (lstv.get("items") if lstv else [])]
    check("con ?status=VOID SÍ aparece (trazable)", e1["id"] in void_ids)

    # 3) Timeline trae el evento VOIDED.
    code, tl = req("GET", f"/log-entries/{e1['id']}/timeline", op)
    kinds = [ev["kind"] for ev in (tl.get("events") if tl else [])]
    check("timeline incluye evento VOIDED", "VOIDED" in kinds)

    # 4) Guardas.
    code, _ = req("POST", f"/log-entries/{e1['id']}/void", op, body={"reason": "otra vez no"})
    check("re-anular un VOID ⇒ 400", code == 400)
    code, _ = req("POST", f"/log-entries/{e1['id']}/void", op, body={"reason": "abc"})
    check("motivo < 5 ⇒ 400 (validación)", code == 400)

    # 5) Autorización: no-autor sin permiso ⇒ 403; admin con permiso ⇒ 200.
    e2 = create_draft(op)
    code, _ = req("POST", f"/log-entries/{e2['id']}/void", mant, body={"reason": "limpieza ajena sin permiso"})
    check("anular ajeno SIN logentry:void ⇒ 403", code == 403)
    check("sigue DRAFT tras el 403", req("GET", f"/log-entries/{e2['id']}", op)[1].get("status") == "DRAFT")
    code, _ = req("POST", f"/log-entries/{e2['id']}/void", admin, body={"reason": "supervisor limpia borrador abandonado"})
    check("admin (con logentry:void) anula ajeno (2xx)", code in (200, 201))
    check("el ajeno quedo VOID tras el admin", req("GET", f"/log-entries/{e2['id']}", admin)[1].get("status") == "VOID")

    # 6) Round-trip de la RUTA DE EDICIÓN: editar un borrador existente (lo que la
    #    pantalla /bitacoras/:id/editar dispara vía saveSection) y verificar que el
    #    valor persiste al re-leer.
    e3 = create_draft(op)
    detail = req("GET", f"/log-entries/{e3['id']}", op)[1]
    target = next((s for s in detail["version"]["sections"]
                   for f in s["fields"] if f["type"] in ("TEXT", "TEXTAREA")), None)
    field = next(f for f in target["fields"] if f["type"] in ("TEXT", "TEXTAREA"))
    sec_state = next(s for s in detail["sectionStates"] if s["sectionKey"] == target["key"])
    val = "smoke-edit-2.8.2"
    code, after = req("PUT", f"/log-entries/{e3['id']}/sections/{target['key']}", op,
                      body={"expectedVersion": sec_state["version"], "values": [{"fieldKey": field["key"], "value": val}]})
    check("editar (guardar sección) en borrador existente (2xx)", code in (200, 201))
    reread = req("GET", f"/log-entries/{e3['id']}", op)[1]
    persisted = next((v["value"] for v in reread["values"] if v["fieldKey"] == field["key"]), None)
    check("el valor editado persiste al re-leer", persisted == val)

    print(f"\nRESULTADO: {ok} OK / {fail} FAIL")
    return fail


if __name__ == "__main__":
    failed = 1
    try:
        failed = main()
    finally:
        cleanup()
        print(f"Limpieza: {len(created_ids)} entradas eliminadas por ID.")
    raise SystemExit(1 if failed else 0)
