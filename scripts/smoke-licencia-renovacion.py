#!/usr/bin/env python3
"""Smoke del LICENCIAMIENTO L4 (renovación challenge-response + linaje rotatorio,
2026-07-05). API compilada en :3403 (no toca el dev server de :3000 ni los
puertos 3401/3402 de los otros smokes de licencia).

Prueba el PoC T6 EN VIVO (clon de VM detectado + respuesta de importación única):

 P)  Activación real (regresión runbook §2): API sin licencia escribe
     solicitud.lreq → `issue` (par DEV) → VALIDA. Con la licencia puesta, la
     app deja/refresca `renovacion.lreq` con el LINAJE local (counter=0 +
     nonce inicializado perezoso, persistido en LicenseInstallation).
 T1) RETROCOMPATIBILIDAD dura: licencia counter=0 sobre instalación que jamás
     renovó ⇒ VALIDA exactamente como L3 (sin rotación).
 T2) CICLO FELIZ: `renew` sobre renovacion.lreq (hereda términos del ledger,
     mismo licenseId, counter presentado+1, atada al nonce presentado) ⇒ la
     API la importa, ROTA el linaje (counter=1 + nonce local FRESCO +
     lastRenewalAt) y queda VALIDA; re-arrancar con la misma licencia sigue
     VALIDA (CURRENT, sin segunda rotación).
 T3) RESPUESTA VIEJA: re-importar la licencia ANTERIOR (counter=0) tras rotar
     ⇒ BLOQUEADA LINEAGE_MISMATCH (mutación 403; lectura sigue — jamás
     secuestro de datos) y el DTO de /license/status no filtra linaje.
 T4) CLON (T6 end-to-end): estado local clonado ANTES de renovar (fila de
     LicenseInstallation + archivos) pide SU renovación con el MISMO linaje ⇒
     el emisor lo ACUSA (CLON DETECTADO, exit ≠ 0, no emite). Con
     --force-duplicate (override humano) emite, queda MARCADO en el ledger, y
     el clon importa/rota — la evidencia quedó registrada.
 T5) LEDGER: entradas type=issue/renewal con linaje presentado; cadena íntegra.

Requiere: infra dev (postgres/redis) arriba y dist compilado (compila si falta).
Custodia/ledger temporales en .license/smoke-renovacion/ — NO toca
~/.lyra-license. El linaje REAL de la BD dev se respalda y RESTAURA al salir
(la licencia del dev server queda intacta)."""
import base64
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
SMOKE_DIR = API_DIR / ".license" / "smoke-renovacion"
HOME_DIR = SMOKE_DIR / "issuer-home"  # custodia/ledger TEMPORALES del smoke
PORT = int(os.environ.get("WL_LIC_PORT", "3403"))
BASE = f"http://localhost:{PORT}/api"
PASS = os.environ.get("WL_DEMO_PASS", "Demo!Pass2026")
ADMIN = "demo@watchlog.local"
DEV_PRIVATE = ROOT / "scripts" / "license" / "dev-keys" / "dev-private.pem"
PG = ["docker", "exec", "lyra-watchlog-dev-postgres-1", "psql", "-U", "watchlog",
      "-d", "watchlog", "-t", "-A"]
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
    """Corre `pnpm license <args>` (cwd de la CLI = packages/licensing-cli ⇒ rutas ABSOLUTAS)."""
    e = {**os.environ, "LYRA_LICENSE_HOME": str(HOME_DIR), **(env or {})}
    return subprocess.run(f"pnpm license {args}", cwd=str(ROOT), env=e,
                          capture_output=True, text=True, shell=True,
                          encoding="utf-8", errors="replace")


def sql(q):
    r = subprocess.run([*PG, "-c", q], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if r.returncode != 0:
        print(f"ABORT: psql falló: {r.stderr.strip()}")
        sys.exit(2)
    return r.stdout.strip()


def lineage_db():
    """(renewalCounter, nonce|None) de la fila single-row de LicenseInstallation."""
    raw = sql('SELECT "renewalCounter" || \'|\' || COALESCE(nonce, \'<NULL>\') '
              'FROM "LicenseInstallation" WHERE id=\'system\'')
    counter, nonce = raw.split("|", 1)
    return int(counter), (None if nonce == "<NULL>" else nonce)


def set_lineage_db(counter, nonce):
    nonce_sql = "NULL" if nonce is None else f"'{nonce}'"
    sql(f'UPDATE "LicenseInstallation" SET "renewalCounter"={counter}, '
        f"nonce={nonce_sql} WHERE id='system'")


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

    # El linaje REAL de la BD dev se respalda y restaura SIEMPRE (la licencia
    # del dev server no debe quedar BLOQUEADA por este smoke).
    saved_counter, saved_nonce = lineage_db()
    print(f"(linaje dev respaldado: counter={saved_counter}; se restaura al salir)")
    set_lineage_db(0, None)  # instalación "recién activada" (estado L3)

    inst_dir = SMOKE_DIR / "instalacion"
    inst_dir.mkdir()
    lic_file = inst_dir / "license.lic"
    act_req = inst_dir / "solicitud.lreq"
    renew_req = inst_dir / "renovacion.lreq"

    try:
        # --- P · activación (regresión del baile de L1/L3) -----------------------
        print("=== P · activación: solicitud.lreq → issue → VALIDA + renovacion.lreq ===")
        api = Api(lic_file, "pendiente")
        try:
            check("P1 la API arranca sin licencia (PENDIENTE_ACTIVACION)", api.wait())
        finally:
            api.stop()
        req = json.loads(act_req.read_text(encoding="utf-8")) if act_req.exists() else {}
        check("P2 solicitud.lreq real (installationId + huella)",
              bool(req.get("installationId")) and bool(req.get("fingerprint")))

        expires = (datetime.now(timezone.utc) + timedelta(days=90)).strftime("%Y-%m-%dT%H:%M:%SZ")
        r = cli(f'issue --request "{act_req}" --customer "Smoke Renovacion" '
                f'--channel-partner SMOKE_L4 --edition professional '
                f'--modules core,logbook,incidents --max-nodes 100000 '
                f'--max-named-users 100000 --expires {expires} '
                f'--private-key "{DEV_PRIVATE}" --out "{lic_file}"')
        check("P3 issue OK (ciclo corto 90d, política runbook §4)",
              r.returncode == 0 and lic_file.exists(),
              (r.stdout or r.stderr)[-300:].strip() if r.returncode != 0 else "")

        # --- T1 · retrocompatibilidad + solicitud de renovación ------------------
        print("\n=== T1 · counter=0 evalúa como L3 y deja renovacion.lreq con el linaje ===")
        api = Api(lic_file, "valida")
        try:
            check("T1a VALIDA con la licencia de activación (retrocompatibilidad counter=0)",
                  api.wait() and "estado=VALIDA" in api.logs())
            check("T1b NO hubo rotación de linaje (jamás renovó)",
                  "linaje rotado" not in api.logs())
            t0 = time.time()
            while not renew_req.exists() and time.time() - t0 < 10:
                time.sleep(0.5)
            rr = json.loads(renew_req.read_text(encoding="utf-8")) if renew_req.exists() else {}
            check("T1c renovacion.lreq escrita junto a la licencia (type=renewal, counter=0)",
                  rr.get("type") == "renewal" and rr.get("renewalCounter") == 0
                  and rr.get("licenseId") and rr.get("nonce"))
            db_counter, db_nonce = lineage_db()
            check("T1d nonce local inicializado y PERSISTIDO (LicenseInstallation)",
                  db_counter == 0 and db_nonce == rr.get("nonce"))
        finally:
            api.stop()

        # CLON: copia byte a byte del estado local ANTES de renovar (como quien
        # clona la VM/BD completa): licencia + solicitud de renovación + linaje.
        clone_dir = SMOKE_DIR / "clon"
        clone_dir.mkdir()
        shutil.copy(lic_file, clone_dir / "license.lic")
        shutil.copy(renew_req, clone_dir / "renovacion.lreq")
        clone_lineage = lineage_db()
        old_lic = SMOKE_DIR / "licencia-vieja.lic"
        shutil.copy(lic_file, old_lic)

        # --- T2 · renovación feliz: counter+1, nonce rotado, importable UNA vez --
        print("\n=== T2 · renew: hereda del ledger, ata el linaje; la API rota e importa ===")
        expires2 = (datetime.now(timezone.utc) + timedelta(days=180)).strftime("%Y-%m-%dT%H:%M:%SZ")
        r = cli(f'renew --request "{renew_req}" --expires {expires2} '
                f'--private-key "{DEV_PRIVATE}" --out "{lic_file}"')
        out = r.stdout + r.stderr
        check("T2a renew OK (sin flags comerciales: hereda del ledger)",
              r.returncode == 0, out[-300:].strip() if r.returncode != 0 else "")
        check("T2b linaje atado: counter 0 → 1 (importable una sola vez)",
              "counter 0 → 1" in out)
        b64 = lic_file.read_text(encoding="utf-8").strip().split(".")[1]
        renewed_payload = json.loads(base64.urlsafe_b64decode(b64 + "=" * (-len(b64) % 4)))
        check("T2c misma licencia (licenseId heredado) y términos intactos",
              renewed_payload.get("licenseId") == rr.get("licenseId")
              and renewed_payload.get("edition") == "professional"
              and renewed_payload.get("renewalCounter") == 1
              and renewed_payload.get("nonce") == rr.get("nonce"))
        api = Api(lic_file, "renovada")
        try:
            check("T2d la API importa la renovación y ROTA el linaje",
                  api.wait() and "linaje rotado (counter 0 → 1)" in api.logs()
                  and "estado=VALIDA" in api.logs())
            db_counter, db_nonce = lineage_db()
            check("T2e linaje local rotado y persistido (counter=1, nonce FRESCO ≠ presentado)",
                  db_counter == 1 and db_nonce is not None and db_nonce != rr.get("nonce"))
            rr2 = json.loads(renew_req.read_text(encoding="utf-8"))
            check("T2f renovacion.lreq refrescada con el linaje ROTADO (counter=1)",
                  rr2.get("renewalCounter") == 1 and rr2.get("nonce") == db_nonce)
            tok = login()
            st, status = call("GET", "/license/status", tok)
            check("T2g GET /license/status = VALIDA",
                  st == 200 and isinstance(status, dict) and status.get("status") == "VALIDA")
        finally:
            api.stop()
        api = Api(lic_file, "renovada-reinicio")
        try:
            check("T2h re-arranque con la MISMA renovada: VALIDA (CURRENT), sin segunda rotación",
                  api.wait() and "estado=VALIDA" in api.logs()
                  and "linaje rotado" not in api.logs())
        finally:
            api.stop()

        # --- T3 · la respuesta VIEJA ya no calza tras rotar -----------------------
        print("\n=== T3 · re-importar la licencia VIEJA (counter=0) ⇒ BLOQUEADA LINEAGE_MISMATCH ===")
        shutil.copy(old_lic, lic_file)
        api = Api(lic_file, "vieja")
        try:
            check("T3a BLOQUEADA con LINEAGE_MISMATCH (ni la anterior ni una re-importación calzan)",
                  api.wait() and "LINEAGE_MISMATCH" in api.logs())
            tok = login()
            check("T3b login sigue (lista blanca auth)", tok is not None)
            st, body = call("POST", "/saved-views", tok,
                            {"module": "LOGBOOK", "name": "x", "config": {}})
            check("T3c mutación 403 (solo lectura + exportación, jamás secuestro)",
                  st == 403 and isinstance(body, dict)
                  and body.get("licenseStatus") == "BLOQUEADA")
            st, views = call("GET", "/saved-views?module=LOGBOOK", tok)
            check("T3d la LECTURA sigue disponible (GET 200)", st == 200)
            st, status = call("GET", "/license/status", tok)
            check("T3e DTO delgado: reason=LINEAGE_MISMATCH y SIN linaje/huella (mínimo privilegio)",
                  st == 200 and isinstance(status, dict)
                  and status.get("reason") == "LINEAGE_MISMATCH"
                  and not (set(status.keys())
                           - {"status", "reason", "edition", "modules", "expiresAt",
                              "daysToExpiry"}))
        finally:
            api.stop()
        # La renovada vigente vuelve: la instalación legítima queda operativa.
        r = cli(f'inspect "{SMOKE_DIR / "licencia-vieja.lic"}" --dev')
        check("T3f la vieja sigue siendo AUTÉNTICA (firma OK) — el candado es el LINAJE, no la firma",
              r.returncode == 0)

        # --- T4 · CLON perfecto: T6 end-to-end ------------------------------------
        print("\n=== T4 · el CLON pide renovar con el MISMO linaje ⇒ el emisor lo ACUSA ===")
        r = cli(f'renew --request "{clone_dir / "renovacion.lreq"}" --expires {expires2} '
                f'--private-key "{DEV_PRIVATE}" --out "{clone_dir / "renovada-clon.lic"}"')
        out = r.stdout + r.stderr
        check("T4a DOS solicitudes con el mismo linaje ⇒ CLON DETECTADO, NO emite (exit ≠ 0)",
              r.returncode != 0 and "CLON DETECTADO" in out, out[-200:].strip())
        check("T4b la evidencia cita la emisión previa del ledger", "ledger #" in out)
        r = cli(f'renew --request "{clone_dir / "renovacion.lreq"}" --expires {expires2} '
                f'--private-key "{DEV_PRIVATE}" --out "{clone_dir / "renovada-clon.lic"}" '
                f'--force-duplicate')
        out = r.stdout + r.stderr
        check("T4c override HUMANO --force-duplicate emite y lo dice a gritos",
              r.returncode == 0 and "force-duplicate" in out)
        # El clon (linaje congelado en el estado clonado) importa la forzada:
        set_lineage_db(clone_lineage[0], clone_lineage[1])
        shutil.copy(clone_dir / "renovada-clon.lic", lic_file)
        api = Api(lic_file, "clon-forzado")
        try:
            check("T4d el clon autorizado importa y rota (la evidencia ya quedó en el ledger)",
                  api.wait() and "estado=VALIDA" in api.logs()
                  and "linaje rotado (counter 0 → 1)" in api.logs())
        finally:
            api.stop()

        # --- T5 · ledger: evidencia contractual -----------------------------------
        print("\n=== T5 · ledger: type/linaje presentado/forzado + cadena íntegra ===")
        entries = [json.loads(line) for line in
                   (HOME_DIR / "ledger.jsonl").read_text(encoding="utf-8").strip().split("\n")]
        renewals = [e for e in entries if e.get("type") == "renewal"]
        check("T5a 1 issue + 2 renewals registradas",
              len(entries) == 3 and entries[0].get("type") == "issue" and len(renewals) == 2)
        check("T5b las renovaciones registran el LINAJE PRESENTADO (evidencia anti-clon)",
              all(e.get("presentedCounter") == 0 and e.get("presentedNonce") for e in renewals))
        check("T5c la forzada quedó MARCADA (forcedDuplicate=true)",
              renewals[-1].get("forcedDuplicate") is True
              and renewals[0].get("forcedDuplicate") is None)
        r = cli("ledger")
        check("T5d cadena de hashes íntegra con los campos nuevos",
              r.returncode == 0 and "íntegra" in (r.stdout + r.stderr))
    finally:
        set_lineage_db(saved_counter, saved_nonce)
        print(f"(linaje dev RESTAURADO: counter={saved_counter})")

    print(f"\nResultado: {len(OK)} PASS / {len(FAIL)} FAIL")
    if FAIL:
        print("Fallidos:", *FAIL, sep="\n  - ")
        sys.exit(1)


if __name__ == "__main__":
    main()
