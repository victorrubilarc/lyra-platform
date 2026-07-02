#!/usr/bin/env python3
"""
Smoke del FOLIO configurable (folio-por-plantilla + folio de OT), 2026-07-02.

Cubre las dos partes del editor de folio reutilizable:

  PART A · Folio de OT configurable por TIPO desde la API con MÁSCARA/ámbito:
    - Tipo con folioScheme {prefix, mask "{PREFIX}/{YYYY}/{SEQ}", scope "type"} →
      al aprobar, el folio se RENDERIZA con la máscara (PTWSMK/AAAA/0001).
    - Segunda OT del mismo tipo ⇒ ...0002 (GAPLESS por tipo).

  PART B · Folio de bitácora POR PLANTILLA (nuevo):
    - Plantilla SIN folioScheme → al sellar, la entrada NO recibe folio propio
      (folio = null ⇒ la UI usa el correlativo global "BIT-######").
    - Plantilla CON folioScheme {prefix "RTSMK"} → al sellar, folio propio
      "RTSMK-AAAA-0001"; segunda entrada ⇒ ...0002 (GAPLESS por plantilla).

Requiere el dev arriba (API :3000). Crea y LIMPIA sus propios datos por id.
Admin: demo@watchlog.local / Demo!Pass2026.
"""
import json
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime

BASE = "http://localhost:3000/api"
ADMIN = "demo@watchlog.local"
PASS = "Demo!Pass2026"
YEAR = datetime.now().year

ok = 0
fail = 0
entry_ids = []
template_ids = []
wo_ids = []
TYPE_KEY = "folio-smoke-ptw"
seq_keys = []  # FolioCounter a limpiar


def check(name, cond, detail=""):
    global ok, fail
    if cond:
        ok += 1
        print(f" OK  {name}")
    else:
        fail += 1
        print(f"FAIL {name} {detail}")


def call(method, path, token=None, body=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    if token:
        headers["Authorization"] = "Bearer " + token
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.loads(resp.read() or "null")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or "null")
        except Exception:
            return e.code, None


def login(email):
    s, r = call("POST", "/auth/login", body={"email": email, "password": PASS})
    assert s == 200 and r.get("result") == "authenticated", f"login {email}: {s} {r}"
    return r["accessToken"]


def sql(q):
    subprocess.run(
        ["docker", "exec", "-e", "PGPASSWORD=watchlog", "lyra-watchlog-dev-postgres-1",
         "psql", "-U", "watchlog", "-d", "watchlog", "-c", q],
        check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )


def cleanup():
    for eid in entry_ids:
        for tbl in ("LogEntryFieldChange", "LogEntryValue", "LogEntrySignature",
                    "LogEntryTransition", "LogEntrySection"):
            sql(f'DELETE FROM "{tbl}" WHERE "logEntryId" = \'{eid}\';')
        sql(f'DELETE FROM "LogEntry" WHERE id = \'{eid}\';')
    for tid in template_ids:
        sql(f'DELETE FROM "TemplateField" f USING "TemplateSection" s, "TemplateVersion" v '
            f'WHERE f."sectionId"=s.id AND s."versionId"=v.id AND v."templateId"=\'{tid}\';')
        sql(f'DELETE FROM "TemplateSection" s USING "TemplateVersion" v '
            f'WHERE s."versionId"=v.id AND v."templateId"=\'{tid}\';')
        sql(f'UPDATE "Template" SET "currentVersionId"=NULL WHERE id=\'{tid}\';')
        sql(f'DELETE FROM "TemplateVersion" WHERE "templateId"=\'{tid}\';')
        sql(f'DELETE FROM "Template" WHERE id=\'{tid}\';')
    for wid in wo_ids:
        for tbl in ("WorkOrderEvent", "WorkOrderTransition"):
            sql(f'DELETE FROM "{tbl}" WHERE "workOrderId" = \'{wid}\';')
        sql(f'DELETE FROM "WorkOrder" WHERE id = \'{wid}\';')
    sql(f'DELETE FROM "WorkOrderType" WHERE key = \'{TYPE_KEY}\';')
    for k in seq_keys:
        sql(f'DELETE FROM "FolioCounter" WHERE "sequenceKey" = \'{k}\';')


# ---------------------------------------------------------------- PART A (OT)
def part_a(admin, node, spec_id):
    print("\n== PART A · Folio de OT por tipo con MÁSCARA ==")
    # Tipo con máscara {PREFIX}/{YYYY}/{SEQ} y ámbito por tipo.
    s, t = call("POST", "/work-orders/types?create=true", admin, {
        "key": TYPE_KEY, "name": "Folio Smoke PTW", "requiresPtwDefault": True,
        "criticalityDefault": 4, "sortOrder": 99,
        "folioScheme": {"prefix": "PTWSMK", "mask": "{PREFIX}/{YYYY}/{SEQ}", "scope": "type"},
    })
    tid = t.get("id") if isinstance(t, dict) else None
    check("crear tipo OT con folioScheme (máscara) → 2xx", s in (200, 201) and bool(tid), str(s))
    check("el tipo devuelve folioScheme persistido",
          isinstance(t, dict) and (t.get("folioScheme") or {}).get("mask") == "{PREFIX}/{YYYY}/{SEQ}", str(t.get("folioScheme")))
    seq_keys.append(f"workorder|type:{tid}|{YEAR}")

    folios = []
    for i in range(2):
        s, wo = call("POST", "/work-orders", admin, {
            "title": f"OT folio smoke {i}", "typeId": tid, "criticality": 4, "orgNodeId": node,
            "specialtyIds": [spec_id] if spec_id else [],
        })
        wid = wo.get("id") if isinstance(wo, dict) else None
        if wid:
            wo_ids.append(wid)
        call("POST", f"/work-orders/{wid}/transitions", admin, {"transitionKey": "enviar"})
        s, r = call("POST", f"/work-orders/{wid}/transitions", admin, {"transitionKey": "aprobar", "password": PASS})
        folios.append(r.get("folio") if isinstance(r, dict) else None)

    expected = [f"PTWSMK/{YEAR}/0001", f"PTWSMK/{YEAR}/0002"]
    check("folio de OT renderizado con la MÁSCARA (PTWSMK/AAAA/0001)", folios[0] == expected[0], str(folios[0]))
    check("folio de OT GAPLESS por tipo (…/0002 en la 2.ª)", folios[1] == expected[1], str(folios[1]))


# ------------------------------------------------------------- PART B (bitácora)
def make_template(admin, node, name, folio_scheme):
    """Crea plantilla simple (1 sección, 1 campo TEXT requerido), sin flujo, y la publica."""
    s, t = call("POST", "/templates", admin, {"name": name, "orgNodeId": node})
    tid = t["id"]
    template_ids.append(tid)
    call("PUT", f"/templates/{tid}/draft", admin, {
        "name": name, "description": "smoke folio", "orgNodeId": node,
        "requireSignature": False,
        "sections": [{
            "key": "datos", "title": "Datos",
            "fields": [{"key": "nota", "type": "TEXT", "label": "Nota", "required": True, "config": {"maxLength": 80}}],
        }],
    })
    call("POST", f"/templates/{tid}/publish", admin, {})
    if folio_scheme is not None:
        s, r = call("PATCH", f"/templates/{tid}", admin, {"folioScheme": folio_scheme})
        check(f"PATCH folioScheme en «{name}» → 2xx + persistido",
              s == 200 and (r.get("folioScheme") or {}).get("prefix") == folio_scheme["prefix"], str(s))
    return tid


def seal_entry(admin, tid, node):
    """Crea entrada, completa la sección y la SELLA (submit). Devuelve el detalle sellado."""
    s, e = call("POST", "/log-entries", admin, {"templateId": tid, "orgNodeId": node})
    eid = e["id"]
    entry_ids.append(eid)
    detail = call("GET", f"/log-entries/{eid}", admin)[1]
    for st in detail["sectionStates"]:
        sec = next((x for x in detail["version"]["sections"] if x["key"] == st["sectionKey"]), None)
        if not sec or not sec["fields"]:
            continue
        vals = [{"fieldKey": f["key"], "value": "ok"} for f in sec["fields"]]
        call("PUT", f"/log-entries/{eid}/sections/{st['sectionKey']}", admin,
             {"expectedVersion": st["version"], "values": vals, "markComplete": True})
    s, sealed = call("POST", f"/log-entries/{eid}/submit", admin, {})
    return s, sealed


def part_b(admin, node):
    print("\n== PART B · Folio de bitácora por plantilla ==")

    # (1) Plantilla SIN esquema ⇒ folio null (usa correlativo global).
    tid0 = make_template(admin, node, "Folio Smoke SIN esquema", None)
    s, sealed0 = seal_entry(admin, tid0, node)
    check("entrada de plantilla SIN esquema: sella → 2xx", s in (200, 201), str(s))
    check("plantilla SIN esquema: folio = null (fallback al correlativo global)",
          isinstance(sealed0, dict) and sealed0.get("folio") is None, str(sealed0.get("folio")))
    check("la entrada conserva su entryNumber (handle interno estable)",
          isinstance(sealed0, dict) and isinstance(sealed0.get("entryNumber"), int) and sealed0["entryNumber"] > 0,
          str(sealed0.get("entryNumber")))

    # (2) Plantilla CON esquema ⇒ folio propio gapless.
    tid1 = make_template(admin, node, "Folio Smoke CON esquema", {"prefix": "RTSMK"})
    seq_keys.append(f"logentry|type:{tid1}|{YEAR}")
    folios = []
    for _ in range(2):
        s, sealed = seal_entry(admin, tid1, node)
        folios.append(sealed.get("folio") if isinstance(sealed, dict) else None)
    check("plantilla CON esquema: folio propio al sellar (RTSMK-AAAA-0001)",
          folios[0] == f"RTSMK-{YEAR}-0001", str(folios[0]))
    check("folio de bitácora GAPLESS por plantilla (…-0002 en la 2.ª)",
          folios[1] == f"RTSMK-{YEAR}-0002", str(folios[1]))

    # (3) La serie es POR PLANTILLA: otra plantilla con el mismo prefijo NO comparte contador.
    tid2 = make_template(admin, node, "Folio Smoke CON esquema 2", {"prefix": "RTSMK"})
    seq_keys.append(f"logentry|type:{tid2}|{YEAR}")
    s, sealed2 = seal_entry(admin, tid2, node)
    check("serie INDEPENDIENTE por plantilla (2.ª plantilla arranca en …-0001)",
          isinstance(sealed2, dict) and sealed2.get("folio") == f"RTSMK-{YEAR}-0001", str(sealed2.get("folio")))

    # (4) El listado y el detalle exponen el folio propio.
    s, lst = call("GET", f"/log-entries?take=100", admin)
    items = lst.get("items", []) if isinstance(lst, dict) else []
    got = next((it.get("folio") for it in items if it.get("templateId") == tid1 and it.get("folio")), None)
    check("el LISTADO de bitácoras expone el folio propio de la plantilla", got is not None and got.startswith("RTSMK-"), str(got))


def main():
    admin = login(ADMIN)
    cleanup()

    node = call("GET", "/structure/nodes", admin)[1][0]["id"]
    s, specs = call("GET", "/work-orders/specialties", admin)
    spec_id = specs[0]["id"] if isinstance(specs, list) and specs else None

    try:
        part_a(admin, node, spec_id)
        part_b(admin, node)
    finally:
        cleanup()

    print(f"\nRESULTADO: {ok} OK / {fail} FAIL")
    return fail


if __name__ == "__main__":
    sys.exit(1 if main() else 0)
