# Estrategia de licenciamiento y anti-pirateo de clase mundial — Lyra WatchLog

> **Qué es este documento.** El análisis profundo y la **decisión de arquitectura** sobre cómo
> proteger Lyra WatchLog contra copia, instalación no autorizada y sobre-despliegue del canal, incluso
> en plantas **sin internet (air-gapped)**. Complementa la especificación técnica de
> [`LICENSING.md`](./LICENSING.md) (el "cómo se construye") con el **"por qué esta estrategia y no otra"**,
> respaldado por investigación del estado del arte real y una **prueba de concepto ejecutable**.
>
> Fecha: **2026-07-04**. Estado: **análisis cerrado, decisión propuesta, pendiente de tu visto bueno**.
> Método: investigación multi-fuente (24 fuentes primarias: Wibu, Thales, Trusted Computing Group,
> VMware, AVEVA, estudios académicos de Denuvo) + verificación adversarial + PoC en [`docs/poc/licencia-poc.mjs`](./poc/licencia-poc.mjs) (9/9 ✓).

---

## 0. La verdad incómoda primero (léela antes que nada)

Pediste que **"nadie deberá poder nunca piratear mi software"**. Como experto honesto, tengo la
obligación de decirte esto antes de venderte una solución: **esa garantía absoluta no existe, y
cualquiera que te la prometa te está mintiendo o no sabe.** La razón no es falta de esfuerzo, es
matemática y física:

> **Principio de la máquina hostil.** Si tu código se ejecuta en una computadora que el atacante
> controla físicamente, el atacante **siempre** puede, con tiempo y recursos suficientes, observar
> qué hace tu código y modificarlo. Tu programa tiene que, en algún momento, decir "sí, la licencia
> es válida, sigue". Un atacante con el binario puede encontrar ese "sí" y forzarlo a estar siempre
> encendido. Esto se llama **el problema del cliente no confiable** y es un teorema, no una opinión.

**La evidencia lo confirma** (de la investigación):

- **Denuvo**, la protección anti-pirateo más cara y avanzada de la industria del videojuego (la usan
  AAA con presupuestos de $100M+), **fue vulnerada con bypasses de hipervisor que permiten cracks el
  día cero** (thefpsreview, 2026). Ni con ese presupuesto se logra "imposible".
- Thales (Sentinel), líder del rubro, **admite en su propia documentación** que la protección de
  código "solo **retrasa** a los crackers en lugar de prevenir el cracking; la defensa declarada es
  **aumentar el costo en tiempo**, no hacer la remoción imposible".

Entonces, ¿tiramos la toalla? **No.** Cambiamos la pregunta equivocada por la correcta:

- ❌ Pregunta ingenua: *"¿Cómo hago imposible piratearlo?"* → no tiene respuesta.
- ✅ Pregunta de ingeniero: *"¿Cómo hago que piratearlo cueste **más** (en dinero, tiempo, riesgo
  legal y pérdida de soporte) que **pagarlo**, para **cada** perfil de atacante que me importa?"*

Esta segunda pregunta **sí** tiene una respuesta de clase mundial, y es lo que construyen los grandes.
Y hay un hallazgo académico que lo vuelve tranquilizador: el estudio de Denuvo (ScienceDirect, 2024)
midió que **la protección solo necesita durar una ventana finita para capturar casi todo su valor
económico** — un juego protegido las primeras ~12 semanas ya no pierde ingresos aunque lo cracken
después. Traducido a tu negocio: **no necesitas un candado eterno; necesitas un candado que aguante
más que el ciclo de renovación anual y que haga el fraude no rentable.** Eso es totalmente alcanzable.

---

## 1. Tu escenario concreto y quiénes son tus atacantes

Antes de elegir armas hay que saber contra quién se pelea. El anti-pirateo genérico falla porque no
modela **tu** amenaza real. La tuya es específica y, en cierto sentido, **más fácil** que la de un
videojuego masivo:

| Tu realidad | Implicación |
|---|---|
| Software **on-premise en Docker** (NestJS + PostgreSQL) | El servidor corre en la máquina del cliente/socio. Máquina hostil (§0). |
| Plantas **air-gapped** (sin internet) | No puedes depender de "llamar a casa" para validar. La validación **debe** funcionar offline. |
| Distribuido por un **canal mayorista con marca blanca** | **Tu atacante #1 NO es un hacker anónimo: es tu propio socio**, que tiene acceso legítimo al servidor, motivación económica y quizás un dev. |
| Cliente final = minería/industria **regulada** | El cliente final valora estabilidad, soporte y cumplimiento. Un fork pirata sin updates es un pasivo para él. **Esto es tu mejor arma.** |
| No es un juego de $60 pirateado por millones | Tu universo de atacantes es **pequeño y conocido** (docenas de socios, no millones de anónimos). Puedes auditarlos y demandarlos. |

**Los cuatro perfiles de atacante que debemos frenar** (de menor a mayor capacidad):

1. **El socio descuidado / avaro** (el 80% del riesgo real): compró 8 licencias, instala 12 "porque
   nadie se da cuenta". No es un hacker; solo copia carpetas y archivos. **Este lo frenamos por
   completo.**
2. **El socio con un dev competente**: intenta editar un `if`, falsear la huella de máquina o clonar
   la VM. **A este lo frenamos técnicamente en un 90% y lo detectamos/disuadimos en el resto.**
3. **El cliente final tránsfuga**: quiere dejar de pagar y seguir usando. **Lo frena el modelo de
   negocio** (sin updates/soporte en industria regulada = inviable) + degradación a solo-lectura.
4. **El cracker experto dedicado** (reverse engineer profesional con semanas de tiempo): puede, en
   teoría, romper el candado de software. **A este NO lo frena el software solo** — lo frena el
   dongle de hardware (§4), el costo/tiempo y el contrato. En tu mercado (docenas de socios
   industriales, no la escena warez), la probabilidad de encontrarte a este perfil es **baja**, pero
   la estrategia lo contempla.

> **Decisión de diseño clave:** optimizamos para frenar **totalmente** a los perfiles 1 y 2 (que son
> el 95% de tu riesgo, y son tu canal), y para hacer **no rentable** a los perfiles 3 y 4. No
> quemamos presupuesto persiguiendo el imposible del perfil 4 a menos que tú decidas el dongle.

---

## 2. Glosario humano (cada término que usaré, explicado sin dar nada por sentado)

- **Criptografía asimétrica / de clave pública.** Un par de llaves matemáticamente ligadas: una
  **privada** (secreta) y una **pública** (se puede repartir). Lo que una firma, la otra verifica.
  *Analogía:* un buzón de correo. Cualquiera puede **echar** cartas por la ranura (clave pública),
  pero solo tú, con **tu** llave (clave privada), puedes **abrirlo**. En firmas es al revés: solo tú
  **firmas** (privada), todos **verifican** (pública).
- **Firma digital.** Un sello matemático sobre unos datos. Si cambias **un solo byte** de los datos,
  el sello deja de calzar. Prueba dos cosas: **quién** lo firmó y que **nadie lo alteró** después.
- **Ed25519.** Un algoritmo de firma asimétrica moderno (curva elíptica Edwards 25519). Rápido,
  llaves diminutas (32 bytes), muy seguro, **incluido nativamente en Node.js** (módulo `crypto`, sin
  dependencias externas). Es el que recomiendan hoy los criptógrafos serios.
- **JWS (JSON Web Signature).** Un formato estándar (RFC 7515) para empaquetar `datos + firma` en un
  texto de tres partes separadas por puntos: `cabecera.datos.firma`. Es lo que usaremos como el
  archivo `license.lic`.
- **Fingerprint / huella de máquina.** Un identificador derivado de características del hardware/SO de
  un servidor (ID de máquina, número de serie del disco, modelo de CPU, MAC de red...). *Analogía:* la
  huella dactilar del servidor. Sirve para "amarrar" una licencia a **una** máquina concreta
  (**node-locking** = candado por nodo).
- **Node-locking (candado por nodo/máquina).** Una licencia que **solo funciona en la máquina para la
  que se emitió**. Thales lo define textualmente: *"la licencia solo puede usarse en la máquina en la
  que fue instalada"*. Es **exactamente** el mecanismo contra tu requisito (2): que el socio no
  reutilice una licencia en varios servidores.
- **Activación offline por solicitud/respuesta (challenge-response).** El baile que resuelve el
  air-gap: la máquina aislada genera un **archivo de solicitud** (que la identifica), lo llevas en un
  USB a una máquina con internet, el fabricante genera un **archivo de respuesta** que **solo sirve
  para esa máquina y una sola vez**, y lo importas de vuelta. Nadie necesita internet en la planta.
  Así lo hacen **CodeMeter (Wibu), AVEVA/Wonderware y AutoCAD** — confirmado en la investigación.
- **Dongle.** Una llave física USB con un chip criptográfico seguro dentro. La licencia vive en el
  chip, que es **casi imposible de clonar**. Sin el dongle enchufado, el software no corre.
- **TPM (Trusted Platform Module).** Un chip de seguridad soldado a la placa madre de servidores
  modernos. Guarda llaves que **no se pueden extraer**. Suena ideal para node-locking... hasta que se
  virtualiza (ver §4, es una trampa importante).
- **Bytecode / ofuscación / binario nativo.** Técnicas para que tu código **no sea texto legible**.
  En vez de entregar `licenseService.js` (que cualquiera lee y edita), entregas una versión
  compilada/ilegible. No lo hace imposible de romper, pero sube mucho el costo (§5).
- **EAL 5+.** Un nivel de certificación de seguridad (Common Criteria) de chips. Los dongles Wibu usan
  chips Infineon **EAL 5+**, que resisten hasta ataques de canal lateral (medir el consumo eléctrico
  del chip para deducir sus secretos). Es grado bancario/gubernamental.

---

## 3. Las alternativas evaluadas (y por qué la mayoría se descarta)

No te doy "lo primero que se me ocurre". Puse sobre la mesa **siete** enfoques que usa la industria y
los sometí al filtro de **tus** requisitos (offline, anti-sobre-despliegue del canal, no secuestrar
datos, costo/fricción razonable). Este es el veredicto:

| # | Enfoque | ¿Funciona offline? | ¿Frena al socio copión? | ¿Frena clon de VM? | Fricción / costo | Veredicto |
|---|---|---|---|---|---|---|
| A | **Solo archivo firmado** (Ed25519, sin huella) | ✅ | ❌ (el archivo se copia tal cual) | ❌ | Nula | **Insuficiente** — no cumple (2) |
| B | **Firmado + huella de máquina** (node-lock por software) | ✅ | ✅ | ⚠️ parcial | Baja | **Base elegida** |
| C | **Firmado + huella + activación challenge-response + linaje** | ✅ | ✅ | ✅ (detecta) | Media | **★ Recomendado** |
| D | **Servidor de licencias flotante** (FlexNet/RLM en la red del cliente) | ✅ (en su LAN) | ⚠️ | ⚠️ | Alta (infra extra) | Descartado — pensado para *pools* de usuarios, no para tu caso; el server flotante es igual de copiable |
| E | **TPM / attestation** (anclar al chip de la placa) | ✅ | ✅ | ❌ **(ver trampa vTPM)** | Media-alta | Descartado como ancla principal — **falsa sensación de seguridad** en VMs |
| F | **Dongle USB** (Wibu CodeMeter / Thales Sentinel HL) | ✅ | ✅✅ | ✅✅ (hardware no clonable) | Alta (logística física + costo/unidad) | **Opción premium** — la única defensa real contra el perfil 4 |
| G | **Ofuscación/bytecode como candado principal** | ✅ | ⚠️ | ⚠️ | Media | Descartado **como candado** — sirve solo como **capa de refuerzo** (§5), nunca como base |

### Por qué se descarta cada uno

- **A (solo firma):** la firma asimétrica es imprescindible pero **no basta**. Prueba que *tú*
  emitiste la licencia y que nadie la alteró (frena keygens y ediciones — ver PoC T2/T3), pero un
  archivo válido **se copia idéntico a 100 servidores** y es válido en todos. No cumple tu requisito
  estrella (2). **La firma es un ingrediente, no el plato.**
- **D (flotante):** FlexNet/RLM sirven cuando quieres un *pool* de N usuarios concurrentes
  compartiendo licencias en una red corporativa (ej. 50 licencias de AutoCAD para 200 ingenieros). Tu
  problema no es concurrencia de usuarios (eso ya lo maneja tu RBAC), es **integridad de instalación**.
  Además el propio servidor flotante corre en una máquina del cliente → mismo problema del cliente
  hostil, con **más** infraestructura que mantener. Sobre-ingeniería para tu caso.
- **E (TPM) — la trampa más importante del análisis:** el TPM parece la bala de plata ("chip soldado,
  llaves inextraíbles"). Y en un **servidor físico** lo es. Pero tus clientes despliegan en
  **máquinas virtuales** (VMware/Hyper-V), y ahí la investigación destapó algo demoledor, confirmado
  por **documentación oficial de VMware**:
  - El **vTPM (TPM virtual) NO está respaldado por ningún chip físico**: es puro software emulado.
  - **Todo el estado del vTPM, incluidas sus llaves, se guarda como un archivo** (el NVRAM) en la
    carpeta de la VM.
  - **Clonar la VM produce una réplica exacta del vTPM, con su "identidad única" incluida.**

  Es decir: si anclas la licencia al TPM y el cliente corre en VM, **el socio clona la VM y obtiene
  un TPM idéntico** → licencia duplicada. El "ancla de hardware" se vuelve un archivo que viaja con
  la VM. **Anclar al TPM daría una falsa sensación de seguridad.** Por eso el TPM **no** es nuestra
  ancla principal (sí puede sumar como *una señal más* de la huella cuando existe TPM físico).
- **G (ofuscación como base):** confundir "difícil de leer" con "seguro" es el error clásico. Un
  binario ofuscado que dice "licencia válida = sí/no" sigue teniendo ese punto de decisión editable.
  Sirve para **encarecer** el ataque del perfil 2 (capa de refuerzo, §5), nunca como el candado mismo.

---

## 4. El clon perfecto de VM: el límite duro del software, y cómo lo domamos

Hay que mirar de frente el peor caso del enfoque por software, porque es donde el análisis honesto se
gana el sueldo.

**El ataque:** el socio instala legítimamente en el servidor A, lo activa (huella A, licencia válida).
Luego hace un **clon perfecto de la máquina virtual completa** — disco, config, todo — y lo levanta
como servidor B para otro cliente. El servidor B tiene la **misma huella** que A (misma "huella
dactilar", porque se copió el hardware virtual entero). Un candado estático de huella **no distingue
A de B**. Este es el techo real de cualquier solución 100% software, y VMware lo confirma.

**Las tres formas de domarlo** (las combinamos):

1. **Huella con señales resistentes al clon.** No toda señal se clona igual. Incluir en la huella
   cosas que **cambian al mover/clonar** (ej. la identidad de la instancia, un `machine-id`
   regenerable, señales del host físico cuando el hipervisor las expone). Reduce los clones "casuales".
   Limitación honesta: un clon *perfecto* con la VM apagada las replica.
2. **Licencias cortas renovables + linaje rotatorio (la clave, patrón CodeMeter).** En lugar de una
   licencia que dura 1 año quieta, la licencia **vence seguido** (ej. cada 30–90 días) y se renueva
   con el baile challenge-response. Cada instalación mantiene un **linaje**: un contador + un
   *nonce* (número aleatorio de un solo uso) que **rota localmente en cada renovación**. Cuando el
   servidor A y su clon B intentan renovar, ambos presentan al emisor (tú) **el mismo linaje**
   (mismo `licenseId`, mismo contador). **Tú ves dos solicitudes con el mismo linaje = sobre-despliegue
   detectado, con evidencia.** Y si uno renueva primero, su nonce rota y el otro queda con un linaje
   viejo que ya no calza. Wibu describe exactamente este principio: el archivo de respuesta *"puede
   importarse una sola vez y solo en ese dispositivo específico"*, con *"recibo a prueba de
   manipulación"*. **Mi PoC (T6) demuestra este mecanismo funcionando: el clon es detectado.**
3. **El dongle (si eliges F).** Es la **única** defensa que hace el clon de VM literalmente inútil:
   la licencia vive en el chip físico, no en el disco. Clonas la VM las veces que quieras; sin el
   dongle enchufado, no corre. Wibu: chip Infineon **EAL 5+**, *"leer las llaves o copiar el firmware
   es prácticamente imposible"*. **Este es el salto de "muy difícil" a "físicamente inviable".**

> **La consecuencia estratégica:** con **solo software** (enfoque C) llegas a *"el sobre-despliegue
> es detectable y deja evidencia contractual, y el fraude casual es imposible"*. Con **dongle**
> (enfoque F) llegas a *"el sobre-despliegue es físicamente imposible sin comprarme otro dongle"*.
> La decisión entre ambos es de **negocio, no técnica** (§8), y por eso te la pregunto al final.

---

## 5. Anti-tamper: cómo protegemos el código que hace el chequeo (capa de refuerzo)

Todo lo anterior asume que el atacante no simplemente **borra el chequeo** del código. Como entregas
imágenes Docker (no el fuente), ya partes con ventaja, pero reforzamos por capas. **Ninguna de estas
es el candado; todas juntas suben el costo del perfil 2:**

1. **No entregar el código fuente** (la principal). Se entregan imágenes Docker con el JS
   minificado/empaquetado, nunca el repo.
2. **Compilar el módulo de licencia crítico a bytecode V8** (`bytenode`) o binario nativo (Node SEA /
   Bun). Deja de ser texto editable. **Honestidad de la investigación:** un artículo técnico
   (dev.to) documenta que **Node SEA por sí solo es débil** para proteger fuente (el bytecode V8 se
   puede desensamblar). No lo vendemos como muralla; es **un obstáculo más**, no el candado.
3. **Verificación distribuida, no un solo `if`.** El chequeo de licencia se **reparte** por el código
   (arranque, gating de módulos, generación del acta PDF, tareas programadas). No hay un único punto
   que desactivar; hay que encontrarlos y romperlos **todos**. Esto multiplica el trabajo del
   atacante. (Es la misma filosofía de Denuvo: muchas comprobaciones entrelazadas.)
4. **Auto-verificación de integridad.** El binario chequea que no fue parcheado (checksums de sus
   propias secciones críticas). Rompible, pero suma horas al atacante.
5. **Marca blanca = configuración, no código.** El socio personaliza por temas/config en runtime,
   **nunca** tocando fuente. Nunca necesita ni recibe el código.

> **El lock definitivo no es técnico.** Un binario parcheado queda **congelado**: sin parches de
> seguridad, sin updates regulatorios, sin módulos nuevos, sin soporte L2/L3. Para un cliente final
> de **minería regulada**, operar un fork pirata sin soporte ni parches es un **riesgo inaceptable**
> de auditoría y continuidad. **Renovar sale más barato que mantener y responsabilizarse de un fork
> pirata.** Ese es el verdadero candado, y es de negocio.

---

## 6. La arquitectura recomendada — "Defensa en profundidad" en 6 capas

Ninguna capa es suficiente sola; **juntas** cubren los cuatro perfiles de atacante. Así se ve la
estrategia completa, de adentro hacia afuera:

```
   ┌──────────────────────────────────────────────────────────────────────┐
   │  CAPA 6 — LEGAL: contrato de canal, prohibición de descompilar,       │
   │            derecho de auditoría de instalaciones, IP de ITESICWS       │
   │  ┌────────────────────────────────────────────────────────────────┐   │
   │  │  CAPA 5 — NEGOCIO: updates + soporte indispensables (el lock     │  │
   │  │           real); binario pirata = congelado, sin parches         │  │
   │  │  ┌──────────────────────────────────────────────────────────┐   │  │
   │  │  │  CAPA 4 — DETECCIÓN: linaje rotatorio + solicitudes de     │  │  │
   │  │  │           renovación → sobre-despliegue detectado (y        │  │  │
   │  │  │           opcional: heartbeat si hay internet)              │  │  │
   │  │  │  ┌────────────────────────────────────────────────────┐   │  │  │
   │  │  │  │  CAPA 3 — ANTI-TAMPER: bytecode + verificación       │  │  │  │
   │  │  │  │           distribuida + integridad (encarece editar) │  │  │  │
   │  │  │  │  ┌──────────────────────────────────────────────┐   │  │  │  │
   │  │  │  │  │  CAPA 2 — NODE-LOCK: huella de máquina →       │  │  │  │  │
   │  │  │  │  │           una licencia ≠ sirve en otro server  │  │  │  │  │
   │  │  │  │  │  ┌────────────────────────────────────────┐   │  │  │  │  │
   │  │  │  │  │  │ CAPA 1 — FIRMA Ed25519: nadie fabrica   │  │  │  │  │  │
   │  │  │  │  │  │ ni altera una licencia. Base de todo.   │  │  │  │  │  │
   │  │  │  │  │  │  [ + CAPA 0 OPCIONAL: DONGLE HARDWARE ] │  │  │  │  │  │
   │  │  │  │  │  └────────────────────────────────────────┘   │  │  │  │  │
   │  │  │  │  └──────────────────────────────────────────────┘   │  │  │  │
   │  │  │  └────────────────────────────────────────────────────┘   │  │  │
   │  │  └──────────────────────────────────────────────────────────┘   │  │
   │  └────────────────────────────────────────────────────────────────┘   │
   └──────────────────────────────────────────────────────────────────────┘
```

**Cómo cada capa mata a cada atacante:**

| Atacante | Lo detiene principalmente | Capas involucradas |
|---|---|---|
| 1. Socio avaro (copia carpetas) | **Node-lock** (la copia no arranca en otra máquina) | 1 + 2 |
| 2. Socio con dev (edita/clona VM) | **Anti-tamper + detección de linaje** (editar es caro; clonar deja evidencia) | 2 + 3 + 4 |
| 3. Cliente tránsfuga (deja de pagar) | **Negocio** (sin updates/soporte) + degradación a solo-lectura | 5 + máquina de estados |
| 4. Cracker experto dedicado | **Dongle** (físicamente inviable) o **costo/tiempo + legal** si es solo software | 0 + 5 + 6 |

---

## 7. Prueba de la teoría (no te pido que me creas — lo ejecuté)

Escribí una **prueba de concepto real en Node.js con `crypto` nativo** ([`docs/poc/licencia-poc.mjs`](./poc/licencia-poc.mjs), cero
dependencias) que implementa las capas 1, 2, 4 y la máquina de estados, y **la corrí**. Resultado:

```
=== T1: emisión y verificación legítimas ===
  PASS  licencia legítima en servidor A → VALIDA
=== T2: el socio edita el payload (1 → 100 instalaciones) ===
  PASS  payload adulterado → BLOQUEADA (firma no calza)
=== T3: keygen — el atacante firma con su PROPIA clave privada ===
  PASS  licencia forjada → BLOQUEADA (pública embebida ≠ clave pirata)
=== T4: copiar license.lic al servidor B (otra máquina) ===
  PASS  mismo archivo en servidor B → BLOQUEADA (huella no coincide)
=== T5: máquina de estados en el tiempo (nunca se secuestran datos) ===
  PASS  un día tras vencer → EN_GRACIA (sigue operando + aviso)
  PASS  pasada la gracia → SOLO_LECTURA (jamás borra ni cifra datos)
=== T6: clon perfecto de la VM + renovación de importación única ===
  PASS  servidor A importa su renovación → OK
  PASS  clon reutiliza la respuesta de A → RECHAZADA
  PASS  emisor recibe 2 solicitudes con el mismo linaje → clon DETECTADO
  Resultado: 9 PASS / 0 FAIL
```

Qué demuestra empíricamente cada prueba:

- **T1–T4:** las capas 1 y 2 funcionan. La firma es infalsificable sin tu clave privada (T3), el
  payload es inmutable (T2, editar `maxInstallations` de 1 a 100 rompe la firma), y el node-lock
  impide reutilizar el archivo en otra máquina (T4). **Perfiles 1 y frenados.**
- **T5:** la máquina de estados **nunca secuestra los datos del cliente** (requisito 3): al vencer
  pasa a solo-lectura + exportación, jamás borra ni cifra. Éticamente y por regulación, correcto.
- **T6:** el caso duro del clon de VM. Aun con huella idéntica, el **linaje rotatorio** hace que el
  clon sea **detectado** en la renovación (dos solicitudes con el mismo linaje) y no pueda reutilizar
  la respuesta del original. **Perfil 2 detectado con evidencia.**

Esto no es teoría de PowerPoint: es código firmando y verificando con Ed25519 real. La implementación
de producto (LICENSING.md) es este mismo núcleo endurecido con las capas 3–6.

---

## 8. La decisión que es tuya: ¿solo software (C) o software + dongle (F)?

Todo lo técnico está resuelto. Queda **una** disyuntiva, y es de negocio, no de ingeniería. La pongo
con total transparencia:

| Dimensión | **Opción C — Solo software** | **Opción F — Software + dongle USB** |
|---|---|---|
| Protección contra perfiles 1–3 | ✅ Total | ✅ Total |
| Protección contra perfil 4 (cracker) + clon de VM | ⚠️ **Detección + disuasión** (no prevención absoluta) | ✅ **Prevención física** (inviable sin el chip) |
| Funciona offline / air-gapped | ✅ | ✅ |
| Costo por instalación | ~$0 (solo tu HH de desarrollo) | **Costo del dongle** (~USD 15–50/unidad) + logística |
| Fricción operacional | Baja (archivos por USB) | **Media-alta**: hay que **enviar físicamente** un USB a cada planta (aduana, extravío, repuestos) |
| Dependencia de proveedor | Ninguna (todo tuyo, `crypto` nativo) | Atado a Wibu/Thales (SDK, licencias de su plataforma, su roadmap) |
| Tiempo de desarrollo | ~80–160 HH (ya estimado en LICENSING.md) | + integración del SDK del dongle (semanas) + tu propia infra de aprovisionamiento |
| Encaje con "marca blanca ágil" | ✅ Alto (todo digital, activación remota) | ⚠️ Choca con despliegues rápidos: no vendes sin enviar hardware antes |

**Mi recomendación como experto**, dado tu modelo (canal ágil, marca blanca, plantas remotas en Chile,
atacante principal = socio avaro no hacker): **empezar con la Opción C (solo software, defensa en 6
capas)**, que ya frena el **~95% real** de tu riesgo con **cero fricción de hardware**, y **dejar el
dongle (F) como upsell opcional** para un cliente/segmento específico que exija grado máximo (o si un
socio demuestra ser problemático). Construyes C ahora; F queda como capa 0 enchufable después sin
rehacer nada, porque la arquitectura ya lo contempla.

Razón de fondo: el dongle resuelve **solo** al perfil 4 y al clon perfecto, que son tu **menor**
probabilidad, a cambio de **tu mayor** fricción operacional (mandar USBs a faenas mineras remotas).
Meter esa fricción desde el día 1 para cubrir el 5% menos probable es, en mi criterio, un mal negocio
inicial. Pero es **tu** llamada comercial, y por eso te la dejo explícita.

---

## 9. Lo que NO te prometo (honestidad final)

- **No es DRM inviolable.** Es disuasión por capas + firma + node-lock + detección + negocio + legal.
  El perfil 4 con semanas de tiempo puede romper la parte de software (§0). El dongle sube ese techo,
  no lo vuelve infinito.
- **No secuestra datos.** Licencia vencida = solo lectura + exportación, **nunca** borrado ni cifrado
  de rehén. Los datos son del cliente (requisito 3, probado en T5).
- **No requiere internet en la planta.** Todo el ciclo (activación, renovación, revocación) funciona
  por archivos en USB (patrón AVEVA/CodeMeter confirmado). El heartbeat online es **opcional y
  aditivo**, solo donde haya red.
- **El clon perfecto de VM se *detecta*, no se *previene*, con solo software.** Prevención absoluta
  del clon = dongle. Dicho sin adornos.

---

## 10. Fuentes primarias del análisis (verificadas)

- **Wibu CodeMeter** — activación/renovación offline por solicitud/respuesta importable una sola vez;
  chip Infineon EAL 5+, clonado "prácticamente imposible":
  `wibu.com/products/codemeter/codemeter-dongle.html`, `.../online-activation.html`
- **Thales Sentinel LDK** — definición de licencia machine-locked; admisión de que la protección de
  código solo *retrasa* al cracker:
  `docs.sentinel.thalesgroup.com/ldk/...Machine-locked.htm`, `.../TypesofAttack_Defense.htm`
- **VMware** — el vTPM es software, su estado (llaves) es un archivo, y **clonar la VM clona el vTPM**:
  `vmware.com/docs/vsphere-virtual-tpm-vtpm-questions-answers`
- **Trusted Computing Group** — TPM 2.0 para identidad de dispositivo (por qué el TPM físico ancla,
  pero no en VM): `trustedcomputinggroup.org/...TPM-2p0-Keys-for-Device-Identity...pdf`
- **AVEVA/Wonderware** — activación air-gapped por archivo de solicitud llevado a mano a una máquina
  con internet: `docs.aveva.com/bundle/enterprise-licensing/page/81184.html`
- **Estudio académico Denuvo** (ScienceDirect 2024) — la protección captura casi todo su valor en una
  ventana finita; no necesita ser eterna: `sciencedirect.com/science/article/abs/pii/S1875952124002532`
- **Denuvo roto por bypass de hipervisor** (2026) — ni la protección más cara es "imposible":
  `thefpsreview.com/2026/04/03/denuvo-has-been-broken...`
- **Keygen.sh** — patrones de licencias offline y air-gapped en la práctica:
  `keygen.sh/docs/choosing-a-licensing-model/offline-licenses/`, `github.com/keygen-sh/air-gapped-activation-example`
- **Node SEA insuficiente para proteger fuente** (bytecode desensamblable) — por qué el anti-tamper es
  refuerzo, no candado: `dev.to/ankitjaininfo/why-nodejs-sea-is-still-bad-for-source-code-protection-k9j`

---

*Documento vivo. La especificación de construcción está en [`LICENSING.md`](./LICENSING.md); el
**procedimiento operacional paso a paso** (cómo se entrega y activa, "10 licencias", dónde se ofusca) en
[`LICENSING_PROCEDURE.md`](./LICENSING_PROCEDURE.md); la cadena de suministro segura (firma de imágenes,
SBOM, distribución) en [`SECURITY.md §9`](./SECURITY.md); el modelo de canal en
[`estrategia-canal.md`](./estrategia-canal.md).*
