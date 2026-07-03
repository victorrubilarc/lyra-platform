/**
 * Plantillas de mensaje POR DEFECTO (Bloque N). Una por evento (locale es-CL, canal
 * EMAIL). Son `isSystem: true`: el admin las edita pero no las borra. Solo usan
 * variables `{{...}}` whitelisteadas por su evento (ver NOTIFICATION_EVENTS). El
 * HTML es premium pero SOBRIO (los clientes de correo no rinden el workspace): se
 * usa el acento de marca en el encabezado y el botón, estilos inline.
 */

export interface NotificationTemplateSeed {
  eventKey: string;
  locale: string;
  channel: "EMAIL";
  subject: string;
  bodyText: string;
  bodyHtml: string;
}

/** Envuelve el cuerpo en una tarjeta de correo con identidad Lyra (estilos inline). */
function htmlShell(title: string, intro: string, rows: Array<[string, string]>, cta?: { label: string; url: string }): string {
  const tableRows = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#6B7280;font-size:13px;white-space:nowrap">${k}</td>` +
        `<td style="padding:6px 0;color:#111827;font-size:13px;font-weight:600">${v}</td></tr>`,
    )
    .join("");
  const button = cta
    ? `<tr><td style="padding-top:20px"><a href="${cta.url}" style="display:inline-block;background:linear-gradient(135deg,#6366F1,#06B6D4);color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 20px;border-radius:10px">${cta.label}</a></td></tr>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#F3F4F6;font-family:Inter,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E5E7EB">
        <tr><td style="background:linear-gradient(135deg,#6366F1,#06B6D4);padding:18px 24px">
          <span style="color:#fff;font-weight:700;font-size:16px;letter-spacing:.3px">Lyra WatchLog</span>
        </td></tr>
        <tr><td style="padding:24px">
          <h1 style="margin:0 0 8px;font-size:18px;color:#0C1124;font-weight:700">${title}</h1>
          <p style="margin:0 0 16px;color:#374151;font-size:14px;line-height:1.5">${intro}</p>
          <table role="presentation" cellpadding="0" cellspacing="0">${tableRows}${button}</table>
        </td></tr>
        <tr><td style="padding:14px 24px;border-top:1px solid #F3F4F6;color:#9AA3B8;font-size:12px">
          Hola {{recipient.name}}, este es un aviso automático de {{app.name}}. Puede ajustar sus avisos en «Mis notificaciones».
        </td></tr>
      </table>
    </td></tr>
  </table></body></html>`;
}

export const NOTIFICATION_TEMPLATE_SEEDS: NotificationTemplateSeed[] = [
  {
    eventKey: "round.overdue",
    locale: "es-CL",
    channel: "EMAIL",
    subject: "Ronda vencida: {{schedule.name}} ({{node.name}})",
    bodyText:
      "Hola {{recipient.name}}:\n\n" +
      "La ronda «{{schedule.name}}» venció. Estaba programada para {{occurrence.scheduledFor}} " +
      "y su plazo era {{occurrence.dueAt}} (atraso de {{occurrence.overdueBy}}).\n\n" +
      "Plantilla: {{template.name}}\nNodo: {{node.name}}\nEquipo: {{equipment.tag}}\n\n" +
      "Inicie o reasigne la ronda en {{app.url}}.\n\n— {{app.name}}",
    bodyHtml: htmlShell(
      "Ronda vencida",
      "La ronda <strong>{{schedule.name}}</strong> superó su plazo y sigue pendiente.",
      [
        ["Plantilla", "{{template.name}}"],
        ["Nodo", "{{node.name}}"],
        ["Equipo", "{{equipment.tag}}"],
        ["Programada", "{{occurrence.scheduledFor}}"],
        ["Plazo", "{{occurrence.dueAt}}"],
        ["Atraso", "{{occurrence.overdueBy}}"],
      ],
      { label: "Ver rondas", url: "{{app.url}}/mis-rondas" },
    ),
  },
  {
    eventKey: "entry.sla.breached",
    locale: "es-CL",
    channel: "EMAIL",
    subject: "SLA incumplido: entrada {{entry.folio}} en «{{entry.state}}»",
    bodyText:
      "Hola {{recipient.name}}:\n\n" +
      "La entrada {{entry.folio}} ({{entry.template}}) superó el tiempo máximo de permanencia " +
      "en el estado «{{entry.state}}» (SLA {{entry.sla}}, atraso {{entry.delayedBy}}).\n\n" +
      "Nodo: {{entry.node}}\n\nRevísela en {{entry.url}}.\n\n— {{app.name}}",
    bodyHtml: htmlShell(
      "SLA incumplido",
      "La entrada <strong>{{entry.folio}}</strong> excedió su SLA de permanencia en el estado actual.",
      [
        ["Plantilla", "{{entry.template}}"],
        ["Nodo", "{{entry.node}}"],
        ["Estado", "{{entry.state}}"],
        ["SLA", "{{entry.sla}}"],
        ["Atraso", "{{entry.delayedBy}}"],
      ],
      { label: "Abrir entrada", url: "{{entry.url}}" },
    ),
  },
  {
    eventKey: "entry.transition",
    locale: "es-CL",
    channel: "EMAIL",
    subject: "Entrada {{entry.folio}} avanzó a «{{entry.toState}}»",
    bodyText:
      "Hola {{recipient.name}}:\n\n" +
      "La entrada {{entry.folio}} ({{entry.template}}) pasó de «{{entry.fromState}}» a «{{entry.toState}}» " +
      "({{entry.actor}}). Le corresponde la siguiente acción.\n\n" +
      "Nodo: {{entry.node}}\n\nÁbrala en {{entry.url}}.\n\n— {{app.name}}",
    bodyHtml: htmlShell(
      "Le toca una acción",
      "La entrada <strong>{{entry.folio}}</strong> avanzó a <strong>{{entry.toState}}</strong> y requiere su atención.",
      [
        ["Plantilla", "{{entry.template}}"],
        ["Nodo", "{{entry.node}}"],
        ["De", "{{entry.fromState}}"],
        ["A", "{{entry.toState}}"],
        ["Ejecutó", "{{entry.actor}}"],
      ],
      { label: "Abrir entrada", url: "{{entry.url}}" },
    ),
  },
  {
    eventKey: "entry.signature.pending",
    locale: "es-CL",
    channel: "EMAIL",
    subject: "Firma pendiente: entrada {{entry.folio}}",
    bodyText:
      "Hola {{recipient.name}}:\n\n" +
      "La entrada {{entry.folio}} ({{entry.template}}) quedó en el estado «{{entry.state}}», " +
      "que requiere su firma electrónica para avanzar.\n\n" +
      "Nodo: {{entry.node}}\n\nFírmela en {{entry.url}}.\n\n— {{app.name}}",
    bodyHtml: htmlShell(
      "Firma pendiente",
      "La entrada <strong>{{entry.folio}}</strong> espera su firma electrónica para continuar.",
      [
        ["Plantilla", "{{entry.template}}"],
        ["Nodo", "{{entry.node}}"],
        ["Estado", "{{entry.state}}"],
      ],
      { label: "Firmar entrada", url: "{{entry.url}}" },
    ),
  },
  {
    eventKey: "incident.sla.breached",
    locale: "es-CL",
    channel: "EMAIL",
    subject: "Permanencia excedida: incidencia {{incident.folio}} en «{{incident.state}}»",
    bodyText:
      "Hola {{recipient.name}}:\n\n" +
      "La incidencia {{incident.folio}} ({{incident.title}}) superó el tiempo máximo de permanencia " +
      "en el estado «{{incident.state}}» (SLA {{incident.sla}}, atraso {{incident.delayedBy}}).\n\n" +
      "Tipo: {{incident.type}}\nSeveridad: {{incident.severity}}\nNodo: {{incident.node}}\n" +
      "Responsable: {{incident.owner}}\n\nRevísela en {{incident.url}}.\n\n— {{app.name}}",
    bodyHtml: htmlShell(
      "Permanencia excedida",
      "La incidencia <strong>{{incident.folio}}</strong> lleva demasiado tiempo en su estado actual.",
      [
        ["Incidencia", "{{incident.title}}"],
        ["Tipo", "{{incident.type}}"],
        ["Severidad", "{{incident.severity}}"],
        ["Nodo", "{{incident.node}}"],
        ["Estado", "{{incident.state}}"],
        ["SLA", "{{incident.sla}}"],
        ["Atraso", "{{incident.delayedBy}}"],
      ],
      { label: "Abrir incidencia", url: "{{incident.url}}" },
    ),
  },
  {
    eventKey: "incident.overdue",
    locale: "es-CL",
    channel: "EMAIL",
    subject: "Plazo vencido: incidencia {{incident.folio}}",
    bodyText:
      "Hola {{recipient.name}}:\n\n" +
      "El plazo de resolución de la incidencia {{incident.folio}} ({{incident.title}}) venció " +
      "el {{incident.dueAt}} y sigue abierta (atraso de {{incident.overdueBy}}).\n\n" +
      "Tipo: {{incident.type}}\nSeveridad: {{incident.severity}}\nNodo: {{incident.node}}\n" +
      "Estado: {{incident.state}}\nResponsable: {{incident.owner}}\n\n" +
      "Resuélvala o reasígnela en {{incident.url}}.\n\n— {{app.name}}",
    bodyHtml: htmlShell(
      "Plazo de resolución vencido",
      "La incidencia <strong>{{incident.folio}}</strong> superó su plazo comprometido y sigue abierta.",
      [
        ["Incidencia", "{{incident.title}}"],
        ["Tipo", "{{incident.type}}"],
        ["Severidad", "{{incident.severity}}"],
        ["Nodo", "{{incident.node}}"],
        ["Estado", "{{incident.state}}"],
        ["Responsable", "{{incident.owner}}"],
        ["Plazo", "{{incident.dueAt}}"],
        ["Atraso", "{{incident.overdueBy}}"],
      ],
      { label: "Abrir incidencia", url: "{{incident.url}}" },
    ),
  },
  {
    eventKey: "incident.action.overdue",
    locale: "es-CL",
    channel: "EMAIL",
    subject: "Acción CAPA vencida: {{action.code}} ({{incident.folio}})",
    bodyText:
      "Hola {{recipient.name}}:\n\n" +
      "La acción {{action.code}} «{{action.title}}» de la incidencia {{incident.folio}} " +
      "({{incident.title}}) venció su plazo el {{action.dueAt}} (atraso de {{action.overdueBy}}).\n\n" +
      "Nodo: {{incident.node}}\nResponsable de la incidencia: {{incident.owner}}\n\n" +
      "Gestiónela en {{incident.url}}.\n\n— {{app.name}}",
    bodyHtml: htmlShell(
      "Acción CAPA vencida",
      "La acción <strong>{{action.code}}</strong> de la incidencia {{incident.folio}} superó su plazo.",
      [
        ["Acción", "{{action.title}}"],
        ["Incidencia", "{{incident.title}}"],
        ["Nodo", "{{incident.node}}"],
        ["Plazo", "{{action.dueAt}}"],
        ["Atraso", "{{action.overdueBy}}"],
      ],
      { label: "Abrir incidencia", url: "{{incident.url}}" },
    ),
  },
  {
    eventKey: "incident.report.due",
    locale: "es-CL",
    channel: "EMAIL",
    subject: "Reporte por vencer: {{report.code}} a {{report.authority}} ({{incident.folio}})",
    bodyText:
      "Hola {{recipient.name}}:\n\n" +
      "El reporte {{report.code}} a {{report.authority}} de la incidencia {{incident.folio}} " +
      "({{incident.title}}) venció su plazo de envío el {{report.dueAt}} (atraso de {{report.overdueBy}}) " +
      "y aún no se ha enviado.\n\n" +
      "Tipo: {{incident.type}}\nNodo: {{incident.node}}\nResponsable: {{incident.owner}}\n\n" +
      "Regístrelo enviado en {{incident.url}}.\n\n— {{app.name}}",
    bodyHtml: htmlShell(
      "Reporte regulatorio por vencer",
      "El reporte <strong>{{report.code}}</strong> a {{report.authority}} de la incidencia {{incident.folio}} venció su plazo de envío.",
      [
        ["Reporte", "{{report.code}}"],
        ["Autoridad", "{{report.authority}}"],
        ["Incidencia", "{{incident.title}}"],
        ["Nodo", "{{incident.node}}"],
        ["Plazo", "{{report.dueAt}}"],
        ["Atraso", "{{report.overdueBy}}"],
      ],
      { label: "Abrir incidencia", url: "{{incident.url}}" },
    ),
  },
  {
    eventKey: "workorder.overdue",
    locale: "es-CL",
    channel: "EMAIL",
    subject: "Plazo vencido: orden de trabajo {{workorder.folio}}",
    bodyText:
      "Hola {{recipient.name}}:\n\n" +
      "El plazo de resolución de la orden de trabajo {{workorder.folio}} ({{workorder.title}}) venció " +
      "el {{workorder.dueAt}} y sigue abierta (atraso de {{workorder.overdueBy}}).\n\n" +
      "Tipo: {{workorder.type}}\nCriticidad: {{workorder.criticality}}\nNodo: {{workorder.node}}\n" +
      "Estado: {{workorder.state}}\nResponsable: {{workorder.owner}}\n\n" +
      "Resuélvala o reasígnela en {{workorder.url}}.\n\n— {{app.name}}",
    bodyHtml: htmlShell(
      "Plazo de resolución vencido",
      "La orden de trabajo <strong>{{workorder.folio}}</strong> superó su plazo comprometido y sigue abierta.",
      [
        ["Orden de trabajo", "{{workorder.title}}"],
        ["Tipo", "{{workorder.type}}"],
        ["Criticidad", "{{workorder.criticality}}"],
        ["Nodo", "{{workorder.node}}"],
        ["Estado", "{{workorder.state}}"],
        ["Responsable", "{{workorder.owner}}"],
        ["Plazo", "{{workorder.dueAt}}"],
        ["Atraso", "{{workorder.overdueBy}}"],
      ],
      { label: "Abrir orden de trabajo", url: "{{workorder.url}}" },
    ),
  },
  {
    eventKey: "workorder.stalled",
    locale: "es-CL",
    channel: "EMAIL",
    subject: "Permanencia excedida: orden de trabajo {{workorder.folio}} en «{{workorder.state}}»",
    bodyText:
      "Hola {{recipient.name}}:\n\n" +
      "La orden de trabajo {{workorder.folio}} ({{workorder.title}}) superó el tiempo máximo de permanencia " +
      "en el estado «{{workorder.state}}» (SLA {{workorder.sla}}, atraso {{workorder.delayedBy}}).\n\n" +
      "Tipo: {{workorder.type}}\nCriticidad: {{workorder.criticality}}\nNodo: {{workorder.node}}\n" +
      "Responsable: {{workorder.owner}}\n\nRevísela en {{workorder.url}}.\n\n— {{app.name}}",
    bodyHtml: htmlShell(
      "Permanencia excedida",
      "La orden de trabajo <strong>{{workorder.folio}}</strong> lleva demasiado tiempo en su estado actual.",
      [
        ["Orden de trabajo", "{{workorder.title}}"],
        ["Tipo", "{{workorder.type}}"],
        ["Criticidad", "{{workorder.criticality}}"],
        ["Nodo", "{{workorder.node}}"],
        ["Estado", "{{workorder.state}}"],
        ["SLA", "{{workorder.sla}}"],
        ["Atraso", "{{workorder.delayedBy}}"],
      ],
      { label: "Abrir orden de trabajo", url: "{{workorder.url}}" },
    ),
  },
  {
    eventKey: "workorder.activity.overdue",
    locale: "es-CL",
    channel: "EMAIL",
    subject: "Actividad vencida: «{{activity.title}}» ({{workorder.folio}})",
    bodyText:
      "Hola {{recipient.name}}:\n\n" +
      "La actividad «{{activity.title}}» del plan de la orden de trabajo {{workorder.folio}} " +
      "({{workorder.title}}) venció su fecha de término el {{activity.dueAt}} (atraso de {{activity.overdueBy}}) " +
      "y aún no se completa.\n\n" +
      "Nodo: {{workorder.node}}\nResponsable de la OT: {{workorder.owner}}\n\n" +
      "Regístrele avance o ciérrela en {{workorder.url}}.\n\n— {{app.name}}",
    bodyHtml: htmlShell(
      "Actividad del plan vencida",
      "La actividad <strong>{{activity.title}}</strong> de la orden de trabajo {{workorder.folio}} superó su fecha de término.",
      [
        ["Actividad", "{{activity.title}}"],
        ["Orden de trabajo", "{{workorder.title}}"],
        ["Nodo", "{{workorder.node}}"],
        ["Término planificado", "{{activity.dueAt}}"],
        ["Atraso", "{{activity.overdueBy}}"],
      ],
      { label: "Abrir orden de trabajo", url: "{{workorder.url}}" },
    ),
  },
  {
    eventKey: "worker.competency.expiring",
    locale: "es-CL",
    channel: "EMAIL",
    subject: "Competencia por vencer: {{worker.name}} — {{worker.competency}} ({{workorder.folio}})",
    bodyText:
      "Hola {{recipient.name}}:\n\n" +
      "La competencia «{{worker.competency}}» de {{worker.name}}, en la dotación de la orden de trabajo " +
      "{{workorder.folio}} ({{workorder.title}}), vence el {{worker.expiresAt}} (en {{worker.expiresIn}}).\n\n" +
      "Nodo: {{workorder.node}}\nResponsable de la OT: {{workorder.owner}}\n\n" +
      "Gestione su renovación antes del vencimiento en {{workorder.url}}.\n\n— {{app.name}}",
    bodyHtml: htmlShell(
      "Competencia por vencer",
      "La competencia <strong>{{worker.competency}}</strong> de {{worker.name}} está por vencer.",
      [
        ["Persona", "{{worker.name}}"],
        ["Competencia", "{{worker.competency}}"],
        ["Orden de trabajo", "{{workorder.folio}} — {{workorder.title}}"],
        ["Nodo", "{{workorder.node}}"],
        ["Vence", "{{worker.expiresAt}}"],
        ["Tiempo restante", "{{worker.expiresIn}}"],
      ],
      { label: "Abrir orden de trabajo", url: "{{workorder.url}}" },
    ),
  },
  {
    eventKey: "worker.competency.expired",
    locale: "es-CL",
    channel: "EMAIL",
    subject: "Competencia VENCIDA: {{worker.name}} — {{worker.competency}} ({{workorder.folio}})",
    bodyText:
      "Hola {{recipient.name}}:\n\n" +
      "La competencia «{{worker.competency}}» de {{worker.name}}, en la dotación de la orden de trabajo " +
      "{{workorder.folio}} ({{workorder.title}}), venció el {{worker.expiresAt}} (hace {{worker.expiresIn}}) " +
      "y la persona sigue en la dotación.\n\n" +
      "Nodo: {{workorder.node}}\nResponsable de la OT: {{workorder.owner}}\n\n" +
      "Renuévela o retire a la persona de la dotación en {{workorder.url}}.\n\n— {{app.name}}",
    bodyHtml: htmlShell(
      "Competencia vencida",
      "La competencia <strong>{{worker.competency}}</strong> de {{worker.name}} está vencida y sigue en la dotación.",
      [
        ["Persona", "{{worker.name}}"],
        ["Competencia", "{{worker.competency}}"],
        ["Orden de trabajo", "{{workorder.folio}} — {{workorder.title}}"],
        ["Nodo", "{{workorder.node}}"],
        ["Venció", "{{worker.expiresAt}}"],
        ["Hace", "{{worker.expiresIn}}"],
      ],
      { label: "Abrir orden de trabajo", url: "{{workorder.url}}" },
    ),
  },
  {
    eventKey: "contractor.accreditation.expiring",
    locale: "es-CL",
    channel: "EMAIL",
    subject: "Acreditación por vencer: {{company.name}} ({{workorder.folio}})",
    bodyText:
      "Hola {{recipient.name}}:\n\n" +
      "La acreditación de la empresa contratista «{{company.name}}», con personal en la dotación de la orden " +
      "de trabajo {{workorder.folio}} ({{workorder.title}}), vence el {{company.accreditedUntil}} (en {{company.expiresIn}}).\n\n" +
      "Nodo: {{workorder.node}}\nResponsable de la OT: {{workorder.owner}}\n\n" +
      "Verifique la re-acreditación de la empresa antes del vencimiento en {{workorder.url}}.\n\n— {{app.name}}",
    bodyHtml: htmlShell(
      "Acreditación de empresa por vencer",
      "La acreditación de <strong>{{company.name}}</strong> está por vencer y tiene personal en la dotación.",
      [
        ["Empresa contratista", "{{company.name}}"],
        ["Grado / score", "{{company.grade}}"],
        ["Orden de trabajo", "{{workorder.folio}} — {{workorder.title}}"],
        ["Nodo", "{{workorder.node}}"],
        ["Vence", "{{company.accreditedUntil}}"],
        ["Tiempo restante", "{{company.expiresIn}}"],
      ],
      { label: "Abrir orden de trabajo", url: "{{workorder.url}}" },
    ),
  },
  {
    eventKey: "contractor.accreditation.expired",
    locale: "es-CL",
    channel: "EMAIL",
    subject: "Acreditación VENCIDA: {{company.name}} ({{workorder.folio}})",
    bodyText:
      "Hola {{recipient.name}}:\n\n" +
      "La acreditación de la empresa contratista «{{company.name}}», con personal en la dotación de la orden " +
      "de trabajo {{workorder.folio}} ({{workorder.title}}), venció el {{company.accreditedUntil}} (hace {{company.expiresIn}}) " +
      "y la empresa sigue con personal en la dotación.\n\n" +
      "Nodo: {{workorder.node}}\nResponsable de la OT: {{workorder.owner}}\n\n" +
      "Re-acredite la empresa o retire a su personal de la dotación en {{workorder.url}}.\n\n— {{app.name}}",
    bodyHtml: htmlShell(
      "Acreditación de empresa vencida",
      "La acreditación de <strong>{{company.name}}</strong> está vencida y sigue con personal en la dotación.",
      [
        ["Empresa contratista", "{{company.name}}"],
        ["Grado / score", "{{company.grade}}"],
        ["Orden de trabajo", "{{workorder.folio}} — {{workorder.title}}"],
        ["Nodo", "{{workorder.node}}"],
        ["Venció", "{{company.accreditedUntil}}"],
        ["Hace", "{{company.expiresIn}}"],
      ],
      { label: "Abrir orden de trabajo", url: "{{workorder.url}}" },
    ),
  },
  {
    eventKey: "handover.ready",
    locale: "es-CL",
    channel: "EMAIL",
    subject: "Entrega de turno lista para recibir: {{handover.code}} ({{handover.node}})",
    bodyText:
      "Hola {{recipient.name}}:\n\n" +
      "{{handover.outgoingBy}} firmó la entrega del {{handover.shift}} en {{handover.node}} " +
      "y está lista para que la reciba ({{handover.incomingShift}}).\n\n" +
      "Estado general al cierre: {{handover.generalStatus}}\n" +
      "Pendientes que ruedan: {{handover.openItems}}\n\n" +
      "Revise el resumen, los pendientes y confirme la recepción con su firma en {{handover.url}}.\n\n— {{app.name}}",
    bodyHtml: htmlShell(
      "Tienes un turno por recibir",
      "<strong>{{handover.outgoingBy}}</strong> firmó la entrega del <strong>{{handover.shift}}</strong> y está lista para que la reciba.",
      [
        ["Entrega", "{{handover.code}}"],
        ["Nodo", "{{handover.node}}"],
        ["Turno saliente", "{{handover.shift}}"],
        ["Turno entrante", "{{handover.incomingShift}}"],
        ["Estado al cierre", "{{handover.generalStatus}}"],
        ["Pendientes", "{{handover.openItems}}"],
      ],
      { label: "Recibir turno", url: "{{handover.url}}" },
    ),
  },
];
