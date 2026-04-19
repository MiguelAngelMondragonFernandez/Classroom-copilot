-- Migración 002: Tabla de horarios semanales del docente
CREATE TABLE IF NOT EXISTS horarios (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         INT UNSIGNED NOT NULL,
    course_id       VARCHAR(255) NOT NULL,
    dia_index       TINYINT NOT NULL COMMENT '0=Dom, 1=Lun, 2=Mar, 3=Mie, 4=Jue, 5=Vie, 6=Sab',
    hora_inicio     TIME NOT NULL,
    hora_fin        TIME NOT NULL,
    duracion_minutos INT,
    created_at      DATETIME NOT NULL DEFAULT NOW(),
    updated_at      DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
    FOREIGN KEY (user_id) REFERENCES perfiles(id) ON DELETE CASCADE,
    INDEX idx_user_course (user_id, course_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO schema_migrations (version) VALUES ('002_horarios');
