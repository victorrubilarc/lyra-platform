#!/usr/bin/env python3
"""Smoke en vivo — Catálogo de objetos premium · Ola 3 (adjuntos / terreno, MinIO).

Round-trip por las tres capas (diseño → versión CONGELADA → detalle) + el ciclo de
subida PROXIED a MinIO con ABAC y la inmutabilidad GxP:

  1. crea una plantilla con un campo de cada objeto nuevo: ATTACHMENT foto (múltiple,
     1 MB), archivo, nota de voz, croquis + un TEXT con escáner QR (config.scan);
  2. publica ⇒ GET detalle: type ATTACHMENT + dataType FILE_ARRAY + config.kind y
     config.scan VIAJARON en la versión inmutable (clonado al publicar);
  3. crea una entrada y SUBE un PNG real a MinIO (POST /attachments) ⇒ descriptor
     (key bajo entries/{id}/foto/, contentType, checksum sha256);
  4. guarda la sección con el descriptor ⇒ 2xx; el valor persiste; descarga
     PROXIED por la API (GET /attachments/{id} con Bearer + ABAC — H1: el
     navegador jamás toca MinIO) ⇒ 200 y los BYTES coinciden;
  5. negativos: subir fuera de TIPO (text a foto) ⇒ 400; fuera de TAMAÑO (>1 MB) ⇒
     400; guardar con una KEY AJENA (otra entrada) ⇒ 400;
  6. INMUTABILIDAD: sella la entrada (submit) ⇒ subir a una entrada sellada ⇒ 400 y
     el objeto SIGUE descargable;
  7. HUÉRFANOS: una 2.ª entrada se ANULA (VOID) ⇒ su objeto se LIMPIA de MinIO
     (la descarga proxied del objeto borrado responde 404).

CREA su propia plantilla + 1–2 entradas y LIMPIA TODO por ID (el AuditLog inmutable
conserva el rastro; los objetos de MinIO los limpia el VOID / el borrado de prueba).
API :3000. Admin demo: demo@watchlog.local / Demo!Pass2026.
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE = os.environ.get("WL_BASE", "http://localhost:3000/api")
PASS = os.environ.get("WL_DEMO_PASS", "Demo!Pass2026")
ADMIN = {"email": os.environ.get("WL_ADMIN_EMAIL", "demo@watchlog.local"), "password": PASS}
PG = ("docker", "exec", "lyra-watchlog-dev-postgres-1", "psql", "-U", "watchlog", "-d", "watchlog", "-tAc")
OK, FAIL = [], []

# PNG 1x1 transparente (válido) para subir como evidencia real.
PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
    "890000000d49444154789c6360000002000154a24f5f0000000049454e44ae426082"
)


def req(method, path, tok=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    if body is not None:
        r.add_header("Content-Type", "application/json")
    if tok:
        r.add_header("Authorization", "Bearer " + tok)
    with urllib.request.urlopen(r) as resp:
        txt = resp.read().decode()
        return resp.status, (json.loads(txt) if txt else None)


def call(method, path, tok=None, body=None):
    try:
        return req(method, path, tok, body)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def upload(path, tok, filename, content, content_type):
    boundary = "----wlsmoke" + os.urandom(8).hex()
    body = b""
    body += ("--" + boundary + "\r\n").encode()
    body += ('Content-Disposition: form-data; name="file"; filename="%s"\r\n' % filename).encode()
    body += ("Content-Type: %s\r\n\r\n" % content_type).encode()
    body += content
    body += ("\r\n--" + boundary + "--\r\n").encode()
    r = urllib.request.Request(BASE + path, data=body, method="POST")
    r.add_header("Content-Type", "multipart/form-data; boundary=" + boundary)
    r.add_header("Authorization", "Bearer " + tok)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def fetch_attachment(entry_id, descriptor_id, tok, inline=False):
    """Descarga PROXIED por la API (H1): GET con Bearer; devuelve (status, bytes)."""
    r = urllib.request.Request(
        BASE + f"/log-entries/{entry_id}/attachments/{descriptor_id}" + ("?inline=1" if inline else ""),
        method="GET",
    )
    r.add_header("Authorization", "Bearer " + tok)
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def pg(sql):
    subprocess.run([*PG, sql], capture_output=True, text=True)


def pg_q(sql):
    return subprocess.run([*PG, sql], capture_output=True, text=True).stdout.strip()


def mc_rm_entry(entry_id):
    """Limpia los objetos de prueba de una entrada en MinIO (la entrada A queda
    SELLADA: el VOID no aplica y su evidencia es retenida; aquí se borra el rastro
    de PRUEBA del bucket vía `mc` del contenedor)."""
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


def fields_by_key(detail):
    out = {}
    for s in detail["version"]["sections"]:
        for f in s["fields"]:
            out[f["key"]] = f
    return out


def new_entry(atok, tpl_id, node_id):
    _, nodes = req("GET", f"/log-entries/templates/{tpl_id}/nodes", atok)
    nlist = nodes.get("nodes") or []
    ent_node = nlist[0]["id"] if nlist else node_id
    s, entry = call("POST", "/log-entries", atok, {"templateId": tpl_id, "orgNodeId": ent_node})
    return (entry["id"] if s in (200, 201) else None), ent_node, s


def section_version(atok, entry_id):
    _, d = req("GET", f"/log-entries/{entry_id}", atok)
    return d["sectionStates"][0]["version"]


def check(name, cond, detail=""):
    (OK if cond else FAIL).append(name)
    print(("  ok  " if cond else "FAIL ") + name + (f"   [{detail}]" if detail else ""))


def main():
    _, login = req("POST", "/auth/login", body=ADMIN)
    atok = login["accessToken"]

    _, tree = req("GET", "/structure/nodes", atok)
    flat = flatten(tree)
    leaves = [n for n in flat if not n["children"]]
    node = leaves[0] if leaves else flat[0]
    node_id = node["id"]
    print(f"Nodo de prueba: {node_id} ({node['name']})")

    tpl_id = entry_id = entry2_id = None
    ts = os.urandom(3).hex()
    try:
        _, tpl = req("POST", "/templates", atok, {
            "name": f"SMOKE Ola3 {ts}",
            "nodeAssignments": [{"orgNodeId": node_id, "includeDescendants": False}],
        })
        tpl_id = tpl["id"]
        req("PUT", f"/templates/{tpl_id}/draft", atok, {
            "sections": [{
                "key": "s1", "title": "Evidencia",
                "fields": [
                    {"key": "foto", "type": "ATTACHMENT", "label": "Foto", "config": {"kind": "photo", "multiple": True, "maxCount": 5, "maxSizeMb": 1, "capture": True}},
                    {"key": "doc", "type": "ATTACHMENT", "label": "Archivo", "config": {"kind": "file"}},
                    {"key": "voz", "type": "ATTACHMENT", "label": "Nota de voz", "config": {"kind": "audio"}},
                    {"key": "croquis", "type": "ATTACHMENT", "label": "Croquis", "config": {"kind": "sketch"}},
                    {"key": "tag", "type": "TEXT", "label": "TAG del activo", "config": {"scan": True}},
                ],
            }],
        })
        s, _ = call("POST", f"/templates/{tpl_id}/publish", atok, {})
        check("publicar (2xx)", s in (200, 201), s)
        _, pub = req("GET", f"/templates/{tpl_id}", atok)
        f = fields_by_key(pub)
        check("CONGELADA: ATTACHMENT → dataType FILE_ARRAY", f["foto"]["dataType"] == "FILE_ARRAY", f["foto"]["dataType"])
        check("CONGELADA: config.kind viajó (photo/file/audio/sketch)",
              {f["foto"]["config"].get("kind"), f["doc"]["config"].get("kind"), f["voz"]["config"].get("kind"), f["croquis"]["config"].get("kind")} == {"photo", "file", "audio", "sketch"})
        check("CONGELADA: foto multiple + maxSizeMb viajaron", f["foto"]["config"].get("multiple") is True and f["foto"]["config"].get("maxSizeMb") == 1)
        check("CONGELADA: TEXT config.scan viajó", f["tag"]["config"].get("scan") is True)

        # --- Entrada A: subida real + descarga + negativos + sellado ---
        entry_id, ent_node, s = new_entry(atok, tpl_id, node_id)
        check("crear entrada A (2xx)", s in (200, 201), s)

        s, desc = upload(f"/log-entries/{entry_id}/attachments/s1/foto", atok, "evidencia.png", PNG, "image/png")
        check("subir PNG a 'foto' (2xx) + descriptor", s in (200, 201) and isinstance(desc, dict) and desc.get("id"), f"{s} {desc if s not in (200,201) else ''}")
        if isinstance(desc, dict) and desc.get("id"):
            check("descriptor.key bajo entries/{id}/foto/", desc["key"].startswith(f"entries/{entry_id}/foto/"), desc.get("key"))
            check("descriptor: contentType image/png + size>0 + checksum sha256",
                  desc.get("contentType") == "image/png" and desc.get("size") == len(PNG) and len(desc.get("checksum", "")) == 64)

            ver = section_version(atok, entry_id)
            s, body = call("PUT", f"/log-entries/{entry_id}/sections/s1", atok, {"expectedVersion": ver, "values": [{"fieldKey": "foto", "value": [desc]}]})
            check("guardar sección con el descriptor (2xx)", s in (200, 201), f"{s} {body if s not in (200,201) else ''}")
            persisted = pg_q(f"SELECT value::text FROM \"LogEntryValue\" WHERE \"logEntryId\"='{entry_id}' AND \"fieldKey\"='foto';")
            check("valor FILE_ARRAY persistido con la key", desc["key"] in persisted, persisted[:60])

            fs, content = fetch_attachment(entry_id, desc["id"], atok)
            check("descarga PROXIED ⇒ 200 y los BYTES coinciden", fs == 200 and content == PNG, f"{fs} {len(content) if content else 0}b")

            # Negativos.
            s, _ = upload(f"/log-entries/{entry_id}/attachments/s1/foto", atok, "nota.txt", b"hola", "text/plain")
            check("subir text/plain a 'foto' (accept image/*) ⇒ 400", s == 400, s)
            s, _ = upload(f"/log-entries/{entry_id}/attachments/s1/foto", atok, "grande.png", b"\x89PNG" + b"\x00" * (1024 * 1024 + 50), "image/png")
            check("subir >1 MB a 'foto' (maxSizeMb=1) ⇒ 400", s == 400, s)

            ver = section_version(atok, entry_id)
            ajena = dict(desc, id="evil", key=f"entries/OTRA-ENTRADA/foto/evil-x.png")
            s, _ = call("PUT", f"/log-entries/{entry_id}/sections/s1", atok, {"expectedVersion": ver, "values": [{"fieldKey": "foto", "value": [ajena]}]})
            check("guardar con KEY AJENA ⇒ 400", s == 400, s)

            # Inmutabilidad: sellar (submit) ⇒ subir a sellada ⇒ 400; el objeto persiste.
            ver = section_version(atok, entry_id)
            call("PUT", f"/log-entries/{entry_id}/sections/s1", atok, {"expectedVersion": ver, "values": [{"fieldKey": "foto", "value": [desc]}], "markComplete": True})
            s, sub = call("POST", f"/log-entries/{entry_id}/submit", atok, {"password": PASS})
            sealed = pg_q(f"SELECT \"sealedAt\" IS NOT NULL FROM \"LogEntry\" WHERE id='{entry_id}';") == "t"
            check("submit sella la entrada A", sealed, f"submit={s}")
            if sealed:
                s, _ = upload(f"/log-entries/{entry_id}/attachments/s1/foto", atok, "tarde.png", PNG, "image/png")
                check("subir a entrada SELLADA ⇒ 400 (inmutable)", s == 400, s)
                fs, content = fetch_attachment(entry_id, desc["id"], atok)
                check("objeto de entrada sellada PERMANECE (descarga 200)", fs == 200 and content == PNG, fs)

        # --- Entrada B: subir + VOID ⇒ huérfano limpiado de MinIO ---
        entry2_id, _, s = new_entry(atok, tpl_id, node_id)
        check("crear entrada B (2xx)", s in (200, 201), s)
        s, desc2 = upload(f"/log-entries/{entry2_id}/attachments/s1/doc", atok, "manual.pdf", b"%PDF-1.4 smoke", "application/pdf")
        check("subir archivo a entrada B (2xx)", s in (200, 201) and isinstance(desc2, dict) and desc2.get("id"), s)
        if isinstance(desc2, dict) and desc2.get("id"):
            ver = section_version(atok, entry2_id)
            call("PUT", f"/log-entries/{entry2_id}/sections/s1", atok, {"expectedVersion": ver, "values": [{"fieldKey": "doc", "value": [desc2]}]})
            fs, _ = fetch_attachment(entry2_id, desc2["id"], atok)
            check("entrada B: objeto descargable antes de anular", fs == 200, fs)
            s, _ = call("POST", f"/log-entries/{entry2_id}/void", atok, {"reason": "smoke de limpieza de huérfanos"})
            check("anular borrador B (2xx)", s in (200, 201), s)
            fs, _ = fetch_attachment(entry2_id, desc2["id"], atok)
            check("objeto del borrador anulado LIMPIADO de MinIO (404)", fs in (403, 404), fs)
    finally:
        for eid in (entry_id, entry2_id):
            if eid:
                mc_rm_entry(eid)  # limpia los objetos de prueba del bucket
                for tbl in ("LogEntryFieldChange", "LogEntryValue", "LogEntrySignature", "LogEntryTransition", "LogEntrySection"):
                    pg(f'DELETE FROM "{tbl}" WHERE "logEntryId" = \'{eid}\';')
                pg(f'DELETE FROM "LogEntry" WHERE id = \'{eid}\';')
        if tpl_id:
            pg(f"DELETE FROM \"Template\" WHERE id='{tpl_id}';")

    if tpl_id:
        left = pg_q(f"SELECT count(*) FROM \"Template\" WHERE id='{tpl_id}';")
        check("limpieza: plantilla eliminada", left == "0", left)
    if entry_id:
        left = pg_q(f"SELECT count(*) FROM \"LogEntry\" WHERE id IN ('{entry_id}','{entry2_id}');")
        check("limpieza: entradas eliminadas", left == "0", left)

    print(f"\n=== {len(OK)} ok · {len(FAIL)} fail ===")
    if FAIL:
        print("FALLAS: " + ", ".join(FAIL))
        sys.exit(1)


if __name__ == "__main__":
    main()
