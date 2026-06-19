#!/usr/bin/env python3
"""Smoke de RESUMEN DE TURNO POR IA EN STREAMING — Fase 5 (Slice 3).

Verifica el resumen por IA token a token (SSE) del cambio de turno, SIN proveedor real:
levanta un servidor OpenAI-compatible FALSO en proceso que responde en streaming
(`stream:true` ⇒ SSE de chunks) y captura el prompt para auditar el grounding/PII.

 A) Stream OK: GET /shift-handover/:id/summary/stream emite varios `delta` y un `done`
    con generatedByAi=true, provider openai-compatible y el texto del modelo; se registra
    en AiGenerationLog (SUCCESS).
 B) Grounding (AC-IA-2): el prompt enviado al proveedor contiene el bloque DATOS y el nodo.
 C) On-prem sin fuga (AC-IA-6/AC-IA-7): proveedor LOCAL (127.0.0.1) ⇒ el grounding NO se
    redacta (fidelidad on-prem): un correo escrito en un pendiente llega tal cual al modelo.
 D) Degradación (AC-IA-5): endpoint MUERTO ⇒ `done` con degraded=true y SIN texto IA; se
    registra FAILED. (El cockpit cae a la ruta no-streaming.)
 E) Modo none (AC-IA-1): sin IA ⇒ el stream emite el determinista en un `delta` + `done`
    con generatedByAi=false/degraded=false y NO registra generación.
 F) Gate del endpoint: token inválido ⇒ el stream NO entrega un `done` generado por IA
    (auth confinada al endpoint; el ABAC por nodo reusa el mismo assertNodeAccess del PATCH).
 G) Persistencia: el PATCH acepta summaryProvider para guardar el texto IA + procedencia.

Requiere API :3000 y Postgres/Redis dev. Limpia por ID. Clave demo Demo!Pass2026."""
import json
import os
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BASE = os.environ.get("WL_BASE", "http://localhost:3000/api")
PASS = os.environ.get("WL_DEMO_PASS", "Demo!Pass2026")
ADMIN = "demo@watchlog.local"
PG = ["docker", "exec", "lyra-watchlog-dev-postgres-1", "psql", "-U", "watchlog", "-d", "watchlog", "-t", "-A"]
OK, FAIL = [], []
CREATED_HANDOVERS = []
SECRET_KEY = "sk-smoke-secret-STREAM"
FAKE_MARKER = "RESUMEN-IA-STREAM-9Z"
PII_EMAIL = "contacto.turno@planta.cl"
DEAD_BASE = "http://127.0.0.1:1/v1"  # puerto cerrado ⇒ connection refused inmediato
RUN_START = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")

CAPTURED = []

# --- Servidor OpenAI-compatible FALSO con STREAMING (SSE de chunks) -------------
STREAM_CHUNKS = [
    {"choices": [{"index": 0, "delta": {"role": "assistant"}, "finish_reason": None}]},
    {"choices": [{"index": 0, "delta": {"content": FAKE_MARKER + " "}, "finish_reason": None}]},
    {"choices": [{"index": 0, "delta": {"content": "— turno operativo, "}, "finish_reason": None}]},
    {"choices": [{"index": 0, "delta": {"content": "sin novedades críticas."}, "finish_reason": "stop"}]},
    {"choices": [], "usage": {"prompt_tokens": 200, "completion_tokens": 25, "total_tokens": 225}},
]


class FakeHandler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(n).decode("utf-8") if n else ""
        CAPTURED.append(raw)
        try:
            streaming = json.loads(raw).get("stream") is True
        except Exception:
            streaming = False
        if streaming:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.end_headers()
            for ch in STREAM_CHUNKS:
                payload = {"id": "chatcmpl-fake", "object": "chat.completion.chunk", "created": 0, "model": "fake", **ch}
                self.wfile.write(("data: " + json.dumps(payload) + "\n\n").encode())
                self.wfile.flush()
            self.wfile.write(b"data: [DONE]\n\n")
            self.wfile.flush()
        else:
            body = json.dumps({
                "id": "chatcmpl-fake", "object": "chat.completion", "created": 0, "model": "fake",
                "choices": [{"index": 0, "message": {"role": "assistant", "content": FAKE_MARKER}, "finish_reason": "stop"}],
                "usage": {"prompt_tokens": 200, "completion_tokens": 25, "total_tokens": 225},
            }).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)


def start_fake():
    srv = ThreadingHTTPServer(("127.0.0.1", 0), FakeHandler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}/v1"


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


def read_stream(hid, tok, general_status="OPERATIONAL", max_seconds=25):
    """Consume el SSE del resumen: devuelve (deltas, done_dict_or_None, status)."""
    url = f"{BASE}/shift-handover/{hid}/summary/stream?access_token={urllib.parse.quote(tok)}"
    if general_status:
        url += f"&generalStatus={general_status}"
    deltas, done = [], None
    try:
        resp = urllib.request.urlopen(urllib.request.Request(url), timeout=max_seconds)
    except urllib.error.HTTPError as e:
        return deltas, done, e.code
    except Exception:
        return deltas, done, "conn-error"
    deadline = time.time() + max_seconds
    try:
        for raw in resp:
            if time.time() > deadline:
                break
            line = raw.decode("utf-8", "replace").strip()
            if not line.startswith("data:"):
                continue
            payload = line[5:].strip()
            if not payload or payload == "[DONE]":
                continue
            try:
                obj = json.loads(payload)
            except Exception:
                continue
            if not isinstance(obj, dict):
                continue
            if obj.get("type") == "delta":
                deltas.append(obj.get("text", ""))
            elif obj.get("type") == "done":
                done = obj
                break
    except (socket.timeout, Exception):
        pass
    finally:
        resp.close()
    return deltas, done, 200


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


def main():
    srv, fake_base = start_fake()
    reset_ai()
    admin = login(ADMIN)
    check("contexto: login admin", bool(admin))
    if not admin:
        return summary()
    node = pick_node()
    cs, comp = compile_handover(admin, node)
    check("contexto: compile entrega del turno", cs == 200 and isinstance(comp, dict), str(cs))
    if cs != 200:
        return summary()
    hid = comp["id"]
    node_name = comp["cockpit"]["scope"]["nodeName"]

    # --- A) Stream OK --------------------------------------------------------
    put_ai(admin, "openai-compatible", True, model="fake", base_url=fake_base, api_key=SECRET_KEY)
    before = len(CAPTURED)
    deltas, done, st = read_stream(hid, admin)
    check("A1 el stream emite varios deltas en vivo", st == 200 and len(deltas) >= 2, f"st={st} n={len(deltas)}")
    check("A2 cierre done con generatedByAi + provider openai-compatible + texto del modelo",
          bool(done) and done.get("generatedByAi") is True and done.get("provider") == "openai-compatible"
          and FAKE_MARKER in (done.get("text") or ""),
          json.dumps(done)[:80] if done else "no done")
    check("A3 los deltas concatenados forman el texto final",
          bool(done) and FAKE_MARKER in "".join(deltas), "".join(deltas)[:40])
    n = sql(f"SELECT count(*) FROM \"AiGenerationLog\" WHERE \"handoverId\"='{hid}' AND capability='shift-summary' AND status='SUCCESS';")
    check("A4 generación registrada (AiGenerationLog SUCCESS)", n == "1", n)

    # --- B) Grounding (AC-IA-2) ----------------------------------------------
    sent = CAPTURED[-1] if len(CAPTURED) > before else ""
    check("B1 grounding: el prompt enviado contiene el bloque DATOS y el nodo",
          "DATOS DEL TURNO" in sent and node_name in sent, node_name)

    # --- C) On-prem sin fuga: proveedor local ⇒ NO se redacta el grounding ----
    call("POST", f"/shift-handover/{hid}/items", admin, {"title": f"Coordinar con {PII_EMAIL} la parada"})
    before = len(CAPTURED)
    deltas2, done2, _ = read_stream(hid, admin)
    sent2 = CAPTURED[-1] if len(CAPTURED) > before else ""
    check("C1 on-prem LOCAL: el correo del pendiente llega SIN redactar (fidelidad, sin egreso)",
          PII_EMAIL in sent2 and bool(done2), PII_EMAIL)

    # --- D) Degradación (endpoint muerto) ------------------------------------
    put_ai(admin, "openai-compatible", True, model="x", base_url=DEAD_BASE, api_key=SECRET_KEY)
    deltas3, done3, _ = read_stream(hid, admin)
    check("D1 IA caída ⇒ done degraded=true y SIN texto IA (cockpit degradará)",
          bool(done3) and done3.get("degraded") is True and done3.get("generatedByAi") is False
          and FAKE_MARKER not in (done3.get("text") or ""),
          json.dumps(done3)[:80] if done3 else "no done")
    n = sql(f"SELECT count(*) FROM \"AiGenerationLog\" WHERE \"handoverId\"='{hid}' AND status='FAILED';")
    check("D2 fallo registrado (AiGenerationLog FAILED)", n == "1", n)

    # --- E) Modo none --------------------------------------------------------
    put_ai(admin, "none", False)
    n_before = sql("SELECT count(*) FROM \"AiGenerationLog\";")
    deltas4, done4, _ = read_stream(hid, admin)
    n_after = sql("SELECT count(*) FROM \"AiGenerationLog\";")
    check("E1 modo none ⇒ stream emite el determinista (delta) + done none, sin registrar",
          bool(done4) and done4.get("generatedByAi") is False and done4.get("degraded") is False
          and len(deltas4) >= 1 and "Entrega de" in "".join(deltas4) and n_before == n_after,
          f"deltas={len(deltas4)} log {n_before}->{n_after}")

    # --- F) Gate del endpoint (token inválido) -------------------------------
    put_ai(admin, "openai-compatible", True, model="fake", base_url=fake_base, api_key=SECRET_KEY)
    deltas5, done5, st5 = read_stream(hid, "token-invalido-xyz", max_seconds=8)
    check("F1 token inválido ⇒ NO entrega un done generado por IA (auth confinada)",
          not (done5 and done5.get("generatedByAi")), f"st={st5} done={bool(done5)}")

    # --- G) Persistencia: PATCH acepta summaryProvider ------------------------
    s, r = call("PATCH", f"/shift-handover/{hid}/summary", admin,
                {"summaryText": FAKE_MARKER + " texto IA persistido", "summaryProvider": "openai-compatible", "generalStatus": "OPERATIONAL"})
    check("G1 PATCH guarda el texto IA con su procedencia (summaryProvider openai-compatible)",
          s == 200 and r.get("summaryProvider") == "openai-compatible" and FAKE_MARKER in (r.get("summaryText") or ""),
          (r.get("summaryProvider"), (r.get("summaryText") or "")[:30]) if s == 200 else str(s))

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
