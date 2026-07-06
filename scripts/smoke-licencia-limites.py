#!/usr/bin/env python3
"""Smoke del LICENCIAMIENTO L2b (enforcement de límites numéricos, 2026-07-06).

Reusa el arnés de smoke-licencia-modulos.py: levanta la API compilada
(node dist/main.js) en el puerto 3406 — no toca el dev server de :3000 — una
vez por ESCENARIO, generando licencias DEV con topes calculados a partir del
conteo REAL de la BD dev compartida (`gen-dev-license --max-nodes/--max-named-users`):

 A) Licencia con HOLGURA (topes 100000): crear nodo y usuario PASAN; el DTO
    /license/status trae `limits` (max + inUse vivos). Deja un nodo y un
    usuario DESHABILITADO de prueba y mide N (nodos vivos) y U (usuarios ACTIVE).
 B) Licencia AL BORDE (max-nodes=N, max-named-users=U — VALIDA, sin cupo):
    los 4 caminos de creación se rechazan con 403
    {code:LICENSE_LIMIT_EXCEEDED, limit, max, current, requested}: crear nodo,
    wizard provision, crear usuario y REACTIVAR al usuario deshabilitado (la
    puerta trasera). Lo existente sigue operando (renombrar OK) y ELIMINAR un
    nodo LIBERA cupo (crear vuelve a pasar) — nunca se rompe lo existente.
 C) Licencia SOBRE el tope (max = N-1/U-1, downgrade): estado LIMITE_EXCEDIDO;
    lectura + edición + mutaciones de otros recursos SIGUEN vivas (jamás
    secuestra datos); solo CREAR el recurso excedido da 403.
 D) SIN archivo (PENDIENTE_ACTIVACION): precedencia — crear nodo da 403
    LICENSE_RESTRICTED (estado global L1, NO se enmascara como límite) y el
    DTO no trae `limits`.

Requiere: infra dev arriba (postgres/redis) y `pnpm build` del API (el script
compila si falta dist). Admin demo demo@watchlog.local / Demo!Pass2026.
Nota: deja en la BD dev un usuario DISABLED `smoke-l2b@watchlog.local` (los
usuarios no se borran); el nodo temporal se elimina al final."""
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
SMOKE_DIR = API_DIR / ".license" / "smoke-limites"
PORT = int(os.environ.get("WL_LIC_PORT", "3406"))
BASE = f"http://localhost:{PORT}/api"
PASS = os.environ.get("WL_DEMO_PASS", "Demo!Pass2026")
ADMIN = "demo@watchlog.local"
SMOKE_USER = "smoke-l2b@watchlog.local"
SMOKE_USER_PASS = "Smoke!L2b#2026xy"
NODE_NAME = "SMOKE-L2B-NODO"

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


def is_limit_403(st, body, limit):
    return (st == 403 and isinstance(body, dict)
            and body.get("code") == "LICENSE_LIMIT_EXCEEDED" and body.get("limit") == limit)


def gen_license(target: Path, extra=""):
    r = run_cmd(f"pnpm run license:dev{extra}", env={"LICENSE_FILE": str(target)})
    if r.returncode != 0:
        print(r.stdout[-2000:] or r.stderr[-2000:])
        sys.exit(1)


def find_user(tok, email):
    st, users = call("GET", "/security/users", tok)
    if st != 200 or not isinstance(users, list):
        return None
    return next((u for u in users if u.get("email") == email), None)


def root_level_id(tok):
    st, levels = call("GET", "/structure/levels", tok)
    if st != 200 or not levels:
        return None
    return sorted(levels, key=lambda lv: lv["order"])[0]["id"]


def find_node(tok, name):
    st, tree = call("GET", "/structure/nodes", tok)
    if st != 200 or not isinstance(tree, list):
        return None

    def walk(nodes):
        for n in nodes:
            if n["name"] == name:
                return n
            hit = walk(n.get("children") or [])
            if hit:
                return hit
        return None

    return walk(tree)


def main():
    SMOKE_DIR.mkdir(parents=True, exist_ok=True)
    if not (API_DIR / "dist" / "main.js").exists():
        print("… dist/main.js no existe: compilando API")
        r = run_cmd("pnpm run build")
        if r.returncode != 0:
            print(r.stdout[-2000:] or r.stderr[-2000:])
            sys.exit(1)

    holgada_lic = SMOKE_DIR / "holgada.lic"
    print("… generando licencia DEV con holgura")
    gen_license(holgada_lic)

    # --- Escenario A · holgura: crear PASA y el DTO trae el cupo ----------------
    print("\n=== A · licencia con HOLGURA ⇒ crear pasa; DTO con limits ===")
    node_id = None
    n = u = None
    api = Api(holgada_lic, "holgada")
    try:
        check("A1 la API arranca (VALIDA)", api.wait())
        tok = login()
        check("A2 login OK", tok is not None)

        st, dto = call("GET", "/license/status", tok)
        lims = (dto or {}).get("limits") if isinstance(dto, dict) else None
        check("A3 DTO con limits (max + inUse de nodos y usuarios)",
              isinstance(lims, dict) and lims.get("nodes", {}).get("max") == 100000
              and isinstance(lims.get("nodes", {}).get("inUse"), int)
              and isinstance(lims.get("namedUsers", {}).get("inUse"), int),
              f"limits={lims}")

        level_id = root_level_id(tok)
        check("A4 hay niveles en la estructura por defecto", level_id is not None)
        st, node = call("POST", "/structure/nodes", tok,
                        {"name": NODE_NAME, "levelId": level_id})
        check("A5 con holgura: crear nodo PASA", st in (200, 201), f"st={st}")
        node_id = (node or {}).get("id") if isinstance(node, dict) else None

        # Usuario de prueba: si quedó de una corrida anterior se reusa.
        existing = find_user(tok, SMOKE_USER)
        if existing is None:
            st, created = call("POST", "/security/users", tok,
                               {"email": SMOKE_USER, "displayName": "Smoke L2b",
                                "password": SMOKE_USER_PASS, "roleIds": []})
            check("A6 con holgura: crear usuario PASA", st in (200, 201), f"st={st} {created}")
            existing = created if isinstance(created, dict) else find_user(tok, SMOKE_USER)
        else:
            check("A6 con holgura: usuario de prueba ya existía (reuso)", True)
        smoke_user_id = (existing or {}).get("id")
        st, _ = call("PATCH", f"/security/users/{smoke_user_id}", tok, {"status": "DISABLED"})
        check("A7 usuario de prueba DESHABILITADO (no consume cupo)", st == 200, f"st={st}")

        # Medición para los escenarios B/C: conteo VIVO desde el propio DTO.
        st, dto = call("GET", "/license/status", tok)
        lims = (dto or {}).get("limits") or {}
        n = lims.get("nodes", {}).get("inUse")
        u = lims.get("namedUsers", {}).get("inUse")
        check("A8 conteos medidos (N nodos vivos, U usuarios ACTIVE)",
              isinstance(n, int) and isinstance(u, int) and n > 0 and u > 0, f"N={n} U={u}")
    finally:
        api.stop()

    # --- Escenario B · AL BORDE (max = conteo actual): sin cupo ------------------
    print(f"\n=== B · licencia AL BORDE (maxNodes={n}, maxNamedUsers={u}) ⇒ crear 403 ===")
    borde_lic = SMOKE_DIR / "borde.lic"
    gen_license(borde_lic, f" -- --max-nodes={n} --max-named-users={u}")
    api = Api(borde_lic, "borde")
    try:
        check("B1 la API arranca", api.wait())
        tok = login()
        st, dto = call("GET", "/license/status", tok)
        check("B2 al borde exacto el estado sigue VALIDA (no excedido)",
              isinstance(dto, dict) and dto.get("status") == "VALIDA",
              f"status={(dto or {}).get('status')}")
        lims = (dto or {}).get("limits") or {}
        check("B3 DTO: inUse == max en ambos topes",
              lims.get("nodes") == {"max": n, "inUse": n}
              and lims.get("namedUsers") == {"max": u, "inUse": u}, f"limits={lims}")

        level_id = root_level_id(tok)
        st, body = call("POST", "/structure/nodes", tok,
                        {"name": "SMOKE-L2B-EXTRA", "levelId": level_id})
        check("B4 crear nodo: 403 LICENSE_LIMIT_EXCEEDED maxNodes",
              is_limit_403(st, body, "maxNodes"), f"st={st} body={body}")
        check("B5 el 403 trae max/current/requested y mensaje presentable",
              isinstance(body, dict) and body.get("max") == n and body.get("current") == n
              and body.get("requested") == 1 and "tu proveedor" in str(body.get("message")),
              f"body={body}")

        st, body = call("POST", "/structure/structures/provision", tok,
                        {"key": "smoke-l2b-area", "name": "Smoke L2b",
                         "levels": ["Planta"], "rootNode": {"name": "Raíz"}})
        check("B6 wizard provision: también 403 maxNodes (sin puerta trasera)",
              is_limit_403(st, body, "maxNodes"), f"st={st} body={body}")

        st, body = call("POST", "/security/users", tok,
                        {"email": "smoke-l2b-extra@watchlog.local", "displayName": "Extra",
                         "password": SMOKE_USER_PASS, "roleIds": []})
        check("B7 crear usuario: 403 LICENSE_LIMIT_EXCEEDED maxNamedUsers",
              is_limit_403(st, body, "maxNamedUsers"), f"st={st} body={body}")

        smoke_user = find_user(tok, SMOKE_USER)
        st, body = call("PATCH", f"/security/users/{smoke_user['id']}", tok,
                        {"status": "ACTIVE"})
        check("B8 REACTIVAR usuario deshabilitado: también 403 (la puerta trasera, gateada)",
              is_limit_403(st, body, "maxNamedUsers"), f"st={st} body={body}")

        node = find_node(tok, NODE_NAME)
        st, _ = call("PATCH", f"/structure/nodes/{node['id']}", tok,
                     {"name": NODE_NAME + " (editado)"})
        check("B9 lo EXISTENTE sigue operando: renombrar nodo OK", st == 200, f"st={st}")

        st, _ = call("DELETE", f"/structure/nodes/{node['id']}", tok)
        check("B10 eliminar nodo OK (bajar del tope JAMÁS se bloquea)", st in (200, 204), f"st={st}")
        st, node = call("POST", "/structure/nodes", tok,
                        {"name": NODE_NAME, "levelId": level_id})
        check("B11 tras liberar cupo, crear vuelve a PASAR", st in (200, 201), f"st={st}")
        node_id = (node or {}).get("id") if isinstance(node, dict) else None
    finally:
        api.stop()

    # --- Escenario C · SOBRE el tope (downgrade): LIMITE_EXCEDIDO ---------------
    print(f"\n=== C · licencia SOBRE el tope (maxNodes={n-1}, maxNamedUsers={u-1}) ⇒ LIMITE_EXCEDIDO ===")
    excedida_lic = SMOKE_DIR / "excedida.lic"
    gen_license(excedida_lic, f" -- --max-nodes={n-1} --max-named-users={u-1}")
    api = Api(excedida_lic, "excedida")
    try:
        check("C1 la API arranca (no se cae por estar sobre el tope)", api.wait())
        tok = login()
        st, dto = call("GET", "/license/status", tok)
        check("C2 estado LIMITE_EXCEDIDO (downgrade real, inUse > max)",
              isinstance(dto, dict) and dto.get("status") == "LIMITE_EXCEDIDO",
              f"status={(dto or {}).get('status')}")
        lims = (dto or {}).get("limits") or {}
        check("C3 DTO: inUse > max (la web puede explicar el exceso)",
              lims.get("nodes", {}).get("inUse", 0) > lims.get("nodes", {}).get("max", 1),
              f"limits={lims}")

        st, _ = call("GET", "/structure/nodes", tok)
        check("C4 LECTURA intacta (GET árbol 200) — jamás se secuestran datos", st == 200, f"st={st}")
        node = find_node(tok, NODE_NAME)
        st, _ = call("PATCH", f"/structure/nodes/{node['id']}", tok, {"name": NODE_NAME})
        check("C5 EDITAR lo existente intacto (rename 200)", st == 200, f"st={st}")
        st, view = call("POST", "/saved-views", tok,
                        {"module": "LOGBOOK", "name": "smoke-l2b", "config": {}})
        check("C6 otras mutaciones del producto SIGUEN vivas (solo crear el recurso excedido se bloquea)",
              st in (200, 201), f"st={st}")
        if isinstance(view, dict) and view.get("id"):
            call("DELETE", f"/saved-views/{view['id']}", tok)

        level_id = root_level_id(tok)
        st, body = call("POST", "/structure/nodes", tok,
                        {"name": "SMOKE-L2B-EXTRA", "levelId": level_id})
        check("C7 crear el recurso excedido: 403 maxNodes con current > max",
              is_limit_403(st, body, "maxNodes")
              and isinstance(body, dict) and body.get("current", 0) > body.get("max", 0),
              f"st={st} body={body}")

        # Regularizar = eliminar el nodo temporal (limpieza del smoke incluida).
        st, _ = call("DELETE", f"/structure/nodes/{node['id']}", tok)
        check("C8 regularizar bajando del tope: eliminar nodo OK", st in (200, 204), f"st={st}")
    finally:
        api.stop()

    # --- Escenario D · SIN archivo: precedencia del estado global (L1) ----------
    print("\n=== D · sin licencia ⇒ LICENSE_RESTRICTED tiene precedencia (no LIMIT) ===")
    pending_dir = SMOKE_DIR / "pendiente"
    pending_dir.mkdir(exist_ok=True)
    lic = pending_dir / "license.lic"
    if lic.exists():
        lic.unlink()
    api = Api(lic, "pendiente")
    try:
        check("D1 la API arranca degradada (PENDIENTE_ACTIVACION)", api.wait())
        tok = login()
        st, dto = call("GET", "/license/status", tok)
        check("D2 DTO sin limits (sin payload verificado, como modules null)",
              st == 200 and isinstance(dto, dict) and dto.get("limits") is None
              and dto.get("modules") is None, f"dto={dto}")
        # Ni siquiera hace falta un nivel válido: el guard L1 corre antes del handler.
        st, body = call("POST", "/structure/nodes", tok, {"name": "x", "levelId": "x"})
        check("D3 crear nodo: 403 LICENSE_RESTRICTED (estado global, NO se enmascara como límite)",
              st == 403 and isinstance(body, dict) and body.get("code") == "LICENSE_RESTRICTED",
              f"st={st} code={body.get('code') if isinstance(body, dict) else body}")
    finally:
        api.stop()

    print(f"\n===== RESULTADO: {len(OK)} ok / {len(FAIL)} fail =====")
    print(f"(el usuario {SMOKE_USER} queda DISABLED en la BD dev; los usuarios no se borran)")
    if FAIL:
        print("Fallidos: " + ", ".join(FAIL))
        sys.exit(1)


if __name__ == "__main__":
    main()
