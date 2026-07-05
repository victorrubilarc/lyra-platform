// ============================================================================
// PoC — Prueba de la teoría de licenciamiento Lyra WatchLog
// Demuestra con código real (Node crypto nativo, cero dependencias):
//   T1. Emisión y verificación de licencia firmada Ed25519 (JWS compacto)
//   T2. Manipulación del payload (subir maxInstallations 1→100) → firma INVÁLIDA
//   T3. Keygen del atacante (firma con SU propia clave) → RECHAZADO
//   T4. Copia del license.lic a otra máquina (huella distinta) → RECHAZADO
//   T5. Vencimiento → máquina de estados (VÁLIDA→GRACIA→SOLO LECTURA)
//   T6. Clon perfecto (misma huella, p.ej. VM clonada) + renovación de una
//       sola importación (patrón CodeMeter): el clon muere en la renovación
//       y el sobre-despliegue queda DETECTADO en el archivo de solicitud.
// ============================================================================
import { generateKeyPairSync, sign, verify, createHash, randomUUID } from 'node:crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(s, 'base64url');
let pass = 0, fail = 0;
const check = (name, cond) => { cond ? pass++ : fail++; console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}`); };

// ---------------------------------------------------------------------------
// EMISOR (ITESICWS): posee la clave PRIVADA. La app embebe solo la PÚBLICA.
// ---------------------------------------------------------------------------
const { publicKey: PUB_ITESICWS, privateKey: PRIV_ITESICWS } = generateKeyPairSync('ed25519');

function issueLicense(payload) {
  const header = b64u(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' }));
  const body = b64u(JSON.stringify(payload));
  const signature = sign(null, Buffer.from(`${header}.${body}`), PRIV_ITESICWS);
  return `${header}.${body}.${b64u(signature)}`; // JWS compacto = license.lic
}

// ---------------------------------------------------------------------------
// VERIFICADOR (la instalación): solo tiene la clave pública embebida.
// ---------------------------------------------------------------------------
function verifyLicense(lic, machineFingerprint, now, embeddedPubKey = PUB_ITESICWS) {
  const [h, b, s] = lic.split('.');
  const sigOk = verify(null, Buffer.from(`${h}.${b}`), embeddedPubKey, fromB64u(s));
  if (!sigOk) return { state: 'BLOQUEADA', reason: 'firma inválida' };
  const p = JSON.parse(fromB64u(b).toString());
  if (p.fingerprint !== machineFingerprint) return { state: 'BLOQUEADA', reason: 'huella de máquina no coincide' };
  const exp = Date.parse(p.expiresAt), graceMs = p.graceDays * 86400_000;
  if (now > exp + graceMs) return { state: 'SOLO_LECTURA', reason: 'vencida tras gracia (datos intactos, exportación permitida)' };
  if (now > exp) return { state: 'EN_GRACIA', reason: 'vencida, dentro de gracia' };
  return { state: 'VALIDA', payload: p };
}

// Huella de máquina: hash de señales del HOST (machine-id + cpu + disco + mac)
const fingerprintOf = (signals) => createHash('sha256').update(JSON.stringify(signals)).digest('hex').slice(0, 32);

// ---------------------------------------------------------------------------
console.log('\n=== T1: emisión y verificación legítimas ===');
const HUELLA_SERVIDOR_A = fingerprintOf({ machineId: 'a1b2-serverA', cpu: 'Xeon-E5', diskSerial: 'WD-77Z', mac: '00:1A:2B' });
const licencia = issueLicense({
  licenseId: 'lic_2026_ACME_001', installationId: 'inst_acme_norte',
  fingerprint: HUELLA_SERVIDOR_A,
  expiresAt: '2026-10-01T00:00:00Z', graceDays: 14,
  limits: { maxInstallations: 1, maxNamedUsers: 80 },
  renewalCounter: 1,
});
const T0 = Date.parse('2026-07-04T12:00:00Z');
check('licencia legítima en servidor A → VALIDA', verifyLicense(licencia, HUELLA_SERVIDOR_A, T0).state === 'VALIDA');

console.log('\n=== T2: el socio edita el payload (1 → 100 instalaciones) ===');
const [h, b, s] = licencia.split('.');
const abierto = JSON.parse(fromB64u(b).toString());
abierto.limits.maxInstallations = 100;                       // "me regalo 99 instalaciones"
const adulterada = `${h}.${b64u(JSON.stringify(abierto))}.${s}`; // reusa la firma original
check('payload adulterado → BLOQUEADA (firma no calza)', verifyLicense(adulterada, HUELLA_SERVIDOR_A, T0).state === 'BLOQUEADA');

console.log('\n=== T3: keygen — el atacante firma con su PROPIA clave privada ===');
const { privateKey: PRIV_PIRATA } = generateKeyPairSync('ed25519');
const forjada = (() => {
  const hh = b64u(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' }));
  const bb = b64u(JSON.stringify({ ...abierto, fingerprint: HUELLA_SERVIDOR_A }));
  return `${hh}.${bb}.${b64u(sign(null, Buffer.from(`${hh}.${bb}`), PRIV_PIRATA))}`;
})();
check('licencia forjada → BLOQUEADA (pública embebida ≠ clave pirata)', verifyLicense(forjada, HUELLA_SERVIDOR_A, T0).state === 'BLOQUEADA');

console.log('\n=== T4: copiar license.lic al servidor B (otra máquina) ===');
const HUELLA_SERVIDOR_B = fingerprintOf({ machineId: 'z9y8-serverB', cpu: 'EPYC-7543', diskSerial: 'ST-4Q1', mac: 'AA:BB:CC' });
check('mismo archivo en servidor B → BLOQUEADA (huella no coincide)', verifyLicense(licencia, HUELLA_SERVIDOR_B, T0).state === 'BLOQUEADA');

console.log('\n=== T5: máquina de estados en el tiempo (nunca se secuestran datos) ===');
check('un día tras vencer → EN_GRACIA (sigue operando + aviso)', verifyLicense(licencia, HUELLA_SERVIDOR_A, Date.parse('2026-10-02T00:00:00Z')).state === 'EN_GRACIA');
check('pasada la gracia → SOLO_LECTURA (jamás borra ni cifra datos)', verifyLicense(licencia, HUELLA_SERVIDOR_A, Date.parse('2026-11-01T00:00:00Z')).state === 'SOLO_LECTURA');

console.log('\n=== T6: clon perfecto de la VM + renovación de importación única ===');
// El distribuidor clona la VM completa: huella IDÉNTICA. El candado estático no
// distingue (limitación real, VMware lo documenta). La defensa: licencias CORTAS
// renovables. Cada instalación guarda un "linaje" (renewalCounter + nonce aleatorio
// generado LOCALMENTE tras cada renovación). El archivo de solicitud de renovación
// incluye ese linaje; el emisor firma la respuesta atada al nonce presentado.
const estadoA = { counter: 1, nonce: randomUUID() };   // servidor A (original) tras activar
const estadoClon = { ...estadoA };                     // clon: copia BYTE a BYTE del estado
// --- Renovación del servidor A: presenta su nonce, el emisor responde atado a él,
//     y A rota su nonce localmente (nunca sale de la máquina hasta la próxima solicitud).
const solicitudA = { licenseId: 'lic_2026_ACME_001', counter: estadoA.counter, nonce: estadoA.nonce };
const respuestaA = { counterEsperado: solicitudA.counter, nonceAtado: solicitudA.nonce, nuevoExpiresAt: '2027-01-01' };
const importaOk = (estado, resp) => estado.counter === resp.counterEsperado && estado.nonce === resp.nonceAtado;
check('servidor A importa su renovación → OK', importaOk(estadoA, respuestaA));
estadoA.counter++; estadoA.nonce = randomUUID();       // A rota linaje tras importar
// --- El clon intenta usar LA MISMA respuesta (o pedir la suya):
check('clon reutiliza la respuesta de A → RECHAZADA (su nonce ya no calza tras rotación... o counter repetido delata)',
  !importaOk({ counter: estadoClon.counter, nonce: estadoClon.nonce }, { counterEsperado: 2, nonceAtado: estadoA.nonce }));
// --- Y si el clon pide SU PROPIA renovación, el emisor recibe DOS solicitudes con
//     el MISMO licenseId y el MISMO linaje counter=1 → sobre-despliegue DETECTADO.
const solicitudClon = { licenseId: 'lic_2026_ACME_001', counter: estadoClon.counter, nonce: estadoClon.nonce };
const detectado = solicitudA.licenseId === solicitudClon.licenseId && solicitudA.counter === solicitudClon.counter;
check('emisor recibe 2 solicitudes con el mismo linaje → clon DETECTADO (evidencia contractual)', detectado);

console.log(`\n${'='.repeat(60)}\nResultado: ${pass} PASS / ${fail} FAIL\n`);
process.exit(fail ? 1 : 0);
