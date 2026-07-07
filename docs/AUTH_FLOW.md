# Flujo de autenticación y tokens — Lyra WatchLog

> Documento de referencia del **modelo de sesión**: qué tokens existen, **dónde se
> guardan**, cómo se emiten/rotan/revocan y por qué. Fiel al código de Fase 1.
> Última actualización: 2026-06-06.

Si vienes con la duda *"hice login y no vi nada en el Network / en el storage"*,
salta a la sección **[8. "No vi pasar nada": dónde mirar en DevTools](#8-no-vi-pasar-nada-dónde-mirar-en-devtools)**.

---

## 1. Resumen en una frase

Usamos el patrón estándar de la industria: un **access token JWT de vida corta**
que viaja en el header `Authorization: Bearer` y **vive solo en memoria** del
navegador, más un **refresh token opaco de vida larga** que viaja en una **cookie
`httpOnly`** y del que en la base de datos **solo se guarda su hash**. El refresh
**rota en cada uso** y detecta reutilización (señal de robo).

---

## 2. Los dos tokens de un vistazo

| | **Access token** | **Refresh token** |
|---|---|---|
| Formato | JWT firmado (HS256) | Cadena opaca aleatoria (32 bytes, base64url) |
| Contenido | `sub` (userId), `email`, `sid` (sessionId), `exp` (+ `mfaPending` solo si debe enrolar MFA) | Nada legible: es un secreto aleatorio |
| Vida (`.env`) | **15 min** (`JWT_ACCESS_TTL=900`) | **30 días** (`JWT_REFRESH_TTL=2592000`) |
| Dónde se guarda en el navegador | **Memoria JS** (variable en `session-token.ts`) | **Cookie `httpOnly`** `wl_refresh` |
| ¿JS puede leerlo? | Sí (la app lo pone en el header) | **No** (`httpOnly`) |
| ¿Va en cada request? | Sí, como `Authorization: Bearer …` | Solo a `/api/auth/*` (cookie con `path` acotado) |
| Cómo viaja del backend | En el **cuerpo JSON** de la respuesta | En cabecera **`Set-Cookie`** |
| Qué guarda el backend | Nada (es *stateless*, se valida con la firma) | Solo el **hash SHA-256** en la tabla `RefreshToken` |
| Se renueva | Vía `/auth/refresh` | **Rota** en cada `/auth/refresh` (uno nuevo por uso) |

Hay además una tercera pieza, **no es un token de identidad**: la cookie **CSRF**
`wl_csrf` (no `httpOnly`), explicada en la [sección 7](#7-csrf-doble-envío).

---

## 3. Mapa de almacenamiento (¿dónde vive cada cosa?)

```
┌──────────────────────────── NAVEGADOR ────────────────────────────┐
│                                                                    │
│   Memoria JS (se borra al recargar la pestaña)                     │
│   ┌──────────────────────────────────────────┐                    │
│   │ session-token.ts                          │                    │
│   │   accessToken  = "eyJhbGciOi…"  (JWT)     │  ← NO en          │
│   │   expiresAt    = 1717..        (epoch ms) │    localStorage    │
│   └──────────────────────────────────────────┘                    │
│   ┌──────────────────────────────────────────┐                    │
│   │ auth-store.ts (Zustand)                   │                    │
│   │   session = { user, permissions, scope }  │  ← perfil para UI │
│   │   (NO el token)                           │    (no secretos)   │
│   └──────────────────────────────────────────┘                    │
│                                                                    │
│   Cookies (las gestiona el navegador, no el JS de la app)          │
│   ┌──────────────────────────────────────────┐                    │
│   │ wl_refresh  httpOnly  SameSite=Strict     │  ← refresh token  │
│   │             path=/api/auth                │    (oculto a JS)   │
│   │ wl_csrf     legible   SameSite=Strict     │  ← token CSRF     │
│   │             path=/                        │                    │
│   └──────────────────────────────────────────┘                    │
│                                                                    │
│   localStorage:  (solo "wl_remember_email" si marcaste recordar)   │
│                  NUNCA un token.                                    │
└────────────────────────────────────────────────────────────────────┘

┌──────────────────────────── BACKEND (Postgres) ───────────────────┐
│  Session       { id, userId, expiresAt, revokedAt, ip, ua }        │
│  RefreshToken  { tokenHash(SHA-256), familyId, usedAt, revokedAt,  │
│                  replacedById, expiresAt }   ← solo el HASH         │
└────────────────────────────────────────────────────────────────────┘
```

**Por qué así (modelo de amenazas):**
- **Access en memoria, no en `localStorage`** → si hubiera un XSS, no puede robar un
  token persistente: al recargar, la memoria se vacía.
- **Refresh en cookie `httpOnly`** → el JavaScript de la página **no puede leerlo**,
  así que un XSS tampoco lo extrae.
- **En la BD solo el hash del refresh** → si se filtrara la base, los refresh no son
  reutilizables (no se puede revertir el SHA-256).
- **`SameSite=Strict` + CSRF de doble envío** → defensa en profundidad contra CSRF.

---

## 3.1 Antes del primer login — asistente de primer arranque (OOBE, 2026-07-06)

En una instalación **VIRGEN** (0 usuarios) el flujo de auth ni siquiera puede empezar: no hay a quién autenticar.
El camino previo es el **asistente de primer arranque**:

1. La web (`LoginPage` y la propia ruta `/setup`) consulta `GET /api/setup/status` — **público**, devuelve SOLO
   `{ setupRequired: boolean }`. Si es `true`, `/login` redirige a **`/setup`**.
2. El wizard opera **sin JWT ni permisos** (endpoints `@Public()`): su candado es el **token de instalación de un
   solo uso** (`x-setup-token`, archivo `./license/setup-token`; hash en BD, lockout 5/15 min — ver
   `SECURITY.md §1.1`). Además, `/api/setup/` está en la whitelist del guard L1 (el setup corre típicamente en
   `PENDIENTE_ACTIVACION`).
3. `POST /api/setup/finalize` crea el administrador REAL en una transacción (política de contraseñas aplicada;
   `forcePasswordChange=false` — la eligió él mismo). Si se marcó "exigir MFA a administradores", se activa
   `requireMfa` en el rol admin ⇒ el **gate de enrolamiento existente (§4.1)** fuerza el enrolamiento TOTP en el
   primer login. Después del finalize, el asistente muere (404) y el flujo normal de abajo es el único camino.

## 4. Login (paso a paso, con bifurcación MFA)

```mermaid
sequenceDiagram
    autonumber
    participant U as Usuario
    participant W as Web (SPA)
    participant API as API /auth/login
    participant DB as Postgres

    U->>W: email + contraseña
    W->>API: POST /api/auth/login  { email, password }
    API->>DB: busca user, verifica Argon2id, lockout, estado
    alt Credenciales inválidas
        API-->>W: 401 (mensaje genérico)
    else MFA activo y sin código
        API-->>W: 200 { result: "mfa_required", mfaToken }
        U->>W: código TOTP / recovery
        W->>API: POST /api/auth/mfa/challenge { mfaToken, totp }
        API->>API: valida 2.º factor
    end
    API->>DB: crea Session + primer RefreshToken (guarda hash)
    API-->>W: 200 { accessToken, expiresIn, session }<br/>Set-Cookie: wl_refresh (httpOnly), wl_csrf
    W->>W: setAccessToken(accessToken) → MEMORIA
    W->>W: setSession(session) → Zustand (perfil/permisos)
    Note over W: La cookie wl_refresh la guarda el navegador solo.<br/>El accessToken NO se persiste a disco.
```

Respuesta real del login exitoso (cuerpo JSON):

```jsonc
{
  "result": "authenticated",
  "accessToken": "eyJhbGciOiJIUzI1Ni...",   // -> va a memoria JS
  "expiresIn": 900,                          // segundos (15 min)
  "session": { "user": { … }, "permissions": [ … ], "scope": { … } }
}
```

Y en las cabeceras de esa misma respuesta:

```
Set-Cookie: wl_refresh=<opaco>; HttpOnly; SameSite=Strict; Path=/api/auth; Max-Age=2592000
Set-Cookie: wl_csrf=<aleatorio>; SameSite=Strict; Path=/; Max-Age=2592000
```

---

## 4.1 Gate de enrolamiento forzado de MFA

Si el **rol** del usuario **exige MFA** (`mfaMode = REQUIRED_BY_ROLE` con un rol `requireMfa`, o
`REQUIRED_FOR_ALL`) y **aún no lo tiene activo**, el login **sí** emite sesión, pero el access token
lleva el claim **`mfaPending`** y la sesión queda **limitada al enrolamiento**:

- En el **backend**, el `MfaEnrollmentGuard` (global) responde **403 `MFA_ENROLLMENT_REQUIRED`** a todo
  endpoint que no esté marcado con `@AllowPendingEnrollment` (ver perfil, logout, `mfa/setup`,
  `mfa/verify`, cambio de contraseña). No es solo cosmético: impide operar con AAL1.
- En el **frontend**, `ProtectedRoute` desvía a `/activar-mfa` (después del cambio forzado de
  contraseña, que tiene prioridad). `SessionInfo.user.mfaEnrollmentRequired` lo señala.
- Al **verificar** el enrolamiento, el cliente hace un **`/auth/refresh`**: el claim se recalcula
  (ahora `mfaEnabled = true`) y el token nuevo **ya no trae `mfaPending`** → acceso pleno.

```
login (rol exige MFA, sin enrolar) ─▶ token con mfaPending ─▶ 403 en la API salvo enrolar
   └─ setup (QR) ─▶ verify (TOTP) ─▶ /auth/refresh ─▶ token SIN mfaPending ─▶ acceso pleno
```

El **segundo factor** (login normal y challenge) está **rate-limited**: tras `maxFailedAttempts`
intentos errados se bloquea `lockoutMinutes` (contador propio `mfaFailedCount`/`mfaLockedUntil`,
separado del de contraseña). El **reset de MFA por un admin** revoca todas las sesiones del objetivo.

## 5. Petición autenticada y **refresh transparente** ante un 401

Cada llamada a la API añade el access token en memoria. Si expiró (401), el cliente
hace **un** refresh y reintenta, todo invisible para el usuario. Código en
`lib/api-client.ts`.

```mermaid
sequenceDiagram
    autonumber
    participant W as Web (api-client)
    participant API as API
    W->>API: GET /api/structure/nodes<br/>Authorization: Bearer <access>
    alt Access válido
        API-->>W: 200 datos
    else Access expirado (401)
        API-->>W: 401
        W->>API: POST /api/auth/refresh<br/>Cookie: wl_refresh + header x-csrf-token
        API-->>W: 200 { accessToken nuevo }<br/>Set-Cookie: wl_refresh ROTADO
        W->>W: setAccessToken(nuevo)
        W->>API: reintenta GET /api/structure/nodes (Bearer nuevo)
        API-->>W: 200 datos
    end
```

> Detalle: los refresh concurrentes se **coalescen** en una sola petición
> (`inFlightRefresh`), para que diez 401 simultáneos no disparen diez refresh.

---

## 6. Rotación del refresh y **detección de reutilización**

El refresh es de **un solo uso**: cada `/auth/refresh` emite uno nuevo y marca el
anterior como usado (`usedAt`). Todos los de una misma sesión comparten un
`familyId`. Si llega **otra vez** un refresh ya rotado ⇒ es un indicio de robo ⇒
se **revoca toda la familia** y la sesión. Código en `token.service.ts`.

```mermaid
flowchart TD
    A["Llega refresh R"] --> B{"¿existe y no revocado?"}
    B -- no --> X["401 inválido"]
    B -- sí --> C{"¿ya tiene usedAt?<br/>(ya fue rotado)"}
    C -- "sí ⇒ REUSO" --> R["Revoca toda la familia<br/>+ la sesión · 401"]
    C -- no --> D{"¿expirado o sesión revocada?"}
    D -- sí --> X
    D -- no --> E["Crea R' (nuevo hash, mismo familyId)<br/>marca R.usedAt + R.replacedBy = R'"]
    E --> F["Devuelve access nuevo + Set-Cookie R'"]
```

```
Familia (una sesión):   R1 ──rota──▶ R2 ──rota──▶ R3 (vigente)
                         used         used         activo
Si alguien reusa R1  ▶  REUSO detectado ▶ se revocan R1,R2,R3 + Session
```

---

## 7. Refresh **proactivo** (no esperamos al 401)

Mientras hay sesión, `AuthProvider` programa un refresh **~30 s antes** de que el
access expire, así casi nunca se ve un 401. Línea de tiempo de un access de 15 min:

```
0min ─────────────────────────────────── 14:30 ─── 15:00
│ login: access en memoria                  │         │
│                                            │         └─ expiraría
│                                            └─ refresh PROACTIVO (lead 30s)
│                                               nuevo access + refresh rotado
└───────────────────────────────────────────────────────────────────▶ tiempo
```

(`REFRESH_LEAD_MS = 30_000` en `AuthProvider.tsx`.)

---

## 8. Bootstrap al recargar la página

Como el access vive **solo en memoria**, al recargar (F5) se pierde. No importa:
al arrancar, la app intenta un **refresh silencioso** con la cookie `wl_refresh` y,
si funciona, rehidrata la sesión cargando `/auth/me`. Por eso **sigues logueado**
tras recargar aunque el access no se guarde en disco.

```mermaid
sequenceDiagram
    autonumber
    participant W as Web (AuthProvider)
    participant API as API
    Note over W: F5 — memoria vacía (sin access)
    W->>API: POST /api/auth/refresh (cookie wl_refresh)
    alt Cookie válida
        API-->>W: 200 { accessToken }  (+ refresh rotado)
        W->>API: GET /api/auth/me
        API-->>W: 200 { user, permissions, scope }
        W->>W: status = "authenticated"
    else Sin cookie / inválida
        API-->>W: 401
        W->>W: status = "unauthenticated" → /login
    end
```

---

## 9. CSRF (doble envío)

Las cookies viajan **solas** en cada request al mismo origen; por eso los endpoints
que confían en la cookie (`/auth/refresh` y `/auth/logout`) exigen además un header
`x-csrf-token` **igual** a la cookie `wl_csrf`. Un sitio atacante puede provocar que
el navegador **envíe** la cookie, pero **no puede leerla** para copiarla al header
(SameSite + same-origin) ⇒ la petición falla. El resto de endpoints usan `Bearer`
(no dependen de cookie, así que no son vulnerables a CSRF). Código en `csrf.guard.ts`.

```
Cliente legitimo:   Cookie: wl_csrf=ABC   +   Header x-csrf-token: ABC   -> coinciden  -> 200
Ataque CSRF:        Cookie: wl_csrf=ABC   +   (no puede leer ABC)        -> falta/!=    -> 403
```

---

## 10. Logout

```mermaid
sequenceDiagram
    autonumber
    participant W as Web
    participant API as API /auth/logout
    participant DB as Postgres
    W->>API: POST /api/auth/logout (Bearer + x-csrf-token)
    API->>DB: revoca la Session + sus RefreshToken (revokedAt)
    API-->>W: 204 + Set-Cookie borra wl_refresh y wl_csrf
    W->>W: clearAccessToken() (memoria) + clear() (store)
```

> Nota: el access token JWT es *stateless* (no se "borra" en el servidor); como dura
> 15 min y la sesión queda revocada, deja de poder refrescarse. Para corte inmediato
> de **todas** las sesiones (p. ej. al **restablecer la contraseña**) existe
> `TokenService.revokeAllForUser`, que revoca todo de golpe. Ver `SECURITY.md` §6.

---

## 11. Dónde mirar en DevTools (responde "no vi nada")

Al hacer login **sí** ocurre tráfico; lo que pasa es que el token no se guarda donde
sueles mirar. Para verlo:

1. **Network** → filtra por `Fetch/XHR` → verás `POST /api/auth/login` (Vite lo
   proxya, aparece como **same-origin** `/api/...`). 
   - En **Response** está el `accessToken` (en el JSON).
   - En **Response Headers** está `Set-Cookie: wl_refresh …` (puede aparecer
     atenuado o marcado como restringido por ser `httpOnly`).
2. **Application → Cookies → tu origen**: ahí están `wl_refresh` (verás la marca
   **HttpOnly ✓**, por eso JS no la lee) y `wl_csrf`.
3. **Application → Local Storage / Session Storage**: **vacío de tokens** a propósito.
   Solo podrías ver `wl_remember_email` si marcaste "recordar correo".
4. Al **recargar** la página verás un `POST /api/auth/refresh` automático (el
   bootstrap de la sección 8), y antes de los 15 min, otro refresh **proactivo**.
5. En cualquier llamada a la API (`/api/auth/me`, `/api/structure/...`) mira
   **Request Headers**: `Authorization: Bearer eyJ…` (ese es el access en memoria).

> Resumen: **no hay token en el storage** porque el diseño lo evita. El access está
> en una variable JS (se ve en el header `Authorization`) y el refresh está en una
> cookie `httpOnly` (se ve en *Cookies*, no en *Storage*, y JS no lo lee).

---

## 12. Riesgos de robo de tokens y mitigaciones

> **Aclaración clave:** el **access token NO vive en una cookie**, vive en **memoria
> JS**. En la cookie (`wl_refresh`, `httpOnly`) vive el **refresh token**. Son piezas
> con riesgos distintos.

Toda forma de guardar credenciales tiene algún riesgo; lo relevante es cuál y qué lo
mitiga. La cookie `httpOnly` es la opción **más segura** para el refresh frente a
`localStorage`/`sessionStorage`.

| Vector de robo | ¿Aplica? | Mitigación en el código |
|---|---|---|
| **XSS lee el token** | El mayor riesgo de `localStorage` | **`httpOnly`** → JS no puede leer `wl_refresh`. El access, al estar en memoria, tampoco es un token persistente que robar. |
| **CSRF** (la cookie se manda sola) | Sí | **`SameSite=Strict`** + **CSRF de doble envío** (`x-csrf-token` debe igualar `wl_csrf`) en `/auth/refresh` y `/auth/logout`. |
| **Sniffing de red** | En HTTP plano | **`Secure`** en producción (`COOKIE_SECURE=true`) → solo HTTPS. |
| **Filtración de la BD** | Sí | En la BD **solo el hash SHA-256** del refresh; irreversible. |
| **Reuso de un refresh robado** | Sí | **Rotación + detección de reuso** → revoca toda la familia + la sesión. |
| **Exposición innecesaria** | — | Cookie con **`path=/api/auth`** → no se envía a toda la API. |

**El access token (memoria) es lo más seguro de los dos:** no está en disco (se borra al
cerrar la pestaña), no es cookie (no es vulnerable a CSRF) y dura **15 min** (caduca solo).

**Riesgos residuales (honestidad técnica):**
1. **XSS sigue siendo crítico.** `httpOnly` impide *exfiltrar* el refresh, pero un XSS
   podría **abusar de la sesión desde dentro** de la página. La defensa real es **no tener
   XSS** (CSP, sanitización, validación, Helmet). El almacenamiento limita el daño, no lo
   elimina.
2. **Compromiso del dispositivo** (malware con acceso al almacén de cookies, equipo
   desbloqueado) escapa a cualquier flag web.

**Comparación con "todo en `localStorage`":** ahí un único XSS roba un token persistente y
exfiltrable, usable desde otra máquina por mucho tiempo. El esquema de aquí (access efímero
en memoria + refresh `httpOnly` rotativo con detección de reuso) es estrictamente mejor y es
el patrón recomendado por OWASP para SPAs.

### 12.1 Verificación (qué está probado y cómo)

Niveles de evidencia, sin sobrevender:

| Propiedad | Evidencia | Resultado |
|---|---|---|
| `wl_refresh` es `HttpOnly; SameSite=Strict; Path=/api/auth; Max-Age=2592000` | **Vivo** — `Set-Cookie` del login (curl `-D`) | ✅ confirmado |
| `wl_csrf` legible (sin HttpOnly) para el doble envío | **Vivo** — `Set-Cookie` del login | ✅ confirmado |
| CSRF: `refresh` sin `x-csrf-token` → 403; con → 200 | **Vivo** — curl con/sin header | ✅ 403 / 200 |
| Rotación + **detección de reuso** revoca la familia | **Vivo** + **unit** (`token.service.spec.ts`) | ✅ R1 reusado → 401 y R2 legítimo → 401 |
| En la BD **solo el hash** del refresh | **Vivo** — `sha256(token)` vs `RefreshToken.tokenHash` en Postgres | ✅ token en claro: 0 filas · su hash: 1 fila |
| Login OK / credencial inválida 401 | **Vivo** (smoke) | ✅ 200 / 401 |
| Reset: neutro, single-use, **caducidad**, política, rate-limit | **Vivo** (smoke con Mailpit) | ✅ ver `SECURITY.md` §6 |
| `Secure` solo-HTTPS en producción | **Config** (`COOKIE_SECURE`); en dev es `false` (localhost) | ⚠️ no ejercido (requiere entorno HTTPS) |
| `httpOnly` impide `document.cookie` en el navegador | **Flag presente** (lo enforce el navegador) | ⚠️ no ejecutado como ataque en navegador |
| Access 15 min → refresh transparente al expirar | **Código + unit**; no se esperó 15 min en vivo | ⚠️ no cronometrado en vivo |

Comandos usados (reproducibles con la infra dev + API arriba):

```bash
# Atributos de cookie
curl -s -c jar -D headers -o /dev/null -X POST localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"…","password":"…"}'; grep -i set-cookie headers
# CSRF
curl -s -o /dev/null -w '%{http_code}\n' -b jar         -X POST localhost:3000/api/auth/refresh   # 403
curl -s -o /dev/null -w '%{http_code}\n' -b jar -H "x-csrf-token: <wl_csrf>" -X POST …/refresh     # 200
# Reuso: reenviar el wl_refresh ya rotado → 401 (y la familia queda revocada)
# Solo-hash en BD
printf '%s' "<refresh_en_claro>" | sha256sum   # == RefreshToken.tokenHash en Postgres
```

## 13. ¿Se cierra la sesión al cerrar la pestaña o el navegador?

**No.** Que el access token viva "en memoria" **no** significa que pierdas la sesión
al cerrar la pestaña. Hay dos piezas con persistencia distinta:

- **Access token** → memoria JS. Al cerrar la pestaña **se pierde** (deseable: nada
  sensible queda en disco).
- **Refresh token** → cookie `wl_refresh` emitida con **`Max-Age` = 30 días**, es decir
  una cookie **persistente** que **sobrevive** a cerrar la pestaña y el navegador.

Al reabrir la app, el bootstrap (sección 8) hace un `/auth/refresh` silencioso con esa
cookie y restaura la sesión **sin pedir credenciales**.

```
Cierras pestaña ─▶ access (memoria) se borra
                   refresh (cookie wl_refresh, 30 días) PERSISTE
Reabres app     ─▶ /auth/refresh con la cookie ─▶ access nuevo ─▶ sesión restaurada
```

**Sí hay que volver a iniciar sesión si:** pasaron >30 días sin uso (caduca la cookie),
hiciste **logout**, se **revocaron las sesiones** (p. ej. tras un reset de contraseña o
por detección de reuso del refresh), o el navegador está en incógnito / configurado para
**borrar cookies al cerrar**.

> En resumen: la *persistencia* de la sesión la da el **refresh en cookie** (larga vida),
> no el access en memoria (corta vida). Lo mejor de ambos: resistencia a XSS **y**
> comodidad de no re-loguear en cada visita.

## 14. Mapa de archivos

| Pieza | Archivo |
|---|---|
| Custodia del access en memoria | `apps/watchlog-web/src/lib/session-token.ts` |
| Cliente HTTP (Bearer, 401→refresh, CSRF) | `apps/watchlog-web/src/lib/api-client.ts` |
| Ciclo de vida (bootstrap + refresh proactivo) | `apps/watchlog-web/src/auth/AuthProvider.tsx` |
| Estado de sesión para la UI | `apps/watchlog-web/src/auth/auth-store.ts` |
| Orquestación de login/MFA/cambio | `apps/watchlog-api/src/auth/auth.service.ts` |
| Política de requerimiento de MFA (derivada) | `apps/watchlog-api/src/auth/mfa-requirement.service.ts` |
| Gate de enrolamiento forzado (backend) | `apps/watchlog-api/src/authz/mfa-enrollment.guard.ts` |
| Enrolamiento MFA self-service (UI) | `apps/watchlog-web/src/features/security/MfaEnrollFlow.tsx` |
| Gate de enrolamiento (UI, full-screen) | `apps/watchlog-web/src/features/auth/ForceMfaEnrollPage.tsx` |
| Emisión/rotación/revocación de tokens | `apps/watchlog-api/src/auth/token.service.ts` |
| Cookies (refresh httpOnly + CSRF) | `apps/watchlog-api/src/auth/auth.cookies.ts` |
| Validación del access (Bearer) | `apps/watchlog-api/src/authz/jwt-access.guard.ts` |
| Guard CSRF de doble envío | `apps/watchlog-api/src/auth/csrf.guard.ts` |
| Esquema de datos (Session/RefreshToken) | `apps/watchlog-api/prisma/schema.prisma` |

Ver también: `SECURITY.md` (políticas y endurecimiento), `DECISIONS.md` (por qué de
cada decisión), `DATA_MODEL.md` (entidades).
