-- Migración 003: Fechas derivadas para unidades de planeación
ALTER TABLE ciclos
    ADD COLUMN IF NOT EXISTS fecha_inicio DATE NULL AFTER nombre,
    ADD COLUMN IF NOT EXISTS fecha_fin DATE NULL AFTER fecha_inicio;

INSERT IGNORE INTO schema_migrations (version) VALUES ('003_unidades_fechas');
