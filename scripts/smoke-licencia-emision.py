#!/usr/bin/env python3
"""Smoke del LICENCIAMIENTO L3 (CLI de emisión `lyra-license`, 2026-07-05).

Prueba la CADENA DE CONFIANZA de punta a punta con la API compilada en :3402
(no toca el dev server de :3000):

 P) Ceremonia real (runbook §2 Fase B): la API arranca SIN licencia y escribe
    `solicitud.lreq` (installationId + huella) — el insumo de la emisión.
 K) `lyra-license keygen` en un home temporal: la privada queda PKCS#8 CIFRADA
    (ilegible sin passphrase) y la pública SPKI lista para embeber.
 T1) `lyra-license issue` sobre la solicitud REAL firmando con el par DEV (la
    pública que embebe este build) → la API arranca VALIDA y OPERA (login +
    mutación + GET /license/status).
 T2) KEYGEN DEL ATACANTE end-to-end (la T3 del PoC, ahora en vivo): la MISMA
    solicitud firmada con la privada del keygen temporal (≠ pública embebida)
    → la API la BLOQUEA (INVALID_SIGNATURE, mutación 403, solo lectura).
 T3) `lyra-license inspect`: acepta la licencia legítima (VALIDA) y rechaza la
    forjada contra la pública DEV (exit ≠ 0, FIRMA INVÁLIDA).
 T4) `lyra-license ledger`: registró ambas emisiones y la cadena de hashes
    verifica íntegra.

Requiere: infra dev (postgres/redis) arriba y `pnpm build` hecho (compila si
falta). El ledger/keys del smoke viven en .license/smoke-emision/ (gitignoreado)
con LYRA_LICENSE_HOME temporal — NO toca la custodia real (~/.lyra-license)."""
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
API_DIR = ROOT / "apps" / "watchlog-api"
SMOKE_DIR = API_DIR / ".license" / "smoke-emision"
HOME_DIR = SMOKE_DIR / "issuer-home"  # custodia TEMPORAL del smoke
PORT = int(os.environ.get("WL_LIC_PORT", "3402"))
BASE = f"http://localhost:{PORT}/api"
PASS = os.environ.get("WL_DEMO_PASS", "Demo!Pass2026")
ADMIN = "demo@watchlog.local"
SMOKE_PASSPHRASE = "smoke-emision-passphrase-l3"
DEV_PRIVATE = ROOT / "scripts" / "license" / "dev-keys" / "dev-private.pem"
DEV_PUBLIC = ROOT / "scripts" / "license" / "dev-keys" / "dev-public.pem"
ALL_MODULES = ("core,structure,templates,logbook,schedules,incidents,exceptions,"
               "work-orders,shift-handover,notifications,themes,ai,dashboards")
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


def cli(args, env=None):
    """Corre `pnpm license <args>` (la CLI del emisor) desde la raíz del repo."""
    e = {**os.environ, "LYRA_LICENSE_HOME": str(HOME_DIR), **(env or {})}
    return subprocess.run(f"pnpm license {args}", cwd=str(ROOT), env=e,
                          capture_output=True, text=True, shell=True,
                          encoding="utf-8", errors="replace")


class Api:
    """API en dist/main.js con LICENSE_FILE por escenario. stdout → archivo."""

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
            subprocess.run(["taskkill", "/PID", str(self.proc.pid), "/T", "/F"],
                           capture_output=True)
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


def main():
    if SMOKE_DIR.exists():
        shutil.rmtree(SMOKE_DIR)
    SMOKE_DIR.mkdir(parents=True)
    if not (API_DIR / "dist" / "main.js").exists():
        print("… dist/main.js no existe: compilando API")
        r = subprocess.run("pnpm run build", cwd=str(API_DIR), capture_output=True,
                           text=True, shell=True)
        if r.returncode != 0:
            print(r.stdout[-2000:] or r.stderr[-2000:])
            sys.exit(1)

    # --- P · ceremonia: la instalación genera su solicitud.lreq -----------------
    print("=== P · la API sin licencia escribe solicitud.lreq (challenge real) ===")
    pending_dir = SMOKE_DIR / "instalacion"
    pending_dir.mkdir()
    req_file = pending_dir / "solicitud.lreq"
    api = Api(pending_dir / "license.lic", "pendiente")
    try:
        check("P1 la API arranca sin licencia (PENDIENTE_ACTIVACION)", api.wait())
    finally:
        api.stop()
    req = json.loads(req_file.read_text(encoding="utf-8")) if req_file.exists() else {}
    check("P2 solicitud.lreq real (installationId + huella)",
          bool(req.get("installationId")) and bool(req.get("fingerprint")))

    # --- K · keygen: privada CIFRADA en la custodia temporal --------------------
    print("\n=== K · lyra-license keygen (custodia temporal del smoke) ===")
    r = cli("keygen", env={"LYRA_LICENSE_PASSPHRASE": SMOKE_PASSPHRASE})
    check("K1 keygen OK", r.returncode == 0, (r.stdout or r.stderr)[-200:].strip())
    priv = (HOME_DIR / "prod-private.enc.pem")
    check("K2 la privada quedó PKCS#8 CIFRADA (jamás en claro)",
          priv.exists() and "ENCRYPTED PRIVATE KEY" in priv.read_text(encoding="utf-8"))
    check("K3 la pública SPKI existe y es distinta de la DEV",
          (HOME_DIR / "prod-public.pem").exists()
          and (HOME_DIR / "prod-public.pem").read_text(encoding="utf-8").strip()
          != DEV_PUBLIC.read_text(encoding="utf-8").strip())

    expires = (datetime.now(timezone.utc) + timedelta(days=730)).strftime("%Y-%m-%dT%H:%M:%SZ")
    common = (f'--request "{req_file}" --customer "Smoke Emision" --channel-partner SMOKE '
              f'--edition enterprise --modules {ALL_MODULES} --max-nodes 100000 '
              f'--max-named-users 100000 --expires {expires}')

    # --- T1 · issue con el par DEV (la pública embebida en este build) ⇒ VALIDA -
    print("\n=== T1 · issue (par DEV = pública embebida) ⇒ la API opera VALIDA ===")
    legit_lic = SMOKE_DIR / "legitima.lic"
    r = cli(f'issue {common} --private-key "{DEV_PRIVATE}" --out "{legit_lic}"')
    check("T1a issue OK con la solicitud real", r.returncode == 0 and legit_lic.exists(),
          (r.stdout or r.stderr)[-300:].strip() if r.returncode != 0 else "")
    api = Api(legit_lic, "legitima")
    try:
        check("T1b la API arranca VALIDA con la licencia emitida", api.wait()
              and "estado=VALIDA" in api.logs())
        tok = login()
        check("T1c login OK", tok is not None)
        st, view = call("POST", "/saved-views", tok,
                        {"module": "LOGBOOK", "name": "smoke-emision", "config": {}})
        check("T1d MUTACIÓN permitida (opera de verdad)", st in (200, 201), f"st={st}")
        if isinstance(view, dict) and view.get("id"):
            call("DELETE", f"/saved-views/{view['id']}", tok)
        st, status = call("GET", "/license/status", tok)
        check("T1e GET /license/status = VALIDA",
              st == 200 and isinstance(status, dict) and status.get("status") == "VALIDA")
    finally:
        api.stop()

    # --- T2 · keygen del ATACANTE end-to-end ⇒ BLOQUEADA -------------------------
    print("\n=== T2 · misma solicitud firmada con OTRA privada ⇒ BLOQUEADA (T3 del PoC en vivo) ===")
    forged_lic = SMOKE_DIR / "forjada.lic"
    r = cli(f'issue {common} --out "{forged_lic}"',
            env={"LYRA_LICENSE_PASSPHRASE": SMOKE_PASSPHRASE})
    check("T2a el atacante PUEDE emitir con su propia clave (la firma no es el candado…)",
          r.returncode == 0 and forged_lic.exists(),
          (r.stdout or r.stderr)[-300:].strip() if r.returncode != 0 else "")
    api = Api(forged_lic, "forjada")
    try:
        check("T2b …pero el producto la BLOQUEA (pública embebida ≠ keygen pirata)",
              api.wait() and "INVALID_SIGNATURE" in api.logs())
        tok = login()
        check("T2c login sigue (lista blanca auth)", tok is not None)
        st, body = call("POST", "/saved-views", tok, {"module": "LOGBOOK", "name": "x", "config": {}})
        check("T2d mutación 403 BLOQUEADA (solo lectura, jamás secuestro)",
              st == 403 and isinstance(body, dict) and body.get("licenseStatus") == "BLOQUEADA")
    finally:
        api.stop()

    # --- T3 · inspect (QA del emisor) --------------------------------------------
    print("\n=== T3 · lyra-license inspect ===")
    r = cli(f'inspect "{legit_lic}" --dev --request "{req_file}"')
    check("T3a inspect acepta la legítima (VALIDA contra huella de la solicitud)",
          r.returncode == 0 and "VALIDA" in r.stdout)
    r = cli(f'inspect "{forged_lic}" --dev')
    check("T3b inspect rechaza la forjada contra la pública DEV (firma inválida)",
          r.returncode != 0 and "INVALID_SIGNATURE" in (r.stdout + r.stderr))

    # --- T4 · ledger --------------------------------------------------------------
    print("\n=== T4 · ledger append-only con cadena de hashes ===")
    r = cli("ledger")
    out = r.stdout + r.stderr
    check("T4a registró las 2 emisiones del smoke", out.count("Smoke Emision") == 2, out[-200:].strip())
    check("T4b resumen por socio (SMOKE: 2)", "SMOKE: 2" in out)
    check("T4c cadena de hashes íntegra", r.returncode == 0 and "íntegra" in out)
    ledger_file = HOME_DIR / "ledger.jsonl"
    lines = ledger_file.read_text(encoding="utf-8").strip().split("\n")
    lines[0] = lines[0].replace('"customer":"Smoke Emision"', '"customer":"Hackeado"')
    ledger_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
    r = cli("ledger")
    check("T4d un ledger ADULTERADO no pasa piola (cadena rota, exit ≠ 0)",
          r.returncode != 0 and "CADENA ROTA" in (r.stdout + r.stderr))

    print(f"\nResultado: {len(OK)} PASS / {len(FAIL)} FAIL")
    if FAIL:
        print("Fallidos:", *FAIL, sep="\n  - ")
        sys.exit(1)


if __name__ == "__main__":
    main()
