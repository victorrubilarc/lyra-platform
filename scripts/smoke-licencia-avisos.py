#!/usr/bin/env python3
"""Smoke del LICENCIAMIENTO L6 (UI de estado + avisos por el Bloque N, 2026-07-06).

Reusa el arnés de smoke-licencia.py: levanta la API compilada (node dist/main.js)
en el puerto 3404 — no toca el dev server de :3000 — una vez por ESCENARIO:

 A) POR_VENCER (vence en 10 días): el DTO delgado trae daysToExpiry y NO
    graceDaysRemaining; el worker encola `license.expiring` (cadencia SEMANAL:
    re-ejecutar el worker NO duplica) y el aviso INAPP llega a la campanita del
    ADMIN (rol con settings:manage) pero NO a un usuario sin ese criterio.
    También queda la fila EMAIL en la bandeja (SUPPRESSED si el SMTP dev está
    apagado). El deep link apunta a LicenseInstallation/"system" (jamás viaja
    el installationId real).
 B) EN_GRACIA (venció hace 5 días, gracia 14): DTO con graceDaysRemaining=9
    (decisión L6a: "renovar en X días") y aviso `license.expiring` diario.
 C) SOLO_LECTURA (--expired) — EL CARVE-OUT: POST /notifications/run está
    bloqueado por el guard L1 (403 LICENSE_RESTRICTED, correcto), pero los
    CRONES del worker procesan los eventos `license.*` igual — la licencia
    restringida NO silencia su propia alarma. Se espera el aviso
    `license.restricted` en la campanita del admin vía cron (≤ ~150 s).
 D) VALIDA: cero eventos license.* (sin banner, sin avisos, sin spam).

Requiere: infra dev arriba (postgres/redis), `pnpm build` del API y el seed
aplicado (plantillas license.*). Admin demo demo@watchlog.local / Demo!Pass2026."""
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
SMOKE_DIR = API_DIR / ".license" / "smoke-avisos"
PORT = int(os.environ.get("WL_LIC_PORT", "3404"))
BASE = f"http://localhost:{PORT}/api"
PASS = os.environ.get("WL_DEMO_PASS", "Demo!Pass2026")
ADMIN = "demo@watchlog.local"
PLAIN_USER = "smoke-l6@watchlog.local"
PLAIN_USER_ID = "smoke_l6_user"
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


def login(email=ADMIN):
    st, r = call("POST", "/auth/login", body={"email": email, "password": PASS})
    return (r or {}).get("accessToken") if st in (200, 201) else None


def run_cmd(args, env=None):
    e = {**os.environ, **(env or {})}
    return subprocess.run(args, cwd=str(API_DIR), env=e, capture_output=True,
                          text=True, shell=True, encoding="utf-8", errors="replace")


def sql(q):
    r = subprocess.run([*PG, "-c", q], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if r.returncode != 0:
        print(f"ABORT: psql falló: {r.stderr.strip()}")
        sys.exit(2)
    return r.stdout.strip()


def clean_license_notifications():
    """Borra eventos/bandeja license.* (las dedupeKeys son por semana/día: sin
    esto el smoke no sería re-ejecutable el mismo día)."""
    sql("DELETE FROM \"NotificationOutbox\" WHERE \"eventKey\" LIKE 'license.%'")
    sql("DELETE FROM \"NotificationEvent\" WHERE \"eventKey\" LIKE 'license.%'")


def license_inbox_items(tok):
    st, body = call("GET", "/notifications/inbox?limit=50", tok)
    if st != 200 or not isinstance(body, dict):
        return None
    return [i for i in body.get("items", []) if str(i.get("eventKey", "")).startswith("license.")]


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


def ensure_plain_user():
    """Usuario temporal SIN roles (⇒ sin settings:manage): copia el hash del demo
    DENTRO de SQL (patrón smoke-incidencias-dashboard) para poder loguearse."""
    sql(f"DELETE FROM \"NotificationOutbox\" WHERE \"recipientUserId\" = '{PLAIN_USER_ID}'")
    sql(f"DELETE FROM \"User\" WHERE id = '{PLAIN_USER_ID}'")
    sql(
        "INSERT INTO \"User\" (id, email, \"displayName\", \"passwordHash\", status, \"updatedAt\") "
        f"SELECT '{PLAIN_USER_ID}', '{PLAIN_USER}', 'Smoke L6 (sin rol)', \"passwordHash\", 'ACTIVE', now() "
        f"FROM \"User\" WHERE email = '{ADMIN}'"
    )


def drop_plain_user():
    sql(f"DELETE FROM \"NotificationOutbox\" WHERE \"recipientUserId\" = '{PLAIN_USER_ID}'")
    sql(f"DELETE FROM \"User\" WHERE id = '{PLAIN_USER_ID}'")


def main():
    SMOKE_DIR.mkdir(parents=True, exist_ok=True)
    if not (API_DIR / "dist" / "main.js").exists():
        print("… dist/main.js no existe: compilando API")
        r = run_cmd("pnpm run build")
        if r.returncode != 0:
            print(r.stdout[-2000:] or r.stderr[-2000:])
            sys.exit(1)

    licenses = {
        "por_vencer": (SMOKE_DIR / "por_vencer.lic", " -- --expires-in-days=10"),
        "gracia": (SMOKE_DIR / "gracia.lic", " -- --expires-in-days=-5"),
        "vencida": (SMOKE_DIR / "vencida.lic", " -- --expired"),
        "valida": (SMOKE_DIR / "valida.lic", ""),
    }
    print("… generando licencias DEV (por vencer / en gracia / vencida / válida)")
    for _tag, (target, extra) in licenses.items():
        r = run_cmd(f"pnpm run license:dev{extra}", env={"LICENSE_FILE": str(target)})
        if r.returncode != 0:
            print(r.stdout[-2000:] or r.stderr[-2000:])
            sys.exit(1)

    ensure_plain_user()
    try:
        # --- Escenario A · POR_VENCER ⇒ aviso semanal SOLO a admins ------------
        print("\n=== A · POR_VENCER ⇒ DTO correcto + license.expiring al admin ===")
        clean_license_notifications()
        api = Api(licenses["por_vencer"][0], "por-vencer")
        try:
            check("A1 la API arranca (POR_VENCER no restringe)", api.wait())
            tok = login()
            check("A2 login admin OK", tok is not None)

            st, dto = call("GET", "/license/status", tok)
            check("A3 DTO: status POR_VENCER con daysToExpiry ≤ 10",
                  st == 200 and isinstance(dto, dict) and dto.get("status") == "POR_VENCER"
                  and isinstance(dto.get("daysToExpiry"), int) and dto["daysToExpiry"] <= 10,
                  f"dto={dto}")
            check("A4 DTO: graceDaysRemaining NO viaja fuera de EN_GRACIA",
                  isinstance(dto, dict) and "graceDaysRemaining" not in dto)

            st, _ = call("POST", "/notifications/run", tok)
            check("A5 worker corre (POR_VENCER no bloquea mutaciones)", st in (200, 201), f"st={st}")
            items = license_inbox_items(tok)
            check("A6 campanita del admin: llega license.expiring (INAPP)",
                  items is not None and any(i["eventKey"] == "license.expiring" for i in items),
                  f"items={[i['eventKey'] for i in (items or [])]}")
            exp = next((i for i in (items or []) if i["eventKey"] == "license.expiring"), {})
            check("A7 el asunto viene RENDERIZADO de la plantilla seed (habla de renovación)",
                  "renovaci" in exp.get("subject", "").lower(), f"subject={exp.get('subject')}")
            check("A8 deep link a LicenseInstallation/'system' (el installationId real NO viaja)",
                  exp.get("relatedEntityType") == "LicenseInstallation"
                  and exp.get("relatedEntityId") == "system",
                  f"related={exp.get('relatedEntityType')}/{exp.get('relatedEntityId')}")

            before = len(items or [])
            call("POST", "/notifications/run", tok)
            after = len(license_inbox_items(tok) or [])
            check("A9 re-ejecutar NO duplica (cadencia SEMANAL por dedupeKey)",
                  after == before, f"antes={before} después={after}")

            plain_tok = login(PLAIN_USER)
            check("A10 login usuario SIN rol OK", plain_tok is not None)
            plain_items = license_inbox_items(plain_tok)
            check("A11 usuario sin settings:manage NO recibe el aviso",
                  plain_items == [], f"items={plain_items}")

            email_rows = sql("SELECT count(*) FROM \"NotificationOutbox\" "
                             "WHERE \"eventKey\" LIKE 'license.%' AND channel = 'EMAIL'")
            check("A12 también quedó la fila EMAIL en la bandeja (multi-canal)",
                  email_rows.isdigit() and int(email_rows) >= 1, f"filas={email_rows}")
        finally:
            api.stop()

        # --- Escenario B · EN_GRACIA ⇒ graceDaysRemaining + aviso diario --------
        print("\n=== B · EN_GRACIA ⇒ graceDaysRemaining=9 + license.expiring diario ===")
        clean_license_notifications()
        api = Api(licenses["gracia"][0], "gracia")
        try:
            check("B1 la API arranca (EN_GRACIA no restringe: no se deja la planta a ciegas)", api.wait())
            tok = login()
            st, dto = call("GET", "/license/status", tok)
            # daysToExpiry usa floor: al evaluar SEGUNDOS después de "hace 5 días"
            # ya da -6 ⇒ gracia restante 8 (conservador, correcto). Se afirma la
            # ARITMÉTICA (grace = 14 + daysToExpiry), no un instante exacto.
            check("B2 DTO: EN_GRACIA con graceDaysRemaining = 14 + daysToExpiry (renovar en X días)",
                  st == 200 and isinstance(dto, dict) and dto.get("status") == "EN_GRACIA"
                  and dto.get("daysToExpiry") in (-5, -6)
                  and dto.get("graceDaysRemaining") == 14 + dto["daysToExpiry"],
                  f"dto={dto}")
            st, _ = call("POST", "/notifications/run", tok)
            check("B3 worker corre (EN_GRACIA sigue operando)", st in (200, 201), f"st={st}")
            items = license_inbox_items(tok)
            check("B4 campanita del admin: license.expiring por la gracia",
                  items is not None and any(i["eventKey"] == "license.expiring" for i in items))
        finally:
            api.stop()

        # --- Escenario C · SOLO_LECTURA ⇒ EL CARVE-OUT del worker ---------------
        print("\n=== C · SOLO_LECTURA ⇒ la licencia restringida NO silencia su alarma ===")
        clean_license_notifications()
        api = Api(licenses["vencida"][0], "vencida")
        try:
            check("C1 la API arranca degradada (SOLO_LECTURA)", api.wait())
            tok = login()
            st, dto = call("GET", "/license/status", tok)
            check("C2 DTO: SOLO_LECTURA (lectura del estado SIEMPRE disponible)",
                  st == 200 and isinstance(dto, dict) and dto.get("status") == "SOLO_LECTURA",
                  f"dto={dto}")
            st, body = call("POST", "/notifications/run", tok)
            check("C3 POST /notifications/run bloqueado por el guard L1 (403 LICENSE_RESTRICTED)",
                  st == 403 and isinstance(body, dict) and body.get("code") == "LICENSE_RESTRICTED",
                  f"st={st}")
            # El aviso llega igual por los CRONES del worker (sweep 60s + dispatch/send 30s):
            # sin el carve-out, workersOperational=false lo dejaría mudo para siempre.
            print("  … esperando el cron del worker (carve-out license.*, ≤150 s)")
            found = None
            t0 = time.time()
            while time.time() - t0 < 150:
                items = license_inbox_items(tok)
                found = next((i for i in (items or []) if i["eventKey"] == "license.restricted"), None)
                if found:
                    break
                time.sleep(5)
            check("C4 CARVE-OUT: license.restricted llegó a la campanita del admin vía cron",
                  found is not None, f"tras {int(time.time() - t0)} s")
        finally:
            api.stop()

        # --- Escenario D · VALIDA ⇒ silencio total -------------------------------
        print("\n=== D · VALIDA ⇒ sin banner ni avisos (cero eventos license.*) ===")
        clean_license_notifications()
        api = Api(licenses["valida"][0], "valida")
        try:
            check("D1 la API arranca (VALIDA)", api.wait())
            tok = login()
            st, dto = call("GET", "/license/status", tok)
            check("D2 DTO: VALIDA sin graceDaysRemaining",
                  st == 200 and isinstance(dto, dict) and dto.get("status") == "VALIDA"
                  and "graceDaysRemaining" not in dto, f"dto={dto}")
            st, _ = call("POST", "/notifications/run", tok)
            check("D3 worker corre", st in (200, 201), f"st={st}")
            n = sql("SELECT count(*) FROM \"NotificationEvent\" WHERE \"eventKey\" LIKE 'license.%'")
            check("D4 CERO eventos license.* (VALIDA no spamea)", n == "0", f"eventos={n}")
            items = license_inbox_items(tok)
            check("D5 campanita del admin sin avisos de licencia", items == [], f"items={items}")
        finally:
            api.stop()
    finally:
        drop_plain_user()
        clean_license_notifications()

    print(f"\nResultado: {len(OK)} PASS / {len(FAIL)} FAIL")
    if FAIL:
        for f in FAIL:
            print(f"  FAIL {f}")
        sys.exit(1)


if __name__ == "__main__":
    main()
