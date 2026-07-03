import { useIsFetching, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "@lyra/ui";
import styles from "./refresh-button.module.css";

/**
 * Botón «Refrescar» reutilizable para grillas: invalida (y por ende refetchea) todas
 * las queries bajo el prefijo del módulo y gira mientras alguna esté en vuelo.
 * Centraliza el patrón de LogbookPage (`doRefresh` + `RefreshCw` girando) para todo
 * módulo con listado/KPIs. No decide QUÉ mostrar: solo re-consulta al backend (fuente
 * de verdad). `queryKey` = prefijo del módulo (p. ej. `["work-orders"]`, que cubre
 * list/stats/dashboard/detalle).
 */
export function RefreshButton({ queryKey, label = "Refrescar" }: { queryKey: QueryKey; label?: string }) {
  const qc = useQueryClient();
  const fetching = useIsFetching({ queryKey });
  return (
    <Button
      variant="secondary"
      leftIcon={<RefreshCw size={16} className={fetching ? styles.spin : undefined} />}
      onClick={() => void qc.invalidateQueries({ queryKey })}
    >
      {label}
    </Button>
  );
}
