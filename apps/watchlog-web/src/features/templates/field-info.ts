/**
 * Ficha por preset de la paleta para el modal "Ver más" (qué es · caso de uso ·
 * ejemplo), más una demo EN VIVO que arma el propio modal con `FieldControl`.
 * Resumen del `docs/FORM_GUIDE.md` (mapa de capacidades vivo). Clave = `id` del preset
 * en `FIELD_PALETTE` (builder-model). Texto en es-CL (la UI es es-CL hoy).
 */
export interface FieldInfo {
  /** Qué es / cómo se comporta, en 1–2 frases simples. */
  desc: string;
  /** Caso de uso: cuándo/por qué elegirlo (contexto de planta/terreno). */
  useCase: string;
  /** Ejemplo concreto de un valor real. */
  example: string;
}

export const FIELD_INFO: Record<string, FieldInfo> = {
  // --- Básicos ---
  text: {
    desc: "Una línea de texto corto. Admite largo mín/máx, patrón o máscara de entrada.",
    useCase: "Para códigos o identificadores breves donde el formato importa pero no hay una lista cerrada.",
    example: "N.º de orden de trabajo: OT-2026-014.",
  },
  textarea: {
    desc: "Texto largo de varias líneas, con un contador de caracteres opcional.",
    useCase: "Para relatos, observaciones o descripciones del turno que no caben en una línea.",
    example: "Observaciones: «Se detecta ruido anormal en el descanso lado motor…».",
  },
  number: {
    desc: "Un número con unidad y bandas de alerta (umbrales ISA-18.2) que pintan el valor sin bloquear el guardado.",
    useCase: "Para lecturas de proceso (temperatura, presión, nivel) donde quieres detectar y resaltar valores fuera de lo normal.",
    example: "Temp. descanso molino: 92 °C → se marca como crítico y la entrada entra a «excepciones».",
  },
  percent: {
    desc: "Un número acotado a 0–100 que se muestra como porcentaje.",
    useCase: "Para mediciones expresadas en porcentaje (humedad, avance, disponibilidad).",
    example: "Humedad del mineral: 12,5 %.",
  },
  currency: {
    desc: "Un monto de dinero con separador de miles y decimales según la región.",
    useCase: "Para costos o valorizaciones (repuestos, costo de una detención).",
    example: "Costo estimado de la detención: $ 1.250.000.",
  },
  rut: {
    desc: "RUT chileno que se valida con su dígito verificador y se formatea con puntos y guion mientras escribes.",
    useCase: "Para identificar personas o contratistas de forma confiable.",
    example: "Responsable: 12.345.678-5.",
  },
  email: {
    desc: "Correo electrónico con formato válido.",
    useCase: "Para registrar un contacto al que se pueda escribir o notificar.",
    example: "Contacto del contratista: contratista@empresa.cl.",
  },
  phone: {
    desc: "Teléfono (al menos 7 dígitos; admite +, espacios y guiones).",
    useCase: "Para coordinación: número del turno saliente, contacto de emergencia.",
    example: "Fono del turno: +56 9 1234 5678.",
  },
  url: {
    desc: "Dirección web válida (http/https).",
    useCase: "Para enlazar un recurso externo desde la entrada.",
    example: "Tablero de turno: https://intranet/tablero.",
  },
  boolean: {
    desc: "Un interruptor Sí/No. Arranca en «No» para que las reglas que comparan contra «No» se evalúen.",
    useCase: "Para confirmaciones de seguridad o estados de dos valores.",
    example: "¿Bloqueo/enclavamiento LOTO aplicado? → Sí.",
  },
  date: {
    desc: "Una fecha (sin hora), mostrada según la región.",
    useCase: "Para fechas que no necesitan hora exacta.",
    example: "Fecha de la última mantención: 30-05-2026.",
  },
  datetime: {
    desc: "Fecha y hora de un evento.",
    useCase: "Para marcar el momento exacto en que ocurrió algo.",
    example: "Inicio de la detención: 15-06-2026 03:42.",
  },
  time: {
    desc: "Hora del día en formato HH:MM (24h).",
    useCase: "Para horas puntuales dentro del turno (lecturas, relevos).",
    example: "Hora de la lectura: 06:15.",
  },
  duration: {
    desc: "Una duración en HH:MM (se guarda en minutos).",
    useCase: "Para medir cuánto duró algo (detención, tarea).",
    example: "Duración de la detención: 01:45.",
  },
  range: {
    desc: "Un rango mín–máx de dos números.",
    useCase: "Para registrar el rango observado de una variable durante el turno.",
    example: "Presión observada: 3,2–6,8 bar.",
  },
  tolerance: {
    desc: "Una lectura con un objetivo ± tolerancia; el sistema deriva solo las bandas de alerta.",
    useCase: "Para mediciones con un valor objetivo y márgenes (apriete, calibración).",
    example: "Torque de apriete: objetivo 80 ± 5 (aviso) / ± 10 (crítico) N·m.",
  },
  counter: {
    desc: "Una lectura incremental (horómetro/medidor) que no debería bajar; muestra el delta vs la lectura previa del equipo.",
    useCase: "Para acumulados de uso donde interesa el consumo entre lecturas.",
    example: "Horómetro de la bomba: 1.245,0 h (Δ +44,5 desde ayer).",
  },
  // --- Selección ---
  select: {
    desc: "Elegir UNA opción de una lista desplegable (guarda un código estable).",
    useCase: "Para estados o clasificaciones con un conjunto cerrado de valores.",
    example: "Estado mecánico: Operativo / Degradado / Fuera de servicio.",
  },
  radio: {
    desc: "Elegir una opción con todas a la vista (un toque).",
    useCase: "Pocas opciones donde conviene verlas todas y elegir rápido (con guantes).",
    example: "Turno: Día / Noche.",
  },
  segmented: {
    desc: "Elegir una opción en chips contiguos.",
    useCase: "Pocas opciones, estilo «pestañas», para una elección compacta.",
    example: "Prioridad: Baja / Media / Alta.",
  },
  checkboxes: {
    desc: "Marcar varias opciones con casillas visibles.",
    useCase: "Listas de verificación donde aplican varios ítems a la vez.",
    example: "EPP usado: Casco, Guantes, Arnés.",
  },
  multiselect: {
    desc: "Elegir varias opciones en un desplegable con etiquetas.",
    useCase: "Selección múltiple cuando la lista es mediana y no quieres ocupar mucho espacio.",
    example: "Sistemas afectados: hidráulico, lubricación.",
  },
  multiselectModal: {
    desc: "Elegir varias opciones desde un buscador emergente.",
    useCase: "Selección múltiple sobre catálogos grandes (cientos de ítems).",
    example: "Modos de falla: elegir 3 de un catálogo de 200.",
  },
  // --- Evaluación ---
  conformity: {
    desc: "Tri-estado de inspección: Conforme / No conforme / N.A.",
    useCase: "Checklists de inspección o pre-arranque donde cada punto se aprueba o se marca como hallazgo.",
    example: "Guardas de seguridad: No conforme.",
  },
  severity: {
    desc: "Escala fija de severidad 1–5 (con color).",
    useCase: "Para clasificar la gravedad de un hallazgo o evento de forma estándar.",
    example: "Severidad del evento: 4.",
  },
  rating: {
    desc: "Una valoración ordinal: estrellas, numérica o escala Likert.",
    useCase: "Para una apreciación cualitativa (orden y limpieza, satisfacción).",
    example: "Orden y limpieza del área: 4 de 5 estrellas.",
  },
  riskMatrix: {
    desc: "Una matriz probabilidad × consecuencia que deriva el nivel de riesgo (ISO 31000).",
    useCase: "Para evaluar el riesgo de una tarea o condición de forma consistente.",
    example: "Probabilidad 4 × Consecuencia 5 → nivel 5 (rojo).",
  },
  signature: {
    desc: "Firma electrónica con significado (FDA 21 CFR Part 11); se firma al avanzar el flujo, no como un campo normal.",
    useCase: "Para aprobaciones formales con trazabilidad e identidad (cierre de turno, autorización).",
    example: "Firma del supervisor: «Aprobación de cierre de turno».",
  },
  // --- Referencia ---
  refEquipment: {
    desc: "Selector de un equipo/activo del nodo, validado con permisos en el servidor.",
    useCase: "Para asociar la lectura o el evento a un activo concreto (confiabilidad/EAM).",
    example: "Equipo inspeccionado: Bomba P-101.",
  },
  refUser: {
    desc: "Selector de una persona de la plataforma.",
    useCase: "Para asignar un responsable o registrar quién reportó.",
    example: "Responsable: J. Pérez.",
  },
  refNode: {
    desc: "Selector de un nodo de la estructura (planta/área/línea).",
    useCase: "Para indicar un área distinta a la de la entrada.",
    example: "Área afectada: Molienda.",
  },
  refShift: {
    desc: "Selector de un turno definido.",
    useCase: "Para asociar el registro a un turno específico.",
    example: "Turno: Turno A (Día).",
  },
  // --- Evidencia / Terreno ---
  photo: {
    desc: "Una o varias fotos (cámara o galería) con vista previa.",
    useCase: "Para dejar evidencia visual de una condición o hallazgo.",
    example: "Evidencia de fuga: 2 fotos del sello.",
  },
  attachment: {
    desc: "Adjuntar uno o varios archivos (PDF, planilla, etc.).",
    useCase: "Para anexar documentos de respaldo a la entrada.",
    example: "Certificado de calibración (PDF).",
  },
  voiceNote: {
    desc: "Grabar una nota de voz en el momento.",
    useCase: "Cuando es incómodo escribir en terreno y conviene dictar la observación.",
    example: "Nota de voz de 20 s describiendo el ruido.",
  },
  sketch: {
    desc: "Dibujar un croquis a mano en pantalla (se guarda como imagen).",
    useCase: "Para señalar ubicaciones o esquemas rápidos que una foto no captura.",
    example: "Croquis marcando dónde está la fisura.",
  },
  qrScan: {
    desc: "Un campo de texto que se rellena escaneando un QR/código de barras con la cámara.",
    useCase: "Para identificar un equipo o material sin teclear su código.",
    example: "TAG del equipo: escanear la etiqueta → EQ-P101.",
  },
  // --- Estructurados ---
  table: {
    desc: "Una tabla repetible: filas dinámicas (agregar/quitar/reordenar) con columnas fijas.",
    useCase: "Para capturar varias lecturas del mismo tipo en una entrada.",
    example: "Vibraciones por punto: 3 filas (punto, mm/s, estado).",
  },
  repeatableGroup: {
    desc: "Un grupo repetible en tarjetas («agregar otro…»), ideal para tablet.",
    useCase: "Para listar varios ítems con varios campos cada uno, sin la rigidez de una grilla.",
    example: "Hallazgos del turno: una tarjeta por hallazgo.",
  },
  matrix: {
    desc: "Una matriz parámetro × turno con filas y columnas fijas y una celda uniforme.",
    useCase: "Para registrar el mismo set de parámetros en varios turnos/intervalos.",
    example: "Presión/Temperatura/Caudal medidos en Turno A y Turno B.",
  },
  // --- Presentación (no son dato: el llenado los ignora) ---
  heading: {
    desc: "Un encabezado para titular y separar bloques del formulario.",
    useCase: "Para organizar visualmente un formulario largo en secciones reconocibles.",
    example: "Título de bloque: «Inspección visual».",
  },
  staticText: {
    desc: "Un texto o instrucción fija (no se llena ni se guarda).",
    useCase: "Para dar indicaciones al operador dentro del formulario.",
    example: "«Complete esta sección antes de arrancar el equipo».",
  },
  divider: {
    desc: "Un separador visual entre bloques.",
    useCase: "Para dar aire y separar grupos de campos.",
    example: "Línea entre «Lecturas» y «Observaciones».",
  },
  notice: {
    desc: "Un aviso destacado con intención (info / advertencia / éxito / peligro).",
    useCase: "Para resaltar una precaución o una nota importante.",
    example: "⚠ «Use EPP completo en esta zona».",
  },
  procedureLink: {
    desc: "Un enlace a un procedimiento o documento.",
    useCase: "Para llevar al operador al instructivo correcto sin salir del contexto.",
    example: "«Ver instructivo de bloqueo LOTO».",
  },
  referenceImage: {
    desc: "Una imagen de referencia como guía visual.",
    useCase: "Para mostrar cómo se ve una condición correcta o un punto de medición.",
    example: "Esquema de la lectura correcta del manómetro.",
  },
};
