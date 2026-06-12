#!/usr/bin/env python3
"""Crea una DEMO completa de bitácora: roles, usuarios, flujo y plantilla con
todas las capacidades (multi-actor por rol, granularidad por campo, flujo con
firma Part 11, umbrales, fecha efectiva, visibilidad condicional, ventana de
edición). Idempotente: re-ejecutar no duplica. Requiere la API en :3000."""
import json
import os
import urllib.request
import urllib.error

# Configurable por entorno; defaults = credenciales de DEMO/dev (no producción).
BASE = os.environ.get("WL_BASE", "http://localhost:3000/api")
PASS = os.environ.get("WL_DEMO_PASS", "Demo!Pass2026")
ADMIN = {"email": os.environ.get("WL_ADMIN_EMAIL", "demo@watchlog.local"), "password": PASS}


def req(method, path, tok=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method)
    r.add_header("Content-Type", "application/json")
    if tok:
        r.add_header("Authorization", "Bearer " + tok)
    try:
        with urllib.request.urlopen(r) as resp:
            txt = resp.read().decode()
            return json.loads(txt) if txt else None
    except urllib.error.HTTPError as e:
        msg = e.read().decode()
        raise RuntimeError(f"{method} {path} -> {e.code}: {msg}")


def main():
    tok = req("POST", "/auth/login", body=ADMIN)["accessToken"]

    # --- 1. Roles (idempotente por key) -------------------------------------
    roles = {r["key"]: r for r in req("GET", "/security/roles", tok)}

    def ensure_role(key, name, perms):
        if key in roles:
            return roles[key]
        r = req("POST", "/security/roles", tok,
                {"key": key, "name": name, "permissionKeys": perms, "requireMfa": False})
        roles[key] = r
        return r

    op = ensure_role("op-molienda", "Operador de Molienda",
                     ["module:logbook:view", "logentry:view", "logentry:create", "logentry:fill", "logentry:transition"])
    sup = ensure_role("sup-turno", "Supervisor de Turno",
                      ["module:logbook:view", "logentry:view", "logentry:fill", "logentry:transition"])
    man = ensure_role("mantenedor", "Mantenedor",
                      ["module:logbook:view", "logentry:view", "logentry:fill"])

    # --- 2. Usuarios (idempotente por email) --------------------------------
    users = {u["email"]: u for u in req("GET", "/security/users", tok)}

    def ensure_user(email, name, role_id):
        if email in users:
            u = users[email]
            req("PUT", f"/security/users/{u['id']}/roles", tok, {"roleIds": [role_id]})
            return u
        u = req("POST", "/security/users", tok,
                {"email": email, "displayName": name, "password": PASS, "roleIds": [role_id]})
        users[email] = u
        return u

    ensure_user("operador@watchlog.local", "Olga Operadora", op["id"])
    ensure_user("supervisor@watchlog.local", "Sergio Supervisor", sup["id"])
    ensure_user("mantenedor@watchlog.local", "Manuel Mantenedor", man["id"])

    # --- 3. Flujo (idempotente por nombre) ----------------------------------
    wf_name = "Flujo Turno — Demo Completa"
    wf = next((w for w in req("GET", "/workflows", tok) if w["name"] == wf_name), None)
    if not wf:
        wf = req("POST", "/workflows", tok,
                 {"key": "demo-turno-completa", "name": wf_name,
                  "description": "Borrador → En revisión → (Aprobado | Observado → Borrador)."})
        req("PUT", f"/workflows/{wf['id']}/draft", tok, {
            "name": wf_name,
            "states": [
                {"key": "borrador", "name": "Borrador", "isInitial": True, "isFinal": False, "color": "indigo"},
                {"key": "en_revision", "name": "En revisión", "isInitial": False, "isFinal": False, "color": "cyan"},
                {"key": "observado", "name": "Observado", "isInitial": False, "isFinal": False, "color": "amber"},
                {"key": "aprobado", "name": "Aprobado", "isInitial": False, "isFinal": True, "color": "green"},
            ],
            "transitions": [
                {"key": "enviar", "label": "Enviar a revisión", "fromStateKey": "borrador", "toStateKey": "en_revision", "roleIds": [op["id"]]},
                {"key": "aprobar", "label": "Aprobar", "fromStateKey": "en_revision", "toStateKey": "aprobado",
                 "requireSignature": True, "signatureMeaning": "Aprobado", "roleIds": [sup["id"]]},
                {"key": "observar", "label": "Observar", "fromStateKey": "en_revision", "toStateKey": "observado", "roleIds": [sup["id"]]},
                {"key": "corregir", "label": "Corregir", "fromStateKey": "observado", "toStateKey": "borrador", "roleIds": [op["id"]]},
            ],
        })
        req("POST", f"/workflows/{wf['id']}/publish", tok, {})
    wf_detail = req("GET", f"/workflows/{wf['id']}", tok)
    wf_version_id = wf_detail["currentVersionId"]

    # --- 4. Plantilla (idempotente por nombre) ------------------------------
    tpl_name = "Bitácora de Turno — Demo Completa"
    tpl = next((x for x in req("GET", "/templates", tok) if x["name"] == tpl_name), None)
    if not tpl:
        node_id = req("GET", "/structure/nodes", tok)[0]["id"]
        tpl = req("POST", "/templates", tok, {"name": tpl_name, "orgNodeId": node_id})
        req("PUT", f"/templates/{tpl['id']}/draft", tok, {
            "name": tpl_name,
            "description": "Demo de capacidades: multi-actor por rol, granularidad por campo, flujo con firma, umbrales, fecha efectiva, condicional y ventana de edición.",
            "orgNodeId": node_id,
            "editWindowAnchor": "RECORDED",
            "editWindowMinutes": 2880,  # 48 h
            "workflowDefinitionId": wf["id"],
            "workflowDefinitionVersionId": wf_version_id,
            "requireSignature": False,
            "sections": [
                {
                    "key": "identificacion", "title": "Identificación del turno",
                    "editableInStateKey": "borrador", "roleIds": [op["id"]],
                    "fields": [
                        {"key": "turno", "type": "SELECT", "label": "Turno", "required": True,
                         "config": {"optionSource": {"kind": "inline", "items": [
                             {"code": "A", "label": "Turno A (07–15)"},
                             {"code": "B", "label": "Turno B (15–23)"},
                             {"code": "C", "label": "Turno C (23–07)"}]}}},
                        {"key": "fecha_evento", "type": "DATE", "label": "Fecha del turno",
                         "required": True, "semanticRole": "EFFECTIVE_DATE"},
                        {"key": "operador", "type": "TEXT", "label": "Operador a cargo",
                         "required": True, "config": {"maxLength": 80}},
                    ],
                },
                {
                    "key": "lecturas", "title": "Lecturas y estado del equipo",
                    "editableInStateKey": "borrador", "roleIds": [op["id"], man["id"]],
                    "fields": [
                        {"key": "temp_descanso", "type": "NUMBER", "label": "Temperatura descanso", "required": True,
                         "config": {"unit": "°C", "min": 0, "max": 120, "warnHigh": 70, "critHigh": 85, "decimals": 1}},
                        {"key": "presion_aceite", "type": "NUMBER", "label": "Presión de aceite", "required": True,
                         "config": {"unit": "bar", "min": 0, "max": 10, "warnLow": 2, "critLow": 1.5, "decimals": 1}},
                        {"key": "opero_normal", "type": "BOOLEAN", "label": "¿El equipo operó normal?", "required": True},
                        {"key": "detalle_anomalia", "type": "TEXTAREA", "label": "Detalle de la anomalía",
                         "config": {"maxLength": 500}, "visibleWhen": {"fieldKey": "opero_normal", "equals": False}},
                        {"key": "estado_mecanico", "type": "SELECT", "label": "Estado mecánico (lo registra Mantenedor)",
                         "required": True, "roleIds": [man["id"]],
                         "config": {"optionSource": {"kind": "inline", "items": [
                             {"code": "ok", "label": "Conforme"},
                             {"code": "obs", "label": "Con observaciones"},
                             {"code": "falla", "label": "Falla"}]}}},
                    ],
                },
                {
                    "key": "revision", "title": "Revisión y aprobación",
                    "editableInStateKey": "en_revision", "requireSignature": True, "roleIds": [sup["id"]],
                    "fields": [
                        {"key": "severidad", "type": "SEVERITY", "label": "Severidad del turno", "required": True},
                        {"key": "conformidad", "type": "SELECT", "label": "Conformidad", "required": True,
                         "config": {"optionSource": {"kind": "inline", "items": [
                             {"code": "conforme", "label": "Conforme"},
                             {"code": "no_conforme", "label": "No conforme"}]}}},
                        {"key": "comentario", "type": "TEXTAREA", "label": "Comentario de revisión",
                         "required": True, "config": {"maxLength": 500}},
                    ],
                },
            ],
        })
        req("POST", f"/templates/{tpl['id']}/publish", tok, {})

    print("OK")
    print("template_id=" + tpl["id"])
    print("workflow_id=" + wf["id"])
    print("roles=" + ",".join([op["id"], sup["id"], man["id"]]))


if __name__ == "__main__":
    main()
