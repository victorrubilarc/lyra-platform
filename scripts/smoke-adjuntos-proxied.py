#!/usr/bin/env python3
"""Smoke — Adjuntos PROXIED por la API + magic bytes (H1 "planta restrictiva ready").

Mata la verificación del hallazgo 🔴 del pre-pentest 2026-07-07: la descarga de
evidencia ya NO usa URLs presigned de MinIO (firmaban contra http://minio:9000,
hostname interno que el navegador jamás resuelve fuera de Docker ⇒ adjuntos
ROTOS en prod). Ahora la API streamea el archivo con la MISMA ABAC que
getDetail y MinIO queda 100 % interno. Además la subida valida MAGIC BYTES
(hallazgo 🟡 "stored malware delivery": antes bastaba el mimetype declarado).

Levanta la API compilada (node dist/main.js) en :3409 — no toca el dev de
:3000 — con throttling RELAJADO por env (el smoke martilla; el rate limit se
prueba aparte en smoke-rate-limit.py). Usa la BD/Redis/MinIO del compose dev.

  1. plantilla con foto (accept image/*) + doc (kind file, accept */*);
  2. subir PNG real declarado image/png ⇒ 201, descriptor.contentType=image/png;
  3. subir JPEG real declarado image/png ⇒ 201 y el CONTENIDO manda
     (descriptor.contentType=image/jpeg — sniffed, no el declarado);
  4. subir bytes basura declarados image/png ⇒ 400 (declara imagen, no lo es);
  5. subir EXE (MZ) declarado application/octet-stream a doc (*/*) ⇒ 400
     (ejecutables SIEMPRE rechazados, sin importar el accept);
  6. subir CSV a doc ⇒ 201 (no-sniffable pasa por el declarado);
  7. descarga proxied: 200 + BYTES idénticos + Content-Type/Length + nosniff +
     Cache-Control private + Content-Disposition attachment;
  8. ?inline=1: imagen ⇒ inline; CSV ⇒ attachment IGUAL (no-sniffable jamás
     inline — anti stored-XSS);
  9. seguridad: sin token ⇒ 401; usuario SIN permiso logentry:view ⇒ 403;
     descriptor inexistente ⇒ 404; el endpoint viejo /url ⇒ 404 (retirado);
 10. MinIO no viaja al navegador: la respuesta no contiene URL alguna.

Limpia TODO por ID (plantilla/entrada/usuario de prueba + objetos del bucket).
Requiere: infra dev arriba + `pnpm build` del API. Admin demo / Demo!Pass2026.
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
PORT = int(os.environ.get("WL_ADJUNTOS_PORT", "3409"))
BASE = f"http://localhost:{PORT}/api"
PASS = os.environ.get("WL_DEMO_PASS", "Demo!Pass2026")
ADMIN = "demo@watchlog.local"
PG = ("docker", "exec", "lyra-watchlog-dev-postgres-1", "psql", "-U", "watchlog", "-d", "watchlog", "-tAc")

# Contenidos de prueba (magic bytes REALES).
PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
    "890000000d49444154789c6360000002000154a24f5f0000000049454e44ae426082"
)
JPEG = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00" + b"jpeg-smoke-payload" * 3
FAKE_PNG = b"no soy una imagen, soy texto plano con nombre de png"
EXE_MZ = b"MZ\x90\x00\x03\x00\x00\x00" + b"\x00" * 64  # cabecera PE/Windows
CSV = "col1,col2\r\nuno,dos\r\n".encode()

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
            return resp.status, (json.loads(txt) if txt else None)
    except urllib.error.HTTPError as e:
        b = e.read().decode()
        try:
            return e.code, json.loads(b)
        except Exception:
            return e.code, b
    except urllib.error.URLError:
        return 0, None


def upload(path, tok, filename, content, content_type):
    boundary = uuid.uuid4().hex
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: {content_type}\r\n\r\n"
    ).encode() + content + f"\r\n--{boundary}--\r\n".encode()
    r = urllib.request.Request(BASE + path, data=body, method="POST")
    r.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    r.add_header("Authorization", "Bearer " + tok)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        b = e.read().decode()
        try:
            return e.code, json.loads(b)
        except Exception:
            return e.code, b


def download(entry_id, descriptor_id, tok=None, inline=False):
    """(status, bytes, headers-en-minúscula) de la descarga proxied (Fastify
    emite los nombres de header en minúscula; dict() es case-sensitive)."""
    r = urllib.request.Request(
        BASE + f"/log-entries/{entry_id}/attachments/{descriptor_id}" + ("?inline=1" if inline else ""),
        method="GET",
    )
    if tok:
        r.add_header("Authorization", "Bearer " + tok)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, resp.read(), {k.lower(): v for k, v in resp.headers.items()}
    except urllib.error.HTTPError as e:
        return e.code, e.read(), {k.lower(): v for k, v in e.headers.items()}
    except urllib.error.URLError:
        return 0, b"", {}


def pg(sql):
    subprocess.run([*PG, sql], capture_output=True, text=True)


def mc_rm_entry(entry_id):
    subprocess.run(
        ["docker", "exec", "lyra-watchlog-dev-minio-1", "sh", "-c",
         "mc alias set wl http://localhost:9000 watchlog watchlogsecret >/dev/null 2>&1; "
         f"mc rm --recursive --force wl/watchlog-evidence/entries/{entry_id}/ >/dev/null 2>&1 || true"],
        capture_output=True, text=True,
    )


def flatten(nodes, out=None):
    if out is None:
        out = []
    for n in nodes:
        out.append({"id": n["id"], "name": n["name"], "children": n.get("children", [])})
        flatten(n.get("children", []), out)
    return out


class Api:
    """API compilada en :3409 con throttling relajado (arnés de smoke-branding)."""

    def __init__(self):
        st, _ = call("GET", "/health")
        if st != 0:
            print(f"ABORT: el puerto {PORT} ya está ocupado; mátalo y reintenta")
            sys.exit(2)
        self.log_path = API_DIR / ".license" / f"smoke-adjuntos-{PORT}.log"
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        self.log = open(self.log_path, "w", encoding="utf-8")
        env = {
            **os.environ,
            "API_PORT": str(PORT),
            # El smoke martilla subidas/llamadas: relajar los buckets para no
            # medir el throttling aquí (tiene su propio smoke :3410).
            "THROTTLE_DEFAULT_LIMIT": "5000",
            "THROTTLE_AUTH_LIMIT": "500",
            "THROTTLE_PUBLIC_LIMIT": "1000",
            "THROTTLE_UPLOAD_LIMIT": "1000",
        }
        self.proc = subprocess.Popen(
            ["node", "dist/main.js"], cwd=str(API_DIR), env=env,
            stdout=self.log, stderr=subprocess.STDOUT,
        )

    def wait(self, timeout=90):
        t0 = time.time()
        while time.time() - t0 < timeout:
            st, _ = call("GET", "/health")
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

    tpl_id = entry_id = user_id = None
    ts = os.urandom(3).hex()
    limited_email = f"smoke-sinpermiso-{ts}@watchlog.local"
    try:
        st, login = call("POST", "/auth/login", body={"email": ADMIN, "password": PASS})
        atok = (login or {}).get("accessToken")
        check("login admin (2xx)", st in (200, 201) and atok, st)
        if not atok:
            return

        _, tree = call("GET", "/structure/nodes", atok)
        flat = flatten(tree)
        leaves = [n for n in flat if not n["children"]]
        node_id = (leaves[0] if leaves else flat[0])["id"]

        st, tpl = call("POST", "/templates", atok, {
            "name": f"SMOKE AdjProxied {ts}",
            "nodeAssignments": [{"orgNodeId": node_id, "includeDescendants": False}],
        })
        tpl_id = tpl["id"]
        call("PUT", f"/templates/{tpl_id}/draft", atok, {
            "sections": [{
                "key": "s1", "title": "Evidencia",
                "fields": [
                    {"key": "foto", "type": "ATTACHMENT", "label": "Foto", "config": {"kind": "photo", "multiple": True, "maxCount": 5}},
                    {"key": "doc", "type": "ATTACHMENT", "label": "Archivo", "config": {"kind": "file", "multiple": True, "maxCount": 5}},
                ],
            }],
        })
        st, _ = call("POST", f"/templates/{tpl_id}/publish", atok, {})
        check("publicar plantilla (2xx)", st in (200, 201), st)

        st, entry = call("POST", "/log-entries", atok, {"templateId": tpl_id, "orgNodeId": node_id})
        check("crear entrada (2xx)", st in (200, 201), st)
        entry_id = entry["id"]

        # --- Subida: magic bytes ---
        st, d_png = upload(f"/log-entries/{entry_id}/attachments/s1/foto", atok, "real.png", PNG, "image/png")
        check("PNG real declarado image/png ⇒ 201", st in (200, 201), st)
        check("descriptor.contentType = image/png", isinstance(d_png, dict) and d_png.get("contentType") == "image/png",
              d_png.get("contentType") if isinstance(d_png, dict) else d_png)

        st, d_jpg = upload(f"/log-entries/{entry_id}/attachments/s1/foto", atok, "foto.png", JPEG, "image/png")
        check("JPEG real declarado image/png ⇒ 201 (accept image/*)", st in (200, 201), st)
        check("el CONTENIDO manda: descriptor.contentType = image/jpeg (sniffed)",
              isinstance(d_jpg, dict) and d_jpg.get("contentType") == "image/jpeg",
              d_jpg.get("contentType") if isinstance(d_jpg, dict) else d_jpg)

        st, body = upload(f"/log-entries/{entry_id}/attachments/s1/foto", atok, "falsa.png", FAKE_PNG, "image/png")
        check("bytes basura declarados image/png ⇒ 400 (magic bytes)", st == 400, st)

        st, body = upload(f"/log-entries/{entry_id}/attachments/s1/doc", atok, "driver.bin", EXE_MZ, "application/octet-stream")
        check("EXE (MZ) a campo */* ⇒ 400 (ejecutable SIEMPRE rechazado)", st == 400, st)

        st, d_csv = upload(f"/log-entries/{entry_id}/attachments/s1/doc", atok, "datos.csv", CSV, "text/csv")
        check("CSV (no-sniffable) a campo */* ⇒ 201 por declarado", st in (200, 201), st)

        # --- Descarga proxied ---
        st, content, hdr = download(entry_id, d_png["id"], atok)
        check("descarga proxied ⇒ 200 y BYTES idénticos", st == 200 and content == PNG, f"{st} {len(content)}b")
        check("Content-Type = image/png", hdr.get("content-type", "").startswith("image/png"), hdr.get("content-type"))
        check("Content-Length correcto", hdr.get("content-length") == str(len(PNG)), hdr.get("content-length"))
        check("X-Content-Type-Options: nosniff", hdr.get("x-content-type-options") == "nosniff")
        check("Cache-Control privado", "private" in hdr.get("cache-control", ""), hdr.get("cache-control"))
        check("Content-Disposition attachment por defecto", hdr.get("content-disposition", "").startswith("attachment"),
              hdr.get("content-disposition"))
        check("respuesta SIN URL de MinIO (binario puro)", b"minio" not in content and b"http" not in content[:200])

        st, _, hdr = download(entry_id, d_png["id"], atok, inline=True)
        check("?inline=1 en imagen verificada ⇒ inline", st == 200 and hdr.get("content-disposition", "").startswith("inline"),
              hdr.get("content-disposition"))

        st, _, hdr = download(entry_id, d_csv["id"], atok, inline=True)
        check("?inline=1 en CSV (no-sniffable) ⇒ attachment IGUAL", st == 200 and hdr.get("content-disposition", "").startswith("attachment"),
              hdr.get("content-disposition"))

        # --- Seguridad ---
        st, _, _ = download(entry_id, d_png["id"], tok=None)
        check("sin token ⇒ 401", st == 401, st)

        st, limited = call("POST", "/security/users", atok, {
            "email": limited_email, "displayName": "Smoke Sin Permiso",
            "password": "Smoke!Pass2026x", "roleIds": [],
        })
        user_id = (limited or {}).get("id") if st in (200, 201) else None
        st, l2 = call("POST", "/auth/login", body={"email": limited_email, "password": "Smoke!Pass2026x"})
        ltok = (l2 or {}).get("accessToken")
        if ltok:
            st, _, _ = download(entry_id, d_png["id"], ltok)
            check("usuario SIN logentry:view ⇒ 403", st == 403, st)
        else:
            check("usuario SIN logentry:view ⇒ 403", False, f"no pude loguear al usuario limitado ({st})")

        st, _, _ = download(entry_id, "00000000-0000-0000-0000-000000000000", atok)
        check("descriptor inexistente ⇒ 404", st == 404, st)

        st, _ = call("GET", f"/log-entries/{entry_id}/attachments/{d_png['id']}/url", atok)
        check("endpoint viejo /url RETIRADO ⇒ 404", st == 404, st)
    finally:
        if entry_id:
            mc_rm_entry(entry_id)
            for tbl in ("LogEntryFieldChange", "LogEntryValue", "LogEntrySignature", "LogEntryTransition", "LogEntrySection"):
                pg(f'DELETE FROM "{tbl}" WHERE "logEntryId" = \'{entry_id}\';')
            pg(f'DELETE FROM "LogEntry" WHERE id = \'{entry_id}\';')
        if tpl_id:
            pg(f"DELETE FROM \"Template\" WHERE id='{tpl_id}';")
        pg(f"DELETE FROM \"RefreshToken\" WHERE \"userId\" IN (SELECT id FROM \"User\" WHERE email='{limited_email}');")
        pg(f"DELETE FROM \"User\" WHERE email='{limited_email}';")
        api.stop()

    print(f"\n=== {len(OK)} ok · {len(FAIL)} fail ===")
    if FAIL:
        print("FALLAS: " + ", ".join(FAIL))
        sys.exit(1)


if __name__ == "__main__":
    main()
