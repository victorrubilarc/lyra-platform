#!/usr/bin/env python3
"""Smoke de PROGRAMACIÓN DE RONDAS — Fase 2.3 (2026-06-15).

Verifica el ciclo completo del módulo `LogSchedule` + `RoundOccurrence`:
 1) Validación: recurrencia INTERVAL con everyMinutes inválido → 400 (contrato);
    SHIFT con turno inexistente → 400; equipo inexistente → 400.
 2) Crear un horario SHIFT en una plantilla publicada + nodo elegible → 201; la
    creación materializa ocurrencias (generador idempotente) con shiftCode + dueAt.
 3) Idempotencia: `POST /schedules/generate` otra vez NO duplica (mismo conteo).
 4) `overdueOnly`: mutando el dueAt de una ocurrencia al pasado (psql), el listado
    `?overdueOnly=true` la devuelve con overdue=true (derivado, sin cron).
 5) Iniciar una ronda crea la ENTRADA real ligada (logEntryId); la ocurrencia queda
    PENDING con la entrada en curso.
 6) Anular esa entrada (VOID) DESLIGA la ocurrencia → vuelve PENDING sin logEntryId.
 7) Omitir una ocurrencia con motivo → SKIPPED + skipReason (auditado).
 8) `GET /schedules/occurrences/stats` devuelve pending/overdue/today.
 9) Los 3 usuarios demo listan ocurrencias sin error (ABAC).

Crea y LIMPIA por ID (psql cascade). API :3000. Usuarios demo clave Demo!Pass2026."""
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
USERS = {"operador": "operador@watchlog.local", "supervisor": "supervisor@watchlog.local", "mantenedor": "mantenedor@watchlog.local"}
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
    return r["accessToken"]


def sql(q):
    return subprocess.run(PG + ["-c", q], capture_output=True, text=True).stdout.strip()


def check(name, cond, detail=""):
    (OK if cond else FAIL).append(name)
    print(("  ok  " if cond else "FAIL ") + name + (f"   [{detail}]" if detail else ""))


def main():
    admin = login(ADMIN)
    sched_id = None
    entry_id = None
    try:
        # Plantilla publicada + nodo elegible.
        s, tpls = call("GET", "/log-entries/templates", admin)
        check("hay plantillas publicadas para programar", s == 200 and isinstance(tpls, list) and len(tpls) > 0, f"{s}")
        if not tpls:
            return
        # Busca una plantilla con al menos un nodo elegible.
        tpl_id = node_id = equip_id = None
        equip_mode = "OPTIONAL"
        for t in tpls:
            s, el = call("GET", f"/log-entries/templates/{t['id']}/nodes", admin)
            if s == 200 and el.get("nodes"):
                tpl_id = t["id"]
                node = el["nodes"][0]
                node_id = node["id"]
                equip_mode = el.get("equipmentMode", "OPTIONAL")
                if equip_mode == "REQUIRED" and node.get("equipment"):
                    equip_id = node["equipment"][0]["id"]
                break
        check("hay plantilla con nodo elegible", bool(tpl_id and node_id), f"tpl={tpl_id} node={node_id} mode={equip_mode}")
        if not tpl_id:
            return

        base = {"templateId": tpl_id, "orgNodeId": node_id, "dueWindowMinutes": 720, "horizonDays": 3}

        # (1) Validación.
        s, _ = call("POST", "/schedules", admin, {**base, "recurrenceKind": "INTERVAL", "recurrenceConfig": {"everyMinutes": 1}})
        check("INTERVAL everyMinutes=1 ⇒ 400", s == 400, f"{s}")
        s, _ = call("POST", "/schedules", admin, {**base, "recurrenceKind": "SHIFT", "recurrenceConfig": {"shiftCodes": ["ZZZ"]}})
        check("SHIFT con turno inexistente ⇒ 400", s == 400, f"{s}")
        s, _ = call("POST", "/schedules", admin, {**base, "recurrenceKind": "SHIFT", "recurrenceConfig": {}, "equipmentId": "no-existe-xyz"})
        check("equipo inexistente ⇒ 400", s == 400, f"{s}")

        # (2) Crear horario SHIFT válido → materializa ocurrencias.
        body = {**base, "name": "Smoke ronda SHIFT", "recurrenceKind": "SHIFT", "recurrenceConfig": {}}
        if equip_id:
            body["equipmentId"] = equip_id
        s, sched = call("POST", "/schedules", admin, body)
        check("crear horario SHIFT ⇒ 2xx", s in (200, 201), f"{s} {sched if s not in (200,201) else ''}")
        if s not in (200, 201):
            return
        sched_id = sched["id"]

        s, occ1 = call("GET", f"/schedules/occurrences?scheduleId={sched_id}", admin)
        n1 = len(occ1) if isinstance(occ1, list) else 0
        check("la creación generó ocurrencias", s == 200 and n1 > 0, f"{s} n={n1}")
        if n1:
            o0 = occ1[0]
            check("ocurrencia trae shiftCode + dueAt + scheduledFor", bool(o0.get("dueAt") and o0.get("scheduledFor")), str(o0.get("shiftCode")))
            check("ocurrencia nace PENDING sin entrada", o0["status"] == "PENDING" and o0["logEntryId"] is None)

        # (3) Idempotencia.
        s, gen = call("POST", "/schedules/generate", admin, {"scheduleId": sched_id})
        s, occ2 = call("GET", f"/schedules/occurrences?scheduleId={sched_id}", admin)
        n2 = len(occ2) if isinstance(occ2, list) else 0
        check("generar de nuevo NO duplica", n2 == n1, f"n1={n1} n2={n2} nuevas={gen.get('generated') if isinstance(gen, dict) else '?'}")

        # (4) overdueOnly (deriva vencida tras mutar dueAt al pasado).
        if n1:
            target = occ1[-1]["id"]
            sql(f"UPDATE \"RoundOccurrence\" SET \"dueAt\" = now() - interval '2 hours' WHERE id='{target}';")
            s, over = call("GET", f"/schedules/occurrences?scheduleId={sched_id}&overdueOnly=true", admin)
            hit = isinstance(over, list) and any(o["id"] == target and o["overdue"] for o in over)
            check("overdueOnly devuelve la vencida (overdue=true)", s == 200 and hit, f"{s} n={len(over) if isinstance(over,list) else '?'}")

        # (5) Iniciar ronda → crea entrada ligada.
        started = next((o for o in occ1 if o["status"] == "PENDING"), None)
        can_start = started and (equip_mode != "REQUIRED" or equip_id)
        if can_start:
            s, r = call("POST", f"/schedules/occurrences/{started['id']}/start", admin, {})
            check("iniciar ronda ⇒ crea entrada (logEntryId)", s in (200, 201) and r.get("logEntryId"), f"{s} {r}")
            if s in (200, 201):
                entry_id = r["logEntryId"]
                link = sql(f"SELECT \"logEntryId\",\"status\" FROM \"RoundOccurrence\" WHERE id='{started['id']}';")
                check("la ocurrencia queda ligada (logEntryId) y PENDING", entry_id in link and "PENDING" in link, link)

                # (6) VOID de la entrada DESLIGA la ocurrencia.
                s, _ = call("POST", f"/log-entries/{entry_id}/void", admin, {"reason": "smoke ronda revert"})
                relink = sql(f"SELECT COALESCE(\"logEntryId\",'NULL'),\"status\" FROM \"RoundOccurrence\" WHERE id='{started['id']}';")
                check("VOID desliga y deja PENDING", s in (200, 201) and "NULL" in relink and "PENDING" in relink, f"{s} {relink}")
        else:
            check("iniciar ronda (omitido: plantilla REQUIRED sin equipo)", True, "skip")

        # (7) Omitir otra ocurrencia con motivo.
        to_skip = next((o for o in occ1 if o["status"] == "PENDING" and (not started or o["id"] != started["id"])), None)
        if to_skip:
            s, sk = call("POST", f"/schedules/occurrences/{to_skip['id']}/skip", admin, {"reason": "smoke omisión justificada"})
            check("omitir ⇒ SKIPPED + motivo", s in (200, 201) and sk.get("status") == "SKIPPED" and sk.get("skipReason"), f"{s} {sk.get('status') if isinstance(sk,dict) else sk}")
            audited = sql("SELECT count(*) FROM \"AuditLog\" WHERE action='schedule.occurrence.skipped' AND \"entityId\"='%s';" % to_skip["id"])
            check("omisión auditada", audited == "1", audited)
            s, _ = call("POST", f"/schedules/occurrences/{to_skip['id']}/skip", admin, {"reason": "no de nuevo por favor"})
            check("re-omitir una no-pendiente ⇒ 400", s == 400, f"{s}")

        # (8) Stats.
        s, st = call("GET", "/schedules/occurrences/stats", admin)
        check("stats trae pending/overdue/today", s == 200 and all(k in (st or {}) for k in ("pending", "overdue", "today")), f"{s} {st}")

        # (9) Gate de permiso: usuarios SIN `schedule:view` ⇒ 403 (enforcement del
        # permiso nuevo del catálogo, hoy solo del rol admin). Confirma que el módulo
        # de rondas no queda abierto a cualquiera con sesión.
        for role, email in USERS.items():
            try:
                tok = login(email)
                s, _ = call("GET", "/schedules/occurrences", tok)
                check(f"{role} SIN schedule:view ⇒ 403 (gate)", s == 403, f"{s}")
            except Exception as e:
                check(f"{role} SIN schedule:view ⇒ 403 (gate)", False, str(e))

    finally:
        if entry_id:
            for tbl in ("LogEntryFieldChange", "LogEntryValue", "LogEntrySignature", "LogEntryTransition", "LogEntrySection"):
                sql(f'DELETE FROM "{tbl}" WHERE "logEntryId" = \'{entry_id}\';')
            sql(f"UPDATE \"RoundOccurrence\" SET \"logEntryId\"=NULL WHERE \"logEntryId\"='{entry_id}';")
            sql(f'DELETE FROM "LogEntry" WHERE id = \'{entry_id}\';')
        if sched_id:
            sql(f'DELETE FROM "RoundOccurrence" WHERE "scheduleId" = \'{sched_id}\';')
            sql(f'DELETE FROM "LogSchedule" WHERE id = \'{sched_id}\';')

    print(f"\n=== {len(OK)} ok, {len(FAIL)} fail ===")
    if FAIL:
        print("FAILS:", FAIL)
        sys.exit(1)


if __name__ == "__main__":
    main()
