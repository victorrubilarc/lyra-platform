#!/usr/bin/env python3
"""Smoke del BRANDING RUNTIME (OOBE S3, 2026-07-06).

Reusa el arnés de smoke-licencia-limites.py: levanta la API compilada
(node dist/main.js) en el puerto 3408 — no toca el dev server de :3000 — una
vez por ESCENARIO de licencia (el gate whiteLabel L6d vive en el payload):

 A) Licencia DEV por defecto (whiteLabel:true):
    - GET /api/branding es PÚBLICO y MÍNIMO: exactamente las 5 claves
      presentables; nada de licencia/installationId/huella/versión.
    - El nombre editado en /settings (identidad) se refleja en el branding.
    - Logo: subir PNG válido (PUT multipart, settings:manage) ⇒ servido
      público y cacheable (ETag + 304); SVG / magic bytes falsos / sobre 512KB ⇒ 400;
      anónimo no puede escribir; quitar vuelve a 404.
 B) Licencia --no-white-label (whiteLabel:false): el branding lo refleja.
 C) SIN licencia (PENDIENTE_ACTIVACION): GET /branding sigue vivo (el login se
    co-marca igual) con whiteLabel:false (payload no verificado), y la
    MUTACIÓN de logo se bloquea por L1 (403 LICENSE_RESTRICTED) — una
    instalación restringida no se re-marca, pero jamás deja de leer.

Requiere: infra dev arriba (postgres/redis) y `pnpm build` del API (el script
compila si falta dist). Admin demo demo@watchlog.local / Demo!Pass2026.
Deja la BD dev como estaba (nombre/logo se restauran al final del escenario A).
"""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
API_DIR = ROOT / "apps" / "watchlog-api"
SMOKE_DIR = API_DIR / ".license" / "smoke-branding"
PORT = int(os.environ.get("WL_BRANDING_PORT", "3408"))
BASE = f"http://localhost:{PORT}/api"
PASS = os.environ.get("WL_DEMO_PASS", "Demo!Pass2026")
ADMIN = "demo@watchlog.local"
SMOKE_NAME = "SMOKE Branding SpA"

PNG = b"\x89PNG\r\n\x1a\n" + b"smoke-png-payload" * 4
JPEG = b"\xff\xd8\xff\xe0" + b"jfif-smoke"
SVG = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
FAKE_PNG = b"no soy un png aunque me llamen logo.png"
BIG = b"\x89PNG\r\n\x1a\n" + b"\x00" * (512 * 1024)

OK, FAIL = [], []


def check(name, cond, detail=""):
    (OK if cond else FAIL).append(name)
    print(("  ok  " if cond else "FAIL ") + name + (f"   [{detail}]" if detail else ""))


def call(method, path, tok=None, body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    if tok:
        r.add_header("Authorization", "Bearer " + tok)
    if data is not None:
        r.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        r.add_header(k, v)
    try:
        with urllib.request.urlopen(r) as resp:
            txt = resp.read().decode()
            try:
                return resp.status, (json.loads(txt) if txt else None), dict(resp.headers)
            except Exception:
                return resp.status, txt, dict(resp.headers)
    except urllib.error.HTTPError as e:
        b = e.read().decode()
        try:
            return e.code, json.loads(b), dict(e.headers)
        except Exception:
            return e.code, b, dict(e.headers)
    except urllib.error.URLError:
        return 0, None, {}


def get_raw(path, headers=None):
    """GET binario (logo): status, bytes, headers."""
    r = urllib.request.Request(BASE + path, method="GET")
    for k, v in (headers or {}).items():
        r.add_header(k, v)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, resp.read(), dict(resp.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read(), dict(e.headers)
    except urllib.error.URLError:
        return 0, b"", {}


def upload(method, path, content, filename, tok=None, headers=None):
    """Multipart de un archivo (campo `file`), con o sin Bearer."""
    boundary = uuid.uuid4().hex
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: application/octet-stream\r\n\r\n"
    ).encode() + content + f"\r\n--{boundary}--\r\n".encode()
    r = urllib.request.Request(BASE + path, data=body, method=method)
    r.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    if tok:
        r.add_header("Authorization", "Bearer " + tok)
    for k, v in (headers or {}).items():
        r.add_header(k, v)
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


def login():
    st, r, _ = call("POST", "/auth/login", body={"email": ADMIN, "password": PASS})
    return (r or {}).get("accessToken") if st in (200, 201) else None


def run_cmd(args, env=None):
    e = {**os.environ, **(env or {})}
    return subprocess.run(args, cwd=str(API_DIR), env=e, capture_output=True, text=True, shell=True)


class Api:
    """API en dist/main.js con LICENSE_FILE por escenario (arnés de smoke-licencia.py)."""

    def __init__(self, license_file: Path, tag: str):
        st, _, _ = call("GET", "/health")
        if st != 0:
            print(f"ABORT: el puerto {PORT} ya está ocupado por otro proceso; mátalo y reintenta")
            sys.exit(2)
        self.log_path = SMOKE_DIR / f"api-{tag}.log"
        self.log = open(self.log_path, "w", encoding="utf-8")
        env = {**os.environ, "API_PORT": str(PORT), "LICENSE_FILE": str(license_file)}
        self.proc = subprocess.Popen(
            ["node", "dist/main.js"], cwd=str(API_DIR), env=env,
            stdout=self.log, stderr=subprocess.STDOUT,
        )

    def wait(self, timeout=90):
        t0 = time.time()
        while time.time() - t0 < timeout:
            if "EADDRINUSE" in self.logs():
                return False
            st, _, _ = call("GET", "/health")
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
            st, _, _ = call("GET", "/health")
            if st == 0:
                return
            time.sleep(0.5)
        print(f"ABORT: el puerto {PORT} sigue ocupado tras detener la API")
        sys.exit(2)


def gen_license(target: Path, extra=""):
    r = run_cmd(f"pnpm run license:dev{extra}", env={"LICENSE_FILE": str(target)})
    if r.returncode != 0:
        print(r.stdout[-2000:] or r.stderr[-2000:])
        sys.exit(1)


BRANDING_KEYS = {"companyName", "hasLogo", "logoVersion", "defaultThemeMode", "whiteLabel"}
FORBIDDEN_FRAGMENTS = ("installationId", "fingerprint", "edition", "modules", "licenseId", "status")


def main():
    SMOKE_DIR.mkdir(parents=True, exist_ok=True)
    if not (API_DIR / "dist" / "main.js").exists():
        print("… dist/main.js no existe: compilando API")
        r = run_cmd("pnpm run build")
        if r.returncode != 0:
            print(r.stdout[-2000:] or r.stderr[-2000:])
            sys.exit(1)

    wl_lic = SMOKE_DIR / "whitelabel.lic"
    cobrand_lic = SMOKE_DIR / "cobrand.lic"
    print("… generando licencias DEV (default whiteLabel:true y --no-white-label)")
    gen_license(wl_lic)
    gen_license(cobrand_lic, " -- --no-white-label")

    # --- A · whiteLabel:true — DTO mínimo + identidad + ciclo de vida del logo ---
    print("\n=== A · licencia default (whiteLabel:true) ===")
    prev_name = None
    api = Api(wl_lic, "whitelabel")
    try:
        check("A1 la API arranca (VALIDA)", api.wait())

        st, dto, _ = call("GET", "/branding")
        check("A2 GET /branding es público (sin auth)", st == 200 and isinstance(dto, dict))
        check(
            "A3 el DTO es MÍNIMO: exactamente las 5 claves presentables",
            isinstance(dto, dict) and set(dto.keys()) == BRANDING_KEYS,
            f"claves={sorted(dto.keys()) if isinstance(dto, dict) else dto}",
        )
        raw = json.dumps(dto)
        check(
            "A4 nada de licencia/huella se filtra a anónimos",
            all(frag not in raw for frag in FORBIDDEN_FRAGMENTS),
        )
        check("A5 whiteLabel:true del payload verificado (L6d)", dto.get("whiteLabel") is True)

        tok = login()
        check("A6 login admin demo", tok is not None)

        st, settings, _ = call("GET", "/settings", tok)
        prev_name = (settings or {}).get("companyDisplayName")
        st, _, _ = call("PATCH", "/settings", tok, body={"companyDisplayName": SMOKE_NAME})
        check("A7 PATCH /settings companyDisplayName", st == 200)
        st, dto, _ = call("GET", "/branding")
        check("A8 el nombre se refleja en el branding público", (dto or {}).get("companyName") == SMOKE_NAME)

        # Logo: partir limpio (idempotente aunque la BD dev traiga uno).
        call("DELETE", "/branding/logo", tok)
        st, _, _ = get_raw("/branding/logo")
        check("A9 sin logo ⇒ GET /branding/logo 404", st == 404)

        st, _ = upload("PUT", "/branding/logo", PNG, "logo.png", tok)
        check("A10 subir PNG válido ⇒ 204", st == 204)
        st, dto, _ = call("GET", "/branding")
        check(
            "A11 branding refleja hasLogo + logoVersion",
            (dto or {}).get("hasLogo") is True and bool((dto or {}).get("logoVersion")),
        )
        st, body, hdr = get_raw("/branding/logo")
        etag = hdr.get("etag") or hdr.get("ETag")
        check(
            "A12 logo público: 200 image/png + ETag + cacheable",
            st == 200 and body.startswith(b"\x89PNG") and bool(etag)
            and "max-age" in (hdr.get("cache-control") or hdr.get("Cache-Control") or ""),
        )
        st, _, _ = get_raw("/branding/logo", headers={"If-None-Match": etag or ""})
        check("A13 If-None-Match ⇒ 304 (cache revalida barato)", st == 304)

        st, body = upload("PUT", "/branding/logo", SVG, "logo.svg", tok)
        check(
            "A14 SVG se RECHAZA (XSS) con código legible",
            st == 400 and isinstance(body, dict) and body.get("code") == "BRANDING_LOGO_UNSUPPORTED_TYPE",
        )
        st, body = upload("PUT", "/branding/logo", FAKE_PNG, "logo.png", tok)
        check("A15 magic bytes mandan: 'logo.png' de mentira ⇒ 400", st == 400)
        st, body = upload("PUT", "/branding/logo", BIG, "big.png", tok)
        check(
            "A16 sobre 512KB ⇒ 400 BRANDING_LOGO_TOO_LARGE",
            st == 400 and isinstance(body, dict) and body.get("code") == "BRANDING_LOGO_TOO_LARGE",
        )
        st, dto, _ = call("GET", "/branding")
        check("A17 los rechazos NO tocaron el logo vigente", (dto or {}).get("hasLogo") is True)

        st, _ = upload("PUT", "/branding/logo", JPEG, "logo.jpg", None)
        check("A18 anónimo no puede subir (401)", st == 401)
        st, _, _ = call("DELETE", "/branding/logo")
        check("A19 anónimo no puede quitar (401)", st == 401)

        st, _, _ = call("DELETE", "/branding/logo", tok)
        check("A20 quitar logo ⇒ 204", st == 204)
        st, dto, _ = call("GET", "/branding")
        st2, _, _ = get_raw("/branding/logo")
        check("A21 sin logo de nuevo: hasLogo false + 404", (dto or {}).get("hasLogo") is False and st2 == 404)

        # Restaurar la identidad previa de la BD dev.
        st, _, _ = call("PATCH", "/settings", tok, body={"companyDisplayName": prev_name})
        check("A22 identidad de la BD dev restaurada", st == 200)
    finally:
        api.stop()

    # --- B · whiteLabel:false (--no-white-label) --------------------------------
    print("\n=== B · licencia --no-white-label ⇒ co-branding ===")
    api = Api(cobrand_lic, "cobrand")
    try:
        check("B1 la API arranca (VALIDA)", api.wait())
        st, dto, _ = call("GET", "/branding")
        check("B2 whiteLabel:false en el branding", st == 200 and (dto or {}).get("whiteLabel") is False)
    finally:
        api.stop()

    # --- C · sin licencia (PENDIENTE_ACTIVACION) ---------------------------------
    print("\n=== C · sin licencia ⇒ branding vivo, re-marcado bloqueado ===")
    api = Api(SMOKE_DIR / "no-existe.lic", "pendiente")
    try:
        check("C1 la API arranca (PENDIENTE_ACTIVACION)", api.wait())
        st, dto, _ = call("GET", "/branding")
        check(
            "C2 GET /branding sigue vivo y whiteLabel:false (payload no verificado)",
            st == 200 and (dto or {}).get("whiteLabel") is False,
        )
        tok = login()
        check("C3 login sigue vivo (whitelist L1)", tok is not None)
        st, body = upload("PUT", "/branding/logo", PNG, "logo.png", tok)
        check(
            "C4 mutación de logo bloqueada por L1 (403 LICENSE_RESTRICTED)",
            st == 403 and isinstance(body, dict) and body.get("code") == "LICENSE_RESTRICTED",
        )
    finally:
        api.stop()

    print(f"\nResultado: {len(OK)} ok, {len(FAIL)} fail")
    if FAIL:
        print("Fallidos: " + ", ".join(FAIL))
        sys.exit(1)


if __name__ == "__main__":
    main()
