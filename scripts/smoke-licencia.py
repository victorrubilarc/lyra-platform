#!/usr/bin/env python3
"""Smoke del LICENCIAMIENTO L1 (runtime de la licencia en la API, 2026-07-05).

Levanta la API compilada (node dist/main.js) en el puerto 3401 — no toca el dev
server de :3000 — una vez por ESCENARIO de la máquina de estados y verifica:

 A) Licencia DEV VÁLIDA → estado VALIDA: login + lectura + MUTACIÓN operan;
    POST /notifications/run corre el worker. Además prueba la verificación
    DISTRIBUIDA en vivo: se adultera el archivo EN CALIENTE y el worker (que
    re-verifica la firma desde disco, no el caché del guard) queda en pausa.
 B) SIN archivo → PENDIENTE_ACTIVACION: arranca degradada (jamás crashea);
    login y lectura pasan; la mutación da 403 LICENSE_RESTRICTED; se escribe
    `solicitud.lreq` (installationId + huella) para la ceremonia de activación.
 C) Archivo ADULTERADO (payload editado, firma rota) → BLOQUEADA: mutación 403,
    lectura 200, login 200 (lista blanca de auth).
 D) Licencia VENCIDA pasada la gracia → SOLO_LECTURA: mutación 403 y la
    EXPORTACIÓN sigue permitida (GET /security/audit/export = CSV 200; la
    licencia jamás secuestra datos).
 E) Auditoría: cada arranque registra `license.state.changed` (actor sistema)
    con el estado esperado (verificado por SQL en el Postgres dev).

Requiere: infra dev arriba (postgres/redis), `pnpm build` del API hecho (el
script lo hace si falta dist), licencia dev NO necesaria de antemano (genera
las suyas en .license/smoke/). Admin demo demo@watchlog.local / Demo!Pass2026."""
import base64
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
SMOKE_DIR = API_DIR / ".license" / "smoke"
PORT = int(os.environ.get("WL_LIC_PORT", "3401"))
BASE = f"http://localhost:{PORT}/api"
PASS = os.environ.get("WL_DEMO_PASS", "Demo!Pass2026")
ADMIN = "demo@watchlog.local"
PG = ["docker", "exec", "lyra-watchlog-dev-postgres-1", "psql", "-U", "watchlog", "-d", "watchlog", "-t", "-A"]
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


def sql(q):
    return subprocess.run(PG + ["-c", q], capture_output=True, text=True).stdout.strip()


def login():
    st, r = call("POST", "/auth/login", body={"email": ADMIN, "password": PASS})
    return (r or {}).get("accessToken") if st == 200 or st == 201 else None


def run_cmd(args, env=None):
    e = {**os.environ, **(env or {})}
    return subprocess.run(args, cwd=str(API_DIR), env=e, capture_output=True, text=True, shell=True)


class Api:
    """API en dist/main.js con LICENSE_FILE por escenario. stdout → archivo."""

    def __init__(self, license_file: Path, tag: str):
        # Preflight: si el puerto ya contesta, hay un proceso HUÉRFANO de una
        # corrida anterior y TODOS los checks le pegarían a ese (falsos
        # resultados). Abortar en seco es lo honesto.
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
                return False  # nunca llegó a escuchar: sería otro proceso el que contesta
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
        # En Windows terminate() puede dejar vivo parte del árbol (worker de
        # pino-pretty mantiene el event loop): taskkill /T mata el árbol entero.
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
        # No seguir hasta que el puerto quede LIBRE (evita el EADDRINUSE del
        # siguiente escenario).
        t0 = time.time()
        while time.time() - t0 < 15:
            st, _ = call("GET", "/health")
            if st == 0:
                return
            time.sleep(0.5)
        print(f"ABORT: el puerto {PORT} sigue ocupado tras detener la API")
        sys.exit(2)


def tamper(lic: str) -> str:
    """Edita el payload del JWS (sube los topes) SIN re-firmar: firma rota."""
    h, body, sig = lic.strip().split(".")
    pad = "=" * (-len(body) % 4)
    payload = json.loads(base64.urlsafe_b64decode(body + pad))
    payload["limits"]["maxNamedUsers"] = 999999
    body2 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    return f"{h}.{body2}.{sig}"


def audit_last():
    row = sql("SELECT after->>'status' FROM \"AuditLog\" WHERE action='license.state.changed' ORDER BY \"occurredAt\" DESC LIMIT 1;")
    return row


def main():
    SMOKE_DIR.mkdir(parents=True, exist_ok=True)
    if not (API_DIR / "dist" / "main.js").exists():
        print("… dist/main.js no existe: compilando API")
        r = run_cmd("pnpm run build")
        if r.returncode != 0:
            print(r.stdout[-2000:] or r.stderr[-2000:])
            sys.exit(1)

    valid_lic = SMOKE_DIR / "valida.lic"
    expired_lic = SMOKE_DIR / "vencida.lic"
    print("… generando licencias DEV del smoke (válida y vencida)")
    for target, extra in ((valid_lic, ""), (expired_lic, " -- --expired")):
        r = run_cmd(f"pnpm run license:dev{extra}", env={"LICENSE_FILE": str(target)})
        if r.returncode != 0:
            print(r.stdout[-2000:] or r.stderr[-2000:])
            sys.exit(1)
    tampered_lic = SMOKE_DIR / "adulterada.lic"
    tampered_lic.write_text(tamper(valid_lic.read_text(encoding="utf-8")), encoding="utf-8")

    audits0 = int(sql("SELECT count(*) FROM \"AuditLog\" WHERE action='license.state.changed';") or 0)

    # --- Escenario A · VÁLIDA -------------------------------------------------
    print("\n=== A · licencia VÁLIDA ⇒ opera ===")
    api = Api(valid_lic, "valida")
    try:
        check("A1 la API arranca con licencia válida", api.wait())
        tok = login()
        check("A2 login OK", tok is not None)
        st, _ = call("GET", "/saved-views?module=LOGBOOK", tok)
        check("A3 lectura OK (GET saved-views 200)", st == 200)
        st, view = call("POST", "/saved-views", tok,
                        {"module": "LOGBOOK", "name": "smoke-licencia", "config": {}})
        check("A4 MUTACIÓN permitida (POST saved-views)", st in (200, 201), f"st={st}")
        if isinstance(view, dict) and view.get("id"):
            call("DELETE", f"/saved-views/{view['id']}", tok)
        st, _ = call("POST", "/notifications/run", tok)
        check("A5 worker corre bajo licencia válida (POST run)", st in (200, 201), f"st={st}")
        check("A6 log de arranque nítido (estado=VALIDA)", "estado=VALIDA" in api.logs())
        check("A7 auditoría license.state.changed → VALIDA", audit_last() == "VALIDA")

        # Verificación DISTRIBUIDA en vivo: se adultera el archivo EN CALIENTE.
        # El guard HTTP sigue con el caché (VALIDA), pero el worker re-verifica
        # la firma DESDE DISCO en cada corrida y se pausa de inmediato.
        original = valid_lic.read_text(encoding="utf-8")
        valid_lic.write_text(tamper(original), encoding="utf-8")
        call("POST", "/notifications/run", tok)
        time.sleep(2)  # pino escribe por worker thread; darle un respiro al flush
        check("A8 chequeo distribuido: worker en pausa al adulterar en caliente",
              "procesos de fondo" in api.logs())
        valid_lic.write_text(original, encoding="utf-8")
    finally:
        api.stop()

    # --- Escenario B · SIN ARCHIVO ⇒ PENDIENTE_ACTIVACION ---------------------
    print("\n=== B · sin archivo ⇒ PENDIENTE_ACTIVACION (degradada, jamás crashea) ===")
    pending_dir = SMOKE_DIR / "pendiente"
    pending_dir.mkdir(exist_ok=True)
    req_file = pending_dir / "solicitud.lreq"
    if req_file.exists():
        req_file.unlink()
    api = Api(pending_dir / "license.lic", "pendiente")
    try:
        check("B1 la API ARRANCA sin licencia (no crashea)", api.wait())
        tok = login()
        check("B2 login sigue permitido (lista blanca auth)", tok is not None)
        st, _ = call("GET", "/saved-views?module=LOGBOOK", tok)
        check("B3 lectura permitida", st == 200)
        st, body = call("POST", "/saved-views", tok, {"module": "LOGBOOK", "name": "x", "config": {}})
        check("B4 mutación bloqueada 403", st == 403, f"st={st}")
        check("B5 código LICENSE_RESTRICTED + estado PENDIENTE_ACTIVACION",
              isinstance(body, dict) and body.get("code") == "LICENSE_RESTRICTED"
              and body.get("licenseStatus") == "PENDIENTE_ACTIVACION")
        req = json.loads(req_file.read_text(encoding="utf-8")) if req_file.exists() else {}
        check("B6 solicitud.lreq escrita (installationId + huella)",
              bool(req.get("installationId")) and bool(req.get("fingerprint")))
        check("B7 auditoría → PENDIENTE_ACTIVACION", audit_last() == "PENDIENTE_ACTIVACION")
    finally:
        api.stop()

    # --- Escenario C · ADULTERADA ⇒ BLOQUEADA ---------------------------------
    print("\n=== C · archivo adulterado ⇒ BLOQUEADA (solo lectura) ===")
    api = Api(tampered_lic, "adulterada")
    try:
        check("C1 la API arranca con licencia adulterada (no crashea)", api.wait())
        tok = login()
        check("C2 login permitido", tok is not None)
        st, _ = call("GET", "/saved-views?module=LOGBOOK", tok)
        check("C3 lectura permitida", st == 200)
        st, body = call("POST", "/saved-views", tok, {"module": "LOGBOOK", "name": "x", "config": {}})
        check("C4 mutación bloqueada 403 con estado BLOQUEADA",
              st == 403 and isinstance(body, dict) and body.get("licenseStatus") == "BLOQUEADA")
        check("C5 log acusa firma inválida", "INVALID_SIGNATURE" in api.logs())
        check("C6 auditoría → BLOQUEADA", audit_last() == "BLOQUEADA")
    finally:
        api.stop()

    # --- Escenario D · VENCIDA ⇒ SOLO_LECTURA + exportación viva ---------------
    print("\n=== D · vencida pasada la gracia ⇒ SOLO_LECTURA + exportación viva ===")
    api = Api(expired_lic, "vencida")
    try:
        check("D1 la API arranca con licencia vencida", api.wait())
        tok = login()
        check("D2 login permitido", tok is not None)
        st, body = call("POST", "/saved-views", tok, {"module": "LOGBOOK", "name": "x", "config": {}})
        check("D3 mutación bloqueada 403 con estado SOLO_LECTURA",
              st == 403 and isinstance(body, dict) and body.get("licenseStatus") == "SOLO_LECTURA")
        st, csv = call("GET", "/security/audit/export", tok)
        check("D4 EXPORTACIÓN sigue permitida (audit CSV 200) — jamás se secuestran datos",
              st == 200 and isinstance(csv, str) and len(csv) > 0, f"st={st}")
        st, _ = call("GET", "/saved-views?module=LOGBOOK", tok)
        check("D5 lectura permitida", st == 200)
        check("D6 auditoría → SOLO_LECTURA", audit_last() == "SOLO_LECTURA")
    finally:
        api.stop()

    audits1 = int(sql("SELECT count(*) FROM \"AuditLog\" WHERE action='license.state.changed';") or 0)
    check("E1 cada arranque auditó su estado (4 filas nuevas)", audits1 - audits0 == 4,
          f"{audits0}→{audits1}")

    print(f"\nResultado: {len(OK)} PASS / {len(FAIL)} FAIL")
    if FAIL:
        print("Fallidos:", *FAIL, sep="\n  - ")
        sys.exit(1)


if __name__ == "__main__":
    main()
