#!/usr/bin/env python3
"""Smoke de EXCLUSIÓN DE CHECKLISTS del módulo Bitácoras (UX pulido pre-S8, 2026-07-03).

Los checklists de OT son `LogEntry` con plantilla de propósito CHECKLIST: se
instancian desde su orden de trabajo, NO son bitácoras programables por calendario.
Verifica que:
 1) El CATÁLOGO ADMIN de plantillas (`GET /templates`, gate template:view) SÍ incluye
    las plantillas CHECKLIST (ahí deben verse para gestionarlas).
 2) El picker de «Nueva entrada» (`GET /log-entries/templates`) NO devuelve NINGUNA
    plantilla CHECKLIST (ni por id ni por purpose).
 3) El filtro de la grilla (`GET /log-entries/filter-templates`) NO devuelve CHECKLIST.
 4) Ambos pickers SIGUEN devolviendo plantillas GENERALES (purpose=null) publicadas
    (la exclusión es null-safe: no barre las generales).
 5) La LISTA de Bitácoras excluye TODA instancia de checklist de OT — el criterio es el
    ENLACE (LogEntry.workOrderChecklists), NO el purpose de la plantilla: un checklist
    instanciado desde una plantilla GENERAL (purpose=null) TAMBIÉN se excluye (fuga real
    detectada 2026-07-03). Ninguna entrada enlazada a un WorkOrderChecklist aparece en la
    grilla, ni siquiera filtrando por su misma plantilla.
 6) CONTROL: la LISTA filtrada por una plantilla GENERAL con entradas SÍ devuelve items.

Solo LEE (no crea ni limpia). API :3000. Admin demo clave Demo!Pass2026."""
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
PG = ["docker", "exec", "lyra-watchlog-dev-postgres-1", "psql", "-U", "watchlog", "-d", "watchlog", "-t", "-A"]
OK, FAIL = [], []


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
    _, r = call("POST", "/auth/login", body={"email": email, "password": PASS})
    return r["accessToken"]


def sql(q):
    return subprocess.run(PG + ["-c", q], capture_output=True, text=True).stdout.strip()


def check(name, cond, detail=""):
    (OK if cond else FAIL).append(name)
    print(("  ok  " if cond else "FAIL ") + name + (f"   [{detail}]" if detail else ""))


def ids_of(items):
    return {t["id"] for t in items} if isinstance(items, list) else set()


def main():
    tok = login(ADMIN)

    # --- Datos de la BD (fuente de verdad para lo que DEBE/NO debe aparecer) ---
    checklist_ids = set(filter(None, sql(
        "SELECT id FROM \"Template\" WHERE purpose='CHECKLIST' AND status='PUBLISHED' AND \"deletedAt\" IS NULL;"
    ).splitlines()))
    checklist_with_entries = sql(
        "SELECT t.id FROM \"Template\" t JOIN \"LogEntry\" le ON le.\"templateId\"=t.id "
        "WHERE t.purpose='CHECKLIST' AND le.\"deletedAt\" IS NULL GROUP BY t.id LIMIT 1;"
    ).strip()
    general_pub_id = sql(
        "SELECT id FROM \"Template\" WHERE purpose IS NULL AND status='PUBLISHED' AND \"deletedAt\" IS NULL LIMIT 1;"
    ).strip()
    general_with_entries = sql(
        "SELECT t.id FROM \"Template\" t JOIN \"LogEntry\" le ON le.\"templateId\"=t.id "
        "WHERE t.purpose IS NULL AND le.\"deletedAt\" IS NULL GROUP BY t.id LIMIT 1;"
    ).strip()

    check("Precondición: hay ≥1 plantilla CHECKLIST publicada", len(checklist_ids) >= 1, f"{len(checklist_ids)}")
    check("Precondición: hay un checklist CON entradas en la BD", bool(checklist_with_entries), checklist_with_entries)
    check("Precondición: hay plantilla GENERAL publicada", bool(general_pub_id), general_pub_id)

    # --- 1) Catálogo admin SÍ incluye los checklists ---
    s, cat = call("GET", "/templates", tok)
    cat_ids = ids_of(cat)
    check("Catálogo admin GET /templates incluye los CHECKLIST", s == 200 and checklist_ids.issubset(cat_ids),
          f"status={s} faltan={checklist_ids - cat_ids}")

    # --- 2) Picker «Nueva entrada» NO incluye checklists; SÍ incluye generales ---
    s, picker = call("GET", "/log-entries/templates", tok)
    pick_ids = ids_of(picker)
    pick_purposes = {t.get("purpose") for t in picker} if isinstance(picker, list) else set()
    check("Picker /log-entries/templates NO trae CHECKLIST (por id)", s == 200 and not (checklist_ids & pick_ids),
          f"status={s} intrusos={checklist_ids & pick_ids}")
    check("Picker /log-entries/templates NO trae purpose=CHECKLIST", "CHECKLIST" not in pick_purposes)
    check("Picker /log-entries/templates SÍ trae la plantilla GENERAL (null-safe)", general_pub_id in pick_ids)

    # --- 3) Filtro de la grilla NO incluye checklists ---
    s, filt = call("GET", "/log-entries/filter-templates", tok)
    filt_ids = ids_of(filt)
    check("Filtro /log-entries/filter-templates NO trae CHECKLIST", s == 200 and not (checklist_ids & filt_ids),
          f"status={s} intrusos={checklist_ids & filt_ids}")

    # --- 5) La LISTA excluye TODA instancia de checklist de OT (por ENLACE, no purpose) ---
    # 5a) Filtrando por la plantilla de un checklist dedicado: 0 items (todas sus entradas
    #     son instancias de OT).
    n_entries = sql(f"SELECT count(*) FROM \"LogEntry\" WHERE \"templateId\"='{checklist_with_entries}' AND \"deletedAt\" IS NULL;").strip()
    s, lst = call("GET", f"/log-entries?templateId={checklist_with_entries}", tok)
    items = lst.get("items", []) if isinstance(lst, dict) else []
    check("Lista GET /log-entries?templateId=<checklist dedicado> devuelve 0 items",
          s == 200 and len(items) == 0, f"status={s} items={len(items)} (BD tiene {n_entries})")

    # 5b) FUGA por plantilla GENERAL: un checklist de OT instanciado desde una plantilla
    #     purpose=null NO debe aparecer aunque su plantilla sí tenga bitácoras normales.
    leak = sql(
        "SELECT wc.\"logEntryId\", le.\"templateId\" FROM \"WorkOrderChecklist\" wc "
        "JOIN \"LogEntry\" le ON le.id = wc.\"logEntryId\" JOIN \"Template\" t ON t.id = le.\"templateId\" "
        "WHERE t.purpose IS NULL AND le.\"deletedAt\" IS NULL LIMIT 1;"
    ).strip()
    if leak and "|" in leak:
        leak_entry, leak_tid = leak.split("|", 1)
        s, lst3 = call("GET", f"/log-entries?templateId={leak_tid}", tok)
        ids3 = {i["id"] for i in lst3.get("items", [])} if isinstance(lst3, dict) else set()
        check("Checklist de OT desde plantilla GENERAL NO aparece en la grilla",
              s == 200 and leak_entry not in ids3, f"status={s} leak_entry_visible={leak_entry in ids3}")
    else:
        print("  --  (sin checklist de OT desde plantilla general; sub-caso 5b omitido)")

    # También: NINGÚN LogEntry enlazado a un WorkOrderChecklist debe estar en la grilla
    # (verificación por conjunto, filtrando por cada plantilla involucrada).
    ot_ids = set(filter(None, sql(
        "SELECT wc.\"logEntryId\" FROM \"WorkOrderChecklist\" wc JOIN \"LogEntry\" le ON le.id=wc.\"logEntryId\" "
        "WHERE le.\"deletedAt\" IS NULL;"
    ).splitlines()))
    ot_tids = set(filter(None, sql(
        "SELECT DISTINCT le.\"templateId\" FROM \"WorkOrderChecklist\" wc JOIN \"LogEntry\" le ON le.id=wc.\"logEntryId\" "
        "WHERE le.\"deletedAt\" IS NULL;"
    ).splitlines()))
    seen = set()
    for tid in ot_tids:
        _, r = call("GET", f"/log-entries?templateId={tid}&pageSize=200", tok)
        if isinstance(r, dict):
            seen |= {i["id"] for i in r.get("items", [])}
    check("Ninguna instancia de checklist de OT aparece en la grilla (por conjunto)",
          not (ot_ids & seen), f"intrusos={ot_ids & seen}")

    # --- 6) CONTROL: lista filtrada por plantilla GENERAL con entradas SÍ trae items ---
    if general_with_entries:
        s, lst2 = call("GET", f"/log-entries?templateId={general_with_entries}", tok)
        items2 = lst2.get("items", []) if isinstance(lst2, dict) else []
        check("CONTROL: lista por plantilla GENERAL con entradas SÍ trae items",
              s == 200 and len(items2) > 0, f"status={s} items={len(items2)}")
    else:
        print("  --  (sin plantilla general con entradas para el control; omitido)")

    print(f"\n{len(OK)} ok / {len(FAIL)} fail")
    if FAIL:
        print("FALLIDOS:", ", ".join(FAIL))
        sys.exit(1)


if __name__ == "__main__":
    main()
