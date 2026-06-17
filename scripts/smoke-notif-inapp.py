#!/usr/bin/env python3
"""Smoke de NOTIFICACIONES — Fase B: canal IN-APP (la campanita) + tiempo real (2026-06-17).

Verifica el canal in-app sobre el motor existente (outbox+worker), sin reinventarlo:
 A) Emisión multi-canal: una transición configurada para avisar al ADMIN (userIds) genera,
    al despachar, una fila de outbox INAPP (recipientUserId=admin, readAt NULL) ADEMÁS de la
    de correo; el sender marca la INAPP SENT (entrega = la propia fila), sin depender del SMTP.
 B) API del inbox (ownership): GET /inbox lista la del usuario; unread-count la cuenta; la fila
    recién entregada aparece en MI bandeja.
 C) Marcar leída: POST /inbox/:id/read pone readAt y baja el contador; read-all deja 0.
 D) Ownership: un no-admin que intenta leer la notificación del admin → 404 (no se filtra
    existencia ajena); y el no-admin SÍ accede a su propio inbox (sin permiso de catálogo → 200).
 E) Tiempo real (fallback poll + SSE): unread-count refleja la entrega; el stream SSE
    (?access_token=) emite el evento inicial con el contador.

Crea y LIMPIA por ID (psql). API :3000. Clave demo Demo!Pass2026."""
import json
import os
import socket
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


def sse_initial_unread(token, timeout=4.0):
    """Abre el stream SSE y devuelve el `unread` del evento inicial (o None si falla)."""
    req = urllib.request.Request(f"{BASE}/notifications/inbox/stream?access_token={token}")
    try:
        resp = urllib.request.urlopen(req, timeout=timeout)
        fp = resp.fp
        try:
            fp.raw._sock.settimeout(timeout)  # type: ignore[attr-defined]
        except Exception:
            pass
        deadline = time.time() + timeout
        try:
            while time.time() < deadline:
                line = resp.readline()
                if not line:
                    break
                txt = line.decode(errors="ignore").strip()
                if txt.startswith("data:"):
                    payload = txt[len("data:"):].strip()
                    try:
                        obj = json.loads(payload)
                    except Exception:
                        continue
                    if isinstance(obj, dict) and obj.get("type") == "inbox":
                        return obj.get("unread")
        finally:
            resp.close()
    except (urllib.error.URLError, socket.timeout, TimeoutError, OSError):
        return None
    return None


def main():
    tok = login(ADMIN)
    ts = str(int(time.time()))
    ev_ids = []

    admin_id = sql(f"SELECT id FROM \"User\" WHERE email='{ADMIN}';")
    check("setup: id del admin", bool(admin_id), f"admin={admin_id[:8]}")

    # Entrada real con versión de flujo congelada + una transición (para emitir entry.transition).
    row = sql(
        "SELECT le.id, le.\"workflowDefinitionVersionId\" FROM \"LogEntry\" le "
        "JOIN \"Template\" t ON t.id=le.\"templateId\" "
        "WHERE le.\"deletedAt\" IS NULL AND le.\"workflowDefinitionVersionId\" IS NOT NULL "
        "AND t.\"currentVersionId\" IS NOT NULL ORDER BY le.\"createdAt\" DESC LIMIT 1;"
    )
    parts = row.split("|") if row else []
    entry_id, vid = (parts + ["", ""])[:2]
    trow = sql(
        "SELECT wt.key, fs.key, ts.key FROM \"WorkflowTransition\" wt "
        "JOIN \"WorkflowState\" fs ON fs.id=wt.\"fromStateId\" JOIN \"WorkflowState\" ts ON ts.id=wt.\"toStateId\" "
        f"WHERE wt.\"workflowDefinitionVersionId\"='{vid}' ORDER BY wt.\"order\" LIMIT 1;"
    )
    tparts = trow.split("|") if trow else []
    tkey, fromk, tostate = (tparts + ["", "", ""])[:3]
    have = bool(entry_id and vid and tkey and admin_id)
    check("setup: entrada + transición congelada", have, f"entry={entry_id[:6]} v={vid[:6]} t={tkey}")
    if not have:
        print("Sin datos para el smoke; aborta.")
        sys.exit(1)

    # Baseline de no leídas del admin (la bandeja puede tener historial).
    s, r = call("GET", "/notifications/inbox/unread-count", tok)
    base_unread = r.get("unread", 0) if s == 200 else 0
    check("setup: unread-count base accesible", s == 200, f"{s} base={base_unread}")

    # === A. Emisión multi-canal (transición → email + in-app al admin) =========
    cfg = json.dumps({
        "enabled": True, "templateId": None, "roleIds": [], "userIds": [admin_id],
        "includeAuthor": False, "includeActor": False, "includeDestinationRoles": False,
        "externalEmails": [],
    })
    sql(f"UPDATE \"WorkflowTransition\" SET \"notifyConfig\"='{cfg}'::jsonb "
        f"WHERE \"workflowDefinitionVersionId\"='{vid}' AND key='{tkey}';")
    ev = f"smk_inapp_{ts}"
    ev_ids.append(ev)
    payload = json.dumps({"entryId": entry_id, "fromStateKey": fromk, "toStateKey": tostate, "transitionKey": tkey, "actorId": None})
    sql("INSERT INTO \"NotificationEvent\" (id,\"eventKey\",payload,\"dedupeKey\",status,attempts,\"createdAt\") "
        f"VALUES ('{ev}','entry.transition','{payload}'::jsonb,'{ev}','PENDING',0,now());")
    s, r = call("POST", "/notifications/run", tok)
    check("A1 POST /run despacha + entrega", s in (200, 201), f"{s} {r}")
    time.sleep(0.5)

    inapp_id = sql(f"SELECT id FROM \"NotificationOutbox\" WHERE \"eventId\"='{ev}' AND channel='INAPP' AND \"recipientUserId\"='{admin_id}';")
    check("A2 fila INAPP del admin creada", bool(inapp_id), f"id={inapp_id[:8]}")
    inapp_status = sql(f"SELECT status FROM \"NotificationOutbox\" WHERE id='{inapp_id}';") if inapp_id else ""
    check("A3 la INAPP se entrega (SENT), no depende del SMTP", inapp_status == "SENT", f"status={inapp_status!r}")
    email_cnt = sql(f"SELECT count(*) FROM \"NotificationOutbox\" WHERE \"eventId\"='{ev}' AND channel='EMAIL' AND \"recipientUserId\"='{admin_id}';")
    check("A4 coexiste la fila EMAIL del mismo destinatario (dedupe por canal)", email_cnt == "1", f"count={email_cnt}")
    readat = sql(f"SELECT \"readAt\" FROM \"NotificationOutbox\" WHERE id='{inapp_id}';") if inapp_id else "x"
    check("A5 la INAPP nace NO leída (readAt NULL)", readat == "", f"readAt={readat!r}")

    # === B. API del inbox (ownership) =========================================
    s, r = call("GET", "/notifications/inbox/unread-count", tok)
    new_unread = r.get("unread", 0) if s == 200 else -1
    check("B1 unread-count subió tras la entrega", new_unread >= base_unread + 1, f"base={base_unread} now={new_unread}")
    s, r = call("GET", "/notifications/inbox?limit=50", tok)
    items = r.get("items", []) if s == 200 else []
    mine = next((it for it in items if it["id"] == inapp_id), None)
    check("B2 GET /inbox incluye mi notificación (no leída)", bool(mine) and mine.get("readAt") is None, f"{s} n={len(items)}")
    check("B3 unread del listado coincide con unread-count", (r.get("unread") == new_unread) if s == 200 else False, f"list={r.get('unread')} count={new_unread}")

    # === E (SSE). El stream emite el contador inicial =========================
    sse_unread = sse_initial_unread(tok)
    check("E1 SSE emite el evento inicial con el contador", sse_unread is not None and sse_unread >= 1, f"sse_unread={sse_unread}")

    # === C. Marcar leída ======================================================
    if inapp_id:
        s, r = call("POST", f"/notifications/inbox/{inapp_id}/read", tok)
        check("C1 marcar leída → ok y baja el contador", s in (200, 201) and r.get("unread") == new_unread - 1, f"{s} unread={r.get('unread')}")
        db_read = sql(f"SELECT \"readAt\" FROM \"NotificationOutbox\" WHERE id='{inapp_id}';")
        check("C2 readAt persistido en la fila", db_read != "", f"readAt={db_read[:19]!r}")

    # === D. Ownership =========================================================
    ntok = login(NONADMIN)
    if inapp_id:
        s, _ = call("POST", f"/notifications/inbox/{inapp_id}/read", ntok)
        check("D1 no-admin no puede leer la notificación del admin → 404", s == 404, f"{s}")
    s, r = call("GET", "/notifications/inbox/unread-count", ntok)
    check("D2 no-admin accede a SU propio inbox (ownership, sin 403)", s == 200, f"{s}")

    # === C (read-all) =========================================================
    s, r = call("POST", "/notifications/inbox/read-all", tok)
    check("C3 read-all deja el contador en 0", s in (200, 201) and r.get("unread") == 0, f"{s} unread={r.get('unread')}")

    # === E (poll). unread-count tras read-all =================================
    s, r = call("GET", "/notifications/inbox/unread-count", tok)
    check("E2 unread-count refleja 0 tras read-all (poll)", s == 200 and r.get("unread") == 0, f"{s} unread={r.get('unread')}")

    # === Limpieza por ID ======================================================
    sql(f"UPDATE \"WorkflowTransition\" SET \"notifyConfig\"=NULL WHERE \"workflowDefinitionVersionId\"='{vid}' AND key='{tkey}';")
    for e in ev_ids:
        sql(f"DELETE FROM \"NotificationOutbox\" WHERE \"eventId\"='{e}';")
        sql(f"DELETE FROM \"NotificationEvent\" WHERE id='{e}';")

    print(f"\n=== {len(OK)} ok / {len(FAIL)} fail ===")
    if FAIL:
        print("FALLARON:", ", ".join(FAIL))
        sys.exit(1)


if __name__ == "__main__":
    main()
