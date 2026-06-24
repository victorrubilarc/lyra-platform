#!/usr/bin/env python3
"""Smoke de CICLO DE VIDA de estructura organizacional (L2c) — 2026-06-24.

Verifica ARCHIVAR / REACTIVAR / REORDENAR estructuras sin borrar datos:

 A) Lista de estructuras + existe la por defecto.
 B) Crear 2 estructuras (A, B), cada una con un nivel + un nodo (configuradas).
 C) Archivar B (PATCH active:false): 200; B queda active:false PERO sigue en la lista
    de gestión y su árbol by-id sigue 200 (paridad L1: una archivada es legible).
 D) Reactivar B (PATCH active:true): 200, vuelve a estar activa.
 E) Reordenar (PUT /structure/structures/reorder): el `reportOrder` refleja el orden
    enviado; invertirlo vuelve a reflejarse. Ids desconocidos ⇒ 400.
 F) Guardas: la por defecto NO se puede archivar (400).

Limpia por key 'smoke-cv-%' al final (psql). API :3000. Clave demo Demo!Pass2026.
"""
import json
import os
import sys
import urllib.error
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE = os.environ.get("WL_BASE", "http://localhost:3000/api")
PASS = os.environ.get("WL_DEMO_PASS", "Demo!Pass2026")
ADMIN = "demo@watchlog.local"
OK, FAIL = [], []
CREATED = []


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


def login(email):
    s, r = call("POST", "/auth/login", body={"email": email, "password": PASS})
    return r["accessToken"] if s == 200 else None


def check(name, cond, detail=""):
    (OK if cond else FAIL).append(name)
    print(("  ✓ " if cond else "  ✗ ") + name + ("" if cond else f"  → {detail}"))


def get_struct(tok, sid):
    s, lst = call("GET", "/structure/structures", tok)
    if s != 200:
        return None
    return next((x for x in (lst or []) if x.get("id") == sid), None)


def make_structure(tok, key, name):
    s, st = call("POST", "/structure/structures", tok, {"key": key, "name": name})
    if not (s in (200, 201) and st and st.get("id")):
        return None
    CREATED.append(st["id"])
    s, lv = call("POST", "/structure/levels", tok, {"structureId": st["id"], "name": "Sitio", "order": 0})
    if s in (200, 201) and lv and lv.get("id"):
        call("POST", "/structure/nodes", tok, {"structureId": st["id"], "name": f"Nodo {name}", "levelId": lv["id"]})
    return st


def main():
    admin = login(ADMIN)
    if not admin:
        print("No se pudo autenticar el admin demo. ¿API en :3000? ¿seed corrido?")
        sys.exit(2)

    # ── A) Lista + por defecto ───────────────────────────────────────────────
    s, structures = call("GET", "/structure/structures", admin)
    check("A1 lista de estructuras 200", s == 200, f"http={s}")
    default = next((x for x in (structures or []) if x.get("isDefault")), None)
    check("A2 existe estructura por defecto", default is not None, str(structures))
    if not default:
        cleanup(); summary(); return

    # ── B) Crear A y B configuradas ──────────────────────────────────────────
    a = make_structure(admin, "smoke-cv-a", "Smoke CV A")
    b = make_structure(admin, "smoke-cv-b", "Smoke CV B")
    check("B1 estructura A creada", a is not None, str(a))
    check("B2 estructura B creada", b is not None, str(b))
    if not (a and b):
        cleanup(); summary(); return

    # ── C) Archivar B ─────────────────────────────────────────────────────────
    s, r = call("PATCH", f"/structure/structures/{b['id']}", admin, {"active": False})
    check("C1 archivar B ⇒ 200", s == 200 and r and r.get("active") is False, f"http={s} {r}")
    brow = get_struct(admin, b["id"])
    check("C2 B sigue en la lista de gestión (no borrada)", brow is not None, "")
    check("C3 B figura como inactiva (active:false)", brow is not None and brow.get("active") is False,
          str(brow.get("active") if brow else None))
    # Paridad L1: una archivada sigue siendo legible por id (deep-link / by-id).
    s, btree = call("GET", f"/structure/nodes?structureId={b['id']}", admin)
    check("C4 árbol by-id de una archivada sigue 200 (legible)", s == 200 and isinstance(btree, list),
          f"http={s}")
    check("C5 la archivada conserva su nodo (historial intacto)", isinstance(btree, list) and len(btree) >= 1,
          f"n={len(btree or [])}")

    # ── D) Reactivar B ────────────────────────────────────────────────────────
    s, r = call("PATCH", f"/structure/structures/{b['id']}", admin, {"active": True})
    check("D1 reactivar B ⇒ 200 y active:true", s == 200 and r and r.get("active") is True, f"http={s} {r}")

    # ── E) Reordenar ──────────────────────────────────────────────────────────
    s, r = call("PUT", "/structure/structures/reorder", admin, {"ids": [b["id"], a["id"]]})
    check("E1 reorder [B, A] ⇒ 200", s == 200, f"http={s}")
    arow, brow = get_struct(admin, a["id"]), get_struct(admin, b["id"])
    check("E2 B antes que A (reportOrder B < A)",
          arow and brow and brow["reportOrder"] < arow["reportOrder"],
          f"A={arow and arow.get('reportOrder')} B={brow and brow.get('reportOrder')}")
    s, r = call("PUT", "/structure/structures/reorder", admin, {"ids": [a["id"], b["id"]]})
    check("E3 reorder inverso [A, B] ⇒ 200", s == 200, f"http={s}")
    arow, brow = get_struct(admin, a["id"]), get_struct(admin, b["id"])
    check("E4 A antes que B tras invertir (reportOrder A < B)",
          arow and brow and arow["reportOrder"] < brow["reportOrder"],
          f"A={arow and arow.get('reportOrder')} B={brow and brow.get('reportOrder')}")
    s, _ = call("PUT", "/structure/structures/reorder", admin, {"ids": ["no-existe-xyz"]})
    check("E5 reorder con id desconocido ⇒ 400", s == 400, f"http={s}")

    # ── F) Guardas ────────────────────────────────────────────────────────────
    s, _ = call("PATCH", f"/structure/structures/{default['id']}", admin, {"active": False})
    check("F1 archivar la estructura por defecto ⇒ 400", s == 400, f"http={s}")
    defrow = get_struct(admin, default["id"])
    check("F2 la por defecto sigue activa", defrow and defrow.get("active") is True, str(defrow))

    cleanup()
    summary()


def cleanup():
    """Limpia las estructuras de prueba (la cascada borra niveles/nodos)."""
    import subprocess
    PG = ["docker", "exec", "lyra-watchlog-dev-postgres-1", "psql", "-U", "watchlog", "-d", "watchlog", "-q", "-c"]
    subprocess.run(PG + ["DELETE FROM \"OrgStructure\" WHERE key LIKE 'smoke-cv-%';"], capture_output=True)
    print("  · limpieza de estructuras de prueba ejecutada")


def summary():
    print(f"\nResultado: {len(OK)} OK, {len(FAIL)} FAIL")
    if FAIL:
        print("FALLARON:")
        for f in FAIL:
            print("  - " + f)
        sys.exit(1)
    print("Todos los checks en verde ✅")


if __name__ == "__main__":
    main()
