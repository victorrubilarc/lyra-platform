#!/usr/bin/env python3
"""Smoke — Rate limiting GLOBAL de la API (H1 "planta restrictiva ready").

Verifica el hallazgo 🔴 del pre-pentest 2026-07-07 (sin rate limiting global):
@nestjs/throttler con contadores en Redis, throttler `default` generoso +
estrictos `auth`/`public`/`upload` por ruta, salud y SSE EXENTOS, y `Retry-After`
ESTÁNDAR en el 429 (guard propio: el paquete lo sufija en los no-default).

Levanta la API compilada en :3410 con límites BAJOS por env (gatillar el 429
sin martillar) y TTL público corto (probar la RECUPERACIÓN sin esperar 1 min):

  1. /api/health x40 ⇒ TODOS 200 (exento aunque supere cualquier límite);
  2. login demo OK + 10 llamadas autenticadas ⇒ 200 (el flujo normal NO se
     bloquea con el límite default);
  3. /api/branding (público) hasta el límite ⇒ 200; el siguiente ⇒ 429 con
     header `Retry-After` (a secas, numérico) y mensaje presentable;
  4. tras el TTL corto ⇒ /api/branding vuelve a 200 (recuperación);
  5. /auth/login con credenciales de un email INEXISTENTE hasta el límite auth
     ⇒ 401; el siguiente ⇒ 429 + Retry-After (throttling por IP, NIST 800-63B
     §5.2.2, complementa el lockout por cuenta — que aquí no se toca).

No toca la BD (solo lecturas) ni el dev de :3000. Redis dev: las claves del
throttler expiran solas (TTL corto). Admin demo / Demo!Pass2026.
"""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
API_DIR = ROOT / "apps" / "watchlog-api"
PORT = int(os.environ.get("WL_RATELIMIT_PORT", "3410"))
BASE = f"http://localhost:{PORT}/api"
PASS = os.environ.get("WL_DEMO_PASS", "Demo!Pass2026")
ADMIN = "demo@watchlog.local"

# Límites BAJOS del escenario (inyectados por env al levantar la API).
# OJO PUBLIC_TTL: con un TTL menor que lo que tarda el martilleo (urllib abre
# una conexión nueva por request ⇒ ~1 s c/u en Windows) la ventana EXPIRA en
# medio del loop y el contador nunca excede — 30 s da margen y la prueba de
# recuperación sigue siendo tolerable.
DEFAULT_LIMIT = 100          # generoso relativo: el flujo normal no lo toca
PUBLIC_LIMIT, PUBLIC_TTL = 6, 30
AUTH_LIMIT = 4

OK, FAIL = [], []


def check(name, cond, detail=""):
    (OK if cond else FAIL).append(name)
    print(("  ok  " if cond else "FAIL ") + name + (f"   [{detail}]" if detail else ""))


def call(method, path, tok=None, body=None):
    """(status, json/texto, headers-en-minúscula — Fastify emite lowercase)."""
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    if tok:
        r.add_header("Authorization", "Bearer " + tok)
    if data is not None:
        r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r) as resp:
            txt = resp.read().decode()
            hdrs = {k.lower(): v for k, v in resp.headers.items()}
            try:
                return resp.status, (json.loads(txt) if txt else None), hdrs
            except Exception:
                return resp.status, txt, hdrs
    except urllib.error.HTTPError as e:
        b = e.read().decode()
        hdrs = {k.lower(): v for k, v in e.headers.items()}
        try:
            return e.code, json.loads(b), hdrs
        except Exception:
            return e.code, b, hdrs
    except urllib.error.URLError:
        return 0, None, {}


class Api:
    def __init__(self):
        st, _, _ = call("GET", "/health")
        if st != 0:
            print(f"ABORT: el puerto {PORT} ya está ocupado; mátalo y reintenta")
            sys.exit(2)
        self.log_path = API_DIR / ".license" / f"smoke-ratelimit-{PORT}.log"
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        self.log = open(self.log_path, "w", encoding="utf-8")
        env = {
            **os.environ,
            "API_PORT": str(PORT),
            "THROTTLE_DEFAULT_LIMIT": str(DEFAULT_LIMIT),
            "THROTTLE_DEFAULT_TTL_S": "60",
            "THROTTLE_AUTH_LIMIT": str(AUTH_LIMIT),
            "THROTTLE_AUTH_TTL_S": "60",
            "THROTTLE_PUBLIC_LIMIT": str(PUBLIC_LIMIT),
            "THROTTLE_PUBLIC_TTL_S": str(PUBLIC_TTL),
        }
        self.proc = subprocess.Popen(
            ["node", "dist/main.js"], cwd=str(API_DIR), env=env,
            stdout=self.log, stderr=subprocess.STDOUT,
        )

    def wait(self, timeout=90):
        t0 = time.time()
        while time.time() - t0 < timeout:
            st, _, _ = call("GET", "/health")
            if st == 200:
                return True
            if self.proc.poll() is not None:
                return False
            time.sleep(1)
        return False

    def stop(self):
        if os.name == "nt":
            subprocess.run(["taskkill", "/PID", str(self.proc.pid), "/T", "/F"], capture_output=True)
        else:
            self.proc.terminate()
        try:
            self.proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.proc.kill()
        self.log.close()


def main():
    api = Api()
    if not api.wait():
        print("ABORT: la API no levantó; log en", api.log_path)
        sys.exit(2)

    try:
        # 1. Salud EXENTA: martillar muy por encima de cualquier límite.
        statuses = {call("GET", "/health")[0] for _ in range(40)}
        check("health x40 ⇒ todos 200 (exento del rate limit)", statuses == {200}, statuses)

        # 2. Flujo normal autenticado NO se bloquea.
        st, login, _ = call("POST", "/auth/login", body={"email": ADMIN, "password": PASS})
        atok = (login or {}).get("accessToken")
        check("login demo OK (1er hit del bucket auth)", st in (200, 201) and atok, st)
        if atok:
            sts = {call("GET", "/structure/nodes", atok)[0] for _ in range(10)}
            check("10 llamadas autenticadas ⇒ todas 200 (default generoso)", sts == {200}, sts)

        # 3. Público estricto: /api/branding hasta el límite y el 429.
        results = [call("GET", "/branding") for _ in range(PUBLIC_LIMIT + 2)]
        codes = [r[0] for r in results]
        over = results[-1]
        check(f"branding x{PUBLIC_LIMIT} dentro del límite ⇒ 200", set(codes[:PUBLIC_LIMIT]) == {200}, codes)
        check("el que EXCEDE ⇒ 429", over[0] == 429, codes)
        retry = over[2].get("retry-after")
        check("429 trae Retry-After ESTÁNDAR y numérico", retry is not None and str(retry).isdigit(), retry)
        msg = over[1].get("message", "") if isinstance(over[1], dict) else str(over[1])
        check("mensaje 429 presentable (es-CL)", "solicitudes" in msg.lower(), msg[:60])

        # 4. Recuperación tras el TTL corto del bucket público.
        time.sleep(PUBLIC_TTL + 1)
        st, _, _ = call("GET", "/branding")
        check(f"tras {PUBLIC_TTL}s (TTL) branding vuelve a 200", st == 200, st)

        # 5. Auth estricto por IP: email INEXISTENTE (no toca el lockout del demo).
        # Autosuficiente: límite+1 intentos (el hit del login demo del paso 2
        # puede haber expirado ya — TTL 60 s y el paso 4 durmió 31 s).
        ghost = {"email": "no-existe-rl@watchlog.local", "password": "Nada!123456"}
        results = [call("POST", "/auth/login", body=ghost) for _ in range(AUTH_LIMIT + 1)]
        codes = [r[0] for r in results]
        check("logins fallidos ⇒ 401 dentro del límite y 429 al exceder",
              codes[-1] == 429 and all(c in (400, 401) for c in codes[:-1] if c != 429), codes)
        check("429 de auth trae Retry-After", results[-1][2].get("retry-after") is not None,
              results[-1][2].get("retry-after"))
    finally:
        api.stop()

    print(f"\n=== {len(OK)} ok · {len(FAIL)} fail ===")
    if FAIL:
        print("FALLAS: " + ", ".join(FAIL))
        sys.exit(1)


if __name__ == "__main__":
    main()
