#!/usr/bin/env python3
"""Smoke del ASISTENTE DE PRIMER ARRANQUE (OOBE S1/S2, 2026-07-06).

A diferencia de los demás smokes, usa una BD EFÍMERA PROPIA (watchlog_setup_smoke,
creada/migrada/sembrada por este arnés): el flujo exige una instalación VIRGEN
(0 usuarios) y la BD dev compartida jamás lo está. La API compilada corre en el
puerto 3407 (3401–3406 tomados) con LICENSE_FILE en una carpeta limpia ⇒ arranca
en PENDIENTE_ACTIVACION real (prueba la whitelist L1 de verdad).

 A) LOCKOUT (BD fresca): instalación virgen escribe `setup-token` (el log solo
    anuncia la RUTA, jamás el token); sin token y con token inválido los
    endpoints dan 403 SETUP_TOKEN_INVALID; al 5.º intento se bloquea y hasta el
    token VÁLIDO recibe 403 SETUP_TOKEN_LOCKED (fuerza bruta muerta).
 B) CAMINO FELIZ (BD fresca): status→setupRequired; token válido→contexto
    (política + installationId/huella, estado PENDIENTE_ACTIVACION — los POST
    de /setup PASAN el guard L1 en ese estado); descarga de solicitud.lreq;
    import de licencia BASURA rechazado (400, nada se persiste) e import de
    licencia DEV VÁLIDA aceptado (→VALIDA); logo del wizard (OOBE S3): token
    inválido 403, PNG válido 204 y el branding PÚBLICO lo refleja ANTES del
    finalize; finalize con contraseña débil 400; finalize OK crea el admin real
    (+ MFA por rol + settings + paleta), BORRA el setup-token del disco y
    responde {ok}. Después: status=false, contexto 404, re-finalize 404 (no
    duplica), POST /setup/logo 404 (el módulo murió) pero el logo y el nombre
    SOBREVIVEN en /branding, login del admin nuevo OK, y el seed de catálogo NO
    dejó estructura de demo. Reinicio de la API sobre la misma BD:
    no re-emite token ni re-expone el setup. Seed SEED_SCOPE=demo sobre la BD
    efímera: el usuario demo dev sigue naciendo igual (dev intacto).

Requiere: infra dev arriba (postgres/redis del compose dev) y `pnpm build` del
API (dist/main.js). NO toca la BD dev ni el dev server de :3000."""
import json
import os
import re
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
SMOKE_DIR = API_DIR / ".license" / "smoke-setup"
PORT = int(os.environ.get("WL_SETUP_PORT", "3407"))
BASE = f"http://localhost:{PORT}/api"
DB_NAME = "watchlog_setup_smoke"
LICENSE_FILE = SMOKE_DIR / "license.lic"
TOKEN_FILE = SMOKE_DIR / "setup-token"

ADMIN_EMAIL = "smoke-oobe-admin@watchlog.local"
ADMIN_PASS = "Oobe!Setup#2026xy"
DEMO = ("demo@watchlog.local", "Demo!Pass2026")

OK, FAIL = [], []


def check(name, cond, detail=""):
    (OK if cond else FAIL).append(name)
    print(("  ok  " if cond else "FAIL ") + name + (f"   [{detail}]" if detail else ""))


def call(method, path, body=None, token=None, bearer=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    if token is not None:
        r.add_header("x-setup-token", token)
    if bearer is not None:
        r.add_header("Authorization", "Bearer " + bearer)
    if data is not None:
        r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r) as resp:
            txt = resp.read().decode()
            try:
                return resp.status, json.loads(txt) if txt else None
            except Exception:
                return resp.status, txt
    except urllib.error.HTTPError as e:
        b = e.read().decode()
        try:
            return e.code, json.loads(b)
        except Exception:
            return e.code, b
    except urllib.error.URLError:
        return 0, None


def upload_logo(content, filename, token=None):
    """Multipart de un archivo al endpoint token-gated del wizard (OOBE S3)."""
    import uuid

    boundary = uuid.uuid4().hex
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: application/octet-stream\r\n\r\n"
    ).encode() + content + f"\r\n--{boundary}--\r\n".encode()
    r = urllib.request.Request(BASE + "/setup/logo", data=body, method="POST")
    r.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    if token is not None:
        r.add_header("x-setup-token", token)
    try:
        with urllib.request.urlopen(r) as resp:
            txt = resp.read().decode()
            return resp.status, json.loads(txt) if txt else None
    except urllib.error.HTTPError as e:
        b = e.read().decode()
        try:
            return e.code, json.loads(b)
        except Exception:
            return e.code, b
    except urllib.error.URLError:
        return 0, None


def run_cmd(args, env=None, input_text=None):
    e = {**os.environ, **(env or {})}
    return subprocess.run(
        args, cwd=str(API_DIR), env=e, capture_output=True, text=True, shell=True,
        input=input_text, encoding="utf-8", errors="replace",
    )


def read_env_var(name):
    for line in (ROOT / ".env").read_text(encoding="utf-8", errors="replace").splitlines():
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip()
    print(f"ABORT: no encuentro {name} en .env")
    sys.exit(2)


DEV_DB_URL = read_env_var("DATABASE_URL")
EPH_DB_URL = re.sub(r"/[^/?]+(\?|$)", f"/{DB_NAME}\\1", DEV_DB_URL, count=1)
ADMIN_DB_URL = re.sub(r"/[^/?]+(\?|$)", r"/postgres\1", DEV_DB_URL, count=1)


def fresh_db():
    """(Re)crea la BD efímera + migraciones + seed de CATÁLOGO (como el init de prod)."""
    # Una sentencia por llamada: DROP/CREATE DATABASE no pueden correr en la
    # transacción implícita del multi-statement.
    for stmt in (f"DROP DATABASE IF EXISTS {DB_NAME} WITH (FORCE)", f"CREATE DATABASE {DB_NAME}"):
        r = run_cmd(
            f'pnpm exec prisma db execute --url "{ADMIN_DB_URL}" --stdin',
            input_text=stmt,
        )
        if r.returncode != 0:
            print("ABORT: no pude recrear la BD efímera\n" + (r.stderr or r.stdout)[-1500:])
            sys.exit(2)
    r = run_cmd("pnpm exec prisma migrate deploy", env={"DATABASE_URL": EPH_DB_URL})
    if r.returncode != 0:
        print("ABORT: migrate deploy falló\n" + (r.stderr or r.stdout)[-1500:])
        sys.exit(2)
    r = run_cmd(
        "pnpm exec tsx prisma/seed.ts",
        env={"DATABASE_URL": EPH_DB_URL, "SEED_SCOPE": "catalog"},
    )
    if r.returncode != 0:
        print("ABORT: seed de catálogo falló\n" + (r.stderr or r.stdout)[-1500:])
        sys.exit(2)


class Api:
    """API en dist/main.js sobre la BD efímera (arnés de smoke-licencia.py)."""

    def __init__(self, tag: str):
        st, _ = call("GET", "/health")
        if st != 0:
            print(f"ABORT: el puerto {PORT} ya está ocupado; mátalo y reintenta")
            sys.exit(2)
        self.log_path = SMOKE_DIR / f"api-{tag}.log"
        self.log = open(self.log_path, "w", encoding="utf-8")
        env = {
            **os.environ,
            "API_PORT": str(PORT),
            "DATABASE_URL": EPH_DB_URL,
            "LICENSE_FILE": str(LICENSE_FILE),
        }
        self.proc = subprocess.Popen(
            ["node", "dist/main.js"], cwd=str(API_DIR), env=env,
            stdout=self.log, stderr=subprocess.STDOUT,
        )

    def wait(self, timeout=90):
        t0 = time.time()
        while time.time() - t0 < timeout:
            if "EADDRINUSE" in self.logs():
                return False
            st, _ = call("GET", "/health")
            if st == 200 and "escuchando" in self.logs():
                return True
            if self.proc.poll() is not None:
                return False
            time.sleep(1)
        return False

    def logs(self):
        self.log.flush()
        return self.log_path.read_text(encoding="utf-8", errors="replace")

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
        t0 = time.time()
        while time.time() - t0 < 15:
            st, _ = call("GET", "/health")
            if st == 0:
                return
            time.sleep(0.5)
        print(f"ABORT: el puerto {PORT} sigue ocupado tras detener la API")
        sys.exit(2)


def gen_license(target: Path):
    r = run_cmd("pnpm run license:dev", env={"LICENSE_FILE": str(target)})
    if r.returncode != 0:
        print("ABORT: no pude generar la licencia dev\n" + (r.stdout or r.stderr)[-1500:])
        sys.exit(1)


def clean_smoke_dir():
    SMOKE_DIR.mkdir(parents=True, exist_ok=True)
    for f in (LICENSE_FILE, TOKEN_FILE, SMOKE_DIR / "solicitud.lreq", SMOKE_DIR / "renovacion.lreq"):
        if f.exists():
            f.unlink()


def main():
    if not (API_DIR / "dist" / "main.js").exists():
        print("ABORT: falta apps/watchlog-api/dist/main.js — corre `pnpm build` primero")
        sys.exit(2)

    # ── Escenario A: lockout de fuerza bruta del token ────────────────────────
    print("· Escenario A: instalación virgen + lockout del token")
    clean_smoke_dir()
    fresh_db()
    api = Api("lockout")
    if not api.wait():
        print(api.logs()[-3000:])
        print("ABORT: la API no arrancó (escenario A)")
        sys.exit(2)
    try:
        st, body = call("GET", "/setup/status")
        check("A1 instalación virgen: setupRequired=true", st == 200 and body == {"setupRequired": True})
        check("A2 el arranque escribió setup-token", TOKEN_FILE.exists())
        token = TOKEN_FILE.read_text(encoding="utf-8").strip()
        logs = api.logs()
        check("A3 el log anuncia la RUTA del token, no el token", "setup-token" in logs and token not in logs)
        st, body = call("GET", "/setup/context")
        check("A4 sin token: 403 SETUP_TOKEN_INVALID", st == 403 and (body or {}).get("code") == "SETUP_TOKEN_INVALID")
        for _ in range(4):
            st, body = call("GET", "/setup/context", token="token-basura")
        check("A5 intentos inválidos: 403 SETUP_TOKEN_INVALID", st == 403 and (body or {}).get("code") == "SETUP_TOKEN_INVALID")
        st, body = call("GET", "/setup/context", token=token)
        check("A6 bloqueado: hasta el token VÁLIDO da 403 SETUP_TOKEN_LOCKED",
              st == 403 and (body or {}).get("code") == "SETUP_TOKEN_LOCKED")
        st, body = call("POST", "/setup/finalize", token=token, body={
            "admin": {"email": ADMIN_EMAIL, "displayName": "X", "password": ADMIN_PASS}})
        check("A7 bloqueado: finalize también 403", st == 403 and (body or {}).get("code") == "SETUP_TOKEN_LOCKED")
    finally:
        api.stop()

    # ── Escenario B: camino feliz completo ────────────────────────────────────
    print("· Escenario B: camino feliz (token → licencia → finalize → muere)")
    clean_smoke_dir()
    fresh_db()
    api = Api("feliz")
    if not api.wait():
        print(api.logs()[-3000:])
        print("ABORT: la API no arrancó (escenario B)")
        sys.exit(2)
    try:
        token = TOKEN_FILE.read_text(encoding="utf-8").strip()

        # El guard L1 está activo (PENDIENTE_ACTIVACION) y aún así /setup opera.
        st, body = call("POST", "/log-entries", token=token, body={})
        check("B1 PENDIENTE_ACTIVACION: mutación normal bloqueada (guard L1 vivo)",
              st in (401, 403), f"st={st}")
        st, ctx = call("GET", "/setup/context", token=token)
        check("B2 contexto con token válido (whitelist L1: /setup opera en PENDIENTE_ACTIVACION)",
              st == 200 and (ctx or {}).get("license", {}).get("status") == "PENDIENTE_ACTIVACION")
        check("B3 contexto trae política + installationId + huella",
              bool((ctx or {}).get("passwordPolicy", {}).get("minLength"))
              and bool((ctx or {}).get("license", {}).get("installationId"))
              and bool((ctx or {}).get("license", {}).get("fingerprint")))

        st, req = call("GET", "/setup/license-request", token=token)
        ok_req = st == 200 and isinstance(req, (dict, str))
        if ok_req and isinstance(req, str):
            req = json.loads(req)
        check("B4 descarga de solicitud.lreq con installationId",
              ok_req and req.get("installationId") == ctx["license"]["installationId"])

        st, body = call("POST", "/setup/license", token=token, body={"content": "no-es-una-licencia"})
        check("B5 licencia BASURA rechazada (400, nada se persiste)",
              st == 400 and not LICENSE_FILE.exists())

        tmp_lic = SMOKE_DIR / "license-emitida.lic"
        gen_license(tmp_lic)
        st, body = call("POST", "/setup/license", token=token,
                        body={"content": tmp_lic.read_text(encoding="utf-8")})
        check("B6 licencia dev VÁLIDA importada desde el wizard → VALIDA",
              st == 200 and (body or {}).get("status") == "VALIDA" and LICENSE_FILE.exists())

        # Logo del wizard (OOBE S3): mismo validador que /configuracion, candado = token.
        png = b"\x89PNG\r\n\x1a\n" + b"logo-oobe-smoke" * 3
        st, _ = upload_logo(png, "logo.png", token="token-invalido")
        check("B6b logo con token inválido: 403", st == 403)
        st, _ = upload_logo(png, "logo.png", token=token)
        check("B6c logo del wizard subido (204, validación de branding)", st == 204)
        st, body = call("GET", "/branding")
        check("B6d el branding PÚBLICO refleja el logo antes del finalize",
              st == 200 and (body or {}).get("hasLogo") is True)

        st, body = call("POST", "/setup/finalize", token=token, body={
            "admin": {"email": ADMIN_EMAIL, "displayName": "Admin OOBE", "password": "corta"}})
        check("B7 contraseña débil: 400 de la política", st == 400)

        st, body = call("POST", "/setup/finalize", token=token, body={
            "admin": {"email": ADMIN_EMAIL, "displayName": "Admin OOBE", "password": ADMIN_PASS},
            "requireMfaForAdmins": False,
            "identity": {"companyDisplayName": "Empresa Smoke OOBE", "timezone": "America/Santiago", "locale": "es-CL"},
            # presetId se OMITE (el contrato es .optional(), null se rechaza — igual que la web).
            "appearance": {"themeMode": "dark"},
        })
        check("B8 finalize atómico OK", st == 200 and (body or {}).get("ok") is True
              and (body or {}).get("adminEmail") == ADMIN_EMAIL)
        check("B9 el setup-token murió del disco", not TOKEN_FILE.exists())

        st, body = call("GET", "/setup/status")
        check("B10 status ahora setupRequired=false", st == 200 and body == {"setupRequired": False})
        st, _ = call("GET", "/setup/context", token=token)
        check("B11 contexto tras completar: 404 (no revela que existió)", st == 404)
        st, _ = call("POST", "/setup/finalize", token=token, body={
            "admin": {"email": "otro@watchlog.local", "displayName": "X", "password": ADMIN_PASS}})
        check("B12 re-finalize: 404, no duplica admins", st == 404)
        st, _ = upload_logo(png, "logo.png", token=token)
        check("B12b logo tras completar: 404 (el módulo murió)", st == 404)
        st, body = call("GET", "/branding")
        check("B12c nombre y logo SOBREVIVEN al finalize en el branding público",
              st == 200 and (body or {}).get("companyName") == "Empresa Smoke OOBE"
              and (body or {}).get("hasLogo") is True)

        st, body = call("POST", "/auth/login", body={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
        tok = (body or {}).get("accessToken") if st in (200, 201) else None
        check("B13 el admin recién creado entra al sistema", tok is not None)
        st, nodes = call("GET", "/structure/nodes", bearer=tok)
        check("B14 seed de catálogo NO sembró estructura de demo",
              st == 200 and isinstance(nodes, list) and len(nodes) == 0, f"st={st} n={len(nodes) if isinstance(nodes, list) else '?'}")
    finally:
        api.stop()

    # ── Escenario B2: reinicio sobre la MISMA BD (instalación con usuarios) ───
    print("· Escenario B2: reinicio — instalación con usuarios jamás re-expone el setup")
    api = Api("reinicio")
    if not api.wait():
        print(api.logs()[-3000:])
        print("ABORT: la API no arrancó (escenario B2)")
        sys.exit(2)
    try:
        st, body = call("GET", "/setup/status")
        check("C1 tras reinicio: setupRequired=false", st == 200 and body == {"setupRequired": False})
        check("C2 tras reinicio: NO se re-emite setup-token", not TOKEN_FILE.exists())

        # El seed DEMO sigue creando el usuario demo igual que siempre (dev intacto).
        r = run_cmd("pnpm exec tsx prisma/seed.ts", env={"DATABASE_URL": EPH_DB_URL, "SEED_SCOPE": "demo"})
        check("C3 seed SEED_SCOPE=demo corre en verde", r.returncode == 0, (r.stderr or "")[-300:])
        st, body = call("POST", "/auth/login", body={"email": DEMO[0], "password": DEMO[1]})
        check("C4 login del usuario demo (dev) sigue intacto", st in (200, 201) and bool((body or {}).get("accessToken")))
    finally:
        api.stop()

    print(f"\nResultado: {len(OK)} ok, {len(FAIL)} fail")
    if FAIL:
        print("Fallidos: " + ", ".join(FAIL))
        sys.exit(2)


if __name__ == "__main__":
    main()
