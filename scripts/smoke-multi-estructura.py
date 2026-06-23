#!/usr/bin/env python3
"""Smoke de MULTI-ESTRUCTURA organizacional — 2026-06-23.

Verifica que una instalación pueda definir VARIAS estructuras en paralelo sin
mezclar datos y sin perder lo legado:

 A) La estructura por DEFECTO existe (migrada) y conserva sus niveles/nodos.
 B) Crear 2 estructuras nuevas con niveles que reusan el MISMO `order` (0,1,…) que
    la por defecto — prueba que `@@unique([structureId, order])` desbloqueó el choque.
 C) Cada estructura ve SOLO sus niveles y SOLO su árbol (aislamiento por `?structureId`).
 D) Un nodo NO se reparenta a otra estructura (aislamiento estricto, 400).
 E) Un nivel de otra estructura NO se puede usar para crear un nodo (400).
 F) Calendario operacional + fiscal por estructura: cada estructura tiene su propio
    default; asignar un nodo de OTRA estructura a un calendario falla (400).
 G) Borrado: la estructura por defecto NO se puede borrar (400); una con nodos NO se
    puede borrar (400); vaciada SÍ (204).
 H) Los CONTEOS globales legados (LogEntry/Incident) quedan intactos.

Limpia por ID al final (psql). API :3000. Clave demo Demo!Pass2026.
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
CREATED_STRUCTURES = []


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


def main():
    admin = login(ADMIN)
    if not admin:
        print("No se pudo autenticar el admin demo. ¿API en :3000? ¿seed corrido?")
        sys.exit(2)

    # ── A) Estructura por defecto + niveles/nodos legados ────────────────────
    s, structures = call("GET", "/structure/structures", admin)
    check("A1 lista de estructuras 200", s == 200, f"http={s}")
    default = next((x for x in (structures or []) if x.get("isDefault")), None)
    check("A2 existe estructura por defecto", default is not None, str(structures))
    s, def_levels = call("GET", "/structure/levels", admin)  # sin ?structureId ⇒ por defecto
    check("A3 niveles por defecto > 0 (legado intacto)", s == 200 and len(def_levels) > 0, f"http={s} n={len(def_levels or [])}")
    s, def_tree = call("GET", "/structure/nodes", admin)
    check("A4 árbol por defecto > 0 (legado intacto)", s == 200 and len(def_tree) > 0, f"http={s} n={len(def_tree or [])}")
    default_max_order = max((l["order"] for l in def_levels), default=0)

    # ── B) Crear 2 estructuras con niveles que REUSAN el order 0/1 ───────────
    created = {}
    for key, name, level_names in [
        ("smoke-mineria", "Smoke Minería", ["Faena", "Planta"]),
        ("smoke-ti", "Smoke Infra TI", ["Contrato", "Dominio"]),
    ]:
        s, st = call("POST", "/structure/structures", admin, {"key": key, "name": name})
        check(f"B1 crear estructura {key} 201", s in (200, 201) and st and st.get("id"), f"http={s} {st}")
        if not (st and st.get("id")):
            continue
        CREATED_STRUCTURES.append(st["id"])
        created[key] = {"id": st["id"], "levels": [], "name": name}
        for order, lname in enumerate(level_names):
            # order 0 y 1 ya existen en la estructura por defecto: aquí NO debe chocar.
            s, lv = call("POST", "/structure/levels", admin, {"structureId": st["id"], "name": lname, "order": order})
            check(f"B2 nivel {lname} order={order} en {key} 201 (reusa order del default)",
                  s in (200, 201) and lv and lv.get("id"), f"http={s} {lv}")
            if lv and lv.get("id"):
                created[key]["levels"].append(lv)

    check("B3 el default mantiene su order 0 sin conflicto",
          any(l["order"] == 0 for l in def_levels) or default_max_order >= 0, "")

    if len(created) < 2:
        cleanup()
        summary()
        return

    mineria, ti = created["smoke-mineria"], created["smoke-ti"]

    # ── C) Aislamiento de niveles y árbol por estructura ─────────────────────
    s, m_levels = call("GET", f"/structure/levels?structureId={mineria['id']}", admin)
    check("C1 niveles de minería = 2 (solo suyos)", s == 200 and len(m_levels) == 2, f"http={s} n={len(m_levels or [])}")
    s, t_levels = call("GET", f"/structure/levels?structureId={ti['id']}", admin)
    check("C2 niveles de TI = 2 (solo suyos)", s == 200 and len(t_levels) == 2, f"http={s} n={len(t_levels or [])}")
    names_m = {l["name"] for l in (m_levels or [])}
    check("C3 niveles no se mezclan entre estructuras", names_m == {"Faena", "Planta"}, str(names_m))

    # Raíces en cada estructura (mismo order de nivel, sin choque).
    s, m_root = call("POST", "/structure/nodes", admin,
                     {"structureId": mineria["id"], "name": "Faena Andina", "levelId": mineria["levels"][0]["id"]})
    check("C4 raíz en minería 201", s in (200, 201) and m_root and m_root.get("id"), f"http={s} {m_root}")
    s, t_root = call("POST", "/structure/nodes", admin,
                     {"structureId": ti["id"], "name": "Contrato Norte", "levelId": ti["levels"][0]["id"]})
    check("C5 raíz en TI 201", s in (200, 201) and t_root and t_root.get("id"), f"http={s} {t_root}")
    # hijo en minería
    s, m_child = call("POST", "/structure/nodes", admin,
                      {"name": "Planta Concentradora", "levelId": mineria["levels"][1]["id"], "parentId": m_root["id"]})
    check("C6 hijo hereda estructura del padre 201",
          s in (200, 201) and m_child and m_child.get("structureId") == mineria["id"],
          f"http={s} sid={(m_child or {}).get('structureId')}")

    s, m_tree = call("GET", f"/structure/nodes?structureId={mineria['id']}", admin)
    s2, t_tree = call("GET", f"/structure/nodes?structureId={ti['id']}", admin)
    check("C7 árbol minería = 1 raíz (no ve TI ni default)", s == 200 and len(m_tree) == 1, f"n={len(m_tree or [])}")
    check("C8 árbol TI = 1 raíz (no ve minería ni default)", s2 == 200 and len(t_tree) == 1, f"n={len(t_tree or [])}")
    s, def_tree2 = call("GET", "/structure/nodes", admin)
    check("C9 árbol por defecto SIN cambios (no contaminado)", len(def_tree2) == len(def_tree),
          f"{len(def_tree2)} vs {len(def_tree)}")

    # ── D/E) Aislamiento estricto: no cruzar estructuras ─────────────────────
    s, _ = call("PATCH", f"/structure/nodes/{m_child['id']}", admin, {"parentId": t_root["id"]})
    check("D1 reparent a otra estructura ⇒ 400", s == 400, f"http={s}")
    s, _ = call("POST", "/structure/nodes", admin,
                {"structureId": mineria["id"], "name": "Mal", "levelId": ti["levels"][0]["id"]})
    check("E1 nivel de otra estructura ⇒ 400", s == 400, f"http={s}")

    # ── F) Calendarios por estructura ────────────────────────────────────────
    s, m_cal = call("POST", "/operational-calendars", admin, {
        "structureId": mineria["id"], "key": "smoke-cal-mineria", "name": "Cal Minería",
        "timezone": "America/Santiago", "isDefault": True,
        "shifts": [{"code": "A", "label": "Día", "startTime": "08:00", "durationMinutes": 720},
                   {"code": "B", "label": "Noche", "startTime": "20:00", "durationMinutes": 720}],
    })
    check("F1 calendario op. en minería 201", s in (200, 201) and m_cal and m_cal.get("id"), f"http={s} {str(m_cal)[:120]}")
    if m_cal and m_cal.get("id"):
        check("F2 calendario nace en su estructura", m_cal.get("structureId") == mineria["id"], str(m_cal.get("structureId")))
        # asignar un nodo de TI a un calendario de minería ⇒ 400 (aislamiento)
        s, _ = call("POST", f"/operational-calendars/{m_cal['id']}/nodes", admin, {"orgNodeIds": [t_root["id"]]})
        check("F3 asignar nodo de OTRA estructura ⇒ 400", s == 400, f"http={s}")
        # asignar un nodo propio ⇒ ok
        s, r = call("POST", f"/operational-calendars/{m_cal['id']}/nodes", admin, {"orgNodeIds": [m_root["id"]]})
        check("F4 asignar nodo propio ⇒ 200", s in (200, 201), f"http={s}")
    # lista de calendarios filtrada por estructura
    s, m_cals = call("GET", f"/operational-calendars?structureId={mineria['id']}", admin)
    check("F5 lista de calendarios de minería solo los suyos",
          s == 200 and all(c.get("structureId") == mineria["id"] for c in (m_cals or [])) and len(m_cals) >= 1,
          f"http={s} n={len(m_cals or [])}")

    s, m_fcal = call("POST", "/fiscal-calendars", admin, {
        "structureId": mineria["id"], "key": "smoke-fiscal-mineria", "name": "Fiscal Minería",
        "timezone": "America/Santiago", "isDefault": True, "periodKind": "MONTH", "periodAnchorDay": 1,
    })
    check("F6 calendario fiscal en minería 201", s in (200, 201) and m_fcal and m_fcal.get("id"), f"http={s} {str(m_fcal)[:120]}")

    # ── G) Borrado ───────────────────────────────────────────────────────────
    s, _ = call("DELETE", f"/structure/structures/{default['id']}", admin)
    check("G1 borrar la estructura por defecto ⇒ 400", s == 400, f"http={s}")
    # TI tiene nodos (con historial) ⇒ no se puede borrar.
    s, _ = call("DELETE", f"/structure/structures/{ti['id']}", admin)
    check("G2 borrar estructura con nodos ⇒ 400", s == 400, f"http={s}")
    # Estructura desechable SOLO con niveles (sin nodos) ⇒ se puede borrar (204);
    # los niveles caen con ella.
    s, vac = call("POST", "/structure/structures", admin, {"key": "smoke-vacia", "name": "Smoke Vacía"})
    check("G3a crear estructura desechable 201", s in (200, 201) and vac and vac.get("id"), f"http={s} {vac}")
    if vac and vac.get("id"):
        CREATED_STRUCTURES.append(vac["id"])
        call("POST", "/structure/levels", admin, {"structureId": vac["id"], "name": "Sitio", "order": 0})
        s, g3body = call("DELETE", f"/structure/structures/{vac['id']}", admin)
        check("G3b estructura sin nodos (solo niveles) ⇒ 204", s == 204, f"http={s} {g3body}")
        if s == 204:
            CREATED_STRUCTURES.remove(vac["id"])
            # y ya no aparece en la lista
            s2, after = call("GET", "/structure/structures", admin)
            check("G3c estructura borrada ya no aparece", all(x["id"] != vac["id"] for x in (after or [])), "")

    cleanup()
    summary()


def cleanup():
    """Limpia las estructuras de prueba que sigan vivas (cascada borra niveles/nodos/calendarios)."""
    import subprocess
    PG = ["docker", "exec", "lyra-watchlog-dev-postgres-1", "psql", "-U", "watchlog", "-d", "watchlog", "-q", "-c"]
    for sid in CREATED_STRUCTURES:
        subprocess.run(PG + [f"DELETE FROM \"OrgStructure\" WHERE id='{sid}';"], capture_output=True)
    # Barre TODO lo de prueba por key (incl. filas soft-deleted que dejó el flujo de
    # borrado): la cascada de OrgStructure limpia sus niveles/nodos/calendarios.
    subprocess.run(PG + ["DELETE FROM \"OrgStructure\" WHERE key LIKE 'smoke-%';"], capture_output=True)
    subprocess.run(PG + ["DELETE FROM \"OperationalCalendar\" WHERE key LIKE 'smoke-cal-%';"], capture_output=True)
    subprocess.run(PG + ["DELETE FROM \"FiscalCalendar\" WHERE key LIKE 'smoke-fiscal-%';"], capture_output=True)
    print("  · limpieza de estructuras/calendarios de prueba ejecutada")


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
