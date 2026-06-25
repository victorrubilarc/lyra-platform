#!/usr/bin/env python3
"""Smoke del SISTEMA DE TEMAS / PALETAS administrable (EST-TEMAS) — 2026-06-24.

Verifica el ciclo enterprise de paletas de marca: un ADMIN construye una paleta con
variante CLARA y OSCURA, la PUBLICA con un flag y marca UNA por defecto; un USUARIO sin
permiso ve SOLO las publicadas, elige una (persistida por usuario) y NO puede construir
ni publicar (403). Más la validación de entrada (formato de color + whitelist de claves)
y la coherencia del default (despublicar la por defecto la quita de default).

Modelo: tabla `ThemePalette` (tokensDark/tokensLight JSON, isPublished) +
`SystemSettings.defaultPaletteId` + `User.themePaletteId`. Autorización en el backend:
construir/publicar/default exige `theme:manage`; listar publicadas y elegir, no.

Ejes:
 T0  Login admin (demo).
 T1  Admin crea paleta P1 (dark+light) ⇒ 201, devuelve tokens persistidos.
 T2  Lista admin contiene P1; isPublished=false, isDefault=false.
 T3  Admin edita P1 (PATCH nombre + un token) ⇒ 200.
 T4  Marcar por defecto una paleta SIN publicar ⇒ 400.
 T5  Validación: color inválido ⇒ 400; clave fuera de la whitelist ⇒ 400; severidad ⇒ 400.
 T6  Admin publica P1 ⇒ 200 isPublished=true.
 T7  Admin marca P1 por defecto ⇒ 200; la lista la marca isDefault=true.
 T8  Admin crea P2 y NO la publica (control para la lista pública).
 T9  Usuario NO-admin: login; GET /theme/palettes ve P1 (publicada) y NO ve P2.
 T10 Usuario NO-admin: GET admin ⇒ 403; POST crear ⇒ 403; publicar ⇒ 403 (sin permiso).
 T11 Usuario NO-admin elige P1 (PUT /theme/me) ⇒ 200; GET /theme/me = P1 (persiste).
 T12 Persistencia en BD: User.themePaletteId = P1.
 T13 Usuario elige paleta inexistente/ no publicada ⇒ 404.
 T14 Usuario vuelve a "por defecto" (paletteId=null) ⇒ GET /theme/me = la por defecto (P1).
 T15 Despublicar la paleta por defecto la quita de default (coherencia).

Limpia paletas/usuario temporales + default. API :3000. Clave demo Demo!Pass2026."""
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
ADMIN = "demo@watchlog.local"
PG = ["docker", "exec", "lyra-watchlog-dev-postgres-1", "psql", "-U", "watchlog", "-d", "watchlog", "-t", "-A"]
OK, FAIL = [], []

USER = "smoke-theme-user"
USER_EMAIL = "smoke-theme-user@watchlog.local"
CREATED = []  # ids de paletas creadas

DARK = {"bgBase": "#070a1a", "surface1": "#0e1430", "textPrimary": "#f0f2ff",
        "accentPrimary": "#ff5a1f", "accentSecondary": "#ffb020"}
LIGHT = {"bgBase": "#f6f4ef", "surface1": "#ffffff", "textPrimary": "#101010",
         "accentPrimary": "#cc4400", "accentSecondary": "#a36b00"}


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
    return r["accessToken"] if s == 200 and isinstance(r, dict) else None


def sql(q):
    return subprocess.run(PG + ["-c", q], capture_output=True, text=True).stdout.strip()


def check(name, cond, detail=""):
    (OK if cond else FAIL).append(name)
    print(("  ok  " if cond else "FAIL ") + name + (f"   [{detail}]" if detail else ""))


def insert_user(uid, email):
    """Usuario temporal SIN roles (autenticable, sin permisos) con la clave demo."""
    sql("INSERT INTO \"User\" (id,email,\"displayName\",\"passwordHash\",status,\"updatedAt\") "
        f"SELECT '{uid}','{email}',u.\"displayName\",u.\"passwordHash\",'ACTIVE',now() "
        "FROM \"User\" u WHERE u.email='operador@watchlog.local';")


def main():
    global ADMIN_TOK
    ADMIN_TOK = login(ADMIN)
    check("T0 login super-admin (demo)", bool(ADMIN_TOK))
    if not ADMIN_TOK:
        return finish()
    cleanup()

    # ── T1 crear paleta P1 ──
    s, p1 = call("POST", "/theme/admin/palettes", ADMIN_TOK,
                 {"name": "smoke-theme-marca", "description": "Marca institucional smoke",
                  "tokensDark": DARK, "tokensLight": LIGHT})
    p1id = p1.get("id") if isinstance(p1, dict) else None
    if p1id:
        CREATED.append(p1id)
    check("T1 admin crea P1 (dark+light) ⇒ 201", s == 201 and bool(p1id), f"http={s}")
    check("T1b tokens persistidos (accentPrimary dark)",
          isinstance(p1, dict) and p1.get("tokensDark", {}).get("accentPrimary") == "#ff5a1f")
    if not p1id:
        return finish()

    # ── T2 lista admin ──
    s, lst = call("GET", "/theme/admin/palettes", ADMIN_TOK)
    row = next((x for x in (lst or []) if x.get("id") == p1id), None) if isinstance(lst, list) else None
    check("T2 lista admin contiene P1, sin publicar/no-default",
          bool(row) and row.get("isPublished") is False and row.get("isDefault") is False, f"row={row}")

    # ── T3 editar ──
    s, _ = call("PATCH", f"/theme/admin/palettes/{p1id}", ADMIN_TOK,
                {"name": "smoke-theme-marca (ed)", "tokensDark": {**DARK, "accentPrimary": "#ff7a3f"}})
    check("T3 admin edita P1 ⇒ 200", s == 200, f"http={s}")

    # ── T4 default sin publicar ⇒ 400 ──
    s, _ = call("PUT", f"/theme/admin/palettes/{p1id}/default", ADMIN_TOK)
    check("T4 marcar por defecto SIN publicar ⇒ 400", s == 400, f"http={s}")

    # ── T5 validación de entrada ──
    s, _ = call("POST", "/theme/admin/palettes", ADMIN_TOK,
                {"name": "bad-color", "tokensDark": {"accentPrimary": "no-color"}, "tokensLight": {}})
    check("T5a color inválido ⇒ 400", s == 400, f"http={s}")
    s, _ = call("POST", "/theme/admin/palettes", ADMIN_TOK,
                {"name": "bad-key", "tokensDark": {"notAToken": "#ffffff"}, "tokensLight": {}})
    check("T5b clave fuera de whitelist ⇒ 400", s == 400, f"http={s}")
    s, _ = call("POST", "/theme/admin/palettes", ADMIN_TOK,
                {"name": "sev", "tokensDark": {"sev1": "#ffffff"}, "tokensLight": {}})
    check("T5c token de severidad (protegido) ⇒ 400", s == 400, f"http={s}")

    # ── T6 publicar ──
    s, pub = call("PUT", f"/theme/admin/palettes/{p1id}/publish", ADMIN_TOK, {"isPublished": True})
    check("T6 admin publica P1 ⇒ 200 isPublished", s == 200 and isinstance(pub, dict)
          and pub.get("isPublished") is True, f"http={s}")

    # ── T7 marcar por defecto ──
    s, lst = call("PUT", f"/theme/admin/palettes/{p1id}/default", ADMIN_TOK)
    row = next((x for x in (lst or []) if x.get("id") == p1id), None) if isinstance(lst, list) else None
    check("T7 admin marca P1 por defecto ⇒ 200, isDefault=true", s == 200 and bool(row)
          and row.get("isDefault") is True, f"http={s} row={row}")

    # ── T8 P2 sin publicar (control) ──
    s, p2 = call("POST", "/theme/admin/palettes", ADMIN_TOK,
                 {"name": "smoke-theme-borrador", "tokensDark": DARK, "tokensLight": LIGHT})
    p2id = p2.get("id") if isinstance(p2, dict) else None
    if p2id:
        CREATED.append(p2id)
    check("T8 admin crea P2 (sin publicar)", bool(p2id))

    # ── Usuario NO-admin ──
    insert_user(USER, USER_EMAIL)
    utok = login(USER_EMAIL)
    check("setup: login usuario no-admin", bool(utok))
    if not utok:
        return finish()

    # ── T9 lista pública: ve P1, NO ve P2 ──
    s, pubs = call("GET", "/theme/palettes", utok)
    ids = [x.get("id") for x in pubs] if isinstance(pubs, list) else []
    check("T9 no-admin ve la publicada P1 y NO la borrador P2",
          s == 200 and p1id in ids and p2id not in ids, f"http={s} ids={ids}")

    # ── T10 sin permiso: admin/build/publish ⇒ 403 ──
    s, _ = call("GET", "/theme/admin/palettes", utok)
    check("T10a no-admin GET admin ⇒ 403", s == 403, f"http={s}")
    s, _ = call("POST", "/theme/admin/palettes", utok, {"name": "nope", "tokensDark": {}, "tokensLight": {}})
    check("T10b no-admin construir ⇒ 403", s == 403, f"http={s}")
    s, _ = call("PUT", f"/theme/admin/palettes/{p1id}/publish", utok, {"isPublished": False})
    check("T10c no-admin publicar ⇒ 403", s == 403, f"http={s}")

    # ── T11 elegir P1 ──
    s, me = call("PUT", "/theme/me", utok, {"paletteId": p1id})
    check("T11a no-admin elige P1 ⇒ 200", s == 200 and isinstance(me, dict)
          and (me.get("palette") or {}).get("id") == p1id, f"http={s}")
    s, me = call("GET", "/theme/me", utok)
    check("T11b GET /theme/me devuelve P1 (persiste)",
          s == 200 and (me.get("palette") or {}).get("id") == p1id, f"http={s}")

    # ── T12 persistencia en BD ──
    stored = sql(f"SELECT \"themePaletteId\" FROM \"User\" WHERE id='{USER}';")
    check("T12 User.themePaletteId persiste P1 en BD", stored == p1id, f"db={stored}")

    # ── T13 elegir inexistente/ no publicada ⇒ 404 ──
    s, _ = call("PUT", "/theme/me", utok, {"paletteId": p2id})  # P2 no publicada
    check("T13 elegir paleta no publicada ⇒ 404", s == 404, f"http={s}")

    # ── T14 volver a por defecto (null) ⇒ recibe la default P1 ──
    s, me = call("PUT", "/theme/me", utok, {"paletteId": None})
    check("T14 paletteId=null ⇒ GET /theme/me = la por defecto (P1)",
          s == 200 and (me.get("palette") or {}).get("id") == p1id, f"http={s}")

    # ── T15 despublicar la default la quita de default (coherencia) ──
    s, _ = call("PUT", f"/theme/admin/palettes/{p1id}/publish", ADMIN_TOK, {"isPublished": False})
    s, lst = call("GET", "/theme/admin/palettes", ADMIN_TOK)
    row = next((x for x in (lst or []) if x.get("id") == p1id), None) if isinstance(lst, list) else None
    default_now = sql("SELECT COALESCE(\"defaultPaletteId\",'') FROM \"SystemSettings\" WHERE id='system';")
    check("T15 despublicar la default la quita de default", bool(row)
          and row.get("isDefault") is False and default_now != p1id, f"row={row} default={default_now}")

    return finish()


def cleanup():
    sql("UPDATE \"SystemSettings\" SET \"defaultPaletteId\"=NULL "
        "WHERE \"defaultPaletteId\" IN (SELECT id FROM \"ThemePalette\" WHERE name LIKE 'smoke-theme-%');")
    sql(f"UPDATE \"User\" SET \"themePaletteId\"=NULL WHERE id='{USER}';")
    sql("DELETE FROM \"ThemePalette\" WHERE name LIKE 'smoke-theme-%';")
    sql(f"DELETE FROM \"UserRole\" WHERE \"userId\"='{USER}';")
    sql(f"DELETE FROM \"User\" WHERE id='{USER}';")


def finish():
    cleanup()
    print(f"\n=== {len(OK)} ok, {len(FAIL)} fail ===")
    if FAIL:
        for f in FAIL:
            print("  - " + f)
        sys.exit(1)
    print("Todos los checks en verde ✅")


if __name__ == "__main__":
    main()
