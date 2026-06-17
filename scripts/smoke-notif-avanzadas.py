#!/usr/bin/env python3
"""Smoke de NOTIFICACIONES AVANZADAS — Fase A (2026-06-17).

Verifica el épico (Fase A, solo email) sobre el motor existente:
 A) Plantillas POR BITÁCORA (ámbito): crear ad-hoc scoped → 201 (templateId + templateName);
    whitelist con comodín de campo inexistente → 400; duplicada (mismo evento/locale/bitácora)
    → 409; field-variables de la bitácora; filtro scope=generic/scoped; borrar la genérica → 400.
 B) Config de aviso POR TRANSICIÓN CONGELADA en la versión: crear flujo → guardar borrador con
    una transición que lleva notify{enabled,includeAuthor,externalEmails} → publicar → GET detalle
    devuelve la config congelada (round-trip).
 C) Resolver en runtime: sobre una entrada real cuya transición se configura (psql), se inyecta el
    evento entry.transition; POST /run resuelve destinatarios = correo EXTERNO (sin ABAC) usando la
    plantilla ESPECÍFICA de la bitácora con el comodín {{campo.<key>}} renderizado (sin {{ crudo}}.
 D) Default de sistema OFF: una transición SIN config no notifica (0 filas) cuando el toggle está en
    false; se restaura a true.
 E) Default de sistema expuesto en GET/PATCH /settings (round-trip) + gate settings:manage (no-admin 403).
 Gates: un no-admin recibe 403 en crear/borrar plantillas.

Crea y LIMPIA por ID (psql). API :3000, Mailpit :8025. Clave demo Demo!Pass2026."""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE = os.environ.get("WL_BASE", "http://localhost:3000/api")
PASS = os.environ.get("WL_DEMO_PASS", "Demo!Pass2026")
ADMIN = "demo@watchlog.local"
NONADMIN = os.environ.get("WL_NONADMIN", "operador@watchlog.local")
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
    s, r = call("POST", "/auth/login", body={"email": email, "password": PASS})
    if s != 200:
        print(f"login {email} -> {s} {r}")
        sys.exit(1)
    return r["accessToken"]


def sql(q):
    return subprocess.run(PG + ["-c", q], capture_output=True, text=True).stdout.strip()


def check(name, cond, detail=""):
    (OK if cond else FAIL).append(name)
    print(("  ok  " if cond else "FAIL ") + name + (f"   [{detail}]" if detail else ""))


def main():
    tok = login(ADMIN)
    ts = str(int(time.time()))
    marker = f"SMK-NA-{ts}"
    ext_email = f"externo-{ts}@contratista-demo.cl"
    created_tpl_ids = []
    wf_id = None
    ev_ids = []

    # --- Bitácora con entrada (autor + versión de flujo) para C ---
    row = sql(
        "SELECT le.\"templateId\", le.id, le.\"createdById\", le.\"workflowDefinitionVersionId\" "
        "FROM \"LogEntry\" le JOIN \"Template\" t ON t.id=le.\"templateId\" "
        "WHERE le.\"deletedAt\" IS NULL AND le.\"createdById\" IS NOT NULL "
        "AND le.\"workflowDefinitionVersionId\" IS NOT NULL AND t.\"currentVersionId\" IS NOT NULL "
        "ORDER BY le.\"createdAt\" DESC LIMIT 1;"
    )
    parts = row.split("|") if row else []
    lb_id, entry_id, author_id, vid = (parts + ["", "", "", ""])[:4]
    have_entry = bool(lb_id and entry_id and vid)
    check("setup: bitácora con entrada + versión de flujo", have_entry,
          f"lb={lb_id[:6]} entry={entry_id[:6]} v={vid[:6]}")
    if not have_entry:
        print("Sin datos de entrada para el smoke; aborta.")
        sys.exit(1)

    # Campo presente en el VALOR de la entrada Y en la versión publicada de la bitácora (comodín).
    fk = sql(
        f"SELECT lev.\"fieldKey\" FROM \"LogEntryValue\" lev WHERE lev.\"logEntryId\"='{entry_id}' "
        "AND lev.\"fieldKey\" IN (SELECT f.key FROM \"TemplateField\" f "
        "JOIN \"TemplateSection\" s ON s.id=f.\"sectionId\" JOIN \"TemplateVersion\" v ON v.id=s.\"templateVersionId\" "
        f"JOIN \"Template\" t ON t.\"currentVersionId\"=v.id WHERE t.id='{lb_id}') LIMIT 1;"
    )

    # Transición de la versión congelada de la entrada (para C) y otra para D.
    trow = sql(
        "SELECT wt.key, fs.key, ts.key FROM \"WorkflowTransition\" wt "
        "JOIN \"WorkflowState\" fs ON fs.id=wt.\"fromStateId\" JOIN \"WorkflowState\" ts ON ts.id=wt.\"toStateId\" "
        f"WHERE wt.\"workflowDefinitionVersionId\"='{vid}' ORDER BY wt.\"order\" LIMIT 1;"
    )
    tparts = trow.split("|") if trow else []
    tkey, fromk, tok_state = (tparts + ["", "", ""])[:3]
    have_transition = bool(tkey)

    # === A. Plantillas por bitácora ===========================================
    field_ph = f" {{{{campo.{fk}}}}}" if fk else ""
    body_tpl = {
        "eventKey": "entry.transition",
        "locale": "es-CL",
        "templateId": lb_id,
        "subject": f"{marker} folio {{{{entry.folio}}}}{field_ph}",
        "bodyText": f"{marker} Estado {{{{entry.toState}}}}.{field_ph}",
        "bodyHtml": f"<p>{marker} {{{{entry.toState}}}}{field_ph}</p>",
    }
    s, r = call("POST", "/notifications/templates", tok, body_tpl)
    ok_create = s in (200, 201) and r.get("templateId") == lb_id and r.get("templateName")
    if ok_create:
        created_tpl_ids.append(r["id"])
        scoped_tpl_id = r["id"]
    check("A1 crear plantilla scoped → 201 (templateId + nombre de bitácora)", ok_create, f"{s} {r if not ok_create else r.get('templateName')}")

    bad = dict(body_tpl, locale="es-XX", subject=f"{marker} {{{{campo.__no_existe_{ts}}}}}")
    s, _ = call("POST", "/notifications/templates", tok, bad)
    check("A2 comodín de campo inexistente → 400", s == 400, f"{s}")

    s, _ = call("POST", "/notifications/templates", tok, body_tpl)
    check("A3 plantilla duplicada (evento/locale/bitácora) → 409", s == 409, f"{s}")

    s, r = call("GET", f"/notifications/templates/field-variables?templateId={lb_id}", tok)
    nvars = len(r.get("variables", [])) if s == 200 else 0
    check("A4 diccionario de comodines de la bitácora", s == 200 and nvars >= 1, f"{s} n={nvars}")

    s, r = call("GET", "/notifications/templates?scope=scoped", tok)
    scoped_list = r.get("templates", []) if s == 200 else []
    check("A5 filtro scope=scoped incluye la ad-hoc", any(t["id"] == scoped_tpl_id for t in scoped_list) if ok_create else False, f"{s} n={len(scoped_list)}")
    s, r = call("GET", "/notifications/templates?scope=generic", tok)
    gen_list = r.get("templates", []) if s == 200 else []
    check("A6 filtro scope=generic NO incluye la ad-hoc y sí genéricas", (s == 200 and len(gen_list) >= 1 and all(t["templateId"] is None for t in gen_list)), f"{s} n={len(gen_list)}")

    gen_id = gen_list[0]["id"] if gen_list else None
    if gen_id:
        s, _ = call("DELETE", f"/notifications/templates/{gen_id}", tok)
        check("A7 borrar plantilla GENÉRICA → 400 (no se borra)", s == 400, f"{s}")

    # === B. Config de aviso por transición CONGELADA ==========================
    wkey = f"smk-na-{ts}"
    s, r = call("POST", "/workflows", tok, {"key": wkey, "name": f"{marker} flujo"})
    if s in (200, 201):
        wf_id = r["id"]
    check("B1 crear flujo", bool(wf_id), f"{s}")
    notify_cfg = {
        "enabled": True, "templateId": None, "roleIds": [], "userIds": [],
        "includeAuthor": True, "includeActor": False, "includeDestinationRoles": True,
        "externalEmails": [ext_email],
    }
    if wf_id:
        draft = {
            "states": [
                {"key": "abierto", "name": "Abierto", "isInitial": True},
                {"key": "cerrado", "name": "Cerrado", "isFinal": True},
            ],
            "transitions": [
                {"key": "cerrar", "label": "Cerrar", "fromStateKey": "abierto", "toStateKey": "cerrado", "notify": notify_cfg},
            ],
        }
        s, _ = call("PUT", f"/workflows/{wf_id}/draft", tok, draft)
        check("B2 guardar borrador con notify en la transición", s in (200, 201), f"{s}")
        s, _ = call("POST", f"/workflows/{wf_id}/publish", tok, {})
        check("B3 publicar flujo", s in (200, 201), f"{s}")
        s, r = call("GET", f"/workflows/{wf_id}", tok)
        tr = next((t for t in (r.get("version", {}).get("transitions", []) if s == 200 else []) if t["key"] == "cerrar"), None)
        frozen = tr.get("notify") if tr else None
        ok_frozen = bool(frozen) and frozen.get("enabled") is True and frozen.get("includeAuthor") is True and frozen.get("externalEmails") == [ext_email]
        check("B4 GET detalle: config de aviso CONGELADA round-trip", ok_frozen, f"frozen={frozen}")

    # === C. Resolver en runtime (entrada real + transición configurada) =======
    if have_transition and ok_create:
        cfg_c = json.dumps({
            "enabled": True, "templateId": None, "roleIds": [], "userIds": [],
            "includeAuthor": True, "includeActor": False, "includeDestinationRoles": False,
            "externalEmails": [ext_email],
        })
        sql(f"UPDATE \"WorkflowTransition\" SET \"notifyConfig\"='{cfg_c}'::jsonb "
            f"WHERE \"workflowDefinitionVersionId\"='{vid}' AND key='{tkey}';")
        ev_c = f"smk_na_c_{ts}"
        ev_ids.append(ev_c)
        payload = json.dumps({"entryId": entry_id, "fromStateKey": fromk, "toStateKey": tok_state, "transitionKey": tkey, "actorId": None})
        sql("INSERT INTO \"NotificationEvent\" (id,\"eventKey\",payload,\"dedupeKey\",status,attempts,\"createdAt\") "
            f"VALUES ('{ev_c}','entry.transition','{payload}'::jsonb,'{ev_c}','PENDING',0,now());")
        s, r = call("POST", "/notifications/run", tok)
        check("C1 POST /run despacha el evento de transición", s in (200, 201), f"{s} {r}")
        time.sleep(0.4)
        ext_row = sql(f"SELECT status FROM \"NotificationOutbox\" WHERE \"eventId\"='{ev_c}' AND \"recipientEmail\"='{ext_email}' AND \"recipientUserId\" IS NULL;")
        check("C2 destinatario EXTERNO (sin usuario) en la bandeja", ext_row in ("SENT", "PENDING", "SUPPRESSED"), f"status={ext_row!r}")
        body = sql(f"SELECT \"bodyHtml\" FROM \"NotificationOutbox\" WHERE \"eventId\"='{ev_c}' AND \"recipientEmail\"='{ext_email}' LIMIT 1;")
        rendered_ok = marker in body and "{{" not in body
        check("C3 plantilla ESPECÍFICA de la bitácora, renderizada (sin {{ crudo)", rendered_ok, f"body={body[:80]!r}")
        if fk:
            # El comodín de campo se sustituyó (no quedó {{campo. crudo}; ya cubierto por C3.
            check("C4 comodín {{campo.<key>}} resuelto", "{{campo." not in body, f"fk={fk}")
        # restaurar
        sql(f"UPDATE \"WorkflowTransition\" SET \"notifyConfig\"=NULL WHERE \"workflowDefinitionVersionId\"='{vid}' AND key='{tkey}';")

    # === D. Default de sistema OFF (transición SIN config no notifica) =========
    if have_transition:
        sql("UPDATE \"SystemSettings\" SET \"notifyTransitionDefaultDestinationRoles\"=false WHERE id='system';")
        ev_d = f"smk_na_d_{ts}"
        ev_ids.append(ev_d)
        payload_d = json.dumps({"entryId": entry_id, "fromStateKey": fromk, "toStateKey": tok_state, "transitionKey": tkey, "actorId": None})
        sql("INSERT INTO \"NotificationEvent\" (id,\"eventKey\",payload,\"dedupeKey\",status,attempts,\"createdAt\") "
            f"VALUES ('{ev_d}','entry.transition','{payload_d}'::jsonb,'{ev_d}','PENDING',0,now());")
        call("POST", "/notifications/run", tok)
        time.sleep(0.3)
        cnt_d = sql(f"SELECT count(*) FROM \"NotificationOutbox\" WHERE \"eventId\"='{ev_d}';")
        check("D1 default OFF + transición sin config → 0 destinatarios", cnt_d == "0", f"count={cnt_d}")
        sql("UPDATE \"SystemSettings\" SET \"notifyTransitionDefaultDestinationRoles\"=true WHERE id='system';")

    # === E. Default de sistema expuesto en el endpoint de settings (round-trip) ==
    s, r = call("GET", "/settings", tok)
    has_field = s == 200 and isinstance(r, dict) and "notifyTransitionDefaultDestinationRoles" in r
    check("E1 GET /settings expone notifyTransitionDefaultDestinationRoles", has_field, f"{s}")
    if has_field:
        original = r["notifyTransitionDefaultDestinationRoles"]
        s, _ = call("PATCH", "/settings", tok, {"notifyTransitionDefaultDestinationRoles": False})
        _, r2 = call("GET", "/settings", tok)
        check("E2 PATCH /settings cambia el default (round-trip)", s in (200, 201) and r2.get("notifyTransitionDefaultDestinationRoles") is False, f"{s} v={r2.get('notifyTransitionDefaultDestinationRoles')}")
        # restaurar
        call("PATCH", "/settings", tok, {"notifyTransitionDefaultDestinationRoles": original})
        ntok_e = login(NONADMIN)
        s, _ = call("PATCH", "/settings", ntok_e, {"notifyTransitionDefaultDestinationRoles": True})
        check("E3 no-admin: PATCH /settings → 403", s == 403, f"{s}")

    # === Gates ================================================================
    ntok = login(NONADMIN)
    s, _ = call("POST", "/notifications/templates", ntok, body_tpl)
    check("G1 no-admin: crear plantilla → 403", s == 403, f"{s}")
    if created_tpl_ids:
        s, _ = call("DELETE", f"/notifications/templates/{created_tpl_ids[0]}", ntok)
        check("G2 no-admin: borrar plantilla → 403", s == 403, f"{s}")

    # === Limpieza por ID ======================================================
    for ev in ev_ids:
        sql(f"DELETE FROM \"NotificationOutbox\" WHERE \"eventId\"='{ev}';")
        sql(f"DELETE FROM \"NotificationEvent\" WHERE id='{ev}';")
    for tid in created_tpl_ids:
        call("DELETE", f"/notifications/templates/{tid}", tok)
    if wf_id:
        sql(f"DELETE FROM \"WorkflowTransitionRole\" WHERE \"transitionId\" IN (SELECT id FROM \"WorkflowTransition\" wt JOIN \"WorkflowDefinitionVersion\" v ON v.id=wt.\"workflowDefinitionVersionId\" WHERE v.\"workflowDefinitionId\"='{wf_id}');")
        sql(f"DELETE FROM \"WorkflowTransition\" WHERE \"workflowDefinitionVersionId\" IN (SELECT id FROM \"WorkflowDefinitionVersion\" WHERE \"workflowDefinitionId\"='{wf_id}');")
        sql(f"UPDATE \"WorkflowDefinition\" SET \"currentVersionId\"=NULL WHERE id='{wf_id}';")
        sql(f"DELETE FROM \"WorkflowState\" WHERE \"workflowDefinitionVersionId\" IN (SELECT id FROM \"WorkflowDefinitionVersion\" WHERE \"workflowDefinitionId\"='{wf_id}');")
        sql(f"DELETE FROM \"WorkflowDefinitionVersion\" WHERE \"workflowDefinitionId\"='{wf_id}';")
        sql(f"DELETE FROM \"WorkflowDefinition\" WHERE id='{wf_id}';")

    print(f"\n=== {len(OK)} ok / {len(FAIL)} fail ===")
    if FAIL:
        print("FALLARON:", ", ".join(FAIL))
        sys.exit(1)


if __name__ == "__main__":
    main()
