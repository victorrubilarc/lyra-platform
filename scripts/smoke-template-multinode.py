#!/usr/bin/env python3
"""Smoke de PLANTILLAS MULTI-NODO (Fase 2.8.0). Verifica el eje de NODO de la
visibilidad de plantilla: asignaciones N:M (un nodo / rama / global), el endpoint
de nodos ELEGIBLES al crear (asignaciones ∩ alcance del usuario), la validación de
membresía en previewNew (sin persistir entradas) y el filtrado del picker por el
alcance de NODO de un usuario restringido. CREA una plantilla propia + un rol
temporal y LIMPIA TODO al final SOLO por ID. Reutiliza la demo (operador@). API :3000."""
import json
import os
import urllib.request
import urllib.error

BASE = os.environ.get("WL_BASE", "http://localhost:3000/api")
PASS = os.environ.get("WL_DEMO_PASS", "Demo!Pass2026")
ADMIN = {"email": os.environ.get("WL_ADMIN_EMAIL", "demo@watchlog.local"), "password": PASS}
OK, FAIL = [], []


def req(method, path, tok=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    # Solo declarar JSON cuando hay cuerpo (Fastify rechaza body vacío con ese header).
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


def check(name, cond, detail=""):
    (OK if cond else FAIL).append(name)
    print(("  ok " if cond else "FAIL ") + name + (f"  [{detail}]" if detail else ""))


def flatten(nodes, parent=None, out=None):
    if out is None:
        out = []
    for n in nodes:
        out.append({"id": n["id"], "name": n["name"], "parent": parent, "children": n.get("children", [])})
        flatten(n.get("children", []), n["id"], out)
    return out


def main():
    _, login = req("POST", "/auth/login", body=ADMIN)
    atok = login["accessToken"]

    # --- Elegir nodos: un padre con hijos, un hijo y un nodo "otro" no relacionado.
    _, tree = req("GET", "/structure/nodes", atok)
    flat = flatten(tree)
    parent = next((n for n in flat if n["children"]), None)
    if not parent:
        print("Estructura sin nodos con hijos; no se puede correr el smoke.")
        return
    child = parent["children"][0]
    child_id, child_name = child["id"], child["name"]
    parent_id = parent["id"]
    # "otro" = un nodo que NO esté en el subárbol del padre.
    sub = {parent_id} | {c["id"] for c in flatten(parent["children"])}
    other = next((n for n in flat if n["id"] not in sub), None)
    if not other:
        print("No hay un nodo fuera del subárbol del padre; no se puede aislar.")
        return
    other_id = other["id"]
    print(f"Nodos: padre={parent_id} hijo={child_id}({child_name}) otro={other_id}")

    tpl_id = None
    role_id = None
    op_id = None
    op_scope_backup = None
    try:
        # === 1. Crear plantilla asignada a UN nodo (el hijo) =================
        _, det = req("POST", "/templates", atok, {
            "name": "ZZ Smoke Multinodo",
            "nodeAssignments": [{"orgNodeId": child_id, "includeDescendants": False}],
        })
        tpl_id = det["id"]
        check("create persiste 1 asignación (hijo)",
              [a["orgNodeId"] for a in det["nodeAssignments"]] == [child_id]
              and det["nodeAssignments"][0]["includeDescendants"] is False, str(det["nodeAssignments"]))
        check("orgNodeId primario derivado = hijo", det["orgNodeId"] == child_id, str(det["orgNodeId"]))

        # Guardar borrador con 1 sección/1 campo y publicar (para crear/preview).
        req("PUT", f"/templates/{tpl_id}/draft", atok, {
            "nodeAssignments": [{"orgNodeId": child_id, "includeDescendants": False}],
            "sections": [{"key": "s1", "title": "Sección", "fields": [
                {"key": "obs", "type": "TEXT", "label": "Observación"}]}],
        })
        scp, _ = call("POST", f"/templates/{tpl_id}/publish", atok, {})
        check("publish 200/201", scp in (200, 201), str(scp))

        # === 2. Nodos ELEGIBLES (admin sin restricción): solo el hijo =======
        _, elig = req("GET", f"/log-entries/templates/{tpl_id}/nodes", atok)
        ids = [n["id"] for n in elig["nodes"]]
        check("elegibles (1 nodo simple) = solo el hijo", ids == [child_id], str(ids))

        # === 3. previewNew valida membresía (sin persistir) =================
        sc, _ = call("GET", f"/log-entries/new?templateId={tpl_id}&orgNodeId={child_id}", atok)
        check("preview en el nodo asignado => 200", sc == 200, str(sc))
        sc, _ = call("GET", f"/log-entries/new?templateId={tpl_id}&orgNodeId={other_id}", atok)
        check("preview en nodo NO asignado => 400", sc == 400, str(sc))

        # === 4. Reasignar a RAMA (padre + descendientes) ====================
        _, det2 = req("PATCH", f"/templates/{tpl_id}", atok, {
            "nodeAssignments": [{"orgNodeId": parent_id, "includeDescendants": True}]})
        check("update a rama persiste includeDescendants",
              det2["nodeAssignments"][0]["includeDescendants"] is True
              and det2["nodeAssignments"][0]["orgNodeId"] == parent_id, str(det2["nodeAssignments"]))
        check("orgNodeId primario = null en rama", det2["orgNodeId"] is None, str(det2["orgNodeId"]))
        _, elig2 = req("GET", f"/log-entries/templates/{tpl_id}/nodes", atok)
        ids2 = {n["id"] for n in elig2["nodes"]}
        check("elegibles (rama) incluye padre y descendientes", parent_id in ids2 and child_id in ids2, f"n={len(ids2)}")
        sc, _ = call("GET", f"/log-entries/new?templateId={tpl_id}&orgNodeId={child_id}", atok)
        check("preview de un descendiente de la rama => 200", sc == 200, str(sc))

        # === 5. Reasignar a GLOBAL (sin asignaciones) =======================
        _, det3 = req("PATCH", f"/templates/{tpl_id}", atok, {"nodeAssignments": []})
        check("update a global = 0 asignaciones", det3["nodeAssignments"] == [], str(det3["nodeAssignments"]))
        sc, _ = call("GET", f"/log-entries/new?templateId={tpl_id}&orgNodeId={other_id}", atok)
        check("global: preview en cualquier nodo accesible => 200", sc == 200, str(sc))

        # === 6. Filtrado del PICKER por alcance de NODO del usuario ==========
        _, users = req("GET", "/security/users", atok)
        op = next((u for u in users if u["email"] == "operador@watchlog.local"), None)
        if op:
            op_id = op["id"]
            _, opdet = req("GET", f"/security/users/{op_id}", atok)
            op_scope_backup = opdet.get("scopes", [])
            # Restringir al operador SOLO al nodo "otro".
            req("PUT", f"/security/users/{op_id}/scope", atok,
                {"scopes": [{"orgNodeId": other_id, "includeDescendants": False}]})
            _, oplogin = req("POST", "/auth/login", body={"email": "operador@watchlog.local", "password": PASS})
            otok = oplogin["accessToken"]

            # Plantilla asignada al hijo => fuera del alcance (otro) => NO en el picker.
            req("PATCH", f"/templates/{tpl_id}", atok,
                {"nodeAssignments": [{"orgNodeId": child_id, "includeDescendants": False}]})
            _, pk = req("GET", "/log-entries/templates", otok)
            check("plantilla en nodo fuera de alcance NO aparece en el picker",
                  tpl_id not in {t["id"] for t in pk}, f"ids={[t['id'] for t in pk]}")

            # Global => visible para el operador restringido.
            req("PATCH", f"/templates/{tpl_id}", atok, {"nodeAssignments": []})
            _, pk2 = req("GET", "/log-entries/templates", otok)
            check("plantilla GLOBAL aparece para el operador restringido",
                  tpl_id in {t["id"] for t in pk2}, f"ids={[t['id'] for t in pk2]}")

            # Asignada al nodo "otro" (su alcance) => visible.
            req("PATCH", f"/templates/{tpl_id}", atok,
                {"nodeAssignments": [{"orgNodeId": other_id, "includeDescendants": False}]})
            _, pk3 = req("GET", "/log-entries/templates", otok)
            check("plantilla en el nodo del operador SÍ aparece",
                  tpl_id in {t["id"] for t in pk3}, f"ids={[t['id'] for t in pk3]}")
        else:
            print("  (no existe operador@watchlog.local; se omite el filtrado por usuario)")

    finally:
        # === LIMPIEZA SOLO POR ID =========================================
        if op_id is not None and op_scope_backup is not None:
            call("PUT", f"/security/users/{op_id}/scope", atok, {"scopes": op_scope_backup})
            print(f"  cleanup: scope de operador restaurado ({len(op_scope_backup)} entradas)")
        if tpl_id:
            sc, _ = call("DELETE", f"/templates/{tpl_id}", atok)
            print(f"  cleanup: plantilla {tpl_id} eliminada (DELETE {sc})")
        if role_id:
            call("DELETE", f"/security/roles/{role_id}", atok)

    print(f"\nRESULTADO: {len(OK)} ok · {len(FAIL)} fail")
    if FAIL:
        print("FALLARON: " + ", ".join(FAIL))


if __name__ == "__main__":
    main()
