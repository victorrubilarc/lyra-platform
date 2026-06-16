#!/usr/bin/env python3
"""Smoke de CONFIGURACIÓN DE CORREO SALIENTE — Bloque N hardening (2026-06-16).

Verifica la pantalla de config SMTP en BD (`/settings/email`, permiso notification:config):
 1) GET devuelve la config pública SIN contraseña (solo `passwordSet`/`source`).
 2) Guardar una config (Mailpit) → 200, source='db', passwordSet=true; la contraseña
    queda CIFRADA en BD (no en claro) y NO vuelve en la respuesta.
 3) Probar CONEXIÓN (verify) contra Mailpit → ok:true.
 4) Probar ENVÍO (test) → ok:true y MAILPIT recibe el correo de prueba.
 5) Gates: un no-admin recibe 403 en GET/PUT/test/verify.
 6) Limpia: restaura source=env (emailConfiguredAt=null) para que dev siga con Mailpit/env.

API :3000, Mailpit API :8025. Clave demo Demo!Pass2026."""
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
        print(f"login {email} -> {s}"); sys.exit(1)
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
    secret = "SmkSecret-" + str(int(time.time()))

    # === 1. GET público sin contraseña ===
    s, r = call("GET", "/settings/email", tok)
    has_pw_field = isinstance(r, dict) and "password" in r
    check("1 GET config: 200, sin campo password, con source/passwordSet",
          s == 200 and not has_pw_field and "source" in r and "passwordSet" in r, f"{s} source={r.get('source') if isinstance(r,dict) else r}")

    # === 2. Guardar (Mailpit) con contraseña → cifrada en BD ===
    cfg = {"enabled": True, "service": "", "host": "localhost", "port": 1025, "secure": False,
           "user": "smoke", "password": secret, "fromName": "Lyra WatchLog", "fromEmail": "no-reply@watchlog.local"}
    s, r = call("PUT", "/settings/email", tok, cfg)
    check("2a guardar → 200, source=db, passwordSet, sin password en respuesta",
          s == 200 and r.get("source") == "db" and r.get("passwordSet") is True and "password" not in r, f"{s}")
    enc = sql("SELECT \"emailPasswordEnc\" FROM \"SystemSettings\" WHERE id='system';")
    check("2b contraseña CIFRADA en BD (no en claro, no nula)", enc != "" and secret not in enc, f"len={len(enc)}")

    # === 3. Probar conexión (verify) contra Mailpit ===
    s, r = call("POST", "/settings/email/verify", tok, cfg)
    check("3 verify (probar conexión) → ok:true", s == 200 and r.get("ok") is True, f"{s} {r}")

    # === 4. Probar envío → Mailpit recibe ===
    s, r = call("POST", "/settings/email/test", tok, {**cfg, "to": "prueba@watchlog.local"})
    check("4a test (probar envío) → ok:true", s == 200 and r.get("ok") is True, f"{s} {r}")
    time.sleep(0.4)
    msgs = mail("/api/v1/messages?limit=30").get("messages", [])
    test_msgs = [m for m in msgs if "correo de prueba" in (m.get("Subject") or "").lower()]
    check("4b MAILPIT recibió el correo de prueba", len(test_msgs) >= 1, f"n={len(test_msgs)}")

    # === 5. Gates 403 (no-admin) ===
    ntok = login(NONADMIN)
    g = call("GET", "/settings/email", ntok)[0]
    p = call("PUT", "/settings/email", ntok, cfg)[0]
    tt = call("POST", "/settings/email/test", ntok, {**cfg, "to": "x@y.cl"})[0]
    vv = call("POST", "/settings/email/verify", ntok, cfg)[0]
    check("5 no-admin: GET/PUT/test/verify → 403", g == 403 and p == 403 and tt == 403 and vv == 403, f"{g}/{p}/{tt}/{vv}")

    # === Limpieza: volver a source=env ===
    sql("UPDATE \"SystemSettings\" SET \"emailConfiguredAt\"=NULL, \"emailPasswordEnc\"=NULL, \"emailHost\"=NULL, "
        "\"emailUser\"=NULL, \"emailService\"=NULL, \"emailFromName\"=NULL, \"emailFromEmail\"=NULL, \"emailEnabled\"=false "
        "WHERE id='system';")
    s, r = call("GET", "/settings/email", tok)
    check("6 limpieza: source vuelve a env", s == 200 and r.get("source") == "env", f"source={r.get('source') if isinstance(r,dict) else r}")
    if test_msgs:
        try:
            req = urllib.request.Request(MAILPIT + "/api/v1/messages", data=json.dumps({"IDs": [m["ID"] for m in test_msgs]}).encode(), method="DELETE")
            req.add_header("Content-Type", "application/json")
            urllib.request.urlopen(req)
        except Exception:
            pass

    print(f"\n=== {len(OK)} ok / {len(FAIL)} fail ===")
    if FAIL:
        print("FALLARON:", ", ".join(FAIL)); sys.exit(1)


if __name__ == "__main__":
    main()
