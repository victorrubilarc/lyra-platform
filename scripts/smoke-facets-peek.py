#!/usr/bin/env python3
"""Smoke de FACETAS + exceptionsOnly + MI TURNO (Fase 2.8.1c).

Verifica: (1) GET /log-entries/facets devuelve buckets con conteo por dimensión
(status/state/template/equipment/band) con el MISMO where+ABAC; (2) conteos de
HERMANOS: filtrar por una dimensión NO anula sus propias opciones (siguen apareciendo
con conteo) pero SÍ acota las demás; (3) exceptionsOnly acota el listado a lo
accionable (umbral OR firma pendiente); (4) GET /log-entries/my-shift resuelve
{createdById, operationalDate, shiftCode}; (5) los 3 usuarios demo no fallan (ABAC).

No crea datos (solo lee). API :3000. Usuarios demo clave Demo!Pass2026."""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE = os.environ.get("WL_BASE", "http://localhost:3000/api")
PASS = os.environ.get("WL_DEMO_PASS", "Demo!Pass2026")
USERS = {"operador": "operador@watchlog.local", "supervisor": "supervisor@watchlog.local", "mantenedor": "mantenedor@watchlog.local"}
OK, FAIL = [], []


def call(method, path, tok=None):
    r = urllib.request.Request(BASE + path, method=method)
    if tok:
        r.add_header("Authorization", "Bearer " + tok)
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
    data = json.dumps({"email": email, "password": PASS}).encode()
    r = urllib.request.Request(BASE + "/auth/login", data=data, method="POST")
    r.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(r) as resp:
        return json.loads(resp.read().decode())["accessToken"]


def check(name, cond, detail=""):
    (OK if cond else FAIL).append(name)
    print(("  ok  " if cond else "FAIL ") + name + (f"   [{detail}]" if detail else ""))


def total(tok, qs=""):
    s, r = call("GET", f"/log-entries/stats{qs}", tok)
    return r["total"] if isinstance(r, dict) else None


def main():
    tokens = {k: login(v) for k, v in USERS.items()}
    op = tokens["operador"]

    # 1. Facetas base
    s, f = call("GET", "/log-entries/facets", op)
    check("facets responde 200 con las 5 dimensiones", s == 200 and all(k in f for k in ("status", "state", "template", "equipment", "band")), str(s))
    if not isinstance(f, dict):
        print("sin facetas; aborta")
        sys.exit(1)
    print("  buckets:", {k: len(f[k]) for k in ("status", "state", "template", "equipment", "band")})
    check("cada bucket tiene value/label/count", all("count" in b and "label" in b for dim in f.values() for b in dim))

    # 2. Conteos de HERMANOS: elegir un status NO borra las demás opciones de status,
    #    pero el conteo total del listado SÍ baja (acota las otras dimensiones).
    statuses = [b["value"] for b in f["status"]]
    if len(statuses) >= 2:
        pick = statuses[0]
        s, ff = call("GET", f"/log-entries/facets?status={pick}", op)
        sib = [b["value"] for b in ff["status"]]
        check("faceta de status conserva sus hermanos al filtrar por una (no se autoanula)", set(sib) == set(statuses), f"{sib} vs {statuses}")
        base_total = total(op)
        filt_total = total(op, f"?status={pick}")
        check("filtrar por status acota el total del set", filt_total is not None and filt_total <= base_total, f"{filt_total}<={base_total}")
    else:
        check("(omitido) <2 status para probar hermanos", True, f"status={statuses}")

    # 3. band facet ⇒ buckets WARN/CRIT con conteo > 0 si los hay
    bands = {b["value"]: b["count"] for b in f["band"]}
    check("banda: solo aparece WARN/CRIT con conteo>0", all(v > 0 and k in ("WARN", "CRIT") for k, v in bands.items()), str(bands))

    # 4. exceptionsOnly acota a lo accionable (<= total general)
    base = total(op)
    exc = total(op, "?exceptionsOnly=true")
    check("exceptionsOnly acota el set (<= total)", exc is not None and base is not None and exc <= base, f"{exc}<={base}")

    # 5. my-shift resuelto
    s, ms = call("GET", "/log-entries/my-shift", op)
    check("my-shift 200 con createdById+operationalDate", s == 200 and isinstance(ms, dict) and ms.get("createdById") and ms.get("operationalDate"), str(ms))
    check("my-shift.operationalDate con formato YYYY-MM-DD", isinstance(ms, dict) and bool(__import__("re").match(r"^\d{4}-\d{2}-\d{2}$", ms.get("operationalDate", ""))))

    # 6. Los 3 usuarios listan facetas sin error (ABAC)
    for name, tok in tokens.items():
        s, _ = call("GET", "/log-entries/facets", tok)
        check(f"{name} obtiene facetas (200, ABAC)", s == 200, str(s))

    print(f"\n== {len(OK)} ok, {len(FAIL)} fail ==")
    if FAIL:
        print("FALLARON:", ", ".join(FAIL))
        sys.exit(1)


if __name__ == "__main__":
    main()
