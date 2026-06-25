#!/usr/bin/env python3
"""Smoke de TEMAS FASE 2A — PLANTILLAS DE INICIO + DUPLICAR (EST-TEMAS) — 2026-06-24.

La Fase 2A agrega un catálogo CURADO de paletas de arranque ("starter themes", constantes
en @lyra/contracts) y dos atajos de admin que CLONAN tokens en una paleta NUEVA (borrador):
 - "Empezar desde una plantilla": clona los tokens de una plantilla curada.
 - "Duplicar / guardar como nueva": clona una paleta existente a "… (copia)".

Ambos son CLONADO EN CLIENTE: leer tokens y llamar al POST /theme/admin/palettes existente
(menos superficie de API, reusa validación). Por eso este smoke verifica el CONTRATO en que
se apoyan: crear un borrador a partir de tokens dados; que la copia sea INDEPENDIENTE del
original; y que sin `theme:manage` clonar/duplicar dé 403. Las PLANTILLAS no son paletas de
BD (no se seedean, no se publican, el usuario final no las ve): son solo el arranque.

Ejes:
 T0  Login super-admin (demo).
 T1  "Clonar plantilla": POST con los tokens de una plantilla (Índigo) ⇒ 201, BORRADOR
     (isPublished/isDefault=false), tokens persistidos = los de la plantilla.
 T2  La plantilla solo usa la whitelist: clonar con un token de SEVERIDAD ⇒ 400 (protegido).
 T3  "Duplicar": GET la paleta clonada y POST otra con sus mismos tokens + nombre "… (copia)"
     ⇒ 201, id distinto, borrador.
 T4  INDEPENDENCIA: editar (PATCH) un token de la COPIA NO altera el ORIGINAL.
 T5  La copia editada difiere del original en ese token (cambio aislado real).
 T6  Sin permiso (`theme:manage`): no-admin clona ⇒ 403; no-admin duplica (PATCH) ⇒ 403.

Limpia paletas/usuario temporales. API :3000. Clave demo Demo!Pass2026."""
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

USER = "smoke-tpl-user"
USER_EMAIL = "smoke-tpl-user@watchlog.local"
CREATED = []  # ids de paletas creadas

# Espejo de la plantilla "Índigo" (packages/contracts/src/theme/presets.ts). El smoke no
# importa TS; basta un subconjunto representativo para ejercitar el clonado.
PRESET_DARK = {"bgBase": "#0a0a1c", "surface1": "#101028", "surface2": "#161634", "surface3": "#20204a",
               "textPrimary": "#eceff7", "textSecondary": "#b4bcce", "textMuted": "#97a1b5",
               "accentPrimary": "#6366f1", "accentSecondary": "#06b6d4"}
PRESET_LIGHT = {"bgBase": "#eeeef8", "surface1": "#ffffff", "surface2": "#f4f4fc", "surface3": "#e7e7f6",
                "textPrimary": "#101726", "textSecondary": "#44516a", "textMuted": "#5a6478",
                "accentPrimary": "#4f46e5", "accentSecondary": "#0e7490"}


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
    admin = login(ADMIN)
    check("T0 login super-admin (demo)", bool(admin))
    if not admin:
        return finish()
    cleanup()

    # ── T1 clonar plantilla en una paleta NUEVA (borrador) ──
    s, p1 = call("POST", "/theme/admin/palettes", admin,
                 {"name": "smoke-tpl Índigo", "description": "Clonada de la plantilla Índigo",
                  "tokensDark": PRESET_DARK, "tokensLight": PRESET_LIGHT})
    p1id = p1.get("id") if isinstance(p1, dict) else None
    if p1id:
        CREATED.append(p1id)
    check("T1 clonar plantilla ⇒ 201 borrador", s == 201 and bool(p1id)
          and p1.get("isPublished") is False and p1.get("isDefault") is False, f"http={s}")
    check("T1b tokens de la plantilla persistidos",
          isinstance(p1, dict)
          and p1.get("tokensDark", {}).get("accentPrimary") == "#6366f1"
          and p1.get("tokensLight", {}).get("accentPrimary") == "#4f46e5")
    if not p1id:
        return finish()

    # ── T2 las plantillas solo tocan la whitelist (severidad protegida) ──
    s, _ = call("POST", "/theme/admin/palettes", admin,
                {"name": "smoke-tpl bad", "tokensDark": {**PRESET_DARK, "sev1": "#ffffff"},
                 "tokensLight": PRESET_LIGHT})
    check("T2 clonar con token de severidad ⇒ 400 (protegido)", s == 400, f"http={s}")

    # ── T3 duplicar: clonar la paleta existente a "… (copia)" ──
    s, orig = call("GET", "/theme/admin/palettes", admin)
    row = next((x for x in (orig or []) if x.get("id") == p1id), None) if isinstance(orig, list) else None
    s, p2 = call("POST", "/theme/admin/palettes", admin,
                 {"name": "smoke-tpl Índigo (copia)", "description": row.get("description") if row else None,
                  "tokensDark": row["tokensDark"], "tokensLight": row["tokensLight"]})
    p2id = p2.get("id") if isinstance(p2, dict) else None
    if p2id:
        CREATED.append(p2id)
    check("T3 duplicar ⇒ 201 copia distinta (borrador)", s == 201 and bool(p2id) and p2id != p1id
          and p2.get("isPublished") is False, f"http={s}")

    # ── T4/T5 independencia: editar la COPIA no toca el ORIGINAL ──
    s, _ = call("PATCH", f"/theme/admin/palettes/{p2id}", admin,
                {"tokensDark": {**PRESET_DARK, "accentPrimary": "#ff0000"}})
    check("T4a PATCH de la copia ⇒ 200", s == 200, f"http={s}")
    s, o = call("GET", "/theme/admin/palettes", admin)
    orow = next((x for x in (o or []) if x.get("id") == p1id), None) if isinstance(o, list) else None
    crow = next((x for x in (o or []) if x.get("id") == p2id), None) if isinstance(o, list) else None
    check("T4b el ORIGINAL conserva su acento (#6366f1)",
          bool(orow) and orow.get("tokensDark", {}).get("accentPrimary") == "#6366f1",
          f"orig={orow.get('tokensDark', {}).get('accentPrimary') if orow else None}")
    check("T5 la COPIA tiene el acento editado (#ff0000), aislado del original",
          bool(crow) and crow.get("tokensDark", {}).get("accentPrimary") == "#ff0000",
          f"copy={crow.get('tokensDark', {}).get('accentPrimary') if crow else None}")

    # ── T6 sin permiso: clonar/duplicar ⇒ 403 ──
    insert_user(USER, USER_EMAIL)
    utok = login(USER_EMAIL)
    check("setup: login usuario no-admin", bool(utok))
    if utok:
        s, _ = call("POST", "/theme/admin/palettes", utok,
                    {"name": "nope", "tokensDark": PRESET_DARK, "tokensLight": PRESET_LIGHT})
        check("T6a no-admin clona plantilla ⇒ 403", s == 403, f"http={s}")
        s, _ = call("PATCH", f"/theme/admin/palettes/{p1id}", utok, {"tokensDark": PRESET_DARK})
        check("T6b no-admin duplica/edita ⇒ 403", s == 403, f"http={s}")

    return finish()


def cleanup():
    sql("DELETE FROM \"ThemePalette\" WHERE name LIKE 'smoke-tpl%';")
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
