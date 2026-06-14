#!/usr/bin/env python3
"""Smoke de WORKFLOW SLA + atrasos (2026-06-13).

Verifica:
 1) Round-trip del SLA por estado en el builder de flujos: saveDraft con
    `maxStayMinutes` por estado → GET detail lo conserva; publish lo congela.
 2) `roleNames` resuelto en la transición de la versión congelada expuesta en el
    detalle de una entrada (responsable en el visor, sin migración).
 3) Grilla: filtro `delayedOnly`, KPI `stats.delayed`, faceta `facets.delayed`,
    e ítem de lista con `currentStateSince` + `currentStateMaxStayMinutes`. El
    atraso se computa con el MISMO where+ABAC (intersección de ids, cero fuga).
 4) `currentStateSince` gobierna el atraso: la MISMA entrada con since=ahora NO
    está atrasada; con since=hace 2 días SÍ.
 5) Los 3 usuarios demo no fallan con delayedOnly (ABAC).

Muta una WorkflowState (maxStayMinutes) y un LogEntry (currentStateSince) por psql
y RESTAURA al final. API :3000. Usuarios demo clave Demo!Pass2026."""
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
    tokens = {k: login(v) for k, v in USERS.items()}

    # === 1. Round-trip del SLA en el builder ===============================
    s, det = call("POST", "/workflows", admin, {"key": f"sla-smoke-{os.getpid()}", "name": "SLA Smoke"})
    check("crear flujo 200/201", s in (200, 201), str(s))
    wid = det["id"]
    try:
        draft = {
            "name": "SLA Smoke",
            "states": [
                {"key": "abierto", "name": "Abierto", "isInitial": True, "isFinal": False, "maxStayMinutes": 120},
                {"key": "cerrado", "name": "Cerrado", "isInitial": False, "isFinal": True},
            ],
            "transitions": [{"key": "cerrar", "label": "Cerrar", "fromStateKey": "abierto", "toStateKey": "cerrado"}],
        }
        s, d2 = call("PUT", f"/workflows/{wid}/draft", admin, draft)
        check("saveDraft con maxStayMinutes 200", s == 200, str(s))
        st = {x["key"]: x for x in d2["version"]["states"]}
        check("maxStayMinutes=120 persiste en 'abierto'", st["abierto"]["maxStayMinutes"] == 120, str(st["abierto"].get("maxStayMinutes")))
        check("maxStayMinutes=null en 'cerrado' (sin SLA)", st["cerrado"]["maxStayMinutes"] is None)
        s, d3 = call("POST", f"/workflows/{wid}/publish", admin, {})
        check("publish 200/201", s in (200, 201), str(s))
        stp = {x["key"]: x for x in d3["version"]["states"]}
        check("SLA viaja en la versión publicada (congelada)", stp["abierto"]["maxStayMinutes"] == 120)
    finally:
        call("DELETE", f"/workflows/{wid}", admin)

    # === Entrada DRAFT existente con flujo (para 2/3/4) ====================
    eid = sql("SELECT id FROM \"LogEntry\" WHERE status='DRAFT' AND \"workflowDefinitionVersionId\" IS NOT NULL AND \"currentStateKey\" IS NOT NULL AND \"deletedAt\" IS NULL LIMIT 1;")
    if not eid:
        print("No hay entrada DRAFT con flujo; aborto la parte de grilla")
        return summary()
    ver, key, since0 = sql(
        f"SELECT \"workflowDefinitionVersionId\"||'|'||\"currentStateKey\"||'|'||COALESCE(\"currentStateSince\"::text,'') FROM \"LogEntry\" WHERE id='{eid}';"
    ).split("|")
    sla0 = sql(f"SELECT COALESCE(\"maxStayMinutes\"::text,'NULL') FROM \"WorkflowState\" WHERE \"workflowDefinitionVersionId\"='{ver}' AND key='{key}';")
    print(f"  entrada={eid} version={ver} estado={key} sla0={sla0} since0={since0}")

    try:
        # === 2. roleNames en la versión congelada del detalle ==============
        s, d = call("GET", f"/log-entries/{eid}", admin)
        check("detalle 200 con workflowVersion", s == 200 and d.get("workflowVersion") is not None, str(s))
        trs = d["workflowVersion"]["transitions"]
        check("cada transición trae roleNames (array)", all(isinstance(t.get("roleNames"), list) for t in trs))
        withroles = [t for t in trs if t.get("roleIds")]
        if withroles:
            check("roleNames resuelto donde hay roleIds", all(len(t["roleNames"]) == len(t["roleIds"]) for t in withroles),
                  f"{withroles[0]['roleIds']}→{withroles[0]['roleNames']}")
        else:
            print("  (la versión congelada no tiene roles por transición; se omite la aserción de nombres)")
        cur = next((x for x in d["workflowVersion"]["states"] if x["key"] == key), None)
        check("el estado actual trae maxStayMinutes (campo presente)", cur is not None and "maxStayMinutes" in cur)

        # === 3/4. Atraso en la grilla ======================================
        # SLA de 1 min en el estado actual + entrada con since=hace 2 días ⇒ atrasada.
        sql(f"UPDATE \"WorkflowState\" SET \"maxStayMinutes\"=1 WHERE \"workflowDefinitionVersionId\"='{ver}' AND key='{key}';")
        sql(f"UPDATE \"LogEntry\" SET \"currentStateSince\"=now() - interval '2 days' WHERE id='{eid}';")

        s, st = call("GET", "/log-entries/stats", admin)
        check("stats.delayed >= 1 con la entrada vencida", st.get("delayed", 0) >= 1, str(st.get("delayed")))
        s, fa = call("GET", "/log-entries/facets", admin)
        check("facets.delayed >= 1", fa.get("delayed", 0) >= 1, str(fa.get("delayed")))

        s, lst = call("GET", "/log-entries?delayedOnly=true&take=100", admin)
        ids = [i["id"] for i in lst["items"]]
        check("delayedOnly incluye la entrada vencida", eid in ids, f"{len(ids)} items")
        item = next((i for i in lst["items"] if i["id"] == eid), None)
        if item:
            check("ítem trae currentStateMaxStayMinutes=1", item.get("currentStateMaxStayMinutes") == 1, str(item.get("currentStateMaxStayMinutes")))
            check("ítem trae currentStateSince (ISO)", bool(item.get("currentStateSince")))

        # since = ahora ⇒ la MISMA entrada ya NO está atrasada.
        sql(f"UPDATE \"LogEntry\" SET \"currentStateSince\"=now() WHERE id='{eid}';")
        s, lst2 = call("GET", "/log-entries?delayedOnly=true&take=100", admin)
        check("con since=ahora la entrada SALE de delayed", eid not in [i["id"] for i in lst2["items"]])

        # === 5. ABAC: 3 usuarios no fallan con delayedOnly =================
        for u, tk in tokens.items():
            s, _ = call("GET", "/log-entries?delayedOnly=true&take=10", tk)
            check(f"{u}: delayedOnly 200 (ABAC, sin error)", s == 200, str(s))
    finally:
        # Restaurar SLA y currentStateSince originales.
        restore_sla = "NULL" if sla0 in ("", "NULL") else sla0
        sql(f"UPDATE \"WorkflowState\" SET \"maxStayMinutes\"={restore_sla} WHERE \"workflowDefinitionVersionId\"='{ver}' AND key='{key}';")
        if since0:
            sql(f"UPDATE \"LogEntry\" SET \"currentStateSince\"='{since0}' WHERE id='{eid}';")
        else:
            sql(f"UPDATE \"LogEntry\" SET \"currentStateSince\"=NULL WHERE id='{eid}';")
        chk = sql(f"SELECT COALESCE(\"maxStayMinutes\"::text,'NULL') FROM \"WorkflowState\" WHERE \"workflowDefinitionVersionId\"='{ver}' AND key='{key}';")
        check("limpieza: maxStayMinutes restaurado", chk == sla0, f"{chk} vs {sla0}")

    summary()


def summary():
    print(f"\n=== {len(OK)} ok · {len(FAIL)} fail ===")
    if FAIL:
        print("FALLARON:", FAIL)
        sys.exit(1)


if __name__ == "__main__":
    main()
