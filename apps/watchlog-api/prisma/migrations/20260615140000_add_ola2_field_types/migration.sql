-- Catálogo de objetos premium — Ola 2 (2026-06-15). Migración ADITIVA: solo
-- agrega valores a los enums FieldType y FieldDataType. Cero ruptura (no toca
-- filas existentes; las plantillas viejas siguen igual). En PostgreSQL 12+ se
-- pueden agregar valores de enum dentro de una transacción mientras no se usen
-- en la misma transacción (aquí solo se declaran). `IF NOT EXISTS` = idempotente.

-- FieldType (capa 1, presentación/widget): objetos de REFERENCIA (un solo tipo
-- REFERENCE discriminado por config.entity = equipo/usuario/nodo/turno) y la
-- MATRIZ DE RIESGO (valor estructurado probabilidad×consecuencia → dataType RISK).
-- Tolerancia y contador NO agregan tipo: son variantes de NUMBER (config).
ALTER TYPE "FieldType" ADD VALUE IF NOT EXISTS 'REFERENCE';
ALTER TYPE "FieldType" ADD VALUE IF NOT EXISTS 'RISK_MATRIX';

-- FieldDataType (capa 2, almacenamiento/reporte): RISK (estructurado
-- {probability,consequence}). REFERENCE ya existía (lo usa SIGNATURE / Ola 2 lo
-- reusa para los selectores de entidad).
ALTER TYPE "FieldDataType" ADD VALUE IF NOT EXISTS 'RISK';
