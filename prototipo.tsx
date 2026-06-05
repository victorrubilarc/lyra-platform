import { useState, useRef, useEffect, useMemo } from "react";
import { LayoutDashboard, ClipboardList, FilePlus2, Layers, AlertTriangle, Sparkles, ChevronRight, Plus, Trash2, ArrowUp, ArrowDown, Eye, Send, CheckCircle2, Clock, MapPin, Camera, PenLine, X, Settings2, Search, Zap, Shield, RefreshCw, BookOpen, Network, LogOut, Lock, ArrowLeftRight, MessageSquare, UserCheck, Plug, Flag, Database, Globe, Link2 } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

/* ================= ESTILOS ================= */
const css = `
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Inter:wght@400;500;600&display=swap');
*{box-sizing:border-box} body{margin:0}
.lb{font-family:'Inter',system-ui,sans-serif;background:radial-gradient(1200px 800px at 80% -10%,#1b2550 0%,transparent 60%),radial-gradient(900px 600px at -10% 110%,#0e3a3a 0%,transparent 55%),#070a14;color:#e7eaf3;min-height:100vh}
.h{font-family:'Sora',sans-serif}
.card{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.09);border-radius:18px;backdrop-filter:blur(14px);transition:all .25s ease}
.card:hover{border-color:rgba(255,255,255,.16)}
.glow{box-shadow:0 0 0 1px rgba(99,102,241,.25),0 12px 40px -12px rgba(99,102,241,.35)}
.grad{background:linear-gradient(135deg,#6366f1,#06b6d4)}
.gradtxt{background:linear-gradient(90deg,#a5b4fc,#67e8f9);-webkit-background-clip:text;background-clip:text;color:transparent}
.inp{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.12);border-radius:12px;color:#e7eaf3;padding:10px 14px;width:100%;font-size:14px;outline:none;transition:border .2s}
.inp:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.18)}
.btn{display:inline-flex;align-items:center;gap:8px;border-radius:12px;padding:10px 18px;font-weight:600;font-size:14px;cursor:pointer;border:none;transition:all .2s}
.btnp{background:linear-gradient(135deg,#6366f1,#06b6d4);color:#fff}
.btnp:hover{transform:translateY(-1px);box-shadow:0 10px 28px -8px rgba(99,102,241,.6)}
.btng{background:rgba(255,255,255,.07);color:#e7eaf3;border:1px solid rgba(255,255,255,.12)}
.btng:hover{background:rgba(255,255,255,.12)}
.chip{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:99px;font-size:12px;font-weight:600}
.nav{display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:13px;cursor:pointer;font-size:13.5px;font-weight:500;color:#9aa3b8;transition:all .2s;border:1px solid transparent}
.nav:hover{color:#fff;background:rgba(255,255,255,.05)}
.nava{color:#fff;background:linear-gradient(135deg,rgba(99,102,241,.22),rgba(6,182,212,.12));border-color:rgba(99,102,241,.35)}
.fade{animation:fade .35s ease}
@keyframes fade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.pulse{animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.45}}
.sev{display:flex;gap:6px}
.sevb{width:38px;height:38px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:700;cursor:pointer;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);transition:all .15s}
.sevb:hover{transform:scale(1.08)}
::-webkit-scrollbar{width:8px;height:8px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,.15);border-radius:99px}::-webkit-scrollbar-track{background:transparent}
input[type=range]{accent-color:#6366f1}
.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.drawer{position:fixed;top:0;right:0;height:100vh;width:480px;max-width:94vw;background:#0c1124;border-left:1px solid rgba(99,102,241,.3);z-index:60;overflow-y:auto;animation:slide .3s ease;box-shadow:-30px 0 80px rgba(0,0,0,.6)}
@keyframes slide{from{transform:translateX(60px);opacity:0}to{transform:none;opacity:1}}
.mono{font-family:ui-monospace,Menlo,monospace}
`;

/* ================= CATÁLOGOS ================= */
const INDUSTRIES = [
  { id: "min", name: "Minería", icon: "⛏️", c: "#f59e0b" }, { id: "for", name: "Forestal", icon: "🌲", c: "#22c55e" },
  { id: "ali", name: "Agroalimentaria", icon: "🥬", c: "#84cc16" }, { id: "con", name: "Construcción", icon: "🏗️", c: "#f97316" },
  { id: "man", name: "Manufactura", icon: "⚙️", c: "#64748b" }, { id: "ene", name: "Energía", icon: "⚡", c: "#eab308" },
  { id: "seg", name: "Seguridad", icon: "🛡️", c: "#6366f1" }, { id: "fac", name: "Facility Mgmt", icon: "🏢", c: "#06b6d4" },
  { id: "sal", name: "Salud", icon: "🏥", c: "#ec4899" }, { id: "log", name: "Logística", icon: "🚚", c: "#a855f7" },
];
const indOf = id => INDUSTRIES.find(i => i.id === id) || INDUSTRIES[0];

/* ================= ORÍGENES DE DATOS (configurables) ================= */
const DS_CATS = [
  { id: "erp", name: "ERP", icon: "🏦", c: "#6366f1" }, { id: "cmms", name: "CMMS / Mantención", icon: "🔧", c: "#f59e0b" },
  { id: "rrhh", name: "RRHH", icon: "👥", c: "#ec4899" }, { id: "iot", name: "IoT / Sensores", icon: "📡", c: "#06b6d4" },
  { id: "lab", name: "Laboratorio / Calidad", icon: "🧪", c: "#84cc16" }, { id: "inv", name: "Inventario / Bodega", icon: "📦", c: "#a855f7" },
  { id: "otro", name: "Otro / Custom", icon: "🔗", c: "#64748b" },
];
const catOf = id => DS_CATS.find(c => c.id === id) || DS_CATS[6];
const AUTHS = ["Sin autenticación", "API Key (header)", "Bearer Token", "Basic Auth", "OAuth 2.0 (client credentials)"];

const CONNS0 = [
  { id: "c1", name: "SAP ERP Corporativo", cat: "erp", base: "https://erp.miempresa.cl/api", auth: "OAuth 2.0 (client credentials)", cred: "••••••••", status: "conectado", lat: 142, lastSync: "hace 12 min", desc: "Maestros de materiales, contratistas y centros de costo", endpoints: [
    { id: "/api/v1/materiales", name: "Materiales e insumos", path: "/v1/materiales", method: "GET", field: "data.items[].nombre", ttl: "1 h", active: true, sample: ["Aceite hidráulico ISO 68", "Grasa EP-2", "Revestimiento mandíbula", "Filtro hidráulico HF-35", "Polín de carga 35°"] },
    { id: "/api/v1/contratistas", name: "Empresas contratistas", path: "/v1/contratistas", method: "GET", field: "data[].razon_social", ttl: "24 h", active: true, sample: ["Maestranza Sur SpA", "Servicios Eléctricos Andes", "Transportes Bío-Bío", "Aseo Industrial Pacífico"] },
  ]},
  { id: "c2", name: "Fracttal CMMS", cat: "cmms", base: "https://app.fracttal.com/api", auth: "API Key (header)", cred: "••••••••", status: "conectado", lat: 96, lastSync: "hace 3 min", desc: "Activos, TAGs y catálogo de códigos de falla", endpoints: [
    { id: "/api/v1/equipos", name: "Activos / TAGs", path: "/v1/assets", method: "GET", field: "items[].tag_name", ttl: "6 h", active: true, sample: ["CH-001 Chancador primario", "CV-101 Correa transportadora", "ML-201 Molino SAG", "CAEX-17 Camión extracción", "PALA-03 Pala hidráulica", "GE-040 Generador"] },
    { id: "/api/v1/fallas", name: "Códigos de falla", path: "/v1/failure-codes", method: "GET", field: "items[].code_desc", ttl: "24 h", active: true, sample: ["F01 Sobretemperatura", "F02 Baja presión lubricación", "F03 Vibración excesiva", "F04 Falla eléctrica", "F05 Desgaste prematuro", "F06 Fuga hidráulica"] },
  ]},
  { id: "c3", name: "BUK — RRHH", cat: "rrhh", base: "https://miempresa.buk.cl/api", auth: "Bearer Token", cred: "••••••••", status: "conectado", lat: 210, lastSync: "hace 1 h", desc: "Dotación activa por turno y área", endpoints: [
    { id: "/api/v1/operadores", name: "Operadores activos", path: "/v1/employees?status=active", method: "GET", field: "data[].full_name", ttl: "12 h", active: true, sample: ["C. Riquelme", "M. Soto", "J. Paredes", "A. Fuentes", "P. Muñoz", "R. Cárcamo", "V. Salazar", "D. Espinoza"] },
  ]},
  { id: "c4", name: "Bodega Central (WMS)", cat: "inv", base: "https://wms.miempresa.cl/api", auth: "Basic Auth", cred: "••••••••", status: "sin probar", lat: null, lastSync: "—", desc: "Stock de EPP y consumibles", endpoints: [
    { id: "/api/v1/epp", name: "Catálogo EPP", path: "/v1/epp/catalog", method: "GET", field: "rows[].descripcion", ttl: "24 h", active: true, sample: ["Casco con barbiquejo", "Lentes de seguridad", "Protector auditivo", "Guantes anticorte", "Arnés de seguridad", "Respirador medio rostro"] },
  ]},
];

/* registro global (sincronizado desde el estado por App) */
const buildRegistry = conns => { const r = {}; conns.forEach(c => c.endpoints.forEach(e => { if (e.active) r[e.id] = { name: c.name + " · " + e.name, data: e.sample, conn: c.name, cat: c.cat }; })); return r; };
let API_CATALOG = buildRegistry(CONNS0);

const FIELD_TYPES = [
  { t: "section", n: "Sección", i: "📑" }, { t: "text", n: "Texto corto", i: "✏️" }, { t: "textarea", n: "Párrafo", i: "📝" },
  { t: "number", n: "Número + umbral", i: "🔢" }, { t: "select", n: "Selector", i: "🔽", feed: true }, { t: "radio", n: "Radio buttons", i: "🔘", feed: true },
  { t: "multiselect", n: "Selección múltiple", i: "☑️", feed: true }, { t: "checklist", n: "Checklist", i: "✅", feed: true },
  { t: "date", n: "Fecha", i: "📅" }, { t: "time", n: "Hora", i: "⏰" }, { t: "toggle", n: "Sí / No", i: "🟢" },
  { t: "severity", n: "Severidad 1–5", i: "🚦" }, { t: "slider", n: "Deslizador %", i: "🎚️" },
  { t: "signature", n: "Firma digital", i: "🖋️" }, { t: "photo", n: "Evidencia foto", i: "📷" }, { t: "geo", n: "GPS", i: "📍" },
  { t: "table", n: "Tabla repetible", i: "📊" }, { t: "asset", n: "Activo / QR", i: "🏷️" },
];
let _id = 500; const nid = () => "f" + (_id++);

/* ================= ESTRUCTURA ================= */
const LEVELS0 = ["Área", "Proceso", "Equipo"];
const ORG0 = [
  { id: "a1", name: "Planta Concentradora", lvl: 0, parent: null },
  { id: "p1", name: "Chancado Primario", lvl: 1, parent: "a1" },
  { id: "q1", name: "CH-001 Chancador", lvl: 2, parent: "p1" },
  { id: "q2", name: "CV-101 Correa", lvl: 2, parent: "p1" },
  { id: "p2", name: "Molienda", lvl: 1, parent: "a1" },
  { id: "q3", name: "ML-201 Molino SAG", lvl: 2, parent: "p2" },
  { id: "a2", name: "Mina Rajo", lvl: 0, parent: null },
  { id: "p3", name: "Carguío y Transporte", lvl: 1, parent: "a2" },
  { id: "q4", name: "CAEX-17", lvl: 2, parent: "p3" },
  { id: "a3", name: "Mantenimiento", lvl: 0, parent: null },
  { id: "p4", name: "Taller Camiones", lvl: 1, parent: "a3" },
];
const pathOf = (org, id) => { const out = []; let n = org.find(x => x.id === id); while (n) { out.unshift(n.name); n = org.find(x => x.id === n.parent); } return out.join(" › "); };
const descend = (org, id) => { if (!id) return org.map(n => n.id); const out = [id]; let fr = [id]; while (fr.length) { const nx = org.filter(n => fr.includes(n.parent)).map(n => n.id); out.push(...nx); fr = nx; } return out; };

/* ================= USUARIOS ================= */
const USERS = [
  { id: "u1", name: "Carolina Riquelme", role: "admin", roleName: "Administradora", avatar: "👩‍💼", scope: null, desc: "Acceso total · plantillas, estructura y orígenes de datos" },
  { id: "u2", name: "Marcela Soto", role: "supervisor", roleName: "Supervisora", avatar: "👷‍♀️", scope: "a1", desc: "Planta Concentradora · gestiona incidencias y turnos" },
  { id: "u3", name: "Javier Paredes", role: "operador", roleName: "Operador", avatar: "👨‍🔧", scope: "p1", desc: "Chancado Primario · registra y entrega turno" },
];

/* ================= TURNOS ================= */
const SHIFT_CFG = { pattern: "Rotativo 12 horas (7x7)", shifts: [{ id: "dia", name: "Turno Día", icon: "🌞", time: "08:00 – 20:00" }, { id: "noche", name: "Turno Noche", icon: "🌙", time: "20:00 – 08:00" }] };
const currentShift = () => { const h = new Date().getHours(); return h >= 8 && h < 20 ? SHIFT_CFG.shifts[0] : SHIFT_CFG.shifts[1]; };

/* ================= PLANTILLAS ================= */
const TPL0 = [
  { id: "t1", ind: "min", node: "q1", roles: ["admin", "supervisor", "operador"], name: "Turno Mina — Chancado Primario", desc: "Registro operacional por turno del chancador", fields: [
    { id: "a2", t: "select", label: "Turno", opts: ["Día", "Noche"], req: true },
    { id: "a3", t: "select", label: "Operador responsable", src: { type: "api", api: "/api/v1/operadores" }, req: true },
    { id: "a4", t: "select", label: "Equipo (TAG)", src: { type: "api", api: "/api/v1/equipos" } },
    { id: "a6", t: "number", label: "Temperatura descanso hidráulico", unit: "°C", min: 0, max: 85, req: true },
    { id: "a7", t: "number", label: "Presión lubricación", unit: "bar", min: 2.5, max: 6 },
    { id: "a8", t: "number", label: "Tonelaje procesado", unit: "t" },
    { id: "a11", t: "checklist", label: "Verificación de seguridad", opts: ["Bloqueo LOTO verificado", "EPP completo", "Área señalizada", "Emergencias operativas"] },
    { id: "a12", t: "severity", label: "Severidad de novedades" },
    { id: "a13", t: "toggle", label: "¿Detención no programada?" },
    { id: "a14", t: "select", label: "Código de falla", src: { type: "api", api: "/api/v1/fallas" }, showIf: { f: "a13", v: true } },
    { id: "a15", t: "signature", label: "Firma del operador", req: true },
  ]},
  { id: "t2", ind: "ali", node: "a1", roles: ["admin", "supervisor"], name: "Control HACCP — Cámara de Frío", desc: "PCC: temperatura e higiene", fields: [
    { id: "b2", t: "number", label: "Temperatura cámara", unit: "°C", min: 0, max: 4, req: true },
    { id: "b4", t: "checklist", label: "Higiene", opts: ["Superficies sanitizadas", "Rotulado FIFO", "Sin producto en suelo"] },
    { id: "b5", t: "toggle", label: "¿Producto fuera de especificación?" },
    { id: "b8", t: "signature", label: "Firma inspector", req: true },
  ]},
  { id: "t3", ind: "con", node: "a3", roles: ["admin", "supervisor"], name: "Inspección Diaria de Obra", desc: "Avance, dotación y seguridad", fields: [
    { id: "c3", t: "number", label: "Dotación", unit: "personas" },
    { id: "c4", t: "slider", label: "Avance físico" },
    { id: "c5b", t: "multiselect", label: "Contratistas presentes", src: { type: "api", api: "/api/v1/contratistas" } },
    { id: "c6", t: "checklist", label: "EPP en uso", src: { type: "api", api: "/api/v1/epp" } },
    { id: "c7", t: "severity", label: "Riesgo observado" },
    { id: "c11", t: "signature", label: "Firma jefe terreno", req: true },
  ]},
  { id: "t4", ind: "min", node: "q4", roles: ["admin", "operador"], name: "Checklist Pre-uso CAEX", desc: "Inspección antes de operar camión", fields: [
    { id: "d2", t: "radio", label: "Estado general del equipo", opts: ["Operativo", "Operativo con observaciones", "No operativo"], req: true },
    { id: "d3", t: "checklist", label: "Inspección visual", opts: ["Neumáticos", "Niveles de fluido", "Luces y baliza", "Frenos", "Extintor vigente"] },
    { id: "d4", t: "select", label: "Insumo requerido", src: { type: "api", api: "/api/v1/materiales" } },
    { id: "d6", t: "signature", label: "Firma operador", req: true },
  ]},
];

/* ================= DATA SEMILLA ================= */
const DAYS = [...Array(14)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - (13 - i)); return d; });
const fdate = d => d.toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
const seedT = [82, 79, 84, 88, 91, 83, 80, 86, 92, 95, 89, 84, 96, 99];
const ENTRIES0 = []; let eid = 1;
DAYS.forEach((d, i) => { const n = 2 + (i * 7) % 3; for (let k = 0; k < n; k++) { const tpl = TPL0[(i + k) % TPL0.length]; ENTRIES0.push({ id: "E-" + String(eid++).padStart(4, "0"), tpl: tpl.id, node: tpl.node, date: new Date(d), shift: (i + k) % 2 ? "noche" : "dia", by: ["C. Riquelme", "M. Soto", "J. Paredes", "A. Fuentes"][(i + k) % 4], status: "validada", temp: tpl.id === "t1" ? seedT[i] - k * 2 : null, sev: (i + k * 2) % 6 === 0 ? 4 : ((i + k) % 3) + 1, compliance: 72 + ((i * 3 + k * 11) % 28), changes: [] }); } });

const WF = ["Abierta", "Asignada", "En curso", "En verificación", "Resuelta"];
const INC0 = [
  { id: "INC-0041", title: "Temperatura hidráulica 99°C sobre umbral (85°C)", tpl: "Turno Mina — Chancado Primario", node: "q1", sev: 4, prio: "Alta", status: "Abierta", assignee: null, reporter: "J. Paredes", date: DAYS[13], due: "24 h", protocol: "MNT-07: detención programada y revisión de intercambiador", src: "Regla automática", comments: [], activity: [{ ts: DAYS[13], txt: "Incidencia creada por regla automática (umbral excedido)" }] },
  { id: "INC-0040", title: "Cámara CF-02 a 6.2°C — fuera de rango HACCP", tpl: "Control HACCP — Cámara de Frío", node: "a1", sev: 5, prio: "Crítica", status: "En curso", assignee: "M. Soto", reporter: "Sistema", date: DAYS[12], due: "4 h", protocol: "PCC-01: cuarentena de producto y verificación de compresor", src: "Regla automática", comments: [{ by: "M. Soto", ts: DAYS[12], text: "Producto en cuarentena. Técnico de refrigeración en camino." }], activity: [{ ts: DAYS[12], txt: "Creada automáticamente" }, { ts: DAYS[12], txt: "Asignada a M. Soto · prioridad Crítica" }] },
  { id: "INC-0039", title: "Trabajo en altura sin arnés — Nivel 3", tpl: "Inspección Diaria de Obra", node: "a3", sev: 4, prio: "Alta", status: "En verificación", assignee: "C. Riquelme", reporter: "M. Soto", date: DAYS[12], due: "48 h", protocol: "HSE-12: detención parcial y recapacitación", src: "Checklist incumplido", comments: [{ by: "C. Riquelme", ts: DAYS[11], text: "Recapacitación realizada. Pendiente verificación en terreno." }], activity: [{ ts: DAYS[12], txt: "Creada desde checklist" }] },
  { id: "INC-0037", title: "Presión lubricación 2.1 bar bajo mínimo", tpl: "Turno Mina — Chancado Primario", node: "q1", sev: 3, prio: "Media", status: "Resuelta", assignee: "J. Paredes", reporter: "Sistema", date: DAYS[9], due: "—", protocol: "MNT-03: relleno y purga de circuito", src: "Regla automática", comments: [], activity: [{ ts: DAYS[9], txt: "Creada" }, { ts: DAYS[8], txt: "Resuelta: se repuso nivel y purgó circuito" }] },
];

const HAND0 = [
  { id: "H-0012", date: new Date(Date.now() - 12 * 36e5), shift: "noche", from: "A. Fuentes", to: "J. Paredes", node: "p1", status: "recibido", ackAt: new Date(Date.now() - 11.5 * 36e5),
    estado: "Operativo con observaciones", params: { "Temp. hidráulica": "96 °C ⚠", "Presión lubricación": "3.1 bar", "Tonelaje turno": "1.385 t" },
    pendientes: ["Monitorear temperatura cada 2 h", "Solicitar revisión de intercambiador a mantención", "Retirar material acumulado bajo correa CV-101"],
    incidents: ["INC-0041"], resumen: "Turno noche con operación continua salvo detención de 25 min por atollo en boca de chancador (resuelto). Temperatura del descanso hidráulico cerró en 96°C, sobre umbral: se generó INC-0041 y queda monitoreo reforzado cada 2 horas. Lubricación y correas normales. Sin incidentes de seguridad. Pendiente coordinar con mantención la revisión del intercambiador antes del próximo turno noche." },
  { id: "H-0011", date: new Date(Date.now() - 24 * 36e5), shift: "dia", from: "J. Paredes", to: "A. Fuentes", node: "p1", status: "recibido", ackAt: new Date(Date.now() - 23.6 * 36e5), estado: "Operativo", params: { "Temp. hidráulica": "89 °C", "Presión lubricación": "3.4 bar", "Tonelaje turno": "1.512 t" }, pendientes: ["Reapriete de pernos en polín 14"], incidents: [], resumen: "Turno día sin novedades relevantes. Producción 4% sobre plan. Temperatura hidráulica estable pero con tendencia al alza, observar. Queda pendiente reapriete de pernos en polín 14 de CV-101." },
];

const KB0 = [
  { id: "KB-001", type: "lección", title: "Atollos recurrentes en boca de chancador con mineral húmedo", tags: ["chancado", "atollo", "clima"], node: "p1", date: DAYS[8], views: 34, body: "En días de lluvia el mineral húmedo aumenta atollos en un 60%. Mitigación efectiva: reducir tasa de alimentación 15% y activar pica-roca preventivamente. Registrado en 7 bitácoras entre mayo y junio." },
  { id: "KB-002", type: "procedimiento", title: "Purga de circuito de lubricación tras baja presión (MNT-03)", tags: ["lubricación", "mantención"], node: "q1", date: DAYS[9], views: 21, body: "Derivado de INC-0037: secuencia validada de relleno y purga. Tiempo medio de ejecución: 40 min. Verificar siempre presión post-purga > 3.0 bar antes de reanudar." },
  { id: "KB-003", type: "patrón IA", title: "Patrón detectado: sobretemperatura hidráulica precede fallas de intercambiador", tags: ["predictivo", "hidráulica"], node: "q1", date: DAYS[13], views: 58, body: "El modelo identificó que incrementos sostenidos >0.8°C/día durante 10+ días anticipan falla del intercambiador con 7–10 días de antelación. Serie actual de CH-001 cumple el patrón: mantención preventiva recomendada esta semana." },
];

const SEVC = ["", "#22c55e", "#84cc16", "#eab308", "#f97316", "#ef4444"];
const PRIOC = { "Crítica": "#ef4444", "Alta": "#f97316", "Media": "#eab308", "Baja": "#22c55e" };

/* ================= HELPERS UI ================= */
const Sev = ({ v }) => <span className="chip" style={{ background: SEVC[v] + "22", color: SEVC[v] }}>● Sev {v}</span>;
const NodeTag = ({ org, id }) => id ? <span className="chip" style={{ background: "rgba(6,182,212,.15)", color: "#67e8f9" }}><Network size={11} /> {pathOf(org, id)}</span> : null;
const ApiBadge = () => <span className="chip pulse" style={{ background: "rgba(34,197,94,.15)", color: "#34d399", fontSize: 10.5, padding: "2px 8px" }}><Plug size={10} /> API</span>;
const StatusDot = ({ s }) => { const m = { conectado: ["#22c55e", "Conectado"], "sin probar": ["#eab308", "Sin probar"], error: ["#ef4444", "Error"] }[s]; return <span className="chip" style={{ background: m[0] + "22", color: m[0] }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: m[0] }} className={s === "conectado" ? "" : "pulse"} /> {m[1]}</span>; };

async function askAI(prompt, fallback) {
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }) });
    const d = await r.json();
    const txt = (d.content || []).map(c => c.text || "").join("\n").trim();
    return txt || fallback;
  } catch { return fallback; }
}

function useOptions(f) {
  const isApi = f.src?.type === "api";
  const [opts, setOpts] = useState(isApi ? null : (f.opts || []));
  useEffect(() => {
    if (isApi) { setOpts(null); const t = setTimeout(() => setOpts(API_CATALOG[f.src.api]?.data || ["(endpoint no disponible)"]), 650); return () => clearTimeout(t); }
    setOpts(f.opts || []);
  }, [f.src?.api, f.src?.type, JSON.stringify(f.opts || [])]);
  return { opts, isApi, loading: opts === null };
}

/* ================= FIRMA ================= */
function Signature({ value, onChange }) {
  const ref = useRef(null); const draw = useRef(false);
  useEffect(() => { const x = ref.current.getContext("2d"); x.strokeStyle = "#a5b4fc"; x.lineWidth = 2.2; x.lineCap = "round"; }, []);
  const pos = e => { const r = ref.current.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return { x: t.clientX - r.left, y: t.clientY - r.top }; };
  const start = e => { draw.current = true; const x = ref.current.getContext("2d"); const p = pos(e); x.beginPath(); x.moveTo(p.x, p.y); };
  const move = e => { if (!draw.current) return; e.preventDefault(); const x = ref.current.getContext("2d"); const p = pos(e); x.lineTo(p.x, p.y); x.stroke(); };
  const end = () => { if (draw.current) { draw.current = false; onChange(ref.current.toDataURL()); } };
  return <div>
    <canvas ref={ref} width={420} height={110} style={{ width: "100%", maxWidth: 420, height: 110, background: "rgba(255,255,255,.04)", border: "1px dashed rgba(165,180,252,.4)", borderRadius: 12, cursor: "crosshair", touchAction: "none" }} onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end} onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
      <button className="btn btng" style={{ padding: "5px 12px", fontSize: 12 }} onClick={() => { ref.current.getContext("2d").clearRect(0, 0, 420, 110); onChange(null); }}>Limpiar</button>
      {value && <span className="chip" style={{ background: "#22c55e22", color: "#22c55e" }}><CheckCircle2 size={13} /> Firmado</span>}
    </div>
  </div>;
}

/* ================= CAMPOS ================= */
function OptionsField({ f, v, set }) {
  const { opts, isApi, loading } = useOptions(f);
  if (loading) return <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#67e8f9" }}><RefreshCw size={14} className="spin" /> Consultando {API_CATALOG[f.src.api]?.name || "API"}…</div>;
  const head = isApi && <div style={{ marginBottom: 8 }}><ApiBadge /> <span style={{ fontSize: 11, color: "#6b7280" }}>{API_CATALOG[f.src.api]?.name || "origen desconectado"}</span></div>;
  if (f.t === "select") return <div>{head}<select className="inp" value={v || ""} onChange={e => set(e.target.value)}><option value="">Seleccionar…</option>{opts.map(o => <option key={o}>{o}</option>)}</select></div>;
  if (f.t === "radio") return <div>{head}{opts.map(o => <label key={o} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 10, marginBottom: 5, cursor: "pointer", background: v === o ? "rgba(99,102,241,.18)" : "rgba(255,255,255,.03)", border: "1px solid " + (v === o ? "#6366f1" : "rgba(255,255,255,.08)") }}>
    <span style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid " + (v === o ? "#818cf8" : "#475569"), display: "flex", alignItems: "center", justifyContent: "center" }}>{v === o && <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#818cf8" }} />}</span>
    <input type="radio" hidden checked={v === o} onChange={() => set(o)} /><span style={{ fontSize: 13.5 }}>{o}</span></label>)}</div>;
  if (f.t === "multiselect") return <div>{head}<div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{opts.map(o => { const on = (v || []).includes(o); return <button key={o} className="chip" style={{ cursor: "pointer", border: "1px solid", borderColor: on ? "#6366f1" : "rgba(255,255,255,.15)", background: on ? "rgba(99,102,241,.25)" : "rgba(255,255,255,.04)", color: on ? "#c7d2fe" : "#9aa3b8", padding: "8px 14px" }} onClick={() => set(on ? v.filter(x => x !== o) : [...(v || []), o])}>{on ? "✓ " : ""}{o}</button>; })}</div></div>;
  const cv = v || {}; const done = opts.filter(o => cv[o]).length; const pct = opts.length ? Math.round(done / opts.length * 100) : 0;
  return <div>{head}
    {opts.map(o => <div key={o} onClick={() => set({ ...cv, [o]: !cv[o] })} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, cursor: "pointer", marginBottom: 6, background: cv[o] ? "rgba(34,197,94,.1)" : "rgba(255,255,255,.03)", border: "1px solid " + (cv[o] ? "rgba(34,197,94,.3)" : "rgba(255,255,255,.08)") }}>
      <div style={{ width: 20, height: 20, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", background: cv[o] ? "#22c55e" : "rgba(255,255,255,.08)", color: "#06270f", fontWeight: 800, fontSize: 13 }}>{cv[o] ? "✓" : ""}</div>
      <span style={{ fontSize: 13.5, color: cv[o] ? "#d1fae5" : "#c3c9da" }}>{o}</span></div>)}
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 99, background: "rgba(255,255,255,.08)" }}><div style={{ width: pct + "%", height: "100%", borderRadius: 99, background: pct === 100 ? "#22c55e" : "linear-gradient(90deg,#6366f1,#06b6d4)", transition: "width .3s" }} /></div>
      <span style={{ fontSize: 12, fontWeight: 700, color: pct === 100 ? "#22c55e" : "#9aa3b8" }}>{pct}%</span></div>
  </div>;
}

function FieldRender({ f, v, set, all }) {
  if (f.showIf) { const cur = all[f.showIf.f]; if (!(cur === f.showIf.v)) return null; }
  const L = <label style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: "#c3c9da", marginBottom: 7 }}>{f.label}{f.req && <span style={{ color: "#f87171" }}> *</span>}</label>;
  const wrap = el => <div className="fade" style={{ marginBottom: 20 }}>{L}{el}</div>;
  switch (f.t) {
    case "section": return <div className="h" style={{ margin: "26px 0 14px", paddingBottom: 8, borderBottom: "1px solid rgba(255,255,255,.1)", fontSize: 15, fontWeight: 700, color: "#a5b4fc" }}>{f.label}</div>;
    case "text": return wrap(<input className="inp" placeholder={f.ph || "Escribe aquí…"} value={v || ""} onChange={e => set(e.target.value)} />);
    case "textarea": return wrap(<textarea className="inp" rows={3} placeholder="Observaciones…" value={v || ""} onChange={e => set(e.target.value)} />);
    case "asset": return wrap(<div style={{ display: "flex", gap: 8 }}><input className="inp" placeholder={f.ph || "TAG / Código"} value={v || ""} onChange={e => set(e.target.value)} /><button className="btn btng" onClick={() => set("QR-" + Math.floor(1000 + Math.random() * 9000))}>📷 QR</button></div>);
    case "number": {
      const num = v === undefined || v === "" ? null : Number(v);
      const out = num !== null && ((f.min !== undefined && num < f.min) || (f.max !== undefined && num > f.max));
      return wrap(<div><div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="number" className="inp" style={{ maxWidth: 180, borderColor: out ? "#ef4444" : undefined }} value={v ?? ""} onChange={e => set(e.target.value)} />
        {f.unit && <span style={{ color: "#9aa3b8", fontWeight: 600 }}>{f.unit}</span>}
        {(f.min !== undefined || f.max !== undefined) && <span style={{ fontSize: 12, color: "#6b7280" }}>rango: {f.min ?? "—"} a {f.max ?? "—"}</span>}</div>
        {out && <div className="chip pulse" style={{ background: "#ef444422", color: "#f87171", marginTop: 8 }}><AlertTriangle size={13} /> Fuera de rango — generará incidencia con workflow</div>}</div>);
    }
    case "select": case "radio": case "multiselect": case "checklist": return wrap(<OptionsField f={f} v={v} set={set} />);
    case "date": return wrap(<input type="date" className="inp" style={{ maxWidth: 220, colorScheme: "dark" }} value={v || ""} onChange={e => set(e.target.value)} />);
    case "time": return wrap(<input type="time" className="inp" style={{ maxWidth: 160, colorScheme: "dark" }} value={v || ""} onChange={e => set(e.target.value)} />);
    case "toggle": return wrap(<button onClick={() => set(!v)} style={{ width: 58, height: 30, borderRadius: 99, border: "none", cursor: "pointer", background: v ? "linear-gradient(135deg,#6366f1,#06b6d4)" : "rgba(255,255,255,.12)", position: "relative", transition: "all .25s" }}><span style={{ position: "absolute", top: 3, left: v ? 31 : 3, width: 24, height: 24, borderRadius: "50%", background: "#fff", transition: "all .25s" }} /></button>);
    case "severity": return wrap(<div className="sev">{[1, 2, 3, 4, 5].map(n => <div key={n} className="sevb" style={v === n ? { background: SEVC[n], color: "#0b0f1d", borderColor: SEVC[n], transform: "scale(1.1)" } : { color: SEVC[n] }} onClick={() => set(n)}>{n}</div>)}{v >= 4 && <span className="chip pulse" style={{ background: "#ef444422", color: "#f87171", marginLeft: 6 }}>⚠ activa protocolo</span>}</div>);
    case "slider": return wrap(<div style={{ display: "flex", alignItems: "center", gap: 14 }}><input type="range" min={0} max={100} value={v ?? 50} onChange={e => set(Number(e.target.value))} style={{ flex: 1, maxWidth: 320 }} /><span className="h" style={{ fontWeight: 700, fontSize: 18, minWidth: 52 }}>{v ?? 50}%</span></div>);
    case "signature": return wrap(<Signature value={v} onChange={set} />);
    case "photo": return wrap(<div><label className="btn btng" style={{ cursor: "pointer" }}><Camera size={16} /> Capturar / subir<input type="file" accept="image/*" hidden onChange={e => { const file = e.target.files[0]; if (file) set(URL.createObjectURL(file)); }} /></label>{v && <img src={v} alt="evidencia" style={{ display: "block", marginTop: 10, maxHeight: 130, borderRadius: 12, border: "1px solid rgba(255,255,255,.15)" }} />}</div>);
    case "geo": return wrap(<div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}><button className="btn btng" onClick={() => { const sim = () => set({ lat: (-37.46 + Math.random() * .05).toFixed(5), lng: (-72.35 + Math.random() * .05).toFixed(5) }); if (navigator.geolocation) navigator.geolocation.getCurrentPosition(p => set({ lat: p.coords.latitude.toFixed(5), lng: p.coords.longitude.toFixed(5) }), sim, { timeout: 3000 }); else sim(); }}><MapPin size={16} /> Capturar GPS</button>{v && <span className="chip" style={{ background: "#06b6d422", color: "#67e8f9" }}>📍 {v.lat}, {v.lng}</span>}</div>);
    case "table": {
      const rows = v || []; const cols = f.cols || ["Col 1", "Col 2"];
      return wrap(<div><div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr>{cols.map(c => <th key={c} style={{ textAlign: "left", padding: "6px 8px", color: "#9aa3b8", fontWeight: 600, borderBottom: "1px solid rgba(255,255,255,.1)" }}>{c}</th>)}<th /></tr></thead>
        <tbody>{rows.map((r, ri) => <tr key={ri}>{cols.map((c, ci) => <td key={ci} style={{ padding: 4 }}><input className="inp" style={{ padding: "6px 10px", fontSize: 13 }} value={r[ci] || ""} onChange={e => { const nr = rows.map((x, i) => i === ri ? Object.assign([...x], { [ci]: e.target.value }) : x); set(nr); }} /></td>)}<td><button className="btn btng" style={{ padding: 6 }} onClick={() => set(rows.filter((_, i) => i !== ri))}><Trash2 size={14} /></button></td></tr>)}</tbody></table></div>
        <button className="btn btng" style={{ marginTop: 8, padding: "6px 14px", fontSize: 13 }} onClick={() => set([...rows, cols.map(() => "")])}><Plus size={14} /> Agregar fila</button></div>);
    }
    default: return null;
  }
}

/* ================= APP ================= */
export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState("dash");
  const [org, setOrg] = useState(ORG0);
  const [levels, setLevels] = useState(LEVELS0);
  const [conns, setConns] = useState(CONNS0);
  const [templates, setTemplates] = useState(TPL0);
  const [entries, setEntries] = useState(ENTRIES0);
  const [incidents, setIncidents] = useState(INC0);
  const [handovers, setHandovers] = useState(HAND0);
  const [kb, setKb] = useState(KB0);
  const [fillTpl, setFillTpl] = useState(null);
  const [editTpl, setEditTpl] = useState(null);
  const [toast, setToast] = useState(null);
  const notify = m => { setToast(m); setTimeout(() => setToast(null), 4500); };
  useEffect(() => { API_CATALOG = buildRegistry(conns); }, [conns]);

  const userScope = useMemo(() => user ? descend(org, user.scope) : [], [user, org]);
  const canSee = tpl => user && (user.role === "admin" || (tpl.roles.includes(user.role) && (!tpl.node || userScope.includes(tpl.node))));
  const myTemplates = templates.filter(canSee);
  const myEntries = entries.filter(e => user?.role === "admin" || userScope.includes(e.node) || myTemplates.some(t => t.id === e.tpl));

  if (!user) return <Login onLogin={u => { setUser(u); setView(u.role === "operador" ? "turno" : "dash"); }} />;

  const isAdmin = user.role === "admin";
  const NAV = [
    ["dash", "Dashboard", LayoutDashboard, true],
    ["turno", "Cambio de turno", ArrowLeftRight, true],
    ["new", "Nueva entrada", FilePlus2, true],
    ["entries", "Bitácoras", ClipboardList, true],
    ["inc", "Incidencias", AlertTriangle, true],
    ["kb", "Base de conocimiento", BookOpen, true],
    ["ai", "Asistente IA", Sparkles, true],
    ["tpl", "Plantillas (Builder)", Layers, isAdmin],
    ["ds", "Orígenes de datos", Database, isAdmin],
    ["org", "Estructura", Network, isAdmin],
  ].filter(x => x[3]);
  const openInc = incidents.filter(i => i.status !== "Resuelta" && (isAdmin || userScope.includes(i.node))).length;
  const pendingHand = handovers.filter(h => h.status === "pendiente" && userScope.includes(h.node)).length;

  const submitEntry = (tpl, vals, node) => {
    const newInc = [];
    tpl.fields.forEach(f => {
      const v = vals[f.id];
      if (f.t === "number" && v !== undefined && v !== "") { const n = Number(v); if ((f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max)) newInc.push({ title: `${f.label}: ${n}${f.unit || ""} fuera de rango (${f.min ?? "—"}–${f.max ?? "—"})`, sev: 4, prio: "Alta", protocol: "Protocolo automático: verificación por supervisor del área" }); }
      if (f.t === "severity" && v >= 4) newInc.push({ title: `${f.label}: nivel ${v} reportado`, sev: v, prio: v === 5 ? "Crítica" : "Alta", protocol: "Protocolo HSE: respuesta inmediata" });
    });
    const sevF = tpl.fields.find(f => f.t === "severity");
    setEntries(p => [{ id: "E-" + String(1000 + p.length).padStart(4, "0"), tpl: tpl.id, node: node || tpl.node, date: new Date(), shift: currentShift().id, by: user.name, status: "validada", sev: sevF ? vals[sevF.id] || 1 : 1, compliance: 95, vals: JSON.parse(JSON.stringify(vals)), changes: [] }, ...p]);
    if (newInc.length) {
      setIncidents(p => [...newInc.map((x, i) => ({ id: "INC-" + (42 + p.length + i).toString().padStart(4, "0"), ...x, tpl: tpl.name, node: node || tpl.node, status: "Abierta", assignee: null, reporter: user.name, date: new Date(), due: "24 h", src: "Regla automática", comments: [], activity: [{ ts: new Date(), txt: "Creada por regla automática desde " + tpl.name }] })), ...p]);
      notify(`✅ Entrada registrada · 🚨 ${newInc.length} incidencia(s) generadas — asigna responsable en el módulo Incidencias`);
    } else notify("✅ Entrada registrada y validada");
    setFillTpl(null); setView("entries");
  };

  return <div className="lb" style={{ display: "flex" }}>
    <style>{css}</style>
    <aside style={{ width: 252, minHeight: "100vh", padding: "20px 14px", borderRight: "1px solid rgba(255,255,255,.07)", position: "sticky", top: 0, display: "flex", flexDirection: "column", gap: 3, background: "rgba(7,10,20,.6)", backdropFilter: "blur(20px)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 10px 16px" }}>
        <div className="grad" style={{ width: 36, height: 36, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center" }}><Zap size={19} color="#fff" /></div>
        <div><div className="h" style={{ fontWeight: 800, fontSize: 16 }}>LogBook <span className="gradtxt">Pro</span></div><div style={{ fontSize: 10, color: "#9aa3b8", letterSpacing: 1 }}>BITÁCORA INTELIGENTE</div></div>
      </div>
      {NAV.map(([k, l, I]) => <div key={k} className={"nav " + (view === k ? "nava" : "")} onClick={() => { setView(k); setFillTpl(null); setEditTpl(null); }}>
        <I size={17} />{l}
        {k === "inc" && openInc > 0 && <span style={{ marginLeft: "auto", background: "#ef4444", color: "#fff", borderRadius: 99, fontSize: 11, fontWeight: 700, padding: "1px 8px" }}>{openInc}</span>}
        {k === "turno" && pendingHand > 0 && <span className="pulse" style={{ marginLeft: "auto", background: "#eab308", color: "#1a1400", borderRadius: 99, fontSize: 11, fontWeight: 700, padding: "1px 8px" }}>{pendingHand}</span>}
      </div>)}
      <div style={{ marginTop: "auto" }}>
        <div className="card" style={{ padding: 13, marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
            <span style={{ fontSize: 24 }}>{user.avatar}</span>
            <div style={{ minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.name}</div>
              <span className="chip" style={{ background: "rgba(99,102,241,.2)", color: "#c7d2fe", fontSize: 10.5, padding: "1px 8px" }}>{user.roleName}</span></div>
          </div>
          <div style={{ fontSize: 10.5, color: "#67e8f9", marginTop: 7 }}>🔐 Alcance: {user.scope ? pathOf(org, user.scope) : "toda la organización"}</div>
        </div>
        <button className="btn btng" style={{ width: "100%", justifyContent: "center", fontSize: 13 }} onClick={() => setUser(null)}><LogOut size={14} /> Cerrar sesión</button>
      </div>
    </aside>

    <main style={{ flex: 1, padding: "26px 32px", maxWidth: 1260, margin: "0 auto", width: "100%" }}>
      {view === "dash" && <Dash user={user} org={org} entries={myEntries} incidents={incidents.filter(i => isAdmin || userScope.includes(i.node))} templates={myTemplates} handovers={handovers} setView={setView} />}
      {view === "turno" && <TurnoView user={user} org={org} handovers={handovers} setHandovers={setHandovers} incidents={incidents} entries={myEntries} notify={notify} />}
      {view === "new" && !fillTpl && <PickTpl templates={myTemplates} allCount={templates.length} org={org} onPick={setFillTpl} />}
      {view === "new" && fillTpl && <EntryFill tpl={fillTpl} org={org} back={() => setFillTpl(null)} onSubmit={submitEntry} />}
      {view === "entries" && <EntriesView entries={myEntries} setEntries={setEntries} templates={templates} myTemplates={myTemplates} org={org} user={user} notify={notify} />}
      {view === "inc" && <IncidentsView incidents={incidents.filter(i => isAdmin || userScope.includes(i.node))} setIncidents={setIncidents} org={org} user={user} setKb={setKb} notify={notify} />}
      {view === "kb" && <KBView kb={kb} org={org} />}
      {view === "ai" && <AIChat entries={myEntries} incidents={incidents} templates={templates} kb={kb} handovers={handovers} />}
      {view === "tpl" && isAdmin && !editTpl && <TplList templates={templates} org={org} onNew={() => setEditTpl({ id: "t" + Date.now(), ind: "min", node: null, roles: ["admin"], name: "", desc: "", fields: [], isNew: true })} onEdit={t => setEditTpl(JSON.parse(JSON.stringify(t)))} onUse={t => { setFillTpl(t); setView("new"); }} />}
      {view === "tpl" && isAdmin && editTpl && <Builder tpl={editTpl} setTpl={setEditTpl} org={org} levels={levels} conns={conns} onSave={t => { setTemplates(p => { const i = p.findIndex(x => x.id === t.id); const c = { ...t }; delete c.isNew; if (i >= 0) { const n = [...p]; n[i] = c; return n; } return [c, ...p]; }); setEditTpl(null); notify("✅ Plantilla guardada"); }} onCancel={() => setEditTpl(null)} />}
      {view === "ds" && isAdmin && <DataSourcesView conns={conns} setConns={setConns} templates={templates} notify={notify} />}
      {view === "org" && isAdmin && <OrgView org={org} setOrg={setOrg} levels={levels} setLevels={setLevels} templates={templates} notify={notify} />}
    </main>
    {toast && <div className="fade" style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "#10152b", border: "1px solid rgba(99,102,241,.4)", borderRadius: 14, padding: "13px 22px", fontSize: 14, fontWeight: 600, zIndex: 99, maxWidth: 640, boxShadow: "0 16px 48px -8px rgba(0,0,0,.6)" }}>{toast}</div>}
  </div>;
}

/* ================= LOGIN ================= */
function Login({ onLogin }) {
  const [sel, setSel] = useState(null); const [pwd, setPwd] = useState("");
  return <div className="lb" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
    <style>{css}</style>
    <div className="fade" style={{ width: "100%", maxWidth: 520 }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div className="grad" style={{ width: 58, height: 58, borderRadius: 18, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}><Zap size={30} color="#fff" /></div>
        <h1 className="h" style={{ fontSize: 30, fontWeight: 800, margin: 0 }}>LogBook <span className="gradtxt">Pro</span></h1>
        <p style={{ color: "#9aa3b8", fontSize: 14 }}>Plataforma de bitácoras operacionales inteligentes · acceso autenticado por roles</p>
      </div>
      <div className="card glow" style={{ padding: 26 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#9aa3b8", letterSpacing: 1, marginBottom: 12 }}>SELECCIONA UN USUARIO DEMO</div>
        {USERS.map(u => <div key={u.id} onClick={() => setSel(u)} style={{ display: "flex", gap: 12, alignItems: "center", padding: "13px 15px", borderRadius: 14, cursor: "pointer", marginBottom: 8, background: sel?.id === u.id ? "rgba(99,102,241,.18)" : "rgba(255,255,255,.03)", border: "1px solid " + (sel?.id === u.id ? "#6366f1" : "rgba(255,255,255,.08)"), transition: "all .2s" }}>
          <span style={{ fontSize: 28 }}>{u.avatar}</span>
          <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14.5 }}>{u.name} <span className="chip" style={{ background: "rgba(99,102,241,.2)", color: "#c7d2fe", marginLeft: 6 }}>{u.roleName}</span></div>
            <div style={{ fontSize: 12, color: "#9aa3b8", marginTop: 3 }}>{u.desc}</div></div>
          {sel?.id === u.id && <CheckCircle2 size={18} color="#818cf8" />}
        </div>)}
        <div style={{ position: "relative", margin: "16px 0" }}>
          <Lock size={15} style={{ position: "absolute", left: 13, top: 13, color: "#6b7280" }} />
          <input type="password" className="inp" style={{ paddingLeft: 38 }} placeholder="Contraseña (demo: cualquier valor)" value={pwd} onChange={e => setPwd(e.target.value)} onKeyDown={e => e.key === "Enter" && sel && onLogin(sel)} />
        </div>
        <button className="btn btnp" style={{ width: "100%", justifyContent: "center", opacity: sel ? 1 : .5 }} disabled={!sel} onClick={() => onLogin(sel)}><Shield size={16} /> Ingresar de forma segura</button>
        <div style={{ fontSize: 11, color: "#6b7280", textAlign: "center", marginTop: 12 }}>🔒 SSO corporativo, MFA y auditoría de sesiones disponibles en versión productiva</div>
      </div>
    </div>
  </div>;
}

/* ================= ORÍGENES DE DATOS ================= */
function DataSourcesView({ conns, setConns, templates, notify }) {
  const [selId, setSelId] = useState(null);
  const [filter, setFilter] = useState("");
  const [testing, setTesting] = useState(null);
  const [epTest, setEpTest] = useState(null); // {connId, epId} en prueba
  const [epPrev, setEpPrev] = useState(null); // resultado preview
  const [newEp, setNewEp] = useState({ name: "", path: "", field: "data[].nombre", ttl: "1 h", sample: "" });
  const sel = conns.find(c => c.id === selId);
  const totalEp = conns.reduce((a, c) => a + c.endpoints.length, 0);
  const usage = epId => templates.reduce((a, t) => a + t.fields.filter(f => f.src?.api === epId).length, 0);
  const upd = (id, patch) => setConns(p => p.map(c => c.id === id ? { ...c, ...patch } : c));

  const testConn = c => {
    setTesting(c.id);
    setTimeout(() => {
      const lat = 60 + Math.floor(Math.random() * 220);
      upd(c.id, { status: "conectado", lat, lastSync: "ahora" });
      setTesting(null);
      notify(`✅ Conexión "${c.name}" verificada · ${lat} ms · autenticación ${c.auth} OK`);
    }, 1100);
  };

  const testEp = (c, e) => {
    setEpTest(e.id); setEpPrev(null);
    setTimeout(() => { setEpTest(null); setEpPrev({ ep: e.id, lat: 40 + Math.floor(Math.random() * 160), data: e.sample }); }, 900);
  };

  const addEp = () => {
    if (!newEp.name.trim() || !newEp.path.trim()) { notify("⚠️ El endpoint necesita nombre y ruta"); return; }
    const sample = newEp.sample.split("\n").map(s => s.trim()).filter(Boolean);
    const ep = { id: "/api" + (newEp.path.startsWith("/") ? newEp.path : "/" + newEp.path), name: newEp.name.trim(), path: newEp.path.trim(), method: "GET", field: newEp.field, ttl: newEp.ttl, active: true, sample: sample.length ? sample : ["Dato ejemplo 1", "Dato ejemplo 2"] };
    upd(sel.id, { endpoints: [...sel.endpoints, ep] });
    setNewEp({ name: "", path: "", field: "data[].nombre", ttl: "1 h", sample: "" });
    notify("✅ Endpoint agregado — ya está disponible en el Form Builder, agrupado bajo " + sel.name);
  };

  /* ---- DETALLE DE CONEXIÓN ---- */
  if (sel) {
    const cat = catOf(sel.cat);
    return <div className="fade" style={{ maxWidth: 860 }}>
      <button className="btn btng" style={{ marginBottom: 16, fontSize: 13 }} onClick={() => { setSelId(null); setEpPrev(null); }}>← Todos los orígenes</button>
      <div className="card glow" style={{ padding: "24px 28px", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ width: 46, height: 46, borderRadius: 14, background: cat.c + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{cat.icon}</div>
            <div>
              <div className="h" style={{ fontWeight: 800, fontSize: 19 }}>{sel.name}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 5, flexWrap: "wrap" }}>
                <span className="chip" style={{ background: cat.c + "22", color: cat.c }}>{cat.name}</span>
                <StatusDot s={sel.status} />
                {sel.lat && <span className="chip" style={{ background: "rgba(255,255,255,.07)", color: "#9aa3b8" }}>⚡ {sel.lat} ms</span>}
              </div>
            </div>
          </div>
          <button className="btn btnp" onClick={() => testConn(sel)} disabled={testing === sel.id}>{testing === sel.id ? <RefreshCw size={15} className="spin" /> : <Zap size={15} />} {testing === sel.id ? "Probando…" : "Probar conexión"}</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><label style={{ fontSize: 12, color: "#9aa3b8", fontWeight: 600 }}>Nombre del origen</label><input className="inp" style={{ marginTop: 5 }} value={sel.name} onChange={e => upd(sel.id, { name: e.target.value })} /></div>
          <div><label style={{ fontSize: 12, color: "#9aa3b8", fontWeight: 600 }}>Categoría</label><select className="inp" style={{ marginTop: 5 }} value={sel.cat} onChange={e => upd(sel.id, { cat: e.target.value })}>{DS_CATS.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></div>
          <div><label style={{ fontSize: 12, color: "#9aa3b8", fontWeight: 600 }}>URL base</label><input className="inp mono" style={{ marginTop: 5, fontSize: 13 }} value={sel.base} onChange={e => upd(sel.id, { base: e.target.value, status: "sin probar" })} /></div>
          <div><label style={{ fontSize: 12, color: "#9aa3b8", fontWeight: 600 }}>Autenticación</label><select className="inp" style={{ marginTop: 5 }} value={sel.auth} onChange={e => upd(sel.id, { auth: e.target.value, status: "sin probar" })}>{AUTHS.map(a => <option key={a}>{a}</option>)}</select></div>
        </div>
        {sel.auth !== "Sin autenticación" && <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 12, color: "#9aa3b8", fontWeight: 600 }}>🔑 Credencial ({sel.auth.includes("OAuth") ? "client_id : client_secret" : sel.auth.includes("Basic") ? "usuario : contraseña" : "token / key"})</label>
          <input type="password" className="inp mono" style={{ marginTop: 5, maxWidth: 420 }} value={sel.cred} onChange={e => upd(sel.id, { cred: e.target.value, status: "sin probar" })} placeholder="Ingresar credencial segura…" />
          <div style={{ fontSize: 10.5, color: "#6b7280", marginTop: 5 }}>🔒 Las credenciales se almacenan cifradas en bóveda (vault) y nunca se exponen a los usuarios finales.</div>
        </div>}
        <div style={{ marginTop: 12 }}><label style={{ fontSize: 12, color: "#9aa3b8", fontWeight: 600 }}>Descripción</label><input className="inp" style={{ marginTop: 5 }} value={sel.desc} onChange={e => upd(sel.id, { desc: e.target.value })} /></div>
      </div>

      {/* ENDPOINTS */}
      <div className="card" style={{ padding: "22px 26px", marginBottom: 14 }}>
        <div className="h" style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}><Link2 size={16} color="#67e8f9" /> Endpoints de este origen ({sel.endpoints.length})</div>
        <p style={{ fontSize: 12.5, color: "#6b7280", margin: "0 0 16px" }}>Cada endpoint activo queda disponible automáticamente en el Form Builder para alimentar selectores, checklists, radios y selección múltiple.</p>
        {sel.endpoints.map(e => <div key={e.id} className="card" style={{ padding: "14px 16px", marginBottom: 10, opacity: e.active ? 1 : .5 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{e.name} {usage(e.id) > 0 && <span className="chip" style={{ background: "rgba(99,102,241,.18)", color: "#c7d2fe", fontSize: 10.5, marginLeft: 6 }}>usado en {usage(e.id)} campo(s)</span>}</div>
              <div className="mono" style={{ fontSize: 12, color: "#67e8f9", marginTop: 4 }}><span style={{ color: "#34d399", fontWeight: 700 }}>{e.method}</span> {sel.base}{e.path}</div>
              <div style={{ fontSize: 11.5, color: "#6b7280", marginTop: 4 }}>mapeo: <span className="mono" style={{ color: "#9aa3b8" }}>{e.field}</span> · caché {e.ttl}</div>
            </div>
            <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
              <button className="btn btng" style={{ fontSize: 12, padding: "7px 13px" }} onClick={() => testEp(sel, e)} disabled={epTest === e.id}>{epTest === e.id ? <RefreshCw size={13} className="spin" /> : <Eye size={13} />} Probar</button>
              <button onClick={() => upd(sel.id, { endpoints: sel.endpoints.map(x => x.id === e.id ? { ...x, active: !x.active } : x) })} style={{ width: 46, height: 24, borderRadius: 99, border: "none", cursor: "pointer", background: e.active ? "linear-gradient(135deg,#22c55e,#06b6d4)" : "rgba(255,255,255,.12)", position: "relative" }} title={e.active ? "Activo" : "Inactivo"}><span style={{ position: "absolute", top: 3, left: e.active ? 25 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "all .25s" }} /></button>
              <button className="btn btng" style={{ padding: 7, color: "#f87171" }} onClick={() => { if (usage(e.id) > 0) { notify("⚠️ No se puede eliminar: hay campos de plantillas usando este endpoint"); return; } upd(sel.id, { endpoints: sel.endpoints.filter(x => x.id !== e.id) }); }}><Trash2 size={13} /></button>
            </div>
          </div>
          {epPrev?.ep === e.id && <div className="fade" style={{ marginTop: 12, background: "rgba(6,182,212,.07)", border: "1px solid rgba(6,182,212,.25)", borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "#67e8f9", marginBottom: 8 }}>✓ RESPUESTA · HTTP 200 · {epPrev.lat} ms · {epPrev.data.length} registros</div>
            <div className="mono" style={{ fontSize: 11.5, color: "#9aa3b8", background: "rgba(0,0,0,.3)", borderRadius: 8, padding: "8px 11px", marginBottom: 9, overflowX: "auto", whiteSpace: "pre" }}>{`{ "status": 200, "count": ${epPrev.data.length},\n  "data": [ ${epPrev.data.slice(0, 3).map(d => `"${d}"`).join(", ")}, … ] }`}</div>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>Opciones mapeadas que verá el usuario en el formulario:</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{epPrev.data.slice(0, 6).map(d => <span key={d} className="chip" style={{ background: "rgba(255,255,255,.06)", color: "#c3c9da", fontSize: 11.5 }}>{d}</span>)}</div>
          </div>}
        </div>)}

        {/* nuevo endpoint */}
        <div style={{ border: "1px dashed rgba(99,102,241,.4)", borderRadius: 14, padding: "16px 18px", marginTop: 14, background: "rgba(99,102,241,.05)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#a5b4fc", letterSpacing: .5, marginBottom: 12 }}>＋ AGREGAR ENDPOINT</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label style={{ fontSize: 11.5, color: "#9aa3b8" }}>Nombre descriptivo</label><input className="inp" style={{ marginTop: 4 }} placeholder="Ej: Centros de costo" value={newEp.name} onChange={e => setNewEp(p => ({ ...p, name: e.target.value }))} /></div>
            <div><label style={{ fontSize: 11.5, color: "#9aa3b8" }}>Ruta (path)</label><input className="inp mono" style={{ marginTop: 4, fontSize: 13 }} placeholder="/v1/centros-costo" value={newEp.path} onChange={e => setNewEp(p => ({ ...p, path: e.target.value }))} /></div>
            <div><label style={{ fontSize: 11.5, color: "#9aa3b8" }}>Mapeo de respuesta (JSONPath)</label><input className="inp mono" style={{ marginTop: 4, fontSize: 13 }} value={newEp.field} onChange={e => setNewEp(p => ({ ...p, field: e.target.value }))} /></div>
            <div><label style={{ fontSize: 11.5, color: "#9aa3b8" }}>Caché / refresco</label><select className="inp" style={{ marginTop: 4 }} value={newEp.ttl} onChange={e => setNewEp(p => ({ ...p, ttl: e.target.value }))}>{["Tiempo real", "5 min", "1 h", "6 h", "12 h", "24 h"].map(t => <option key={t}>{t}</option>)}</select></div>
          </div>
          <div style={{ marginTop: 10 }}><label style={{ fontSize: 11.5, color: "#9aa3b8" }}>Datos de ejemplo para el prototipo (uno por línea — en producción provienen de la API real)</label>
            <textarea className="inp mono" rows={3} style={{ marginTop: 4, fontSize: 13 }} placeholder={"CC-100 Operaciones\nCC-200 Mantención\nCC-300 Administración"} value={newEp.sample} onChange={e => setNewEp(p => ({ ...p, sample: e.target.value }))} /></div>
          <button className="btn btnp" style={{ marginTop: 12 }} onClick={addEp}><Plus size={15} /> Crear endpoint</button>
        </div>
      </div>
    </div>;
  }

  /* ---- LISTADO DE CONEXIONES ---- */
  const list = conns.filter(c => !filter || c.cat === filter);
  return <div className="fade">
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 6 }}>
      <h1 className="h" style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Orígenes de <span className="gradtxt">datos</span></h1>
      <button className="btn btnp" onClick={() => { const c = { id: "c" + Date.now(), name: "Nueva conexión", cat: "otro", base: "https://", auth: "API Key (header)", cred: "", status: "sin probar", lat: null, lastSync: "—", desc: "", endpoints: [] }; setConns(p => [...p, c]); setSelId(c.id); }}><Plus size={16} /> Nueva conexión</button>
    </div>
    <p style={{ color: "#9aa3b8", marginBottom: 18, fontSize: 13.5 }}>Conecta sistemas corporativos (ERP, CMMS, RRHH, IoT…) una sola vez. Sus endpoints quedan disponibles en el Form Builder, agrupados por origen, para alimentar selectores, checklists y radios con datos siempre vigentes.</p>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 18 }}>
      {[["Conexiones", conns.length, "🔗", "#6366f1"], ["Endpoints publicados", totalEp, "📡", "#06b6d4"], ["Conectadas y sanas", conns.filter(c => c.status === "conectado").length, "💚", "#22c55e"], ["Campos alimentados", templates.reduce((a, t) => a + t.fields.filter(f => f.src?.type === "api").length, 0), "🧩", "#a855f7"]].map(([l, v, ic, c]) =>
        <div key={l} className="card" style={{ padding: 16 }}><div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 12.5, color: "#9aa3b8" }}>{l}</span><span>{ic}</span></div><div className="h" style={{ fontSize: 27, fontWeight: 800, marginTop: 5, color: c }}>{v}</div></div>)}
    </div>

    <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 18 }}>
      <button className="chip" style={{ cursor: "pointer", padding: "8px 14px", border: "1px solid", borderColor: !filter ? "#6366f1" : "rgba(255,255,255,.15)", background: !filter ? "rgba(99,102,241,.25)" : "transparent", color: !filter ? "#c7d2fe" : "#9aa3b8" }} onClick={() => setFilter("")}>Todas</button>
      {DS_CATS.map(c => { const n = conns.filter(x => x.cat === c.id).length; if (!n) return null; const on = filter === c.id; return <button key={c.id} className="chip" style={{ cursor: "pointer", padding: "8px 14px", border: "1px solid", borderColor: on ? c.c : "rgba(255,255,255,.15)", background: on ? c.c + "33" : "transparent", color: on ? c.c : "#9aa3b8" }} onClick={() => setFilter(on ? "" : c.id)}>{c.icon} {c.name} ({n})</button>; })}
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(330px,1fr))", gap: 14 }}>
      {list.map(c => { const cat = catOf(c.cat); return <div key={c.id} className="card" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
            <div style={{ width: 42, height: 42, borderRadius: 13, background: cat.c + "22", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{cat.icon}</div>
            <div><div className="h" style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</div><span className="chip" style={{ background: cat.c + "22", color: cat.c, fontSize: 10.5, marginTop: 3 }}>{cat.name}</span></div>
          </div>
          <StatusDot s={c.status} />
        </div>
        <div className="mono" style={{ fontSize: 11.5, color: "#67e8f9", marginBottom: 6, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}><Globe size={11} style={{ verticalAlign: -1 }} /> {c.base}</div>
        <div style={{ fontSize: 12.5, color: "#9aa3b8", marginBottom: 12, minHeight: 32 }}>{c.desc || "Sin descripción"}</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "#6b7280", marginBottom: 13 }}>
          <span>🔐 {c.auth.split(" ")[0]}</span><span>📡 {c.endpoints.length} endpoint(s)</span><span>🕐 sync {c.lastSync}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btng" style={{ fontSize: 13, padding: "8px 14px", flex: 1, justifyContent: "center" }} onClick={() => setSelId(c.id)}><Settings2 size={14} /> Configurar</button>
          <button className="btn btng" style={{ fontSize: 13, padding: "8px 14px" }} onClick={() => testConn(c)} disabled={testing === c.id}>{testing === c.id ? <RefreshCw size={14} className="spin" /> : <Zap size={14} />}</button>
          <button className="btn btng" style={{ padding: "8px 11px", color: "#f87171" }} onClick={() => { const used = c.endpoints.some(e => usage(e.id) > 0); if (used) { notify("⚠️ No se puede eliminar: plantillas activas dependen de este origen"); return; } setConns(p => p.filter(x => x.id !== c.id)); }}><Trash2 size={14} /></button>
        </div>
      </div>; })}
    </div>
  </div>;
}

/* ================= DASHBOARD ================= */
function Dash({ user, org, entries, incidents, templates, handovers, setView }) {
  const [aiSum, setAiSum] = useState(null); const [busy, setBusy] = useState(false);
  const M = useMemo(() => {
    const byDay = DAYS.map(d => ({ d: fdate(d), n: entries.filter(e => e.date.toDateString() === d.toDateString()).length }));
    const bySev = [1, 2, 3, 4, 5].map(s => ({ name: "Sev " + s, value: incidents.filter(i => i.sev === s).length, c: SEVC[s] })).filter(x => x.value > 0);
    const byNode = org.filter(n => n.lvl === 0).map(n => { const ids = descend(org, n.id); return { name: n.name.split(" ")[0], n: incidents.filter(i => ids.includes(i.node)).length }; }).filter(x => x.n > 0);
    const open = incidents.filter(i => i.status !== "Resuelta").length;
    const noAssign = incidents.filter(i => i.status !== "Resuelta" && !i.assignee).length;
    const comp = Math.round(entries.reduce((a, e) => a + (e.compliance || 85), 0) / Math.max(entries.length, 1));
    return { byDay, bySev, byNode, open, noAssign, comp };
  }, [entries, incidents, org]);

  const genSummary = async () => {
    setBusy(true);
    const ctx = JSON.stringify({ entradas_14d: entries.length, cumplimiento: M.comp + "%", incidencias_abiertas: M.open, sin_asignar: M.noAssign, incidencias: incidents.slice(0, 10).map(i => ({ id: i.id, t: i.title, sev: i.sev, estado: i.status, resp: i.assignee })), ultima_entrega_turno: handovers[0]?.resumen, tendencia: "Temperatura hidráulica CH-001 subió de 82 a 99°C en 14 días (umbral 85°C)" });
    const txt = await askAI(`Eres el analista de LogBook Pro. Genera un RESUMEN EJECUTIVO en español (máx 130 palabras) para un ${user.roleName}: estado general, riesgos prioritarios y 3 acciones recomendadas. Datos: ${ctx}`,
      "📊 Estado general: operación estable con cumplimiento del " + M.comp + "%. ⚠️ Riesgo prioritario: tendencia sostenida de sobretemperatura en CH-001 (99°C, umbral 85°C) con patrón compatible con falla de intercambiador en 7 días. Hay " + M.open + " incidencias abiertas, " + M.noAssign + " sin responsable. Acciones: (1) programar mantención preventiva del intercambiador antes del próximo turno noche; (2) asignar responsables a incidencias pendientes hoy; (3) reforzar monitoreo de temperatura cada 2 horas según pendiente del último cambio de turno.");
    setAiSum(txt); setBusy(false);
  };

  return <div className="fade">
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 22, flexWrap: "wrap", gap: 12 }}>
      <div><h1 className="h" style={{ margin: 0, fontSize: 27, fontWeight: 800 }}>Centro de <span className="gradtxt">Comando</span></h1>
        <p style={{ margin: "6px 0 0", color: "#9aa3b8", fontSize: 13.5 }}>Hola {user.name.split(" ")[0]} · {currentShift().icon} {currentShift().name} en curso · vista filtrada según tus privilegios</p></div>
      <button className="btn btnp" onClick={() => setView("new")}><Plus size={16} /> Nueva entrada</button>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 13, marginBottom: 16 }}>
      {[["Entradas (14 días)", entries.length, "📝", "#6366f1", "entries"], ["Incidencias abiertas", M.open, "🚨", "#ef4444", "inc"], ["Sin responsable", M.noAssign, "👤", "#f97316", "inc"], ["Cumplimiento", M.comp + "%", "✅", "#22c55e", "entries"], ["Plantillas habilitadas", templates.length, "🧩", "#06b6d4", "new"]].map(([l, v, ic, c, target]) =>
        <div key={l} className="card" style={{ padding: 16, cursor: "pointer" }} onClick={() => setView(target)}><div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 12.5, color: "#9aa3b8" }}>{l}</span><span style={{ fontSize: 17 }}>{ic}</span></div><div className="h" style={{ fontSize: 28, fontWeight: 800, marginTop: 5, color: c }}>{v}</div></div>)}
    </div>

    <div className="card glow" style={{ padding: 20, marginBottom: 16, borderColor: "rgba(99,102,241,.3)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div className="h" style={{ fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}><Sparkles size={16} color="#a5b4fc" /> Resumen ejecutivo generado por IA</div>
        <button className="btn btng" style={{ fontSize: 13 }} onClick={genSummary} disabled={busy}>{busy ? <RefreshCw size={14} className="spin" /> : <Sparkles size={14} />} {aiSum ? "Regenerar" : "Generar resumen del día"}</button>
      </div>
      {busy && <div className="pulse" style={{ fontSize: 13, color: "#a5b4fc", marginTop: 12 }}>✦ Analizando bitácoras, incidencias y entregas de turno…</div>}
      {aiSum && !busy && <div className="fade" style={{ fontSize: 13.5, lineHeight: 1.7, color: "#c3c9da", marginTop: 12, whiteSpace: "pre-wrap" }}>{aiSum}</div>}
      {!aiSum && !busy && <div style={{ fontSize: 13, color: "#6b7280", marginTop: 10 }}>La IA cruzará registros, incidencias, tendencias y la última entrega de turno para darte el estado de la operación y acciones priorizadas.</div>}
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 14, marginBottom: 14 }}>
      <div className="card" style={{ padding: 20 }}>
        <div className="h" style={{ fontWeight: 700, marginBottom: 12, fontSize: 15 }}>📈 Actividad de registros — 14 días</div>
        <ResponsiveContainer width="100%" height={200}><AreaChart data={M.byDay}>
          <defs><linearGradient id="g1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity={.5} /><stop offset="100%" stopColor="#6366f1" stopOpacity={0} /></linearGradient></defs>
          <CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} /><XAxis dataKey="d" stroke="#6b7280" fontSize={11} /><YAxis stroke="#6b7280" fontSize={11} width={26} />
          <Tooltip contentStyle={{ background: "#10152b", border: "1px solid rgba(255,255,255,.15)", borderRadius: 12 }} />
          <Area dataKey="n" name="Entradas" stroke="#818cf8" strokeWidth={2.5} fill="url(#g1)" /></AreaChart></ResponsiveContainer>
      </div>
      <div className="card" style={{ padding: 20 }}>
        <div className="h" style={{ fontWeight: 700, marginBottom: 12, fontSize: 15 }}>🚦 Incidencias por severidad</div>
        <ResponsiveContainer width="100%" height={170}><PieChart><Pie data={M.bySev} dataKey="value" innerRadius={46} outerRadius={70} paddingAngle={4}>{M.bySev.map((x, i) => <Cell key={i} fill={x.c} />)}</Pie><Tooltip contentStyle={{ background: "#10152b", border: "1px solid rgba(255,255,255,.15)", borderRadius: 12 }} /></PieChart></ResponsiveContainer>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>{M.bySev.map(x => <span key={x.name} style={{ fontSize: 11.5, color: x.c, fontWeight: 600 }}>● {x.name} ({x.value})</span>)}</div>
      </div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.3fr", gap: 14 }}>
      <div className="card" style={{ padding: 20 }}>
        <div className="h" style={{ fontWeight: 700, marginBottom: 12, fontSize: 15 }}>🏭 Incidencias por área</div>
        <ResponsiveContainer width="100%" height={180}><BarChart data={M.byNode}><CartesianGrid stroke="rgba(255,255,255,.06)" vertical={false} /><XAxis dataKey="name" stroke="#6b7280" fontSize={11} /><YAxis stroke="#6b7280" fontSize={11} width={24} allowDecimals={false} /><Tooltip contentStyle={{ background: "#10152b", border: "1px solid rgba(255,255,255,.15)", borderRadius: 12 }} /><Bar dataKey="n" name="Incidencias" radius={[8, 8, 0, 0]} fill="#06b6d4" /></BarChart></ResponsiveContainer>
      </div>
      <div className="card" style={{ padding: 20, borderLeft: "3px solid #f59e0b" }}>
        <div className="h" style={{ fontWeight: 700, marginBottom: 10, fontSize: 15 }}>🔮 Insight predictivo (base de conocimiento viva)</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.7, color: "#c3c9da" }}>El patrón <b style={{ color: "#fbbf24" }}>KB-003</b> está activo: la temperatura hidráulica de <b>CH-001</b> sube +0.9°C/día hace 12 días (hoy <b style={{ color: "#f87171" }}>99°C</b>). Históricamente este patrón anticipa falla del intercambiador en 7–10 días. <b>Recomendación: mantención preventiva esta semana.</b></div>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className="btn btng" style={{ fontSize: 12.5 }} onClick={() => setView("kb")}><BookOpen size={14} /> Ver conocimiento</button>
          <button className="btn btng" style={{ fontSize: 12.5 }} onClick={() => setView("ai")}><Sparkles size={14} /> Analizar con IA</button>
        </div>
      </div>
    </div>
  </div>;
}

/* ================= CAMBIO DE TURNO ================= */
function TurnoView({ user, org, handovers, setHandovers, incidents, entries, notify }) {
  const cs = currentShift();
  const scope = descend(org, user.scope);
  const myHand = handovers.filter(h => user.role === "admin" || scope.includes(h.node));
  const pending = myHand.find(h => h.status === "pendiente");
  const [mode, setMode] = useState(null);
  const [form, setForm] = useState({ estado: "Operativo", pendientes: ["", "", ""], obs: "" });
  const [aiTxt, setAiTxt] = useState(""); const [busy, setBusy] = useState(false);
  const openInc = incidents.filter(i => i.status !== "Resuelta" && scope.includes(i.node));
  const lastParams = { "Temp. hidráulica": "99 °C ⚠", "Presión lubricación": "3.0 bar", "Tonelaje turno": "1.428 t" };

  const genAI = async () => {
    setBusy(true);
    const ctx = JSON.stringify({ turno: cs.name, operador: user.name, estado_general: form.estado, parametros: lastParams, pendientes: form.pendientes.filter(Boolean), incidencias_abiertas: openInc.map(i => i.id + " " + i.title), observaciones: form.obs });
    const txt = await askAI(`Eres el asistente de cambio de turno de LogBook Pro (operación industrial). Redacta en español un RESUMEN DE ENTREGA DE TURNO profesional, claro y accionable (máx 120 palabras) para el operador entrante, con: estado general, parámetros relevantes, qué vigilar, pendientes e incidencias. Datos: ${ctx}`,
      `${cs.name} cerrado en estado "${form.estado}". Parámetros: temperatura hidráulica en 99°C (sobre umbral, vigilar cada 2 h), lubricación normal en 3.0 bar, producción 1.428 t. Incidencia abierta ${openInc[0]?.id || ""} pendiente de gestión. Pendientes para el turno entrante: ${form.pendientes.filter(Boolean).join("; ") || "sin pendientes adicionales"}. ${form.obs ? "Observaciones: " + form.obs : ""}`);
    setAiTxt(txt); setBusy(false);
  };

  const deliver = () => {
    const next = SHIFT_CFG.shifts.find(s => s.id !== cs.id);
    setHandovers(p => [{ id: "H-" + String(13 + p.length).padStart(4, "0"), date: new Date(), shift: cs.id, from: user.name, to: "Operador " + next.name, node: user.scope || "p1", status: "pendiente", estado: form.estado, params: lastParams, pendientes: form.pendientes.filter(Boolean), incidents: openInc.map(i => i.id), resumen: aiTxt }, ...p]);
    setMode(null); setAiTxt(""); setForm({ estado: "Operativo", pendientes: ["", "", ""], obs: "" });
    notify("🔄 Turno entregado. El operador entrante verá resumen, parámetros, pendientes e incidencias, y confirmará recepción con su firma.");
  };

  const ack = id => { setHandovers(p => p.map(h => h.id === id ? { ...h, status: "recibido", to: user.name, ackAt: new Date() } : h)); notify("✅ Recepción de turno confirmada y registrada en la trazabilidad"); };

  const HandCard = ({ h, full }) => <div className="card" style={{ padding: 20, marginBottom: 12, borderLeft: "3px solid " + (h.status === "pendiente" ? "#eab308" : "#22c55e") }}>
    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className="mono" style={{ fontSize: 12, color: "#a5b4fc" }}>{h.id}</span>
        <span className="chip" style={{ background: "rgba(99,102,241,.18)", color: "#c7d2fe" }}>{SHIFT_CFG.shifts.find(s => s.id === h.shift)?.icon} {SHIFT_CFG.shifts.find(s => s.id === h.shift)?.name}</span>
        <NodeTag org={org} id={h.node} />
      </div>
      <span className="chip" style={{ background: h.status === "pendiente" ? "#eab30822" : "#22c55e22", color: h.status === "pendiente" ? "#fbbf24" : "#34d399" }}>{h.status === "pendiente" ? "⏳ Pendiente de recepción" : "✓ Recibido"}</span>
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "12px 0", fontSize: 13.5 }}>
      <b>{h.from}</b> <ArrowLeftRight size={15} color="#67e8f9" /> <b>{h.to}</b>
      <span style={{ color: "#6b7280", fontSize: 12 }}>· {h.date.toLocaleDateString("es-CL")} {h.date.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}</span>
    </div>
    <div style={{ background: "rgba(99,102,241,.08)", border: "1px solid rgba(99,102,241,.25)", borderRadius: 12, padding: "12px 14px", fontSize: 13.2, lineHeight: 1.65, color: "#c3c9da" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#a5b4fc", marginBottom: 6, display: "flex", gap: 6, alignItems: "center" }}><Sparkles size={12} /> RESUMEN IA DE LA ENTREGA</div>{h.resumen}
    </div>
    {full && <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8, margin: "12px 0" }}>
        {Object.entries(h.params || {}).map(([k, v]) => <div key={k} style={{ background: "rgba(255,255,255,.04)", borderRadius: 10, padding: "9px 12px" }}><div style={{ fontSize: 11, color: "#6b7280" }}>{k}</div><div style={{ fontWeight: 700, fontSize: 14, color: String(v).includes("⚠") ? "#fbbf24" : "#e7eaf3" }}>{v}</div></div>)}
      </div>
      {h.pendientes?.length > 0 && <div style={{ marginBottom: 10 }}><div style={{ fontSize: 12, fontWeight: 700, color: "#9aa3b8", marginBottom: 6 }}>📌 PENDIENTES PARA TU TURNO</div>{h.pendientes.map((p, i) => <div key={i} style={{ fontSize: 13, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,.05)" }}>• {p}</div>)}</div>}
      {h.incidents?.length > 0 && <div style={{ fontSize: 12.5, color: "#f87171" }}>🚨 Incidencias heredadas: {h.incidents.join(", ")}</div>}
    </>}
    {h.status === "pendiente" && <button className="btn btnp" style={{ marginTop: 14 }} onClick={() => ack(h.id)}><UserCheck size={15} /> Confirmar recepción del turno</button>}
  </div>;

  return <div className="fade" style={{ maxWidth: 860 }}>
    <h1 className="h" style={{ fontSize: 26, fontWeight: 800, margin: "0 0 4px" }}>Cambio de <span className="gradtxt">turno</span></h1>
    <p style={{ color: "#9aa3b8", marginBottom: 18, fontSize: 13.5 }}>Régimen: {SHIFT_CFG.pattern} · Ahora: {cs.icon} <b style={{ color: "#e7eaf3" }}>{cs.name}</b> ({cs.time}) · La entrega formal asegura continuidad operacional con trazabilidad de quién entrega y quién recibe.</p>

    {pending && !mode && <div style={{ marginBottom: 18 }}>
      <div className="h" style={{ fontWeight: 700, fontSize: 15, marginBottom: 10, color: "#fbbf24" }}>⏳ Tienes un turno por recibir</div>
      <HandCard h={pending} full />
    </div>}

    {!mode && <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
      <button className="btn btnp" onClick={() => setMode("entregar")}><ArrowLeftRight size={16} /> Entregar mi turno</button>
    </div>}

    {mode === "entregar" && <div className="card glow" style={{ padding: "24px 28px", marginBottom: 22 }}>
      <div className="h" style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>{cs.icon} Entrega de {cs.name}</div>
      <p style={{ fontSize: 12.5, color: "#9aa3b8", margin: "0 0 18px" }}>El sistema recopiló automáticamente los parámetros de tus registros del turno y las incidencias abiertas de tu área.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8, marginBottom: 16 }}>
        {Object.entries(lastParams).map(([k, v]) => <div key={k} style={{ background: "rgba(255,255,255,.04)", borderRadius: 10, padding: "9px 12px" }}><div style={{ fontSize: 11, color: "#6b7280" }}>{k} <span style={{ color: "#34d399" }}>· auto</span></div><div style={{ fontWeight: 700, fontSize: 14, color: String(v).includes("⚠") ? "#fbbf24" : "#e7eaf3" }}>{v}</div></div>)}
      </div>
      {openInc.length > 0 && <div style={{ fontSize: 13, color: "#f87171", marginBottom: 16 }}>🚨 Se adjuntarán automáticamente: {openInc.map(i => i.id).join(", ")}</div>}
      <label style={{ fontSize: 13, fontWeight: 600, color: "#c3c9da", display: "block", marginBottom: 6 }}>Estado general al cierre</label>
      <select className="inp" style={{ maxWidth: 320, marginBottom: 16 }} value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value }))}>{["Operativo", "Operativo con observaciones", "Detenido por mantención", "Detenido por falla"].map(o => <option key={o}>{o}</option>)}</select>
      <label style={{ fontSize: 13, fontWeight: 600, color: "#c3c9da", display: "block", marginBottom: 6 }}>Pendientes para el turno entrante</label>
      {form.pendientes.map((p, i) => <input key={i} className="inp" style={{ marginBottom: 7 }} placeholder={"Pendiente " + (i + 1) + " (opcional)"} value={p} onChange={e => setForm(f => ({ ...f, pendientes: f.pendientes.map((x, j) => j === i ? e.target.value : x) }))} />)}
      <label style={{ fontSize: 13, fontWeight: 600, color: "#c3c9da", display: "block", margin: "10px 0 6px" }}>Observaciones del turno</label>
      <textarea className="inp" rows={2} placeholder="Novedades, detenciones, temas de seguridad…" value={form.obs} onChange={e => setForm(p => ({ ...p, obs: e.target.value }))} />
      <div style={{ margin: "16px 0" }}>
        <button className="btn btng" onClick={genAI} disabled={busy}>{busy ? <RefreshCw size={15} className="spin" /> : <Sparkles size={15} />} Generar resumen de entrega con IA</button>
        {aiTxt && <div className="fade" style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#a5b4fc", marginBottom: 6 }}>✦ RESUMEN GENERADO (editable)</div>
          <textarea className="inp" rows={5} value={aiTxt} onChange={e => setAiTxt(e.target.value)} />
        </div>}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn btnp" disabled={!aiTxt} style={{ opacity: aiTxt ? 1 : .5 }} onClick={deliver}><Send size={15} /> Entregar turno</button>
        <button className="btn btng" onClick={() => setMode(null)}>Cancelar</button>
      </div>
    </div>}

    <div className="h" style={{ fontWeight: 700, fontSize: 15, margin: "8px 0 12px" }}>📜 Historial de entregas</div>
    {myHand.filter(h => h.status !== "pendiente").map(h => <HandCard key={h.id} h={h} full={false} />)}
  </div>;
}

/* ================= SELECCIÓN DE PLANTILLA ================= */
function PickTpl({ templates, allCount, org, onPick }) {
  const locked = allCount - templates.length;
  return <div className="fade">
    <h1 className="h" style={{ fontSize: 26, fontWeight: 800, margin: "0 0 4px" }}>Nueva <span className="gradtxt">entrada</span></h1>
    <p style={{ color: "#9aa3b8", marginBottom: 8 }}>Plantillas habilitadas según tu rol y tu alcance en la estructura organizacional.</p>
    {locked > 0 && <p style={{ fontSize: 12.5, color: "#6b7280", marginBottom: 18 }}><Lock size={12} style={{ verticalAlign: -2 }} /> {locked} plantilla(s) existen pero no son visibles para tu perfil.</p>}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(290px,1fr))", gap: 14 }}>
      {templates.map(t => { const x = indOf(t.ind); return <div key={t.id} className="card" style={{ padding: 20, cursor: "pointer" }} onClick={() => onPick(t)}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}><span style={{ fontSize: 26 }}>{x.icon}</span><NodeTag org={org} id={t.node} /></div>
        <div className="h" style={{ fontWeight: 700, fontSize: 15.5 }}>{t.name}</div>
        <div style={{ fontSize: 13, color: "#9aa3b8", margin: "6px 0 12px" }}>{t.desc}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#6b7280" }}>{t.fields.length} campos · {t.fields.some(f => f.src?.type === "api") ? "🔌 datos vivos" : "datos fijos"}</span>
          <span className="grad" style={{ borderRadius: 99, padding: "6px 10px", display: "flex" }}><ChevronRight size={15} color="#fff" /></span></div>
      </div>; })}
    </div>
  </div>;
}

/* ================= LLENADO ================= */
function EntryFill({ tpl, org, back, onSubmit }) {
  const [vals, setVals] = useState({});
  const missing = tpl.fields.filter(f => f.req && f.t !== "section" && (vals[f.id] === undefined || vals[f.id] === "" || vals[f.id] === null));
  return <div className="fade" style={{ maxWidth: 720 }}>
    <button className="btn btng" style={{ marginBottom: 18, fontSize: 13 }} onClick={back}>← Volver</button>
    <div className="card glow" style={{ padding: "26px 30px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div><div className="h" style={{ fontSize: 21, fontWeight: 800 }}>{indOf(tpl.ind).icon} {tpl.name}</div><div style={{ color: "#9aa3b8", fontSize: 13.5, marginTop: 4 }}>{tpl.desc}</div></div>
        <NodeTag org={org} id={tpl.node} />
      </div>
      <div style={{ height: 1, background: "rgba(255,255,255,.08)", margin: "16px 0 22px" }} />
      {tpl.fields.map(f => <FieldRender key={f.id} f={f} v={vals[f.id]} all={vals} set={v => setVals(p => ({ ...p, [f.id]: v }))} />)}
      <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn btnp" disabled={missing.length > 0} style={{ opacity: missing.length ? .5 : 1 }} onClick={() => onSubmit(tpl, vals, tpl.node)}><Send size={16} /> Enviar y validar</button>
        <button className="btn btng">Guardar borrador</button>
        {missing.length > 0 && <span style={{ fontSize: 12.5, color: "#fbbf24" }}>Faltan {missing.length} campo(s) obligatorio(s)</span>}
      </div>
    </div>
  </div>;
}

/* ================= BITÁCORAS ================= */
function fmtVal(v) {
  if (v === undefined || v === null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (Array.isArray(v)) return v.length === 0 ? "—" : Array.isArray(v[0]) ? v.length + " fila(s)" : v.join(", ");
  if (typeof v === "object") { if (v.lat) return `📍 ${v.lat}, ${v.lng}`; return Object.keys(v).filter(k => v[k]).length + " ítem(s) ✓"; }
  const s = String(v); if (s.startsWith("data:image") || s.startsWith("blob:")) return "[adjunto]"; return s.length > 50 ? s.slice(0, 50) + "…" : s;
}

function EntriesView({ entries, setEntries, templates, myTemplates, org, user, notify }) {
  const [openTpl, setOpenTpl] = useState(null);
  const [selId, setSelId] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({}); const [reason, setReason] = useState("");
  const sel = entries.find(e => e.id === selId);
  const tpl = sel ? templates.find(t => t.id === sel.tpl) : null;

  const saveEdit = () => {
    const orig = sel.vals || {}; const diffs = [];
    (tpl?.fields || []).filter(f => f.t !== "section").forEach(f => { if (JSON.stringify(orig[f.id] ?? null) !== JSON.stringify(draft[f.id] ?? null)) diffs.push({ ts: new Date().toISOString(), by: user.name, field: f.label, from: fmtVal(orig[f.id]), to: fmtVal(draft[f.id]), reason: reason.trim() || undefined }); });
    if (!diffs.length) { setEditing(false); return; }
    setEntries(p => p.map(e => e.id === sel.id ? { ...e, vals: JSON.parse(JSON.stringify(draft)), edited: true, changes: [...(e.changes || []), ...diffs] } : e));
    setEditing(false); notify(`✏️ ${sel.id} actualizada · ${diffs.length} cambio(s) en el log de auditoría`);
  };

  if (sel) {
    const log = [...(sel.changes || [])].reverse();
    return <div className="fade" style={{ maxWidth: 760 }}>
      <button className="btn btng" style={{ marginBottom: 16, fontSize: 13 }} onClick={() => { setSelId(null); setEditing(false); }}>← Volver</button>
      <div className="card glow" style={{ padding: "24px 28px", marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span className="mono" style={{ fontSize: 13, color: "#a5b4fc" }}>{sel.id}</span>
              <span className="chip" style={{ background: "#22c55e22", color: "#34d399" }}>Validada</span>
              {sel.edited && <span className="chip" style={{ background: "#eab30822", color: "#fbbf24" }}><PenLine size={12} /> Editada</span>}
            </div>
            <div className="h" style={{ fontSize: 19, fontWeight: 800, marginTop: 8 }}>{tpl ? tpl.name : sel.tpl}</div>
            <div style={{ fontSize: 12.5, color: "#9aa3b8", marginTop: 4 }}>Por <b style={{ color: "#c3c9da" }}>{sel.by}</b> · {sel.date.toLocaleDateString("es-CL")} · {SHIFT_CFG.shifts.find(s => s.id === sel.shift)?.name}</div>
          </div><NodeTag org={org} id={sel.node} />
        </div>
        <div style={{ height: 1, background: "rgba(255,255,255,.08)", margin: "18px 0" }} />
        {tpl && !editing && <div>
          {tpl.fields.map(f => f.t === "section" ? <div key={f.id} className="h" style={{ margin: "18px 0 8px", fontSize: 13.5, fontWeight: 700, color: "#a5b4fc" }}>{f.label}</div>
            : <div key={f.id} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,.05)", fontSize: 13.5 }}>
              <span style={{ color: "#9aa3b8" }}>{f.label}{f.src?.type === "api" && <span style={{ marginLeft: 6 }}><ApiBadge /></span>}</span>
              <span style={{ fontWeight: 600, textAlign: "right" }}>{fmtVal(sel.vals?.[f.id])}</span></div>)}
          <button className="btn btnp" style={{ marginTop: 20 }} onClick={() => { setDraft(JSON.parse(JSON.stringify(sel.vals || {}))); setReason(""); setEditing(true); }}><PenLine size={15} /> Editar bitácora</button>
        </div>}
        {tpl && editing && <div>
          {tpl.fields.map(f => <FieldRender key={f.id} f={f} v={draft[f.id]} all={draft} set={v => setDraft(p => ({ ...p, [f.id]: v }))} />)}
          <label style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: "#fbbf24", margin: "6px 0 7px" }}>💬 Motivo de la edición (queda en el log)</label>
          <input className="inp" placeholder="Ej: corrección de dato mal digitado en terreno" value={reason} onChange={e => setReason(e.target.value)} />
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button className="btn btnp" onClick={saveEdit}><CheckCircle2 size={15} /> Guardar cambios</button>
            <button className="btn btng" onClick={() => setEditing(false)}><X size={15} /> Cancelar</button>
          </div>
        </div>}
      </div>
      <div className="card" style={{ padding: "22px 26px" }}>
        <div className="h" style={{ fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}><Clock size={16} color="#67e8f9" /> Log de cambios — auditoría</div>
        {log.length === 0 && <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>Sin modificaciones. Conserva su versión original.</div>}
        {log.map((c, i) => <div key={i} style={{ borderLeft: "3px solid #eab308", background: "rgba(255,255,255,.03)", borderRadius: "0 12px 12px 0", padding: "11px 14px", marginBottom: 9 }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6, marginBottom: 5 }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>{c.field}</span>
            <span style={{ fontSize: 11.5, color: "#6b7280" }}>{new Date(c.ts).toLocaleString("es-CL")} · por <b style={{ color: "#9aa3b8" }}>{c.by}</b></span></div>
          <div style={{ fontSize: 13 }}><span style={{ color: "#f87171", textDecoration: "line-through" }}>{c.from}</span> <span style={{ color: "#6b7280" }}>→</span> <span style={{ color: "#34d399", fontWeight: 600 }}>{c.to}</span></div>
          {c.reason && <div style={{ fontSize: 12, color: "#9aa3b8", marginTop: 5 }}>💬 {c.reason}</div>}
        </div>)}
        <div style={{ borderLeft: "3px solid #22c55e", background: "rgba(255,255,255,.03)", borderRadius: "0 12px 12px 0", padding: "11px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: "#34d399" }}>📌 Entrada creada</span>
            <span style={{ fontSize: 11.5, color: "#6b7280" }}>{sel.date.toLocaleString("es-CL")} · por <b style={{ color: "#9aa3b8" }}>{sel.by}</b></span></div>
        </div>
      </div>
    </div>;
  }

  if (openTpl) {
    const t = templates.find(x => x.id === openTpl);
    const list = entries.filter(e => e.tpl === openTpl).sort((a, b) => b.date - a.date);
    const keyFields = (t?.fields || []).filter(f => !["section", "signature", "photo", "geo", "table"].includes(f.t)).slice(0, 3);
    return <div className="fade">
      <button className="btn btng" style={{ marginBottom: 16, fontSize: 13 }} onClick={() => setOpenTpl(null)}>← Todas las bitácoras</button>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6, flexWrap: "wrap" }}>
        <h1 className="h" style={{ fontSize: 23, fontWeight: 800, margin: 0 }}>{indOf(t.ind).icon} {t.name}</h1><NodeTag org={org} id={t.node} />
      </div>
      <p style={{ color: "#9aa3b8", fontSize: 13, marginBottom: 16 }}>{list.length} registros · cada bitácora es un contenedor independiente con sus propias columnas</p>
      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead><tr style={{ background: "rgba(255,255,255,.04)" }}>{["ID", "Fecha", "Turno", "Autor", ...keyFields.map(f => f.label), "Sev.", "Cambios"].map(h => <th key={h} style={{ textAlign: "left", padding: "11px 14px", color: "#9aa3b8", fontWeight: 600, fontSize: 11.5 }}>{h}</th>)}</tr></thead>
          <tbody>{list.slice(0, 25).map(e => <tr key={e.id} style={{ borderTop: "1px solid rgba(255,255,255,.06)", cursor: "pointer" }} onClick={() => setSelId(e.id)} onMouseEnter={ev => ev.currentTarget.style.background = "rgba(99,102,241,.08)"} onMouseLeave={ev => ev.currentTarget.style.background = "transparent"}>
            <td className="mono" style={{ padding: "10px 14px", color: "#a5b4fc" }}>{e.id}</td>
            <td style={{ padding: "10px 14px", color: "#9aa3b8" }}>{e.date.toLocaleDateString("es-CL")}</td>
            <td style={{ padding: "10px 14px" }}>{SHIFT_CFG.shifts.find(s => s.id === e.shift)?.icon}</td>
            <td style={{ padding: "10px 14px" }}>{e.by}</td>
            {keyFields.map(f => <td key={f.id} style={{ padding: "10px 14px", color: "#c3c9da" }}>{e.vals ? fmtVal(e.vals[f.id]) : "—"}</td>)}
            <td style={{ padding: "10px 14px" }}><Sev v={e.sev || 1} /></td>
            <td style={{ padding: "10px 14px" }}>{e.edited ? <span className="chip" style={{ background: "#eab30822", color: "#fbbf24" }}><PenLine size={11} /> {(e.changes || []).length}</span> : <span style={{ color: "#475569" }}>—</span>}</td>
          </tr>)}</tbody></table></div>
      </div>
    </div>;
  }

  return <div className="fade">
    <h1 className="h" style={{ fontSize: 26, fontWeight: 800, margin: "0 0 6px" }}>Registro de <span className="gradtxt">bitácoras</span></h1>
    <p style={{ color: "#9aa3b8", marginBottom: 20, fontSize: 13.5 }}>Cada plantilla es un contenedor independiente: estructura propia, columnas propias y permisos propios. Las bitácoras fuera de tu alcance aparecen bloqueadas.</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 14 }}>
      {templates.map(t => {
        const allowed = myTemplates.some(m => m.id === t.id);
        const list = entries.filter(e => e.tpl === t.id);
        const last = list.sort((a, b) => b.date - a.date)[0];
        return <div key={t.id} className="card" style={{ padding: 20, cursor: allowed ? "pointer" : "default", opacity: allowed ? 1 : .45 }} onClick={() => allowed && setOpenTpl(t.id)}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 26 }}>{indOf(t.ind).icon}</span>
            {allowed ? <NodeTag org={org} id={t.node} /> : <span className="chip" style={{ background: "rgba(255,255,255,.08)", color: "#9aa3b8" }}><Lock size={11} /> Sin privilegios</span>}
          </div>
          <div className="h" style={{ fontWeight: 700, fontSize: 15.5 }}>{t.name}</div>
          <div style={{ fontSize: 12.5, color: "#9aa3b8", margin: "5px 0 14px" }}>{t.desc}</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "#6b7280" }}>
            <span>📂 {allowed ? list.length + " registros" : "contenido restringido"}</span>
            {allowed && last && <span>último: {last.date.toLocaleDateString("es-CL")}</span>}
          </div>
        </div>;
      })}
    </div>
  </div>;
}

/* ================= LISTA DE PLANTILLAS ================= */
function TplList({ templates, org, onNew, onEdit, onUse }) {
  return <div className="fade">
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 6 }}>
      <h1 className="h" style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Plantillas & <span className="gradtxt">Form Builder</span></h1>
      <button className="btn btnp" onClick={onNew}><Plus size={16} /> Crear plantilla</button>
    </div>
    <p style={{ color: "#9aa3b8", marginBottom: 20 }}>Como administrador defines: campos ({FIELD_TYPES.length} objetos premium), fuente de datos (fija o desde Orígenes de Datos), nodo de la estructura, y qué roles pueden usar cada plantilla.</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(310px,1fr))", gap: 14 }}>
      {templates.map(t => <div key={t.id} className="card" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 6 }}><NodeTag org={org} id={t.node} /><span style={{ fontSize: 12, color: "#6b7280" }}>{t.fields.length} campos</span></div>
        <div className="h" style={{ fontWeight: 700, fontSize: 15 }}>{t.name}</div>
        <div style={{ fontSize: 13, color: "#9aa3b8", margin: "5px 0 10px" }}>{t.desc}</div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 13 }}>
          {t.roles.map(r => <span key={r} className="chip" style={{ background: "rgba(99,102,241,.15)", color: "#c7d2fe", fontSize: 10.5 }}>{r}</span>)}
          {t.fields.some(f => f.src?.type === "api") && <ApiBadge />}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btng" style={{ fontSize: 13, padding: "8px 14px" }} onClick={() => onEdit(t)}><Settings2 size={15} /> Editar</button>
          <button className="btn btng" style={{ fontSize: 13, padding: "8px 14px" }} onClick={() => onUse(t)}><Eye size={15} /> Usar</button>
        </div>
      </div>)}
    </div>
  </div>;
}

/* ================= BUILDER ================= */
function Builder({ tpl, setTpl, org, levels, conns, onSave, onCancel }) {
  const [sel, setSel] = useState(null); const [prev, setPrev] = useState(false); const [pvals, setPvals] = useState({});
  const upd = (id, patch) => setTpl(p => ({ ...p, fields: p.fields.map(f => f.id === id ? { ...f, ...patch } : f) }));
  const move = (i, dir) => setTpl(p => { const a = [...p.fields]; const j = i + dir; if (j < 0 || j >= a.length) return p; [a[i], a[j]] = [a[j], a[i]]; return { ...p, fields: a }; });
  const add = t => { const f = { id: nid(), t, label: FIELD_TYPES.find(x => x.t === t).n }; if (["select", "multiselect", "checklist", "radio"].includes(t)) f.opts = ["Opción 1", "Opción 2"]; if (t === "table") f.cols = ["Columna 1", "Columna 2"]; setTpl(p => ({ ...p, fields: [...p.fields, f] })); setSel(f.id); };
  const selF = tpl.fields.find(f => f.id === sel);
  const togglables = tpl.fields.filter(f => f.t === "toggle");
  const feedable = selF && ["select", "multiselect", "checklist", "radio"].includes(selF.t);
  const selConn = selF?.src?.type === "api" ? conns.find(c => c.endpoints.some(e => e.id === selF.src.api)) : null;
  const firstEp = conns.flatMap(c => c.endpoints.filter(e => e.active))[0];
  return <div className="fade">
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
      <h1 className="h" style={{ fontSize: 23, fontWeight: 800, margin: 0 }}>{tpl.isNew ? "Nueva" : "Editar"} <span className="gradtxt">plantilla</span></h1>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btng" onClick={() => setPrev(!prev)}><Eye size={15} /> {prev ? "Editor" : "Vista previa"}</button>
        <button className="btn btng" onClick={onCancel}>Cancelar</button>
        <button className="btn btnp" disabled={!tpl.name} style={{ opacity: tpl.name ? 1 : .5 }} onClick={() => onSave(tpl)}><CheckCircle2 size={15} /> Guardar</button>
      </div>
    </div>
    {prev ? <div className="card glow" style={{ padding: "26px 30px", maxWidth: 720 }}>
      <div className="h" style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>{indOf(tpl.ind).icon} {tpl.name || "Sin título"}</div>
      <div style={{ color: "#9aa3b8", fontSize: 13.5, marginBottom: 20 }}>{tpl.desc}</div>
      {tpl.fields.map(f => <FieldRender key={f.id} f={f} v={pvals[f.id]} all={pvals} set={v => setPvals(p => ({ ...p, [f.id]: v }))} />)}
      {tpl.fields.length === 0 && <div style={{ color: "#6b7280" }}>Aún no hay campos.</div>}
    </div> :
      <div style={{ display: "grid", gridTemplateColumns: "225px 1fr 300px", gap: 14, alignItems: "start" }}>
        <div className="card" style={{ padding: 14, position: "sticky", top: 20, maxHeight: "82vh", overflowY: "auto" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#9aa3b8", letterSpacing: 1, marginBottom: 10 }}>OBJETOS PREMIUM</div>
          {FIELD_TYPES.map(ft => <div key={ft.t} onClick={() => add(ft.t)} style={{ display: "flex", gap: 9, alignItems: "center", padding: "8px 10px", borderRadius: 10, cursor: "pointer", fontSize: 13, marginBottom: 3, transition: "all .15s" }} onMouseEnter={e => e.currentTarget.style.background = "rgba(99,102,241,.15)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <span>{ft.i}</span><span style={{ flex: 1 }}>{ft.n}</span>{ft.feed && <Plug size={11} color="#34d399" />}<Plus size={13} color="#6366f1" /></div>)}
          <div style={{ fontSize: 10.5, color: "#6b7280", marginTop: 10, lineHeight: 1.5 }}><Plug size={10} color="#34d399" style={{ verticalAlign: -1 }} /> = admite lista fija o datos desde Orígenes conectados</div>
        </div>
        <div>
          <div className="card" style={{ padding: 18, marginBottom: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div><label style={{ fontSize: 12, color: "#9aa3b8", fontWeight: 600 }}>Nombre *</label><input className="inp" style={{ marginTop: 5 }} placeholder="Ej: Checklist pre-uso pala" value={tpl.name} onChange={e => setTpl(p => ({ ...p, name: e.target.value }))} /></div>
              <div><label style={{ fontSize: 12, color: "#9aa3b8", fontWeight: 600 }}>Industria</label><select className="inp" style={{ marginTop: 5 }} value={tpl.ind} onChange={e => setTpl(p => ({ ...p, ind: e.target.value }))}>{INDUSTRIES.map(x => <option key={x.id} value={x.id}>{x.icon} {x.name}</option>)}</select></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
              <div><label style={{ fontSize: 12, color: "#9aa3b8", fontWeight: 600 }}>Nodo en la estructura ({levels.join(" › ")})</label>
                <select className="inp" style={{ marginTop: 5 }} value={tpl.node || ""} onChange={e => setTpl(p => ({ ...p, node: e.target.value || null }))}>
                  <option value="">(sin asignar — global)</option>
                  {org.map(n => <option key={n.id} value={n.id}>{"\u00A0".repeat(n.lvl * 3)}{levels[n.lvl]}: {n.name}</option>)}
                </select></div>
              <div><label style={{ fontSize: 12, color: "#9aa3b8", fontWeight: 600 }}>Roles con acceso</label>
                <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap" }}>{["admin", "supervisor", "operador"].map(r => { const on = tpl.roles.includes(r); return <button key={r} className="chip" style={{ cursor: "pointer", padding: "7px 13px", border: "1px solid", borderColor: on ? "#6366f1" : "rgba(255,255,255,.15)", background: on ? "rgba(99,102,241,.25)" : "transparent", color: on ? "#c7d2fe" : "#9aa3b8" }} onClick={() => setTpl(p => ({ ...p, roles: on ? p.roles.filter(x => x !== r) : [...p.roles, r] }))}>{on ? "✓ " : ""}{r}</button>; })}</div></div>
            </div>
            <div style={{ marginTop: 10 }}><label style={{ fontSize: 12, color: "#9aa3b8", fontWeight: 600 }}>Descripción</label><input className="inp" style={{ marginTop: 5 }} value={tpl.desc} onChange={e => setTpl(p => ({ ...p, desc: e.target.value }))} /></div>
          </div>
          {tpl.fields.length === 0 && <div className="card" style={{ padding: 40, textAlign: "center", color: "#6b7280", fontSize: 14, border: "1px dashed rgba(255,255,255,.2)" }}>👈 Agrega objetos desde la paleta</div>}
          {tpl.fields.map((f, i) => { const ft = FIELD_TYPES.find(x => x.t === f.t); const on = sel === f.id; return <div key={f.id} className="card" onClick={() => setSel(f.id)} style={{ padding: "12px 16px", marginBottom: 8, cursor: "pointer", borderColor: on ? "#6366f1" : undefined, background: on ? "rgba(99,102,241,.1)" : undefined, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 18 }}>{ft.i}</span>
            <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{f.label}{f.req && <span style={{ color: "#f87171" }}> *</span>}</div>
              <div style={{ fontSize: 11.5, color: "#6b7280" }}>{ft.n}{f.src?.type === "api" ? " · 🔌 " + (API_CATALOG[f.src.api]?.name || f.src.api) : ""}{f.unit ? ` · ${f.unit}` : ""}{f.min !== undefined || f.max !== undefined ? ` · umbral ${f.min ?? "—"}–${f.max ?? "—"}` : ""}{f.showIf ? " · condicional" : ""}</div></div>
            <button className="btn btng" style={{ padding: 6 }} onClick={e => { e.stopPropagation(); move(i, -1); }}><ArrowUp size={13} /></button>
            <button className="btn btng" style={{ padding: 6 }} onClick={e => { e.stopPropagation(); move(i, 1); }}><ArrowDown size={13} /></button>
            <button className="btn btng" style={{ padding: 6, color: "#f87171" }} onClick={e => { e.stopPropagation(); setTpl(p => ({ ...p, fields: p.fields.filter(x => x.id !== f.id) })); if (on) setSel(null); }}><Trash2 size={13} /></button>
          </div>; })}
        </div>
        <div className="card" style={{ padding: 16, position: "sticky", top: 20, maxHeight: "82vh", overflowY: "auto" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#9aa3b8", letterSpacing: 1, marginBottom: 12 }}>CONFIGURACIÓN</div>
          {!selF ? <div style={{ fontSize: 13, color: "#6b7280" }}>Selecciona un campo para configurar etiqueta, obligatoriedad, fuente de datos (fija o desde Orígenes), umbrales y lógica condicional.</div> :
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><label style={{ fontSize: 12, color: "#9aa3b8" }}>Etiqueta</label><input className="inp" style={{ marginTop: 4 }} value={selF.label} onChange={e => upd(sel, { label: e.target.value })} /></div>
              {selF.t !== "section" && <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}><input type="checkbox" checked={!!selF.req} onChange={e => upd(sel, { req: e.target.checked })} /> Obligatorio</label>}
              {feedable && <div style={{ background: "rgba(34,197,94,.07)", border: "1px solid rgba(34,197,94,.25)", borderRadius: 12, padding: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#34d399", marginBottom: 8, display: "flex", gap: 6, alignItems: "center" }}><Plug size={13} /> FUENTE DE DATOS</div>
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  {[["fixed", "📋 Lista fija"], ["api", "🔌 Origen externo"]].map(([k, l]) => { const on = (selF.src?.type || "fixed") === k; return <button key={k} className="chip" style={{ cursor: "pointer", flex: 1, justifyContent: "center", padding: "8px", border: "1px solid", borderColor: on ? "#34d399" : "rgba(255,255,255,.15)", background: on ? "rgba(34,197,94,.2)" : "transparent", color: on ? "#a7f3d0" : "#9aa3b8" }} onClick={() => upd(sel, { src: k === "api" ? { type: "api", api: selF.src?.api || firstEp?.id } : undefined })}>{l}</button>; })}
                </div>
                {selF.src?.type === "api" ? <div>
                  <label style={{ fontSize: 11.5, color: "#9aa3b8" }}>Endpoint (agrupado por origen)</label>
                  <select className="inp" style={{ marginTop: 4, fontSize: 13 }} value={selF.src.api || ""} onChange={e => upd(sel, { src: { type: "api", api: e.target.value } })}>
                    {conns.map(c => { const eps = c.endpoints.filter(e => e.active); if (!eps.length) return null; return <optgroup key={c.id} label={`${catOf(c.cat).icon} ${c.name} — ${catOf(c.cat).name}`}>{eps.map(e => <option key={e.id} value={e.id}>{e.name} · {e.path}</option>)}</optgroup>; })}
                  </select>
                  {selConn && <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 8 }}><StatusDot s={selConn.status} /><span style={{ fontSize: 10.5, color: "#6b7280" }}>origen: {selConn.name}</span></div>}
                  <div style={{ fontSize: 10.5, color: "#6b7280", marginTop: 6 }}>Las opciones se cargan en tiempo real al abrir el formulario. ¿Falta un origen? Configúralo en "Orígenes de datos".</div>
                </div> : <div><label style={{ fontSize: 11.5, color: "#9aa3b8" }}>Opciones (una por línea)</label><textarea className="inp" rows={4} style={{ marginTop: 4 }} value={(selF.opts || []).join("\n")} onChange={e => upd(sel, { opts: e.target.value.split("\n").filter(Boolean) })} /></div>}
              </div>}
              {selF.t === "number" && <>
                <div><label style={{ fontSize: 12, color: "#9aa3b8" }}>Unidad</label><input className="inp" style={{ marginTop: 4 }} placeholder="°C, bar, kg…" value={selF.unit || ""} onChange={e => upd(sel, { unit: e.target.value })} /></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div><label style={{ fontSize: 12, color: "#9aa3b8" }}>Mín.</label><input type="number" className="inp" style={{ marginTop: 4 }} value={selF.min ?? ""} onChange={e => upd(sel, { min: e.target.value === "" ? undefined : Number(e.target.value) })} /></div>
                  <div><label style={{ fontSize: 12, color: "#9aa3b8" }}>Máx.</label><input type="number" className="inp" style={{ marginTop: 4 }} value={selF.max ?? ""} onChange={e => upd(sel, { max: e.target.value === "" ? undefined : Number(e.target.value) })} /></div></div>
                <div style={{ fontSize: 11.5, color: "#67e8f9", background: "rgba(6,182,212,.1)", padding: 10, borderRadius: 10 }}>⚡ Fuera de rango → incidencia con workflow.</div></>}
              {selF.t === "table" && <div><label style={{ fontSize: 12, color: "#9aa3b8" }}>Columnas (una por línea)</label><textarea className="inp" rows={3} style={{ marginTop: 4 }} value={(selF.cols || []).join("\n")} onChange={e => upd(sel, { cols: e.target.value.split("\n").filter(Boolean) })} /></div>}
              {selF.t !== "section" && togglables.length > 0 && <div><label style={{ fontSize: 12, color: "#9aa3b8" }}>Mostrar solo si:</label>
                <select className="inp" style={{ marginTop: 4 }} value={selF.showIf?.f || ""} onChange={e => upd(sel, { showIf: e.target.value ? { f: e.target.value, v: true } : undefined })}>
                  <option value="">(siempre visible)</option>
                  {togglables.filter(t => t.id !== sel).map(t => <option key={t.id} value={t.id}>"{t.label}" = Sí</option>)}
                </select></div>}
            </div>}
        </div>
      </div>}
  </div>;
}

/* ================= ESTRUCTURA ================= */
function OrgView({ org, setOrg, levels, setLevels, templates, notify }) {
  const [newName, setNewName] = useState(""); const [newParent, setNewParent] = useState("");
  const addNode = () => {
    if (!newName.trim()) return;
    const parent = org.find(n => n.id === newParent);
    const lvl = parent ? parent.lvl + 1 : 0;
    if (lvl >= levels.length) { notify("⚠️ No se puede anidar más allá del último nivel (" + levels[levels.length - 1] + ")"); return; }
    setOrg(p => [...p, { id: "n" + Date.now(), name: newName.trim(), lvl, parent: newParent || null }]);
    setNewName(""); notify("✅ Nodo agregado a la estructura");
  };
  const Tree = ({ parent, depth }) => org.filter(n => n.parent === parent).map(n => <div key={n.id}>
    <div className="card" style={{ padding: "10px 14px", marginBottom: 7, marginLeft: depth * 26, display: "flex", alignItems: "center", gap: 10 }}>
      <span className="chip" style={{ background: ["rgba(99,102,241,.2)", "rgba(6,182,212,.2)", "rgba(34,197,94,.2)"][n.lvl % 3], color: ["#c7d2fe", "#67e8f9", "#86efac"][n.lvl % 3], fontSize: 10.5 }}>{levels[n.lvl]}</span>
      <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{n.name}</span>
      <span style={{ fontSize: 11, color: "#6b7280" }}>{templates.filter(t => t.node === n.id).length} plantilla(s)</span>
      <button className="btn btng" style={{ padding: 5, color: "#f87171" }} onClick={() => setOrg(p => p.filter(x => !descend(p, n.id).includes(x.id)))}><Trash2 size={13} /></button>
    </div>
    <Tree parent={n.id} depth={depth + 1} />
  </div>);
  return <div className="fade" style={{ maxWidth: 820 }}>
    <h1 className="h" style={{ fontSize: 26, fontWeight: 800, margin: "0 0 6px" }}>Estructura <span className="gradtxt">organizacional</span></h1>
    <p style={{ color: "#9aa3b8", marginBottom: 18, fontSize: 13.5 }}>Jerarquía configurable y opcional. Las plantillas, bitácoras, incidencias y privilegios de usuarios se anclan a estos nodos.</p>
    <div className="card" style={{ padding: 18, marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#9aa3b8", letterSpacing: 1, marginBottom: 10 }}>NOMBRES DE NIVELES (personalizables por empresa)</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {levels.map((l, i) => <input key={i} className="inp" style={{ maxWidth: 180 }} value={l} onChange={e => setLevels(p => p.map((x, j) => j === i ? e.target.value : x))} />)}
      </div>
      <div style={{ fontSize: 11.5, color: "#6b7280", marginTop: 8 }}>Otras empresas usan: Gerencia › Superintendencia › Área, o Planta › Línea › Estación, o Edificio › Piso › Sistema.</div>
    </div>
    <div className="card" style={{ padding: 18, marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#9aa3b8", letterSpacing: 1, marginBottom: 10 }}>AGREGAR NODO</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input className="inp" style={{ flex: 1, minWidth: 200 }} placeholder="Nombre del nodo" value={newName} onChange={e => setNewName(e.target.value)} />
        <select className="inp" style={{ maxWidth: 280 }} value={newParent} onChange={e => setNewParent(e.target.value)}>
          <option value="">(raíz — {levels[0]})</option>
          {org.filter(n => n.lvl < levels.length - 1).map(n => <option key={n.id} value={n.id}>dentro de: {pathOf(org, n.id)}</option>)}
        </select>
        <button className="btn btnp" onClick={addNode}><Plus size={15} /> Agregar</button>
      </div>
    </div>
    <Tree parent={null} depth={0} />
  </div>;
}

/* ================= INCIDENCIAS ================= */
function IncidentsView({ incidents, setIncidents, org, user, setKb, notify }) {
  const [selId, setSelId] = useState(null);
  const [comment, setComment] = useState("");
  const sel = incidents.find(i => i.id === selId);
  const upd = (id, patch, act) => setIncidents(p => p.map(i => i.id === id ? { ...i, ...patch, activity: act ? [...i.activity, { ts: new Date(), txt: act }] : i.activity } : i));
  const advance = i => {
    const idx = WF.indexOf(i.status); if (idx >= WF.length - 1) return;
    const next = WF[idx + 1];
    if (next === "Asignada" && !i.assignee) { notify("⚠️ Asigna un responsable antes de avanzar el workflow"); return; }
    upd(i.id, { status: next }, `Estado: ${i.status} → ${next} (por ${user.name})`);
    if (next === "Resuelta") {
      setKb(p => [{ id: "KB-" + String(p.length + 1).padStart(3, "0"), type: "lección", title: "Lección aprendida: " + i.title, tags: ["incidencia", i.id], node: i.node, date: new Date(), views: 0, body: `Derivada del cierre de ${i.id}. Protocolo aplicado: ${i.protocol}. ${i.comments.length ? "Gestión: " + i.comments[i.comments.length - 1].text : ""} Este conocimiento queda disponible para anticipar casos similares.` }, ...p]);
      notify("✅ Incidencia resuelta · 📚 Se generó una lección aprendida en la Base de Conocimiento");
    }
  };
  const groups = [["Abierta"], ["Asignada", "En curso"], ["En verificación"], ["Resuelta"]];
  const gTitle = ["🔴 Abiertas", "🟡 En gestión", "🔵 En verificación", "🟢 Resueltas"];

  return <div className="fade">
    <h1 className="h" style={{ fontSize: 26, fontWeight: 800, margin: "0 0 6px" }}>Motor de <span className="gradtxt">incidencias</span></h1>
    <p style={{ color: "#9aa3b8", marginBottom: 8 }}>Workflow completo: <b style={{ color: "#c3c9da" }}>{WF.join(" → ")}</b></p>
    <p style={{ color: "#6b7280", fontSize: 12.5, marginBottom: 20 }}>Haz clic en una tarjeta para gestionarla: responsable, prioridad, comentarios y actividad. Al resolver, se genera conocimiento automáticamente.</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 13 }}>
      {groups.map((g, gi) => <div key={gi}>
        <div className="h" style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 10 }}>{gTitle[gi]} ({incidents.filter(i => g.includes(i.status)).length})</div>
        {incidents.filter(i => g.includes(i.status)).map(i => <div key={i.id} className="card" style={{ padding: 14, marginBottom: 10, borderLeft: `3px solid ${SEVC[i.sev]}`, cursor: "pointer" }} onClick={() => setSelId(i.id)}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, gap: 4, flexWrap: "wrap" }}><span className="mono" style={{ fontSize: 11.5, color: "#a5b4fc" }}>{i.id}</span><span className="chip" style={{ background: PRIOC[i.prio] + "22", color: PRIOC[i.prio], fontSize: 10.5 }}><Flag size={10} /> {i.prio}</span></div>
          <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.4 }}>{i.title}</div>
          <div style={{ fontSize: 11, color: "#6b7280", margin: "7px 0 5px" }}>{pathOf(org, i.node)} · {new Date(i.date).toLocaleDateString("es-CL")}</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11.5, color: i.assignee ? "#34d399" : "#fbbf24" }}>{i.assignee ? "👤 " + i.assignee : "⚠ sin responsable"}</span>
            {i.comments.length > 0 && <span style={{ fontSize: 11, color: "#9aa3b8" }}><MessageSquare size={11} style={{ verticalAlign: -1 }} /> {i.comments.length}</span>}
          </div>
        </div>)}
        {incidents.filter(i => g.includes(i.status)).length === 0 && <div className="card" style={{ padding: 20, textAlign: "center", fontSize: 12.5, color: "#6b7280", border: "1px dashed rgba(255,255,255,.15)" }}>Sin incidencias</div>}
      </div>)}
    </div>

    {sel && <>
      <div onClick={() => setSelId(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 55 }} />
      <div className="drawer">
        <div style={{ padding: "22px 26px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
            <div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span className="mono" style={{ fontSize: 13, color: "#a5b4fc" }}>{sel.id}</span><Sev v={sel.sev} />
                <span className="chip" style={{ background: PRIOC[sel.prio] + "22", color: PRIOC[sel.prio] }}><Flag size={11} /> {sel.prio}</span>
              </div>
              <div className="h" style={{ fontWeight: 800, fontSize: 17, marginTop: 8, lineHeight: 1.35 }}>{sel.title}</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 5 }}>{pathOf(org, sel.node)} · reportada por {sel.reporter} · {sel.src} · SLA {sel.due}</div>
            </div>
            <button className="btn btng" style={{ padding: 7 }} onClick={() => setSelId(null)}><X size={16} /></button>
          </div>
          <div style={{ display: "flex", alignItems: "center", margin: "16px 0 20px" }}>
            {WF.map((s, i) => { const cur = WF.indexOf(sel.status); const done = i <= cur; return <div key={s} style={{ display: "flex", alignItems: "center", flex: i < WF.length - 1 ? 1 : "none" }}>
              <div title={s} style={{ width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, background: done ? "linear-gradient(135deg,#6366f1,#06b6d4)" : "rgba(255,255,255,.07)", color: done ? "#fff" : "#6b7280", border: "1px solid " + (done ? "transparent" : "rgba(255,255,255,.15)") }}>{i + 1}</div>
              {i < WF.length - 1 && <div style={{ flex: 1, height: 2, background: i < cur ? "#6366f1" : "rgba(255,255,255,.1)" }} />}
            </div>; })}
          </div>
          <div style={{ fontSize: 12, color: "#9aa3b8", marginTop: -12, marginBottom: 18 }}>Estado actual: <b style={{ color: "#c7d2fe" }}>{sel.status}</b></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            <div><label style={{ fontSize: 12, color: "#9aa3b8", fontWeight: 600 }}>👤 Responsable asignado</label>
              <select className="inp" style={{ marginTop: 5 }} value={sel.assignee || ""} onChange={e => upd(sel.id, { assignee: e.target.value || null, status: sel.status === "Abierta" && e.target.value ? "Asignada" : sel.status }, e.target.value ? "Asignada a " + e.target.value + " por " + user.name : "Responsable removido")}>
                <option value="">(sin asignar)</option>{USERS.map(u => <option key={u.id} value={u.name}>{u.name} — {u.roleName}</option>)}</select></div>
            <div><label style={{ fontSize: 12, color: "#9aa3b8", fontWeight: 600 }}>🚩 Prioridad</label>
              <select className="inp" style={{ marginTop: 5 }} value={sel.prio} onChange={e => upd(sel.id, { prio: e.target.value }, "Prioridad cambiada a " + e.target.value)}>{Object.keys(PRIOC).map(p => <option key={p}>{p}</option>)}</select></div>
          </div>
          <div style={{ background: "rgba(255,255,255,.04)", borderRadius: 12, padding: "11px 14px", fontSize: 12.5, color: "#9aa3b8", lineHeight: 1.55, marginBottom: 16 }}>⚙️ <b style={{ color: "#c3c9da" }}>Protocolo:</b> {sel.protocol}</div>
          {sel.status !== "Resuelta" && <button className="btn btnp" style={{ width: "100%", justifyContent: "center", marginBottom: 18 }} onClick={() => advance(sel)}>
            <ChevronRight size={15} /> Avanzar a "{WF[WF.indexOf(sel.status) + 1]}"</button>}
          <div className="h" style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 10 }}><MessageSquare size={14} style={{ verticalAlign: -2 }} /> Comentarios ({sel.comments.length})</div>
          {sel.comments.map((c, i) => <div key={i} style={{ background: "rgba(255,255,255,.04)", borderRadius: 12, padding: "10px 13px", marginBottom: 8 }}>
            <div style={{ fontSize: 11.5, color: "#6b7280", marginBottom: 4 }}><b style={{ color: "#9aa3b8" }}>{c.by}</b> · {new Date(c.ts).toLocaleString("es-CL")}</div>
            <div style={{ fontSize: 13 }}>{c.text}</div></div>)}
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            <input className="inp" placeholder="Agregar comentario de gestión…" value={comment} onChange={e => setComment(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && comment.trim()) { upd(sel.id, { comments: [...sel.comments, { by: user.name, ts: new Date(), text: comment.trim() }] }); setComment(""); } }} />
            <button className="btn btng" onClick={() => { if (comment.trim()) { upd(sel.id, { comments: [...sel.comments, { by: user.name, ts: new Date(), text: comment.trim() }] }); setComment(""); } }}><Send size={14} /></button>
          </div>
          <div className="h" style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 10 }}><Clock size={14} style={{ verticalAlign: -2 }} /> Actividad</div>
          {[...sel.activity].reverse().map((a, i) => <div key={i} style={{ fontSize: 12, color: "#9aa3b8", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
            <span style={{ color: "#6b7280" }}>{new Date(a.ts).toLocaleString("es-CL")}</span> — {a.txt}</div>)}
        </div>
      </div>
    </>}
  </div>;
}

/* ================= BASE DE CONOCIMIENTO ================= */
function KBView({ kb, org }) {
  const [q, setQ] = useState("");
  const TYPEC = { "lección": ["#22c55e", "💡 Lección aprendida"], "procedimiento": ["#06b6d4", "📘 Procedimiento"], "patrón IA": ["#a855f7", "🤖 Patrón detectado por IA"] };
  const list = kb.filter(k => !q || (k.title + k.body + k.tags.join(" ")).toLowerCase().includes(q.toLowerCase()));
  return <div className="fade" style={{ maxWidth: 880 }}>
    <h1 className="h" style={{ fontSize: 26, fontWeight: 800, margin: "0 0 6px" }}>Base de conocimiento <span className="gradtxt">viva</span></h1>
    <p style={{ color: "#9aa3b8", marginBottom: 18, fontSize: 13.5 }}>Se enriquece sola con el día a día: cada incidencia resuelta genera una lección aprendida, la IA detecta patrones en los registros, y los procedimientos validados quedan disponibles para anticiparse a fallos.</p>
    <div style={{ position: "relative", maxWidth: 420, marginBottom: 20 }}>
      <Search size={16} style={{ position: "absolute", left: 12, top: 12, color: "#6b7280" }} />
      <input className="inp" style={{ paddingLeft: 38 }} placeholder="Buscar conocimiento: atollo, lubricación, hidráulica…" value={q} onChange={e => setQ(e.target.value)} />
    </div>
    {list.map(k => <div key={k.id} className="card" style={{ padding: 20, marginBottom: 12, borderLeft: "3px solid " + TYPEC[k.type][0] }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <span className="chip" style={{ background: TYPEC[k.type][0] + "22", color: TYPEC[k.type][0] }}>{TYPEC[k.type][1]}</span>
        <span style={{ fontSize: 11.5, color: "#6b7280" }}>{new Date(k.date).toLocaleDateString("es-CL")} · {k.views} consultas · {pathOf(org, k.node)}</span>
      </div>
      <div className="h" style={{ fontWeight: 700, fontSize: 15.5, marginBottom: 7 }}>{k.title}</div>
      <div style={{ fontSize: 13.5, color: "#c3c9da", lineHeight: 1.65 }}>{k.body}</div>
      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>{k.tags.map(t => <span key={t} className="chip" style={{ background: "rgba(255,255,255,.06)", color: "#9aa3b8", fontSize: 11 }}>#{t}</span>)}</div>
    </div>)}
    {list.length === 0 && <div className="card" style={{ padding: 30, textAlign: "center", color: "#6b7280" }}>Sin resultados para "{q}"</div>}
  </div>;
}

/* ================= ASISTENTE IA ================= */
function AIChat({ entries, incidents, templates, kb, handovers }) {
  const [msgs, setMsgs] = useState([{ role: "assistant", content: "Hola 👋 Soy el analista IA de LogBook Pro. Tengo acceso a bitácoras, incidencias, entregas de turno y la base de conocimiento. Pregúntame: tendencias, riesgos, predicciones, resúmenes ejecutivos o conocimiento histórico." }]);
  const [inp, setInp] = useState(""); const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [msgs]);
  const ctx = useMemo(() => JSON.stringify({
    fecha: new Date().toISOString().slice(0, 10),
    entradas: entries.slice(0, 40).map(e => ({ id: e.id, plantilla: templates.find(t => t.id === e.tpl)?.name, fecha: e.date.toISOString().slice(0, 10), turno: e.shift, sev: e.sev, temp: e.temp })),
    incidencias: incidents.map(i => ({ id: i.id, t: i.title, sev: i.sev, estado: i.status, resp: i.assignee, prio: i.prio })),
    conocimiento: kb.map(k => ({ id: k.id, tipo: k.type, t: k.title })),
    ultima_entrega_turno: handovers[0]?.resumen,
    nota: "Temperatura hidráulica CH-001 subió de 82°C a 99°C en 14 días; umbral 85°C; patrón KB-003 activo."
  }), [entries, incidents, kb, handovers, templates]);
  const send = async () => {
    if (!inp.trim() || busy) return;
    const q = inp.trim(); setInp("");
    setMsgs(p => [...p, { role: "user", content: q }]); setBusy(true);
    const txt = await askAI(`Eres el analista IA de "LogBook Pro" (bitácoras operacionales multi-industria). Responde SIEMPRE en español, conciso, profesional y accionable (máx ~180 palabras). Cruza bitácoras, incidencias, entregas de turno y base de conocimiento; anticipa fallos cuando corresponda. Datos JSON:\n${ctx}\n\nPregunta: ${q}`,
      "Con los datos disponibles: la prioridad hoy es la sobretemperatura de CH-001 (99°C, patrón KB-003 activo, falla probable en 7 días) y la incidencia HACCP crítica INC-0040. Recomiendo asignar responsable a INC-0041, programar mantención preventiva del intercambiador y mantener el monitoreo cada 2 h heredado del último cambio de turno.");
    setMsgs(p => [...p, { role: "assistant", content: txt }]); setBusy(false);
  };
  const sugs = ["¿Qué riesgos debo atender hoy?", "Resume la última entrega de turno", "¿Qué dice el conocimiento sobre atollos?", "¿Qué falla puedo anticipar esta semana?"];
  return <div className="fade" style={{ maxWidth: 780 }}>
    <h1 className="h" style={{ fontSize: 26, fontWeight: 800, margin: "0 0 4px" }}>Asistente <span className="gradtxt">IA</span></h1>
    <p style={{ color: "#9aa3b8", marginBottom: 16, fontSize: 13.5 }}>Consultas en lenguaje natural sobre la memoria operacional completa · agnóstico al proveedor de modelo 🔌</p>
    <div className="card" style={{ padding: 20, minHeight: 420, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, overflowY: "auto", maxHeight: 440, paddingRight: 6 }}>
        {msgs.map((m, i) => <div key={i} className="fade" style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 12 }}>
          <div style={{ maxWidth: "82%", padding: "12px 16px", borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px", fontSize: 13.8, lineHeight: 1.65, whiteSpace: "pre-wrap", background: m.role === "user" ? "linear-gradient(135deg,#6366f1,#06b6d4)" : "rgba(255,255,255,.06)", border: m.role === "user" ? "none" : "1px solid rgba(255,255,255,.1)" }}>{m.content}</div></div>)}
        {busy && <div className="pulse" style={{ fontSize: 13, color: "#a5b4fc" }}>✦ Cruzando bitácoras, turnos y conocimiento…</div>}
        <div ref={endRef} />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>{sugs.map(s => <button key={s} className="chip" style={{ cursor: "pointer", background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.12)", color: "#9aa3b8", padding: "7px 13px" }} onClick={() => setInp(s)}>{s}</button>)}</div>
      <div style={{ display: "flex", gap: 8 }}>
        <input className="inp" placeholder="Ej: ¿qué pendientes dejó el turno anterior y qué falla anticipa la IA?" value={inp} onChange={e => setInp(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} />
        <button className="btn btnp" onClick={send} disabled={busy}><Send size={16} /></button>
      </div>
    </div>
  </div>;
}