/**
 * Datos de referencia para el seed de Equipos (SOLO desarrollo).
 *
 * Fuente única consumida por `seed.ts`. El catálogo de categorías es editable
 * desde la UI (Configurar categorías); estos valores son un punto de partida
 * razonable para una planta de remanufactura de madera + tratamiento.
 */

export interface SeedCategory {
  id: string;
  name: string;
  code: string;
  /** Referencia opcional a taxonomía externa (ej. clase ISO 14224). */
  isoRef?: string;
}

/** Catálogo inicial de categorías/clases de equipo (configurable). */
export const EQUIPMENT_CATEGORIES: SeedCategory[] = [
  { id: "cat-motor", name: "Motor eléctrico", code: "MOTOR", isoRef: "EM" },
  { id: "cat-bomba", name: "Bomba", code: "BOMBA", isoRef: "PU" },
  { id: "cat-compresor", name: "Compresor", code: "COMP", isoRef: "CO" },
  { id: "cat-caldera", name: "Caldera", code: "CALD", isoRef: "BO" },
  { id: "cat-secado", name: "Cámara de secado", code: "SECADO" },
  { id: "cat-cepilladora", name: "Cepilladora / Moldurera", code: "CEPILL" },
  { id: "cat-sierra", name: "Sierra", code: "SIERRA" },
  { id: "cat-prensa", name: "Prensa", code: "PRENSA" },
  { id: "cat-lijadora", name: "Lijadora", code: "LIJA" },
  { id: "cat-autoclave", name: "Autoclave / Impregnado", code: "AUTOCL" },
  { id: "cat-pintado", name: "Equipo de pintado", code: "PINTADO" },
  { id: "cat-transportador", name: "Transportador", code: "TRANSP" },
];

export interface SeedEquipment {
  name: string;
  code?: string;
  tag?: string;
  categoryId?: string;
  manufacturer?: string;
  model?: string;
  criticality?: number;
  orgNodeId: string;
}

/**
 * Equipos de ejemplo anclados a procesos de la estructura de demo (ver
 * `seedDemoStructure`). Los `orgNodeId` referencian ids fijos de esa estructura.
 */
export const DEMO_EQUIPMENT: SeedEquipment[] = [
  // ELABORACION · MOLDURERA
  { name: "Moldurera Weinig 1", code: "MOLD-01", tag: "REMA-ELAB-MOLD-01", categoryId: "cat-cepilladora", manufacturer: "Weinig", model: "Powermat 700", criticality: 4, orgNodeId: "pr-elab-mold" },
  { name: "Moldurera Weinig 2", code: "MOLD-02", tag: "REMA-ELAB-MOLD-02", categoryId: "cat-cepilladora", manufacturer: "Weinig", model: "Powermat 700", criticality: 3, orgNodeId: "pr-elab-mold" },
  // ELABORACION · LIJADO
  { name: "Lijadora ancha", code: "LIJ-01", tag: "REMA-ELAB-LIJ-01", categoryId: "cat-lijadora", manufacturer: "SCM", model: "Sandya 300", criticality: 3, orgNodeId: "pr-elab-lij" },
  // PREPARACION · PRENSA
  { name: "Prensa finger joint", code: "PREN-01", tag: "REMA-PREP-PREN-01", categoryId: "cat-prensa", manufacturer: "Dimter", criticality: 5, orgNodeId: "pr-prep-prens" },
  // PREPARACION · RIP SAW
  { name: "Sierra múltiple RIP", code: "RIP-01", tag: "REMA-PREP-RIP-01", categoryId: "cat-sierra", manufacturer: "Raimann", criticality: 4, orgNodeId: "pr-prep-rip" },
  // SECADO · SECADO
  { name: "Cámara de secado 1", code: "SEC-01", tag: "REMA-SECA-01", categoryId: "cat-secado", criticality: 4, orgNodeId: "pr-seca-seca" },
  { name: "Caldera de vapor", code: "CALD-01", tag: "REMA-SECA-CALD-01", categoryId: "cat-caldera", criticality: 5, orgNodeId: "pr-seca-seca" },
  // TRATAMIENTO · IMPREGNADO BORO
  { name: "Autoclave de impregnado", code: "AUTO-01", tag: "TRAT-BORO-AUTO-01", categoryId: "cat-autoclave", criticality: 5, orgNodeId: "pr-trat-boro" },
  // PINTADO · AIRLESS
  { name: "Equipo airless 1", code: "AIR-01", tag: "TRAT-PINT-AIR-01", categoryId: "cat-pintado", manufacturer: "Graco", criticality: 3, orgNodeId: "pr-pint-air" },
];
