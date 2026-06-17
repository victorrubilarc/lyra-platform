import { Injectable } from "@nestjs/common";
import { Observable, Subject } from "rxjs";

/** Aviso liviano que viaja por SSE a la campanita: solo el contador de no leídas. */
export interface InboxNudge {
  type: "inbox";
  unread: number;
}

/**
 * Bus de tiempo real IN-MEMORY para la campanita (Fase B). Un `Subject` por usuario
 * (multicast a sus pestañas abiertas) sobre el que el worker empuja un "nudge" al
 * entregar una notificación in-app. El cliente, al recibirlo, refetchea por el
 * endpoint autenticado normal (no viaja contenido sensible por el stream).
 *
 * On-prem single-process: el `Map` en memoria basta. Si algún día se escala a varios
 * procesos, este bus debe respaldarse en Redis pub/sub (deuda anotada en BACKLOG).
 */
@Injectable()
export class NotificationRealtimeService {
  private readonly streams = new Map<string, Subject<InboxNudge>>();
  private readonly refCounts = new Map<string, number>();

  /** Empuja un nudge al usuario (no-op si no tiene conexiones abiertas). */
  notify(userId: string | null, nudge: InboxNudge): void {
    if (!userId) return;
    this.streams.get(userId)?.next(nudge);
  }

  /** Observable del usuario para un endpoint SSE. Limpia el Subject al desuscribir. */
  streamFor(userId: string): Observable<InboxNudge> {
    let subject = this.streams.get(userId);
    if (!subject) {
      subject = new Subject<InboxNudge>();
      this.streams.set(userId, subject);
    }
    this.refCounts.set(userId, (this.refCounts.get(userId) ?? 0) + 1);
    return new Observable<InboxNudge>((subscriber) => {
      const sub = subject!.subscribe(subscriber);
      return () => {
        sub.unsubscribe();
        const next = (this.refCounts.get(userId) ?? 1) - 1;
        if (next <= 0) {
          this.refCounts.delete(userId);
          this.streams.delete(userId);
        } else {
          this.refCounts.set(userId, next);
        }
      };
    });
  }
}
