#!/usr/bin/env python3
"""Smoke del LICENCIAMIENTO L2 (gating de módulos por entitlement, 2026-07-05).

Reusa el arnés de smoke-licencia.py: levanta la API compilada (node dist/main.js)
en el puerto 3402 — no toca el dev server de :3000 — una vez por ESCENARIO:

 A) Licencia ACOTADA modules=[core,incidents,notifications] (VALIDA):
    - GET /license/status (autenticado, sin permiso) refleja EXACTAMENTE esos
      módulos y NO expone campos sensibles (huella/linaje/installationId/
      licenseId/customer); sin token da 401.
    - Módulo licenciado OPERA: POST /incidents pasa el gate (400 de validación,
      no 403) y POST /notifications/run corre el worker.
    - Módulo NO licenciado: mutaciones 403 {code:MODULE_NOT_LICENSED, module}
      (POST/DELETE de work-orders, templates, structure) pero la LECTURA y la
      exportación SIGUEN disponibles (GET 200) — la licencia jamás secuestra
      datos, ni siquiera por downgrade de edición.
    - `core` nunca se gatea: POST /saved-views opera.
 B) Licencia COMPLETA (todos los módulos): work-orders pasa el gate (400 de
    validación, no 403) y el DTO lista el catálogo completo.
 C) SIN archivo (PENDIENTE_ACTIVACION): GET /license/status da modules=null y
    la mutación de un módulo da 403 LICENSE_RESTRICTED (el estado GLOBAL de L1
    tiene precedencia: NO se enmascara como MODULE_NOT_LICENSED).

Requiere: infra dev arriba (postgres/redis) y `pnpm build` del API (el script
compila si falta dist). Admin demo demo@watchlog.local / Demo!Pass2026."""
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
SMOKE_DIR = API_DIR / ".license" / "smoke-modulos"
PORT = int(os.environ.get("WL_LIC_PORT", "3402"))
BASE = f"http://localhost:{PORT}/api"
PASS = os.environ.get("WL_DEMO_PASS", "Demo!Pass2026")
ADMIN = "demo@watchlog.local"

# Entitlement acotado del escenario A y catálogo completo del B (espejo del
# catálogo canónico de @lyra/contracts).
LIMITED = ["core", "incidents", "notifications"]
FULL = ["core", "structure", "templates", "logbook", "schedules", "incidents",
        "exceptions", "work-orders", "shift-handover", "notifications",
        "themes", "ai", "dashboards"]
# Desde L2b el DTO SÍ trae `limits`, pero como AGREGADO {nodes,namedUsers:{max,inUse}}
# (cupo para el hint web) — jamás el objeto del payload (sin maxInstallations).
SENSITIVE = ["fingerprint", "installationId", "licenseId", "customer",
             "channelPartner", "nonce", "renewalCounter", "whiteLabel"]

OK, FAIL = [], []


def check(name, cond, detail=""):
    (OK if cond else FAIL).append(name)
    print(("  ok  " if cond else "FAIL ") + name + (f"   [{detail}]" if detail else ""))


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


def login():
    st, r = call("POST", "/auth/login", body={"email": ADMIN, "password": PASS})
    return (r or {}).get("accessToken") if st in (200, 201) else None


def run_cmd(args, env=None):
    e = {**os.environ, **(env or {})}
    return subprocess.run(args, cwd=str(API_DIR), env=e, capture_output=True, text=True, shell=True)


class Api:
    """API en dist/main.js con LICENSE_FILE por escenario (arnés de smoke-licencia.py)."""

    def __init__(self, license_file: Path, tag: str):
        st, _ = call("GET", "/health")
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


def is_module_403(st, body, module):
    return st == 403 and isinstance(body, dict) and body.get("code") == "MODULE_NOT_LICENSED" \
        and body.get("module") == module


def main():
    SMOKE_DIR.mkdir(parents=True, exist_ok=True)
    if not (API_DIR / "dist" / "main.js").exists():
        print("… dist/main.js no existe: compilando API")
        r = run_cmd("pnpm run build")
        if r.returncode != 0:
            print(r.stdout[-2000:] or r.stderr[-2000:])
            sys.exit(1)

    limited_lic = SMOKE_DIR / "acotada.lic"
    full_lic = SMOKE_DIR / "completa.lic"
    print("… generando licencias DEV (acotada y completa)")
    for target, extra in ((limited_lic, f" -- --modules={','.join(LIMITED)}"), (full_lic, "")):
        r = run_cmd(f"pnpm run license:dev{extra}", env={"LICENSE_FILE": str(target)})
        if r.returncode != 0:
            print(r.stdout[-2000:] or r.stderr[-2000:])
            sys.exit(1)

    # --- Escenario A · licencia ACOTADA (core+incidents+notifications) --------
    print("\n=== A · licencia ACOTADA ⇒ gate por módulo activo ===")
    api = Api(limited_lic, "acotada")
    try:
        check("A1 la API arranca (VALIDA)", api.wait())
        tok = login()
        check("A2 login OK", tok is not None)

        st, dto = call("GET", "/license/status", tok)
        check("A3 GET /license/status 200", st == 200)
        check("A4 DTO refleja EXACTAMENTE los módulos de la licencia",
              isinstance(dto, dict) and sorted(dto.get("modules") or []) == sorted(LIMITED),
              f"modules={dto.get('modules') if isinstance(dto, dict) else dto}")
        check("A5 DTO: status VALIDA + edition + daysToExpiry presentes",
              isinstance(dto, dict) and dto.get("status") == "VALIDA"
              and dto.get("edition") == "enterprise" and isinstance(dto.get("daysToExpiry"), int))
        leaked = [k for k in SENSITIVE if isinstance(dto, dict) and k in dto]
        check("A6 DTO SIN campos sensibles (huella/linaje/installationId/…)",
              leaked == [], f"filtrados={leaked}")
        # `limits` es el agregado L2b (cupo web), NUNCA el del payload firmado.
        lims = dto.get("limits") if isinstance(dto, dict) else None
        check("A6b limits = agregado {nodes,namedUsers} sin maxInstallations",
              isinstance(lims, dict) and set(lims.keys()) == {"nodes", "namedUsers"}
              and "maxInstallations" not in json.dumps(lims), f"limits={lims}")
        st, _ = call("GET", "/license/status")
        check("A7 /license/status exige autenticación (sin token ⇒ 401)", st == 401, f"st={st}")

        # Módulo LICENCIADO opera: el gate pasa (el 400 es de validación, tras los guards).
        st, _ = call("POST", "/incidents", tok, {})
        check("A8 módulo licenciado (incidents): mutación PASA el gate (400 validación, no 403)",
              st == 400, f"st={st}")
        st, _ = call("POST", "/notifications/run", tok)
        check("A9 módulo licenciado (notifications): worker corre (POST run)", st in (200, 201), f"st={st}")

        # Módulo NO licenciado: mutaciones 403 MODULE_NOT_LICENSED…
        st, body = call("POST", "/work-orders", tok, {})
        check("A10 work-orders NO licenciado: POST 403 MODULE_NOT_LICENSED+module",
              is_module_403(st, body, "work-orders"), f"st={st} body={body}")
        # Ruta DELETE REAL de un módulo no licenciado (las OT no se borran; usa
        # checklist-rules): el guard corre ANTES de resolver el :id ⇒ 403, no 404.
        st, body = call("DELETE", "/work-orders/checklist-rules/no-importa", tok)
        check("A11 work-orders NO licenciado: DELETE también 403 (guard antes del 404)",
              is_module_403(st, body, "work-orders"), f"st={st}")
        st, body = call("POST", "/templates", tok, {})
        check("A12 templates NO licenciado: POST 403 module=templates",
              is_module_403(st, body, "templates"), f"st={st}")
        st, body = call("POST", "/structure/nodes", tok, {})
        check("A13 structure NO licenciado: POST 403 module=structure",
              is_module_403(st, body, "structure"), f"st={st}")

        # …pero la LECTURA y exportación de esos módulos SIGUEN disponibles.
        st, _ = call("GET", "/work-orders", tok)
        check("A14 work-orders NO licenciado: LECTURA sigue disponible (GET 200)", st == 200, f"st={st}")
        st, _ = call("GET", "/templates", tok)
        check("A15 templates NO licenciado: LECTURA sigue disponible (GET 200)", st == 200, f"st={st}")
        st, csv = call("GET", "/security/audit/export?limit=1", tok)
        check("A16 exportación (GET CSV core) intacta", st == 200, f"st={st}")

        # core jamás se gatea.
        st, view = call("POST", "/saved-views", tok,
                        {"module": "LOGBOOK", "name": "smoke-l2", "config": {}})
        check("A17 core (saved-views) NUNCA se gatea: POST opera", st in (200, 201), f"st={st}")
        if isinstance(view, dict) and view.get("id"):
            call("DELETE", f"/saved-views/{view['id']}", tok)
    finally:
        api.stop()

    # --- Escenario B · licencia COMPLETA ⇒ el gate no estorba ------------------
    print("\n=== B · licencia COMPLETA ⇒ todos los módulos operan ===")
    api = Api(full_lic, "completa")
    try:
        check("B1 la API arranca (VALIDA)", api.wait())
        tok = login()
        st, dto = call("GET", "/license/status", tok)
        check("B2 DTO lista el catálogo completo",
              isinstance(dto, dict) and sorted(dto.get("modules") or []) == sorted(FULL))
        st, _ = call("POST", "/work-orders", tok, {})
        check("B3 work-orders licenciado: mutación PASA el gate (400 validación, no 403)",
              st == 400, f"st={st}")
    finally:
        api.stop()

    # --- Escenario C · SIN archivo ⇒ precedencia del estado GLOBAL (L1) --------
    print("\n=== C · sin licencia ⇒ LICENSE_RESTRICTED tiene precedencia ===")
    pending_dir = SMOKE_DIR / "pendiente"
    pending_dir.mkdir(exist_ok=True)
    api = Api(pending_dir / "license.lic", "pendiente")
    try:
        check("C1 la API arranca degradada (PENDIENTE_ACTIVACION)", api.wait())
        tok = login()
        st, dto = call("GET", "/license/status", tok)
        check("C2 DTO: status PENDIENTE_ACTIVACION + modules null (sin payload)",
              st == 200 and isinstance(dto, dict)
              and dto.get("status") == "PENDIENTE_ACTIVACION" and dto.get("modules") is None,
              f"dto={dto}")
        st, body = call("POST", "/work-orders", tok, {})
        check("C3 mutación 403 LICENSE_RESTRICTED (estado global, NO MODULE_NOT_LICENSED)",
              st == 403 and isinstance(body, dict) and body.get("code") == "LICENSE_RESTRICTED",
              f"st={st} code={body.get('code') if isinstance(body, dict) else body}")
    finally:
        api.stop()

    print(f"\n===== RESULTADO: {len(OK)} ok / {len(FAIL)} fail =====")
    if FAIL:
        print("Fallidos: " + ", ".join(FAIL))
        sys.exit(1)


if __name__ == "__main__":
    main()
