#!/usr/bin/env python3
"""Smoke de NOTIFICACIONES — Bloque N (2026-06-16).

Verifica el motor de avisos por correo (transactional outbox + worker):
 1) Catálogo de eventos (4) y plantillas sembradas (4) accesibles.
 2) Render whitelisteado: PATCH de una plantilla con una variable NO permitida por su
    evento → 400; PATCH válido (mismo cuerpo) → 200.
 3) round.overdue end-to-end: se inserta (psql) un horario + ocurrencia VENCIDA con
    rol responsable = rol del admin demo; POST /notifications/run → barre+despacha+
    envía; la bandeja queda con una fila SENT y MAILPIT recibe el correo RENDERIZADO
    (sin `{{...}}` crudo, con el nombre del horario en el asunto).
 4) Dedup: correr el worker otra vez NO crea una 2.ª fila de bandeja para la ocurrencia.
 5) Opt-out: con la preferencia round.overdue = OFF, otra ocurrencia vencida NO genera
    correo (suprimida). Restaura la preferencia.
 6) Gates: un usuario sin permisos de notificación recibe 403 en plantillas/bandeja/run,
    pero 200 en /events y /preferences (propias, sin permiso).

Crea y LIMPIA por ID (psql). API :3000, Mailpit API :8025. Clave demo Demo!Pass2026."""
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
MAILPIT = os.environ.get("WL_MAILPIT", "http://localhost:8025")
PASS = os.environ.get("WL_DEMO_PASS", "Demo!Pass2026")
ADMIN = "demo@watchlog.local"
NONADMIN = os.environ.get("WL_NONADMIN", "operador@watchlog.local")
PG = ["docker", "exec", "lyra-watchlog-dev-postgres-1", "psql", "-U", "watchlog", "-d", "watchlog", "-t", "-A"]
OK, FAIL = [], []


def call(method, path, tok=None, body=None, base=BASE):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(base + path, data=data, method=method)
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


def mail(path):
    try:
        with urllib.request.urlopen(MAILPIT + path) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        return {"error": str(e)}


def check(name, cond, detail=""):
    (OK if cond else FAIL).append(name)
    print(("  ok  " if cond else "FAIL ") + name + (f"   [{detail}]" if detail else ""))


def main():
    tok = login(ADMIN)
    ts = str(int(time.time()))
    marker = f"SMK-NOTIF-{ts}"

    # --- IDs de dominio existentes ---
    role_id = sql("SELECT id FROM \"Role\" WHERE key='admin' LIMIT 1;")
    node_id = sql("SELECT id FROM \"OrgNode\" WHERE \"deletedAt\" IS NULL LIMIT 1;")
    tpl_id = sql("SELECT id FROM \"Template\" WHERE \"deletedAt\" IS NULL LIMIT 1;")
    demo_id = sql("SELECT id FROM \"User\" WHERE email='%s';" % ADMIN)
    check("setup: ids de dominio resueltos", all([role_id, node_id, tpl_id, demo_id]),
          f"role={role_id[:6]} node={node_id[:6]} tpl={tpl_id[:6]}")

    sched_id = "smk_sched_" + ts
    occ_id = "smk_occ_" + ts
    occ2_id = "smk_occ2_" + ts

    # === 1. Catálogo + plantillas ===
    s, r = call("GET", "/notifications/events", tok)
    check("1a catálogo de eventos (4)", s == 200 and len(r.get("events", [])) == 4, f"{s}")
    s, r = call("GET", "/notifications/templates", tok)
    tpls = r.get("templates", []) if s == 200 else []
    check("1b plantillas sembradas (4)", s == 200 and len(tpls) == 4, f"{s} n={len(tpls)}")

    # === 2. Render whitelist (sobre entry.transition para no tocar round.overdue) ===
    tr = next((t for t in tpls if t["eventKey"] == "entry.transition"), None)
    if tr:
        bad = {"subject": "x {{schedule.name}}", "bodyText": tr["bodyText"], "bodyHtml": tr["bodyHtml"]}
        s, r = call("PATCH", f"/notifications/templates/{tr['id']}", tok, bad)
        check("2a variable no permitida → 400", s == 400, f"{s}")
        ok = {"subject": tr["subject"], "bodyText": tr["bodyText"], "bodyHtml": tr["bodyHtml"]}
        s, r = call("PATCH", f"/notifications/templates/{tr['id']}", tok, ok)
        check("2b PATCH válido → 200", s == 200, f"{s}")
    else:
        check("2 plantilla entry.transition presente", False)

    # === 3. round.overdue end-to-end ===
    sql("INSERT INTO \"LogSchedule\" (id,name,\"templateId\",\"orgNodeId\",\"responsibleRoleId\","
        "\"recurrenceKind\",\"recurrenceConfig\",\"dueWindowMinutes\",\"horizonDays\",active,\"createdAt\",\"updatedAt\") "
        f"VALUES ('{sched_id}','{marker}','{tpl_id}','{node_id}','{role_id}','NONE','{{}}'::jsonb,60,2,true,now(),now());")
    sql("INSERT INTO \"RoundOccurrence\" (id,\"scheduleId\",\"templateId\",\"orgNodeId\",\"scheduledFor\",\"dueAt\",status,\"generatedAt\") "
        f"VALUES ('{occ_id}','{sched_id}','{tpl_id}','{node_id}',now()-interval '3 hours',now()-interval '2 hours','PENDING',now());")

    s, r = call("POST", "/notifications/run", tok)
    check("3a POST /run → 2xx y barrió ≥1", s in (200, 201) and r.get("swept", 0) >= 1, f"{s} {r}")
    time.sleep(0.5)

    # El rol responsable = rol admin (lo tienen varios usuarios) ⇒ varios destinatarios.
    out_status = sql(f"SELECT status FROM \"NotificationOutbox\" WHERE \"relatedEntityId\"='{occ_id}' AND \"recipientUserId\"='{demo_id}';")
    check("3b bandeja: fila round.overdue para el admin demo = SENT", out_status == "SENT", f"status={out_status!r}")

    msgs = mail("/api/v1/messages?limit=200").get("messages", [])
    mine = [m for m in msgs if marker in (m.get("Subject") or "")]
    check("3c MAILPIT recibió correo(s) (asunto con el horario)", len(mine) >= 1, f"n={len(mine)}")
    to_demo = [m for m in mine if any(ADMIN in (t.get("Address") or "") for t in m.get("To", []))]
    body_ok = False
    if to_demo:
        det = mail(f"/api/v1/message/{to_demo[0]['ID']}")
        text = (det.get("Text") or "") + (det.get("HTML") or "")
        body_ok = ("Ronda vencida" in text or marker in text) and "{{" not in text
    check("3d correo al admin demo, renderizado (sin {{...}} crudo)", body_ok, f"to_demo={len(to_demo)}")

    # === 4. Dedup: las filas de bandeja son ESTABLES tras re-correr el worker ===
    cnt1 = sql(f"SELECT count(*) FROM \"NotificationOutbox\" WHERE \"relatedEntityId\"='{occ_id}';")
    call("POST", "/notifications/run", tok)
    cnt2 = sql(f"SELECT count(*) FROM \"NotificationOutbox\" WHERE \"relatedEntityId\"='{occ_id}';")
    check("4 dedup: filas estables tras re-correr (sin duplicar)", cnt1 == cnt2 and int(cnt1 or 0) >= 1, f"{cnt1}→{cnt2}")

    # === 5. Opt-out ===
    s, r = call("PUT", "/notifications/preferences", tok, {"eventKey": "round.overdue", "channel": "EMAIL", "mode": "OFF"})
    check("5a preferencia round.overdue = OFF", s == 200 and r.get("mode") == "OFF", f"{s}")
    sql("INSERT INTO \"RoundOccurrence\" (id,\"scheduleId\",\"templateId\",\"orgNodeId\",\"scheduledFor\",\"dueAt\",status,\"generatedAt\") "
        f"VALUES ('{occ2_id}','{sched_id}','{tpl_id}','{node_id}',now()-interval '3 hours',now()-interval '2 hours','PENDING',now());")
    call("POST", "/notifications/run", tok)
    cnt_demo = sql(f"SELECT count(*) FROM \"NotificationOutbox\" WHERE \"relatedEntityId\"='{occ2_id}' AND \"recipientUserId\"='{demo_id}';")
    check("5b opt-out suprime el correo del admin demo (0 filas)", cnt_demo == "0", f"count={cnt_demo}")
    call("PUT", "/notifications/preferences", tok, {"eventKey": "round.overdue", "channel": "EMAIL", "mode": "IMMEDIATE"})

    # === 6. Gates de permiso ===
    ntok = login(NONADMIN)
    s, _ = call("GET", "/notifications/templates", ntok)
    check("6a no-admin: /templates → 403", s == 403, f"{s}")
    s, _ = call("GET", "/notifications/outbox", ntok)
    check("6b no-admin: /outbox → 403", s == 403, f"{s}")
    s, _ = call("POST", "/notifications/run", ntok)
    check("6c no-admin: /run → 403", s == 403, f"{s}")
    s, _ = call("GET", "/notifications/events", ntok)
    check("6d no-admin: /events → 200 (catálogo)", s == 200, f"{s}")
    s, _ = call("GET", "/notifications/preferences", ntok)
    check("6e no-admin: /preferences propias → 200", s == 200, f"{s}")

    # === Limpieza por ID ===
    sql(f"DELETE FROM \"NotificationOutbox\" WHERE \"relatedEntityId\" IN ('{occ_id}','{occ2_id}');")
    sql(f"DELETE FROM \"NotificationEvent\" WHERE \"dedupeKey\" LIKE 'round.overdue|{occ_id}' OR \"dedupeKey\" LIKE 'round.overdue|{occ2_id}';")
    sql(f"DELETE FROM \"RoundOccurrence\" WHERE id IN ('{occ_id}','{occ2_id}');")
    sql(f"DELETE FROM \"LogSchedule\" WHERE id='{sched_id}';")
    sql(f"DELETE FROM \"NotificationPreference\" WHERE \"userId\"='{demo_id}' AND \"eventKey\"='round.overdue';")
    if mine:
        try:
            req = urllib.request.Request(MAILPIT + "/api/v1/messages", data=json.dumps({"IDs": [m["ID"] for m in mine]}).encode(), method="DELETE")
            req.add_header("Content-Type", "application/json")
            urllib.request.urlopen(req)
        except Exception:
            pass

    print(f"\n=== {len(OK)} ok / {len(FAIL)} fail ===")
    if FAIL:
        print("FALLARON:", ", ".join(FAIL))
        sys.exit(1)


if __name__ == "__main__":
    main()
