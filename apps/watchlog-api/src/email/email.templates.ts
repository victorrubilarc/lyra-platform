import type { EmailMessage } from "./email.service";

/**
 * Plantillas de correo de la recuperación de contraseña. Son funciones puras
 * (sin estado ni dependencias) para poder probarlas y para que el contenido no
 * dependa del transporte. Estética sobria coherente con la marca Lyra WatchLog,
 * con estilos en línea (los clientes de correo no soportan hojas externas).
 *
 * IMPORTANTE: el enlace lleva el token; este texto solo viaja por correo y nunca
 * se registra en logs.
 */

const BRAND = "Lyra WatchLog";
const ACCENT = "#6366F1";
const BG = "#06061A";
const SURFACE = "#0C1124";
const TEXT = "#E7EAF3";
const MUTED = "#9AA3B8";

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BG};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${SURFACE};border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;">
        <tr><td style="height:4px;background:linear-gradient(135deg,#6366F1,#06B6D4);"></td></tr>
        <tr><td style="padding:32px 36px 8px;">
          <div style="font-family:'Sora',Arial,sans-serif;font-weight:800;font-size:20px;color:${TEXT};letter-spacing:-0.01em;">
            Lyra <span style="color:${ACCENT};">WatchLog</span>
          </div>
          <div style="font-family:Arial,sans-serif;font-size:11px;letter-spacing:1.3px;text-transform:uppercase;color:${MUTED};margin-top:4px;">Bitácoras operacionales</div>
        </td></tr>
        <tr><td style="padding:16px 36px 36px;font-family:Arial,sans-serif;color:${TEXT};">
          <h1 style="font-family:'Sora',Arial,sans-serif;font-size:20px;font-weight:700;margin:0 0 16px;color:${TEXT};">${title}</h1>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:20px 36px;border-top:1px solid rgba(255,255,255,0.08);font-family:Arial,sans-serif;font-size:12px;color:${MUTED};">
          Este es un mensaje automático de ${BRAND}. No respondas a este correo.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr><td style="border-radius:10px;background:linear-gradient(135deg,#6366F1,#06B6D4);">
    <a href="${href}" style="display:inline-block;padding:13px 28px;font-family:'Sora',Arial,sans-serif;font-weight:600;font-size:15px;color:#ffffff;text-decoration:none;border-radius:10px;">${label}</a>
  </td></tr></table>`;
}

/** Correo con el enlace de restablecimiento. `ttlMinutes` = vida del token. */
export function buildResetEmail(params: {
  to: string;
  resetUrl: string;
  ttlMinutes: number;
}): EmailMessage {
  const { to, resetUrl, ttlMinutes } = params;
  const subject = `${BRAND} · Restablece tu contraseña`;
  const html = shell(
    "Restablece tu contraseña",
    `<p style="font-size:14px;line-height:1.6;color:${TEXT};margin:0 0 16px;">
       Recibimos una solicitud para restablecer la contraseña de tu cuenta. Haz clic en el botón para definir una nueva. El enlace caduca en <strong>${ttlMinutes} minutos</strong> y solo puede usarse una vez.
     </p>
     ${button(resetUrl, "Restablecer contraseña")}
     <p style="font-size:13px;line-height:1.6;color:${MUTED};margin:0 0 12px;">
       Si el botón no funciona, copia y pega esta dirección en tu navegador:
     </p>
     <p style="font-size:12px;line-height:1.5;word-break:break-all;color:${ACCENT};margin:0 0 20px;">${resetUrl}</p>
     <p style="font-size:13px;line-height:1.6;color:${MUTED};margin:0;">
       Si no solicitaste este cambio, ignora este correo: tu contraseña no se modificará. Por seguridad, considera avisar al administrador de tu organización.
     </p>`,
  );
  const text = `Restablece tu contraseña — ${BRAND}

Recibimos una solicitud para restablecer la contraseña de tu cuenta.
Abre el siguiente enlace para definir una nueva (caduca en ${ttlMinutes} minutos y es de un solo uso):

${resetUrl}

Si no solicitaste este cambio, ignora este correo: tu contraseña no se modificará.`;
  return { to, subject, text, html };
}

/** Notificación de seguridad tras un cambio de contraseña exitoso. */
export function buildPasswordChangedEmail(params: { to: string }): EmailMessage {
  const { to } = params;
  const subject = `${BRAND} · Tu contraseña fue cambiada`;
  const html = shell(
    "Tu contraseña fue cambiada",
    `<p style="font-size:14px;line-height:1.6;color:${TEXT};margin:0 0 16px;">
       Te confirmamos que la contraseña de tu cuenta se cambió correctamente. Por seguridad, se cerraron todas tus sesiones activas.
     </p>
     <p style="font-size:13px;line-height:1.6;color:${MUTED};margin:0;">
       Si <strong>no</strong> fuiste tú, contacta de inmediato al administrador de tu organización: tu cuenta podría estar comprometida.
     </p>`,
  );
  const text = `Tu contraseña fue cambiada — ${BRAND}

Te confirmamos que la contraseña de tu cuenta se cambió correctamente.
Por seguridad, se cerraron todas tus sesiones activas.

Si NO fuiste tú, contacta de inmediato al administrador de tu organización.`;
  return { to, subject, text, html };
}
