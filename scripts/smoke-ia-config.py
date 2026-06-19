#!/usr/bin/env python3
"""Smoke de IA ADMINISTRABLE — Fase 5 (Slice 2).

Verifica el módulo de IA configurable desde la app + el resumen de turno por IA, SIN
depender de un proveedor real: levanta un servidor OpenAI-compatible FALSO en proceso
(captura el prompt para auditar el grounding) y usa una URL muerta para forzar fallos.

 A) Gate: operador sin `ai:config` ⇒ 403 en GET y PUT de /settings/ai.
 B) Default: sin config en BD ⇒ provider none, source env, keySet false.
 C) Write-only + cifrado: PUT con apiKey ⇒ keySet true, la clave NUNCA vuelve en la
    respuesta y en BD va CIFRADA (apiKeyEnc != texto plano). Re-PUT sin apiKey la conserva.
 D) Probar (adapter fake): genera real contra el proveedor del formulario ⇒ ok + texto +
    latencia; el servidor fake recibió la llamada.
 E) Degradación de Probar: proveedor con endpoint MUERTO ⇒ ok=false con error.
 F) Resumen de turno por IA GROUNDED: con el fake configurado, regenerar con IA ⇒
    summaryProvider = openai-compatible + el texto del modelo; el prompt enviado contiene
    el bloque DATOS y el nombre del nodo (grounding AC-IA-2); se registra en AiGenerationLog.
 G) Degradación del resumen (AC-IA-5): endpoint MUERTO ⇒ cae al determinista
    (summaryProvider none, texto determinista) y se registra FAILED.
 H) Modo none: sin IA ⇒ regenerar con IA usa el determinista y NO registra generación.

Requiere API :3000 y Postgres/Redis dev. Limpia por ID. Clave demo Demo!Pass2026."""
import json
import os
import subprocess
import sys
import threading
import urllib.error
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE = os.environ.get("WL_BASE", "http://localhost:3000/api")
PASS = os.environ.get("WL_DEMO_PASS", "Demo!Pass2026")
ADMIN = "demo@watchlog.local"
OPERADOR = "operador@watchlog.local"
PG = ["docker", "exec", "lyra-watchlog-dev-postgres-1", "psql", "-U", "watchlog", "-d", "watchlog", "-t", "-A"]
OK, FAIL = [], []
CREATED_HANDOVERS = []
SECRET_KEY = "sk-smoke-secret-AAA111"
FAKE_MARKER = "RESUMEN-IA-FALSO-7Q"
DEAD_BASE = "http://127.0.0.1:1/v1"  # puerto cerrado ⇒ connection refused inmediato
RUN_START = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")

# --- Servidor OpenAI-compatible FALSO (captura los prompts recibidos) -----------
CAPTURED = []


class FakeHandler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(n).decode("utf-8") if n else ""
        CAPTURED.append(raw)
        body = json.dumps({
            "id": "chatcmpl-fake",
            "object": "chat.completion",
            "created": 0,
            "model": "fake-model",
            "choices": [{"index": 0, "message": {"role": "assistant", "content": FAKE_MARKER + " — turno operativo."}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 123, "completion_tokens": 17, "total_tokens": 140},
        }).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def start_fake():
    srv = ThreadingHTTPServer(("127.0.0.1", 0), FakeHandler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    port = srv.server_address[1]
    return srv, f"http://127.0.0.1:{port}/v1"


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


def reset_ai():
    sql("DELETE FROM \"AiSettings\" WHERE id='system';")


def put_ai(tok, provider, enabled, model="", base_url="", api_key=None):
    body = {"enabled": enabled, "provider": provider, "model": model, "baseUrl": base_url}
    if api_key is not None:
        body["apiKey"] = api_key
    return call("PUT", "/settings/ai", tok, body)


def pick_node():
    return sql('SELECT id FROM "OrgNode" WHERE "deletedAt" IS NULL ORDER BY length(path) DESC LIMIT 1;').splitlines()[0]


def compile_handover(tok, node):
    s, r = call("POST", "/shift-handover/compile", tok, {"orgNodeId": node})
    if s == 200 and isinstance(r, dict) and r["id"] not in CREATED_HANDOVERS:
        CREATED_HANDOVERS.append(r["id"])
    return s, r


def cleanup():
    reset_ai()
    for hid in CREATED_HANDOVERS:
        sql(f"DELETE FROM \"AiGenerationLog\" WHERE \"handoverId\"='{hid}';")
        sql(f"DELETE FROM \"NotificationOutbox\" WHERE \"notificationEventId\" IN "
            f"(SELECT id FROM \"NotificationEvent\" WHERE payload->>'handoverId'='{hid}');")
        sql(f"DELETE FROM \"NotificationEvent\" WHERE payload->>'handoverId'='{hid}';")
        sql(f"DELETE FROM \"ShiftHandoverActivity\" WHERE \"handoverId\"='{hid}';")
        sql(f"DELETE FROM \"ShiftHandoverItem\" WHERE \"handoverId\"='{hid}';")
        sql(f"DELETE FROM \"ShiftHandover\" WHERE id='{hid}';")
    sql(f"DELETE FROM \"AiGenerationLog\" WHERE capability='test' AND \"createdAt\" >= '{RUN_START}';")


def main():
    srv, fake_base = start_fake()
    reset_ai()
    admin = login(ADMIN)
    operador = login(OPERADOR)
    check("contexto: login admin + operador", bool(admin) and bool(operador))
    if not admin:
        return summary()
    node = pick_node()
    check("contexto: nodo de prueba", bool(node), node)

    # --- A) Gate ai:config ---------------------------------------------------
    s, _ = call("GET", "/settings/ai", operador)
    check("A1 gate: operador GET /settings/ai ⇒ 403", s == 403, str(s))
    s, _ = put_ai(operador, "anthropic", True, model="claude-opus-4-8", api_key="x")
    check("A2 gate: operador PUT /settings/ai ⇒ 403", s == 403, str(s))

    # --- B) Default (env, none) ----------------------------------------------
    s, r = call("GET", "/settings/ai", admin)
    check("B1 default: provider none + source env + keySet false",
          s == 200 and r["provider"] == "none" and r["source"] == "env" and r["keySet"] is False,
          json.dumps(r) if s == 200 else str(s))

    # --- C) Write-only + cifrado ---------------------------------------------
    s, r = put_ai(admin, "openai-compatible", True, model="fake-model", base_url=fake_base, api_key=SECRET_KEY)
    check("C1 PUT openai-compatible con clave ⇒ 200", s == 200, str(s))
    s, raw = call("GET", "/settings/ai", admin)
    check("C2 GET refleja provider/enabled/keySet + source db",
          s == 200 and raw["provider"] == "openai-compatible" and raw["enabled"] is True
          and raw["keySet"] is True and raw["source"] == "db" and raw["baseUrl"] == fake_base,
          json.dumps(raw) if s == 200 else str(s))
    check("C3 write-only: la clave NUNCA vuelve en la respuesta", SECRET_KEY not in json.dumps(raw))
    enc = sql("SELECT \"apiKeyEnc\" FROM \"AiSettings\" WHERE id='system';")
    check("C4 clave CIFRADA en reposo (apiKeyEnc presente y != texto plano)", bool(enc) and enc != SECRET_KEY, enc[:18])
    # Re-PUT sin apiKey: conserva la clave guardada.
    s, _ = put_ai(admin, "openai-compatible", True, model="fake-model-2", base_url=fake_base)
    s2, r2 = call("GET", "/settings/ai", admin)
    check("C5 re-PUT sin apiKey conserva keySet true + actualiza modelo",
          s == 200 and r2["keySet"] is True and r2["model"] == "fake-model-2", json.dumps(r2) if s2 == 200 else str(s))

    # --- D) Probar (adapter fake) --------------------------------------------
    before = len(CAPTURED)
    s, r = call("POST", "/settings/ai/test", admin, {"enabled": True, "provider": "openai-compatible", "model": "fake-model", "baseUrl": fake_base})
    check("D1 Probar ⇒ ok + texto + latencia int",
          s == 200 and r["ok"] is True and isinstance(r.get("text"), str) and r["text"] and isinstance(r.get("latencyMs"), int),
          json.dumps(r) if s == 200 else str(s))
    check("D2 el proveedor fake recibió la llamada de Probar", len(CAPTURED) > before)

    # --- E) Degradación de Probar (endpoint muerto) --------------------------
    s, r = call("POST", "/settings/ai/test", admin, {"enabled": True, "provider": "openai-compatible", "model": "x", "baseUrl": DEAD_BASE})
    check("E1 Probar contra endpoint muerto ⇒ ok=false con error",
          s == 200 and r["ok"] is False and bool(r.get("error")), json.dumps(r) if s == 200 else str(s))

    # --- F) Resumen de turno por IA GROUNDED ---------------------------------
    put_ai(admin, "openai-compatible", True, model="fake-model", base_url=fake_base, api_key=SECRET_KEY)
    cs, comp = compile_handover(admin, node)
    check("F0 compile entrega del turno", cs == 200 and isinstance(comp, dict), str(cs))
    node_name = comp["cockpit"]["scope"]["nodeName"] if cs == 200 else ""
    hid = comp["id"] if cs == 200 else None
    before = len(CAPTURED)
    s, r = call("PATCH", f"/shift-handover/{hid}/summary", admin, {"regenerate": True, "useAi": True, "generalStatus": "OPERATIONAL"})
    check("F1 regenerar con IA ⇒ summaryProvider openai-compatible + texto del modelo",
          s == 200 and r.get("summaryProvider") == "openai-compatible" and FAKE_MARKER in (r.get("summaryText") or ""),
          (r.get("summaryProvider"), (r.get("summaryText") or "")[:40]) if s == 200 else str(s))
    sent = CAPTURED[-1] if len(CAPTURED) > before else ""
    check("F2 grounding: el prompt enviado contiene el bloque DATOS y el nodo (AC-IA-2)",
          "DATOS DEL TURNO" in sent and node_name in sent, node_name)
    n = sql(f"SELECT count(*) FROM \"AiGenerationLog\" WHERE \"handoverId\"='{hid}' AND capability='shift-summary' AND status='SUCCESS';")
    check("F3 generación registrada (AiGenerationLog SUCCESS)", n == "1", n)

    # --- G) Degradación del resumen (endpoint muerto ⇒ determinista) ----------
    put_ai(admin, "openai-compatible", True, model="x", base_url=DEAD_BASE, api_key=SECRET_KEY)
    s, r = call("PATCH", f"/shift-handover/{hid}/summary", admin, {"regenerate": True, "useAi": True, "generalStatus": "OPERATIONAL"})
    check("G1 IA caída ⇒ cae al determinista (summaryProvider none + texto determinista)",
          s == 200 and (r.get("summaryProvider") in (None, "none")) and "Entrega de" in (r.get("summaryText") or ""),
          (r.get("summaryProvider"), (r.get("summaryText") or "")[:40]) if s == 200 else str(s))
    n = sql(f"SELECT count(*) FROM \"AiGenerationLog\" WHERE \"handoverId\"='{hid}' AND status='FAILED';")
    check("G2 fallo registrado (AiGenerationLog FAILED)", n == "1", n)

    # --- H) Modo none: sin IA, sin registro -----------------------------------
    put_ai(admin, "none", False)
    n_before = sql("SELECT count(*) FROM \"AiGenerationLog\";")
    s, r = call("PATCH", f"/shift-handover/{hid}/summary", admin, {"regenerate": True, "useAi": True, "generalStatus": "OPERATIONAL"})
    n_after = sql("SELECT count(*) FROM \"AiGenerationLog\";")
    check("H1 modo none ⇒ determinista y NO registra generación",
          s == 200 and (r.get("summaryProvider") in (None, "none")) and "Entrega de" in (r.get("summaryText") or "") and n_before == n_after,
          f"{n_before}->{n_after}")

    srv.shutdown()
    return summary()


def summary():
    cleanup()
    print(f"\n{len(OK)}/{len(OK) + len(FAIL)} checks OK")
    if FAIL:
        print("FALLARON:")
        for f in FAIL:
            print("  - " + f)
    sys.exit(1 if FAIL else 0)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("ERROR FATAL: " + repr(e))
        cleanup()
        sys.exit(1)
