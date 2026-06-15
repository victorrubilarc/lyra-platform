#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Seed de DEMOSTRACIÓN — Bitácora de Ronda Operacional (Planta Concentradora).

Crea y PUBLICA una plantilla MUY realista que ejercita casi todos los objetos del
catálogo (Olas 1–4), con mucha ayuda al usuario en cada campo y sección. NO se
borra: queda lista para llenar en la app (un solo rol = admin demo, scope null).

Además SONDEA brechas/validaciones (sobre todo tablas/matrices) sobre una plantilla
DESECHABLE que se limpia por ID, e imprime un informe de hallazgos.

API :3000. Admin demo: demo@watchlog.local / Demo!Pass2026.
Idempotente: si la plantilla ya existe (mismo nombre, no borrada), reporta su id y no duplica.
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
TPL_NAME = "Bitácora de Ronda Operacional — Planta Concentradora (DEMO OBJETOS)"


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


def pg(sql):
    subprocess.run([*PG, sql], capture_output=True, text=True)


def flatten(nodes, out=None):
    if out is None:
        out = []
    for n in nodes:
        out.append({"id": n["id"], "name": n["name"], "children": n.get("children", [])})
        flatten(n.get("children", []), out)
    return out


# ---- Helpers de construcción de campos ----
def F(key, type_, label, help=None, required=False, config=None, colSpan=12, visibleWhen=None, semanticRole=None, computed=None):
    f = {"key": key, "type": type_, "label": label, "config": config or {}, "colSpan": colSpan}
    if help:
        f["help"] = help
    if required:
        f["required"] = True
    if visibleWhen:
        f["visibleWhen"] = visibleWhen
    if semanticRole:
        f["semanticRole"] = semanticRole
    if computed:
        f["computed"] = computed
    return f


def opts(*pairs):
    return {"optionSource": {"kind": "inline", "items": [{"code": c, "label": l} for c, l in pairs]}}


RISK_5x5 = {
    "probabilityLabels": ["Raro", "Improbable", "Posible", "Probable", "Casi seguro"],
    "consequenceLabels": ["Insignificante", "Menor", "Moderada", "Mayor", "Catastrófica"],
    "cells": [[min(5, max(1, (p + 1) * (c + 1) // 5)) for c in range(5)] for p in range(5)],
}


def build_sections():
    return [
        # ===== Sección 1 =====
        {
            "key": "contexto",
            "title": "1 · Contexto del turno",
            "description": "Identifica quién registra, cuándo y dónde. Completa esta sección al INICIAR la ronda. "
                           "Los campos con * son obligatorios. La fecha de la ronda determina el período y el turno del registro.",
            "fields": [
                F("h_ctx", "HEADING", "Datos del turno y la ronda", config={"level": 2}),
                F("aviso_ctx", "NOTICE", "Antes de empezar",
                  config={"variant": "info", "text": "Registra los datos en terreno con tu tablet. Puedes guardar el avance y continuar más tarde; el registro queda como borrador hasta que lo completes y selles."}),
                F("fecha_ronda", "DATE", "Fecha de la ronda", required=True, colSpan=6,
                  help="Día operacional de la ronda. Define el turno y el período contable del registro.",
                  semanticRole="EFFECTIVE_DATE"),
                F("turno_ref", "REFERENCE", "Turno", colSpan=6, config={"entity": "shift", "display": "dropdown"},
                  help="Selecciona el turno del calendario operacional del área. Si no aparecen opciones, el nodo aún no tiene calendario asignado."),
                F("hora_inicio", "TIME", "Hora de inicio de ronda", colSpan=4, help="Hora local en formato 24h (HH:MM)."),
                F("hora_termino", "TIME", "Hora de término de ronda", colSpan=4, help="Hora local en formato 24h (HH:MM)."),
                F("duracion", "DURATION", "Duración total de la ronda", colSpan=4,
                  help="Tiempo efectivo de recorrido. Se ingresa en horas y minutos."),
                F("operador_ref", "REFERENCE", "Operador responsable", colSpan=6, config={"entity": "user", "display": "dropdown"},
                  help="Persona que ejecuta y firma la ronda. Se elige del directorio de la plataforma."),
                F("rut_operador", "TEXT", "RUT del operador", colSpan=6, config={"format": "rut"},
                  help="RUT chileno con dígito verificador. El sistema valida el DV automáticamente (ej.: 12.345.678-5)."),
                F("area_ref", "REFERENCE", "Área / proceso inspeccionado", colSpan=6, config={"entity": "orgNode", "display": "dropdown"},
                  help="Nodo de la estructura organizacional al que corresponde la ronda."),
                F("equipo_principal", "REFERENCE", "Equipo principal inspeccionado", colSpan=6, config={"entity": "equipment", "display": "modal"},
                  help="Activo principal de la ronda (acotado al nodo de la entrada). Se abre un buscador tipo Value Help."),
                F("clima", "SELECT", "Condición climática", colSpan=6,
                  config={"displayAs": "segmented", **opts(("despejado", "Despejado"), ("nublado", "Nublado"), ("lluvia", "Lluvia"), ("viento", "Viento fuerte"))},
                  help="Condición ambiental dominante durante la ronda (afecta la operación a rajo abierto)."),
                F("relevo", "BOOLEAN", "¿Relevo de turno presencial?", colSpan=6,
                  config={"trueLabel": "Sí, presencial", "falseLabel": "No"},
                  help="Indica si hubo entrega de turno cara a cara con el operador entrante."),
            ],
        },
        # ===== Sección 2 =====
        {
            "key": "proceso",
            "title": "2 · Lecturas de proceso",
            "description": "Registra las variables operacionales clave. Los campos numéricos avisan cuando un valor sale de su "
                           "rango seguro (umbral de advertencia / crítico, estándar ISA-18.2). La RECUPERACIÓN se calcula sola.",
            "fields": [
                F("h_proc", "HEADING", "Variables de proceso", config={"level": 2}),
                F("texto_proc", "STATIC_TEXT", "Cómo leer los umbrales",
                  config={"text": "Si un valor entra en banda ámbar (advertencia) o roja (crítico), el sistema lo marca para revisión por excepción. Registra el valor REAL aunque esté fuera de rango."}),
                F("presion_linea", "NUMBER", "Presión de línea principal", colSpan=4, required=True,
                  config={"unit": "bar", "min": 0, "max": 16, "warnHigh": 12, "critHigh": 14, "warnLow": 4, "critLow": 2, "decimals": 1},
                  help="Presión en la línea de impulsión. Rango seguro 4–12 bar; sobre 14 bar es condición crítica."),
                F("densidad_pulpa", "NUMBER", "Densidad de pulpa", colSpan=4,
                  config={"unit": "t/m³", "expected": 1.35, "tolerance": 0.05, "critTolerance": 0.1, "decimals": 2},
                  help="Lectura con TOLERANCIA: objetivo 1,35 ± 0,05 t/m³. Fuera de ± 0,10 es crítico."),
                F("solidos", "NUMBER", "% de sólidos en pulpa", colSpan=4, config={"format": "percent", "decimals": 1},
                  help="Porcentaje de sólidos (0–100). Se muestra con formato regional."),
                F("horometro_sag", "NUMBER", "Horómetro molino SAG", colSpan=4,
                  config={"unit": "h", "counter": True, "counterNonDecreasing": True, "decimals": 0},
                  help="CONTADOR acumulado: el sistema muestra el delta vs la última lectura sellada del mismo equipo y NO permite registrar un valor menor."),
                F("ph_rango", "RANGE", "Rango de pH operado (mín–máx)", colSpan=4, config={"unit": "pH", "min": 0, "max": 14, "decimals": 1},
                  help="Rango de pH durante la ronda. El mínimo no puede superar al máximo."),
                F("costo_reactivos", "NUMBER", "Costo estimado de reactivos del turno", colSpan=4,
                  config={"format": "currency", "currency": "CLP"},
                  help="Estimación de consumo de reactivos. Se muestra como moneda regional (CLP)."),
                F("ton_alim", "NUMBER", "Tonelaje alimentado", colSpan=4, config={"unit": "t/h", "decimals": 0},
                  help="Tonelaje de mineral alimentado a la planta."),
                F("ton_conc", "NUMBER", "Tonelaje de concentrado", colSpan=4, config={"unit": "t/h", "decimals": 0},
                  help="Tonelaje de concentrado producido."),
                F("recuperacion", "NUMBER", "Recuperación aparente (%)", colSpan=4, config={"format": "percent", "decimals": 1},
                  help="Campo CALCULADO automáticamente por el sistema: concentrado ÷ alimentado × 100. No se teclea.",
                  computed={"expression": {
                      "kind": "op", "op": "round", "args": [
                          {"kind": "op", "op": "mul", "args": [
                              {"kind": "op", "op": "div", "args": [{"kind": "var", "key": "ton_conc"}, {"kind": "var", "key": "ton_alim"}]},
                              {"kind": "lit", "value": 100}]},
                          {"kind": "lit", "value": 1}]}}),
                F("calidad_op", "RATING", "Calidad percibida de la operación", colSpan=6, config={"style": "stars", "max": 5},
                  help="Valoración subjetiva del operador sobre cómo corrió el proceso durante su turno."),
                F("h_matriz", "HEADING", "Matriz de lecturas por punto de muestreo", config={"level": 3}),
                F("aviso_matriz", "NOTICE", "Matriz parámetro × momento",
                  config={"variant": "info", "text": "Registra cada parámetro en tres momentos del turno. Las filas (parámetros) y columnas (momentos) son fijas; solo completas las celdas."}),
                F("matriz_muestreo", "MATRIX", "Lecturas por parámetro y momento del turno",
                  help="Cada celda es una lectura numérica. Deja en blanco las que no aplican.",
                  config={
                      "rowHeaderLabel": "Parámetro",
                      "rows": [
                          {"key": "cu", "label": "Ley de cobre (% Cu)"},
                          {"key": "fe", "label": "Ley de fierro (% Fe)"},
                          {"key": "ph", "label": "pH"},
                          {"key": "temp", "label": "Temperatura (°C)"},
                      ],
                      "columns": [
                          {"key": "inicio", "label": "Inicio de turno"},
                          {"key": "medio", "label": "Mitad de turno"},
                          {"key": "fin", "label": "Fin de turno"},
                      ],
                      "cell": {"type": "NUMBER", "config": {"min": 0, "max": 100, "decimals": 2}},
                  }),
            ],
        },
        # ===== Sección 3 =====
        {
            "key": "inspeccion",
            "title": "3 · Inspección de equipos críticos (tabla repetible)",
            "description": "Agrega UNA FILA por cada equipo inspeccionado. Cada columna se valida por separado. "
                           "Usa los botones de la derecha de cada fila para subir, bajar o eliminar. En tablet la tabla se desplaza en horizontal.",
            "fields": [
                F("h_insp", "HEADING", "Recorrido de equipos", config={"level": 2}),
                F("aviso_insp", "NOTICE", "Cómo completar la tabla",
                  config={"variant": "warning", "text": "Debes registrar al menos un equipo. Hora y Estado son obligatorios en cada fila. Si un equipo está fuera de rango de vibración o temperatura, el sistema lo resalta."}),
                F("tabla_equipos", "TABLE", "Inspección de equipos críticos", required=True,
                  help="Tabla repetible: agrega tantas filas como equipos inspecciones (máximo 20).",
                  config={
                      "layout": "table", "minRows": 1, "maxRows": 20, "addRowLabel": "Agregar equipo",
                      "columns": [
                          {"key": "equipo", "label": "Equipo / TAG", "type": "TEXT", "required": True},
                          {"key": "hora", "label": "Hora", "type": "TIME", "required": True},
                          {"key": "estado", "label": "Estado", "type": "SELECT", "required": True,
                           "config": opts(("operativo", "Operativo"), ("degradado", "Degradado"), ("fuera", "Fuera de servicio"))},
                          {"key": "vibracion", "label": "Vibración", "type": "NUMBER",
                           "config": {"unit": "mm/s", "warnHigh": 7, "critHigh": 11, "decimals": 1}},
                          {"key": "temperatura", "label": "Temp. rodamiento", "type": "NUMBER",
                           "config": {"unit": "°C", "warnHigh": 70, "critHigh": 90, "decimals": 0}},
                          {"key": "conforme", "label": "Conformidad", "type": "CONFORMITY"},
                          {"key": "obs", "label": "Observación", "type": "TEXTAREA"},
                      ],
                  }),
            ],
        },
        # ===== Sección 4 =====
        {
            "key": "hallazgos",
            "title": "4 · Hallazgos y evaluación de riesgo",
            "description": "Registra los hallazgos del turno como tarjetas (grupo repetible) y evalúa el riesgo del más relevante. "
                           "Si hubo una detención no programada, aparecerá un campo extra para describirla.",
            "fields": [
                F("h_hall", "HEADING", "Hallazgos del turno", config={"level": 2}),
                F("grupo_hallazgos", "TABLE", "Hallazgos",
                  help="Grupo repetible (tarjetas): agrega un bloque por cada hallazgo. Título, severidad y descripción son obligatorios.",
                  config={
                      "layout": "cards", "addRowLabel": "Agregar hallazgo", "maxRows": 15,
                      "columns": [
                          {"key": "titulo", "label": "Título del hallazgo", "type": "TEXT", "required": True},
                          {"key": "severidad", "label": "Severidad", "type": "SELECT", "required": True,
                           "config": opts(("baja", "Baja"), ("media", "Media"), ("alta", "Alta"), ("critica", "Crítica"))},
                          {"key": "descripcion", "label": "Descripción", "type": "TEXTAREA", "required": True},
                          {"key": "accion", "label": "Acción inmediata tomada", "type": "TEXT"},
                          {"key": "hora", "label": "Hora del hallazgo", "type": "TIME"},
                      ],
                  }),
                F("detencion", "BOOLEAN", "¿Hubo detención no programada?", colSpan=6,
                  config={"trueLabel": "Sí", "falseLabel": "No"},
                  help="Marca Sí si la planta o una línea se detuvo de forma imprevista."),
                F("detalle_detencion", "TEXTAREA", "Detalle de la detención no programada", colSpan=6,
                  help="Aparece solo si marcaste que hubo detención. Describe causa, duración e impacto.",
                  visibleWhen={"fieldKey": "detencion", "equals": True}),
                F("severidad_turno", "SEVERITY", "Severidad global del turno", colSpan=6,
                  help="Escala 1–5. Un valor 4–5 activa el protocolo de respuesta."),
                F("conformidad_protocolo", "CONFORMITY", "¿Se activó el protocolo de respuesta?", colSpan=6,
                  help="Conforme / No conforme / No aplica."),
                F("matriz_riesgo", "RISK_MATRIX", "Evaluación de riesgo del hallazgo más relevante",
                  help="Selecciona probabilidad × consecuencia; el sistema deriva el nivel de riesgo (ISO 31000).",
                  config=RISK_5x5),
            ],
        },
        # ===== Sección 5 =====
        {
            "key": "evidencias",
            "title": "5 · Evidencias de terreno",
            "description": "Adjunta evidencia objetiva de la ronda. Las fotos se pueden capturar con la cámara de la tablet. "
                           "El escáner QR rellena el TAG sin teclear. Todo se sube de forma segura a través del servidor.",
            "fields": [
                F("h_evid", "HEADING", "Evidencia objetiva", config={"level": 2}),
                F("aviso_evid", "NOTICE", "Evidencia y trazabilidad",
                  config={"variant": "info", "text": "Cada archivo queda con su huella (tamaño, tipo, checksum). Una vez sellado el registro, la evidencia es inmutable."}),
                F("fotos", "ATTACHMENT", "Fotos de evidencia", colSpan=6,
                  config={"kind": "photo", "multiple": True, "maxCount": 8, "maxSizeMb": 10, "capture": True},
                  help="Captura con la cámara o sube desde la galería. Hasta 8 fotos, 10 MB c/u."),
                F("documento", "ATTACHMENT", "Documento / reporte adjunto", colSpan=6,
                  config={"kind": "file", "maxSizeMb": 25},
                  help="PDF u otro documento de respaldo (máx. 25 MB)."),
                F("nota_voz", "ATTACHMENT", "Nota de voz", colSpan=6, config={"kind": "audio"},
                  help="Graba un comentario hablado en terreno (manos libres) o sube un audio."),
                F("croquis", "ATTACHMENT", "Croquis de ubicación", colSpan=6, config={"kind": "sketch"},
                  help="Dibuja a mano la ubicación del hallazgo; se guarda como imagen."),
                F("tag_qr", "TEXT", "TAG del equipo (escáner QR)", colSpan=6, config={"scan": True},
                  help="Apunta la cámara al código QR/barras del equipo y el campo se rellena solo. También puedes teclearlo."),
                F("correo", "TEXT", "Correo de contacto del turno", colSpan=6, config={"format": "email"},
                  help="Correo para seguimiento; se valida el formato."),
                F("telefono", "TEXT", "Teléfono de turno", colSpan=6, config={"format": "phone"},
                  help="Teléfono de contacto en terreno."),
                F("enlace_scada", "TEXT", "Enlace al tablero SCADA", colSpan=6, config={"format": "url"},
                  help="URL del tablero de control asociado a la ronda."),
            ],
        },
        # ===== Sección 6 =====
        {
            "key": "cierre",
            "title": "6 · Cierre del turno",
            "description": "Resume el turno, marca los sistemas revisados y firma. La firma deja constancia de quién registró (estándar 21 CFR Part 11).",
            "fields": [
                F("h_cierre", "HEADING", "Resumen y firma", config={"level": 2}),
                F("resumen", "TEXTAREA", "Resumen del turno", required=True,
                  help="Síntesis de novedades, detenciones y temas de seguridad relevantes.",
                  config={"rows": 5}),
                F("sistemas", "MULTISELECT", "Sistemas revisados en la ronda", colSpan=6,
                  config={"displayAs": "checkboxes", **opts(("chancado", "Chancado"), ("molienda", "Molienda"), ("flotacion", "Flotación"), ("espesadores", "Espesadores"), ("filtros", "Filtros"))},
                  help="Marca todos los sistemas que recorriste."),
                F("insumos", "MULTISELECT", "Insumos consumidos", colSpan=6,
                  config={"displayAs": "modal", **opts(("cal", "Cal"), ("colector", "Colector"), ("espumante", "Espumante"), ("floculante", "Floculante"), ("bolas", "Bolas de molienda"))},
                  help="Se abre un buscador para listas largas (Value Help)."),
                F("estado_planta", "SELECT", "Estado general de la planta", colSpan=6,
                  config={"displayAs": "radio", **opts(("normal", "Operación normal"), ("observacion", "En observación"), ("restringida", "Operación restringida"), ("detenida", "Detenida"))},
                  help="Estado con el que entregas la planta al turno siguiente."),
                F("divisor", "DIVIDER", "Separador", config={"spacing": "lg"}),
                F("firma", "SIGNATURE", "Firma del operador",
                  help="La firma electrónica se captura al completar/sellar el registro (queda con tu nombre, fecha/hora y significado)."),
                F("ok_cierre", "NOTICE", "¡Listo!",
                  config={"variant": "success", "text": "Al completar todas las secciones obligatorias podrás sellar el registro. Gracias por tu ronda."}),
                F("procedimiento", "PROCEDURE_LINK", "Procedimiento de ronda operacional",
                  config={"url": "https://itesic.cl/procedimientos/PRO-OPS-014", "linkText": "Ver PRO-OPS-014 — Ronda operacional de turno"}),
                F("diagrama", "REFERENCE_IMAGE", "Diagrama de referencia de la planta",
                  config={"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Flotation_cell.jpg/640px-Flotation_cell.jpg",
                          "caption": "Esquema referencial de una celda de flotación.", "alt": "Celda de flotación"}),
            ],
        },
    ]


CROSS_RULES = [{
    "key": "conc_no_supera_alim",
    "name": "Concentrado no supera alimentación",
    "severity": "ERROR",
    "message": "El tonelaje de concentrado no puede superar al tonelaje alimentado. Revisa las lecturas.",
    "when": {"kind": "op", "op": "gt", "args": [{"kind": "var", "key": "ton_conc"}, {"kind": "var", "key": "ton_alim"}]},
    "enabled": True,
}]


def find_node_with_equipment(atok, leaves):
    for n in leaves:
        s, eqs = call("GET", f"/structure/equipment?orgNodeId={n['id']}", atok)
        if s == 200 and isinstance(eqs, list) and len(eqs) > 0:
            return n, len(eqs)
    return (leaves[0] if leaves else None), 0


def existing_template(atok):
    s, lst = call("GET", "/templates", atok)
    items = lst.get("items") if isinstance(lst, dict) else (lst if isinstance(lst, list) else [])
    for t in items or []:
        if t.get("name") == TPL_NAME and not t.get("deletedAt"):
            return t.get("id")
    return None


def seed(atok, node):
    existing = existing_template(atok)
    if existing:
        print(f"⏭  La plantilla ya existe (id={existing}); no se duplica.")
        return existing
    s, tpl = call("POST", "/templates", atok, {
        "name": TPL_NAME,
        "description": "Plantilla de demostración del catálogo de objetos (Olas 1–4). Ronda de turno en planta concentradora.",
        "nodeAssignments": [{"orgNodeId": node["id"], "includeDescendants": False}],
    })
    if s not in (200, 201):
        print("FALLO al crear plantilla:", s, tpl)
        return None
    tpl_id = tpl["id"]
    s, body = call("PUT", f"/templates/{tpl_id}/draft", atok, {"sections": build_sections(), "rules": CROSS_RULES})
    if s not in (200, 201):
        print("FALLO al guardar el borrador:", s, body)
        pg(f"DELETE FROM \"Template\" WHERE id='{tpl_id}';")
        return None
    s, body = call("POST", f"/templates/{tpl_id}/publish", atok, {})
    if s not in (200, 201):
        print("FALLO al publicar:", s, body)
        return None
    # Resumen en la grilla de Bitácoras (campos escalares).
    call("PATCH", f"/templates/{tpl_id}", atok, {"gridFieldKeys": ["presion_linea", "estado_planta", "recuperacion", "severidad_turno"]})
    return tpl_id


# ---------- Sondeo de brechas (plantilla desechable) ----------
def probe(atok, node):
    print("\n=== SONDEO DE BRECHAS (plantilla desechable) ===")
    findings = []
    s, tpl = call("POST", "/templates", atok, {"name": f"PROBE objetos {os.urandom(3).hex()}",
                                               "nodeAssignments": [{"orgNodeId": node["id"], "includeDescendants": False}]})
    if s not in (200, 201):
        print("no se pudo crear plantilla de sondeo", s)
        return findings
    pid = tpl["id"]
    eid = None
    try:
        call("PUT", f"/templates/{pid}/draft", atok, {"sections": [{
            "key": "s1", "title": "Probe", "fields": [
                # Tabla con una columna SELECT por LISTA DE REFERENCIA (no inline) → ¿valida el catálogo?
                {"key": "tref", "type": "TABLE", "label": "Tabla ref", "config": {
                    "columns": [
                        {"key": "modo", "label": "Modo de falla", "type": "SELECT",
                         "config": {"optionSource": {"kind": "referenceList", "listKey": "failure-modes"}}},
                        {"key": "n", "label": "N", "type": "NUMBER", "config": {"min": 0, "max": 10}},
                    ], "maxRows": 2}},
                # Matriz simple obligatoria.
                {"key": "mat", "type": "MATRIX", "label": "Matriz", "required": True, "config": {
                    "rows": [{"key": "r1", "label": "R1"}], "columns": [{"key": "c1", "label": "C1"}, {"key": "c2", "label": "C2"}],
                    "cell": {"type": "NUMBER", "config": {"min": 0, "max": 5}}}},
            ]}]})
        call("POST", f"/templates/{pid}/publish", atok, {})
        s, nodes = call("GET", f"/log-entries/templates/{pid}/nodes", atok)
        ent_node = (nodes.get("nodes") or [{"id": node["id"]}])[0]["id"]
        s, entry = call("POST", "/log-entries", atok, {"templateId": pid, "orgNodeId": ent_node})
        eid = entry["id"] if s in (200, 201) else None
        _, d = req("GET", f"/log-entries/{eid}", atok)
        ver = d["sectionStates"][0]["version"]

        def save(values, complete=False, v=None):
            b = {"expectedVersion": v if v is not None else ver, "values": values}
            if complete:
                b["markComplete"] = True
            return call("PUT", f"/log-entries/{eid}/sections/s1", atok, b)

        # (1) SELECT de celda por referenceList con código INVENTADO.
        s, _ = save([{"fieldKey": "tref", "value": [{"modo": "CODIGO_INVENTADO_XYZ", "n": 1}]}])
        if s in (200, 201):
            findings.append("[GAP] Una columna SELECT por **lista de referencia** NO valida el catálogo: aceptó un código inexistente (las celdas solo validan opciones INLINE; el builder solo ofrece inline, pero el backend debería rechazar igual).")
        else:
            findings.append(f"[OK] La columna SELECT por lista de referencia rechazó el código inventado ({s}).")

        # (2) maxRows cuenta filas vacías (placeholder).
        _, d = req("GET", f"/log-entries/{eid}", atok); ver2 = d["sectionStates"][0]["version"]
        s, _ = save([{"fieldKey": "tref", "value": [{"modo": "", "n": ""}, {"modo": "", "n": ""}, {"modo": "", "n": ""}]}], v=ver2)
        if s == 400:
            findings.append("[NOTA] `maxRows` cuenta también las filas VACÍAS (placeholder): 3 filas en blanco con maxRows=2 ⇒ 400. UX a pulir (la tabla debería ignorar/quitar filas vacías antes de contar).")
        else:
            findings.append(f"[OK] maxRows no contó filas vacías ({s}).")

        # (3) Matriz obligatoria con UNA sola celda ⇒ se da por completa.
        _, d = req("GET", f"/log-entries/{eid}", atok); ver3 = d["sectionStates"][0]["version"]
        s, body = save([{"fieldKey": "tref", "value": []}, {"fieldKey": "mat", "value": {"r1": {"c1": 3}}}], complete=True, v=ver3)
        if s in (200, 201):
            findings.append("[NOTA] Una MATRIZ obligatoria se considera completa con **≥1 celda** (no exige todas las celdas ni filas/columnas obligatorias). Correcto para 'en curso', pero no hay forma de exigir matriz completa.")
        else:
            findings.append(f"[INFO] Completar con matriz de 1 celda devolvió {s}: {str(body)[:120]}")
    finally:
        if eid:
            for tbl in ("LogEntryFieldChange", "LogEntryValue", "LogEntrySignature", "LogEntryTransition", "LogEntrySection"):
                pg(f'DELETE FROM "{tbl}" WHERE "logEntryId" = \'{eid}\';')
            pg(f'DELETE FROM "LogEntry" WHERE id = \'{eid}\';')
        pg(f"DELETE FROM \"Template\" WHERE id='{pid}';")
    return findings


def main():
    _, login = req("POST", "/auth/login", body=ADMIN)
    atok = login["accessToken"]
    _, tree = req("GET", "/structure/nodes", atok)
    leaves = [n for n in flatten(tree) if not n["children"]]
    node, neq = find_node_with_equipment(atok, leaves)
    if not node:
        print("No hay nodos hoja en la estructura."); sys.exit(1)
    print(f"Nodo elegido: {node['id']} ({node['name']}) — {neq} equipo(s) activo(s)")

    tpl_id = seed(atok, node)
    if not tpl_id:
        sys.exit(1)
    print(f"\n✅ Plantilla publicada: {tpl_id}")
    print(f"   Nombre: {TPL_NAME}")
    print(f"   Para llenarla: abre la web (:5173) → Nueva entrada → elige la plantilla (nodo {node['name']}).")

    findings = probe(atok, node)
    print("\n=== HALLAZGOS DEL SONDEO ===")
    for f in findings:
        print(" • " + f)


if __name__ == "__main__":
    main()
