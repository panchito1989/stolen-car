-- ============================================================================
-- ShieldCar — Migración 0003: endurecer search_path de las funciones trigger
-- Fija search_path = '' para evitar secuestro del search_path (linter 0011).
-- Ambas funciones solo comparan columnas y lanzan excepciones; no referencian
-- objetos, así que un search_path vacío es totalmente seguro.
-- ============================================================================

alter function public.audit_log_forbid_mutation() set search_path = '';
alter function public.certificates_guard_immutability() set search_path = '';
