import { refreshResponseSchema } from "@lyra/contracts";
import type { ZodType } from "zod";
import {
  getAccessToken,
  notifySessionExpired,
  setAccessToken,
} from "./session-token.js";

/** Prefijo de la API (en dev lo proxya Vite hacia el backend NestJS). */
const API_BASE = "/api";

/** Cookie CSRF (NO httpOnly) que el SPA reenvía como header de doble envío. */
const CSRF_COOKIE = "wl_csrf";
const CSRF_HEADER = "x-csrf-token";

/** Detalle de un campo inválido devuelto por el ZodValidationPipe del backend. */
export interface ApiFieldIssue {
  path: string;
  message: string;
}

/** Error de API normalizado: status + mensaje legible + issues de validación. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly issues?: ApiFieldIssue[],
    /** Mensajes de validación detallados (ej. errores de regla/sección del backend). */
    readonly details?: string[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Lee una cookie por nombre desde `document.cookie`. */
function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

interface RequestOptions {
  method?: string;
  /** Cuerpo JSON; se serializa y se fija el Content-Type automáticamente. */
  body?: unknown;
  /** Manda el header CSRF de doble envío (para endpoints que usan la cookie). */
  csrf?: boolean;
  signal?: AbortSignal;
}

/** Refresh en vuelo compartido: varias 401 simultáneas usan un solo refresh. */
let inFlightRefresh: Promise<boolean> | null = null;

/** Pide un nuevo access token usando la cookie de refresh (+ CSRF). */
async function runRefresh(): Promise<boolean> {
  const csrf = readCookie(CSRF_COOKIE);
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: csrf ? { [CSRF_HEADER]: csrf } : {},
  });
  if (!res.ok) return false;
  const parsed = refreshResponseSchema.safeParse(await res.json());
  if (!parsed.success) return false;
  setAccessToken(parsed.data.accessToken, parsed.data.expiresIn);
  return true;
}

/** Coalescea refresh concurrentes en una sola petición. */
export function refreshAccessToken(): Promise<boolean> {
  inFlightRefresh ??= runRefresh().finally(() => {
    inFlightRefresh = null;
  });
  return inFlightRefresh;
}

/** Construye los headers de la petición (Authorization + CSRF + JSON). */
function buildHeaders(options: RequestOptions): Headers {
  const headers = new Headers();
  headers.set("Accept", "application/json");
  if (options.body !== undefined) headers.set("Content-Type", "application/json");
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.csrf) {
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) headers.set(CSRF_HEADER, csrf);
  }
  return headers;
}

/** Convierte una respuesta no-OK en `ApiError` con el mejor mensaje disponible. */
async function toApiError(res: Response): Promise<ApiError> {
  let message = `Error ${res.status}`;
  let issues: ApiFieldIssue[] | undefined;
  let details: string[] | undefined;
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object") {
      const b = body as { message?: unknown; issues?: ApiFieldIssue[]; errors?: unknown };
      if (typeof b.message === "string") message = b.message;
      else if (Array.isArray(b.message)) message = b.message.join(", ");
      if (Array.isArray(b.issues)) issues = b.issues;
      // El backend de llenado devuelve `errors: string[]` (obligatorios, reglas…).
      if (Array.isArray(b.errors)) details = b.errors.filter((e): e is string => typeof e === "string");
    }
  } catch {
    /* respuesta sin cuerpo JSON: nos quedamos con el mensaje por defecto */
  }
  return new ApiError(res.status, message, issues, details);
}

/**
 * Petición HTTP central. Añade el Bearer en memoria y `credentials: include`,
 * y ante un 401 con sesión vigente intenta UN refresh transparente y reintenta.
 */
async function request(path: string, options: RequestOptions = {}): Promise<Response> {
  const doFetch = (): Promise<Response> =>
    fetch(`${API_BASE}${path}`, {
      method: options.method ?? "GET",
      credentials: "include",
      headers: buildHeaders(options),
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });

  let res = await doFetch();

  // 401 con token presente ⇒ probablemente expiró: refrescamos y reintentamos.
  const hadToken = getAccessToken() !== null;
  const isRefresh = path === "/auth/refresh";
  if (res.status === 401 && hadToken && !isRefresh) {
    const ok = await refreshAccessToken();
    if (ok) {
      res = await doFetch();
    } else {
      notifySessionExpired();
    }
  }
  return res;
}

/** Petición que espera 204/cuerpo vacío; lanza `ApiError` si no es OK. */
export async function apiVoid(path: string, options: RequestOptions = {}): Promise<void> {
  const res = await request(path, options);
  if (!res.ok) throw await toApiError(res);
}

/** Petición que devuelve un Blob (descargas: CSV/PDF). Mantiene Bearer + refresh. */
export async function apiBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
  const res = await request(path, options);
  if (!res.ok) throw await toApiError(res);
  return res.blob();
}

/**
 * Subida multipart (adjuntos/evidencia, Ola 3). El navegador fija el
 * `Content-Type: multipart/form-data; boundary=…` a partir del `FormData` (NO se
 * setea a mano). Mantiene Bearer + CSRF + un refresh transparente ante 401.
 */
export async function apiUpload<T>(path: string, form: FormData, schema: ZodType<T>): Promise<T> {
  const doFetch = (): Promise<Response> => {
    const headers = new Headers();
    headers.set("Accept", "application/json");
    const token = getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) headers.set(CSRF_HEADER, csrf);
    return fetch(`${API_BASE}${path}`, { method: "POST", credentials: "include", headers, body: form });
  };
  let res = await doFetch();
  if (res.status === 401 && getAccessToken() !== null) {
    const ok = await refreshAccessToken();
    if (ok) res = await doFetch();
    else notifySessionExpired();
  }
  if (!res.ok) throw await toApiError(res);
  return schema.parse(await res.json());
}

/** Petición que devuelve JSON validado con un esquema Zod del contrato. */
export async function apiJson<T>(
  path: string,
  schema: ZodType<T>,
  options: RequestOptions = {},
): Promise<T> {
  const res = await request(path, options);
  if (!res.ok) throw await toApiError(res);
  const json: unknown = await res.json();
  return schema.parse(json);
}

export { API_BASE };
