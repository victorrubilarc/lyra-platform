/**
 * Descripciones de uso de cada nodo de la estructura organizacional de demo
 * (planta de remanufactura de madera, referencia tipo ITI / Arauco Remanufactura).
 *
 * Fuente de verdad ÚNICA: la usa tanto el seed (al crear los nodos) como el
 * backfill (para poblar `description` en una BD que ya tiene los nodos creados).
 * Clave = id estable del nodo en el seed.
 */
export const NODE_DESCRIPTIONS: Record<string, string> = {
  // ── Plantas ──────────────────────────────────────────────────────────────
  p1: "Planta de remanufactura: transforma madera aserrada seca en molduras y blanks de valor agregado.",
  p2: "Planta de tratamiento y terminación: impregnado, pintado y acabado de los productos.",

  // ── Áreas · REMANUFACTURE PLANT ─────────────────────────────────────────
  "a-patio": "Recepción y acopio de materia prima; control de ingreso de madera verde, seca y blocks.",
  "a-secado": "Secado en cámaras hasta la humedad objetivo antes de elaboración.",
  "a-prep": "Habilitado de la madera: cepillado, trozado, finger-joint y dimensionado primario.",
  "a-elab": "Mecanizado y terminación de piezas: molduras, lijado, encolado y reparación.",

  // ── Procesos · PATIO ────────────────────────────────────────────────────
  "pr-patio-rec": "Ingreso y registro de materia prima al patio.",
  "pr-patio-emp": "Apilado con separadores (empalillado) para permitir el flujo de aire en el secado.",
  "pr-patio-imp": "Impregnación preventiva de la madera contra hongos e insectos.",
  "pr-patio-recv": "Recepción de madera verde recién aserrada.",
  "pr-patio-recs": "Recepción de madera seca de cámara o de proveedor.",
  "pr-patio-recb": "Recepción de blocks encolados para remanufactura.",
  "pr-patio-recbl": "Recepción de blanks dimensionados listos para molduras.",
  "pr-patio-recrip": "Recepción de madera rip cepillada para la línea de elaboración.",

  // ── Procesos · SECADO ───────────────────────────────────────────────────
  "pr-seca-seca": "Secado en cámara hasta la humedad de equilibrio.",
  "pr-seca-flash": "Oreo / pre-secado superficial antes de la siguiente etapa.",

  // ── Procesos · PREPARACION ──────────────────────────────────────────────
  "pr-prep-cep": "Cepillado de caras y cantos para dejar superficie y escuadría uniformes.",
  "pr-prep-troz": "Corte transversal a largos de trabajo, eliminando defectos.",
  "pr-prep-finger": "Unión finger-joint para fabricar piezas largas a partir de cortos.",
  "pr-prep-huin": "Corte longitudinal con sierra huincha.",
  "pr-prep-prens": "Prensado y encolado de blocks y paneles.",
  "pr-prep-rip": "Despunte longitudinal (rip saw) a anchos de trabajo.",
  "pr-prep-imp": "Impregnado de piezas de remanufactura.",

  // ── Procesos · ELABORACION ──────────────────────────────────────────────
  "pr-elab-part": "Partido y despiece de piezas según el programa de corte.",
  "pr-elab-mold": "Perfilado de molduras en molduradora multi-cabezal.",
  "pr-elab-lij": "Lijado de superficies y perfiles previo a terminación.",
  "pr-elab-cola": "Encolado y armado de piezas en línea de cola.",
  "pr-elab-esc": "Escuadrado final a las dimensiones y ángulos definidos.",
  "pr-elab-dim": "Dimensionado final a largo y ancho de producto.",
  "pr-elab-rep": "Reparación de defectos (masillado, parches) antes de terminación.",
  "pr-elab-raj": "Rajado longitudinal de piezas.",
  "pr-elab-deb": "Desbaste inicial para remover el excedente de material.",

  // ── Áreas · TREATMENT PLANT ─────────────────────────────────────────────
  "a-trat": "Impregnado y tratamiento químico de protección de la madera.",
  "a-rec2": "Recepción de piezas a tratar o terminar en planta 2.",
  "a-pint": "Aplicación de pinturas, sellantes y látex; armado y bajada de racks.",
  "a-p2": "Línea complementaria de pintado P2.",

  // ── Procesos · TRATAMIENTO ──────────────────────────────────────────────
  "pr-trat-impp": "Impregnado base previo al pintado.",
  "pr-trat-flash": "Oreo entre manos de impregnado o pintura.",
  "pr-trat-boro": "Impregnado con sales de boro para protección.",

  // ── Procesos · PINTADO ──────────────────────────────────────────────────
  "pr-pint-air": "Aplicación de pintura por pulverización airless.",
  "pr-pint-vac": "Aplicación por máquina de vacío para perfiles.",
  "pr-pint-arm": "Armado de piezas en racks para la línea de pintado.",
  "pr-pint-br1": "Bajada de rack tras la primera mano.",
  "pr-pint-br2": "Bajada de rack tras la segunda mano.",
  "pr-pint-brl": "Bajada de rack de productos con látex.",
  "pr-pint-brm": "Bajada de rack de pintado manual.",
  "pr-pint-brs": "Bajada de rack tras la aplicación de sellante.",
  "pr-pint-brlfx": "Bajada de rack de látex línea FFX.",

  // ── Procesos · PLANTA P2 ────────────────────────────────────────────────
  "pr-p2-pint2": "Segunda línea de pintado y terminación.",
};
