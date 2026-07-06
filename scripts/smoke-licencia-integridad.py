#!/usr/bin/env python3
"""Smoke del LICENCIAMIENTO L5 (anti-tamper del build de release, 2026-07-06).

Ejerce el MECANISMO REAL de la capa 3 (LICENSING_STRATEGY §5, LICENSING.md §7):
empaqueta la API con `scripts/license/bundle-api.mjs` (esbuild: bundle único
minificado + nombres destruidos + @lyra/licensing INLINEADO) y la sella con
`scripts/license/seal-integrity.mjs`, luego CORRE ese bundle real en :3405
(no toca el dev server de :3000) bajo NODE_ENV=production. Afirma las tres
propiedades del objetivo L5:

  (i)  el texto plano del módulo de licencia NO es localizable en el bundle
       (nombres license-críticos manglados; JSDoc/strings-guía eliminados),
  (ii) la app arranca y evalúa la licencia VALIDA — la protección NO rompe el
       runtime (misma licencia dev que en :3000),
  (iii) adulterar UN byte del artefacto sellado ⇒ BLOQUEADA/INTEGRITY_MISMATCH
       (restringido, jamás destructivo): la LECTURA sigue viva (GET 200) y la
       MUTACIÓN se rechaza (403 LICENSE_RESTRICTED).

El horneado dentro de la imagen Docker (Dockerfile.api: swap del dist legible
por el bundle sellado + borrado de src/@lyra/licensing) se verificó a mano esta
sesión construyendo la imagen linux real; este smoke cubre el runtime del
artefacto, que es el corazón reproducible sin Docker.

Requiere: infra dev (postgres/redis) arriba y el par DEV embebido (build local).
El puerto 3405 debe estar libre (3401-3404 los usan otros smokes)."""
import json
import os
import shutil
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
BUNDLE = API_DIR / "dist-bundle" / "main.js"
DEV_LICENSE = API_DIR / ".license" / "license.lic"
SMOKE_DIR = API_DIR / ".license" / "smoke-integridad"
PORT = int(os.environ.get("WL_LIC_PORT", "3405"))
BASE = f"http://localhost:{PORT}/api"
PASS = os.environ.get("WL_DEMO_PASS", "Demo!Pass2026")
ADMIN = "demo@watchlog.local"

# Nombres license-críticos que NO deben ser localizables en el bundle (viven en
# módulos CJS de la API, donde el mangle es consistente). NO se incluyen los
# exports de @lyra/licensing (frontera ESM→CJS: sobreviven UNA vez en el mapa de
# exports, sin lógica — documentado en bundle-api.mjs).
MANGLED = ["workersOperational", "getEvaluation", "evaluateNow", "sealRequired",
           "verifyArtifactIntegrity", "LICENSE_PUBLIC_KEY_PEM", "writeRenewalRequest",
           "rotateLineage", "toLicenseStatus"]
# Cadenas-guía humanas (JSDoc/comentarios) que el minify debe haber borrado.
GIVEAWAY_STRINGS = ["verifica la firma con la clave", "node-lock por huella",
                    "auto-verificación", "verificación DISTRIBUIDA"]
# Externals que DEBEN seguir referenciados (no se bundlean: assets/binarios).
EXTERNALS = ["@lyra/contracts", "pdfmake", "@expo-google-fonts/inter", "argon2"]

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


def run_node(script, *args):
    return subprocess.run(["node", script, *args], cwd=str(ROOT), capture_output=True,
                          text=True, encoding="utf-8", errors="replace")


class Api:
    """Corre el BUNDLE sellado (dist-bundle/main.js) bajo NODE_ENV=production."""

    def __init__(self, tag: str):
        st, _ = call("GET", "/health")
        if st != 0:
            print(f"ABORT: el puerto {PORT} ya está ocupado; mátalo y reintenta")
            sys.exit(2)
        self.log_path = SMOKE_DIR / f"api-{tag}.log"
        self.log = open(self.log_path, "w", encoding="utf-8")
        env = {**os.environ, "API_PORT": str(PORT), "NODE_ENV": "production",
               "LICENSE_FILE": str(DEV_LICENSE), "LOG_LEVEL": "info"}
        self.proc = subprocess.Popen(
            ["node", "dist-bundle/main.js"], cwd=str(API_DIR), env=env,
            stdout=self.log, stderr=subprocess.STDOUT)

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
            if call("GET", "/health")[0] == 0:
                return
            time.sleep(0.5)
        print(f"ABORT: el puerto {PORT} sigue ocupado tras detener la API")
        sys.exit(2)


def main():
    if not DEV_LICENSE.exists():
        print("ABORT: falta la licencia dev (.license/license.lic). Corre `pnpm license:dev`.")
        sys.exit(2)
    if SMOKE_DIR.exists():
        shutil.rmtree(SMOKE_DIR)
    SMOKE_DIR.mkdir(parents=True)

    # --- 0 · empaquetar + sellar (el horneado del build, reproducido) -----------
    print("=== 0 · bundle + sellado del artefacto (esbuild + seal) ===")
    r = run_node("scripts/license/bundle-api.mjs")
    check("0a bundle-api.mjs OK", r.returncode == 0 and BUNDLE.exists(),
          (r.stderr or r.stdout)[-160:].strip())
    if not BUNDLE.exists():
        print("ABORT: no se generó el bundle; ¿falta `pnpm build`?")
        sys.exit(1)
    r = run_node("scripts/license/seal-integrity.mjs", str(BUNDLE))
    sealed_hash = ""
    for line in (r.stdout or "").splitlines():
        if "SHA-256" in line:
            sealed_hash = line.split(":")[-1].strip()
    check("0b seal-integrity.mjs OK (hash embebido)", r.returncode == 0 and len(sealed_hash) == 64,
          sealed_hash[:16])

    blob = BUNDLE.read_text(encoding="utf-8", errors="replace")

    # --- i · el módulo de licencia NO es localizable en texto plano -------------
    print("\n=== i · nombres/strings license-críticos NO localizables (anti-tamper) ===")
    for name in MANGLED:
        check(f"i·{name} destruido (0 ocurrencias)", blob.count(name) == 0,
              f"count={blob.count(name)}")
    for s in GIVEAWAY_STRINGS:
        check(f"i·guía '{s[:22]}…' eliminada", s not in blob)
    check("i·marcador de sello ÚNICO", blob.count("LYRA-INTEGRITY-SEAL::") == 1,
          f"count={blob.count('LYRA-INTEGRITY-SEAL::')}")
    for e in EXTERNALS:
        check(f"i·external '{e}' intacto (no se bundleó)", e in blob)
    check("i·@lyra/licensing INLINEADO (0 referencias)", "@lyra/licensing" not in blob)

    # --- ii · el bundle sellado arranca VALIDA (protección no rompe runtime) -----
    print("\n=== ii · el bundle sellado arranca y evalúa VALIDA ===")
    api = Api("sellado")
    try:
        up = api.wait()
        check("ii·arranca (health 200)", up)
        check("ii·sello verificado en el log (SEALED_OK)",
              "Sello de integridad del artefacto verificado" in api.logs())
        check("ii·estado=VALIDA en el arranque", "estado=VALIDA" in api.logs())
        tok = login()
        check("ii·login del admin OK (opera normal)", bool(tok))
        st, body = call("GET", "/license/status", tok)
        check("ii·GET /license/status = VALIDA", st == 200 and (body or {}).get("status") == "VALIDA",
              f"st={st} status={(body or {}).get('status')}")
    finally:
        api.stop()

    # --- iii · adulterar el artefacto ⇒ BLOQUEADA/INTEGRITY_MISMATCH -------------
    print("\n=== iii · un byte adulterado ⇒ BLOQUEADA (restringido, jamás destructivo) ===")
    with open(BUNDLE, "a", encoding="utf-8") as f:
        f.write(";void 0;")  # fuera del marcador ⇒ el hash normalizado ya no calza
    api = Api("adulterado")
    try:
        up = api.wait()
        check("iii·arranca igual (degradado, NO crashea)", up)
        logs = api.logs()
        check("iii·estado=BLOQUEADA motivo=INTEGRITY_MISMATCH",
              "BLOQUEADA" in logs and "INTEGRITY_MISMATCH" in logs)
        check("iii·NO destructivo (mensaje solo lectura + exportación)",
              "solo lectura" in logs)
        tok = login()
        check("iii·login sigue permitido (whitelist /api/auth/)", bool(tok))
        st, body = call("GET", "/license/status", tok)
        check("iii·LECTURA viva (GET 200, BLOQUEADA/INTEGRITY_MISMATCH)",
              st == 200 and (body or {}).get("status") == "BLOQUEADA"
              and (body or {}).get("reason") == "INTEGRITY_MISMATCH",
              f"st={st} status={(body or {}).get('status')} reason={(body or {}).get('reason')}")
        # MUTACIÓN bloqueada: cualquier POST de negocio ⇒ 403 LICENSE_RESTRICTED.
        st, body = call("POST", "/saved-views", tok, body={"name": "x", "kind": "logbook", "config": {}})
        code = (body or {}).get("code") if isinstance(body, dict) else None
        check("iii·MUTACIÓN 403 LICENSE_RESTRICTED (no destructivo, solo bloquea escritura)",
              st == 403 and code == "LICENSE_RESTRICTED", f"st={st} code={code}")
    finally:
        api.stop()

    # --- limpieza: el bundle es un artefacto de build; no debe quedar en el árbol
    shutil.rmtree(API_DIR / "dist-bundle", ignore_errors=True)
    shutil.rmtree(SMOKE_DIR, ignore_errors=True)

    print(f"\nResultado: {len(OK)} PASS / {len(FAIL)} FAIL")
    if FAIL:
        print("Fallaron: " + ", ".join(FAIL))
        sys.exit(1)


if __name__ == "__main__":
    main()
