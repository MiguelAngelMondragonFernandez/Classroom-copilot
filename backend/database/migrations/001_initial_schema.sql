-- ================================================================
-- Classroom Copilot - Esquema inicial MySQL 8.0
-- Migración 001: Tablas base
-- ================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- Tabla de perfiles de docentes
CREATE TABLE IF NOT EXISTS perfiles (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    google_id       VARCHAR(255) NOT NULL UNIQUE,
    email           VARCHAR(320) NOT NULL UNIQUE,
    nombre_completo VARCHAR(255),
    photo_url       TEXT,
    refresh_token   TEXT,
    token_balance   INT NOT NULL DEFAULT 10000,
    total_consumed  INT NOT NULL DEFAULT 0,
    created_at      DATETIME NOT NULL DEFAULT NOW(),
    updated_at      DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
    INDEX idx_google_id (google_id),
    INDEX idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Ciclos escolares (semestres/años)
CREATE TABLE IF NOT EXISTS ciclos_escolares (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED NOT NULL,
    course_id   VARCHAR(255) NOT NULL,
    nombre      VARCHAR(255) NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin    DATE NOT NULL,
    created_at  DATETIME NOT NULL DEFAULT NOW(),
    updated_at  DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
    FOREIGN KEY (user_id) REFERENCES perfiles(id) ON DELETE CASCADE,
    INDEX idx_user_course (user_id, course_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Días inhábiles del ciclo
CREATE TABLE IF NOT EXISTS dias_inhabiles (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED NOT NULL,
    ciclo_id    INT UNSIGNED,
    fecha       DATE NOT NULL,
    motivo      VARCHAR(255),
    FOREIGN KEY (user_id) REFERENCES perfiles(id) ON DELETE CASCADE,
    FOREIGN KEY (ciclo_id) REFERENCES ciclos_escolares(id) ON DELETE SET NULL,
    INDEX idx_user_ciclo (user_id, ciclo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Unidades temáticas (agrupación de temas)
CREATE TABLE IF NOT EXISTS ciclos (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id             INT UNSIGNED NOT NULL,
    course_id           VARCHAR(255) NOT NULL,
    ciclo_escolar_id    INT UNSIGNED,
    nombre              VARCHAR(255) NOT NULL,
    classroom_topic_id  VARCHAR(255),
    created_at          DATETIME NOT NULL DEFAULT NOW(),
    updated_at          DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
    FOREIGN KEY (user_id) REFERENCES perfiles(id) ON DELETE CASCADE,
    FOREIGN KEY (ciclo_escolar_id) REFERENCES ciclos_escolares(id) ON DELETE SET NULL,
    INDEX idx_user_course (user_id, course_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Temarios (temas individuales dentro de una unidad)
CREATE TABLE IF NOT EXISTS temarios (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id             INT UNSIGNED NOT NULL,
    course_id           VARCHAR(255) NOT NULL,
    ciclo_id            INT UNSIGNED,
    nombre              VARCHAR(255) NOT NULL,
    recomendaciones     TEXT,
    orden               INT NOT NULL DEFAULT 0,
    estado              ENUM('pendiente','en_progreso','completado') NOT NULL DEFAULT 'pendiente',
    drive_files         JSON,
    classroom_topic_id  VARCHAR(255),
    created_at          DATETIME NOT NULL DEFAULT NOW(),
    updated_at          DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
    FOREIGN KEY (user_id) REFERENCES perfiles(id) ON DELETE CASCADE,
    FOREIGN KEY (ciclo_id) REFERENCES ciclos(id) ON DELETE SET NULL,
    INDEX idx_user_course (user_id, course_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Planeación detallada (cronograma clase por clase)
CREATE TABLE IF NOT EXISTS planeacion_detallada (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id             INT UNSIGNED NOT NULL,
    ciclo_id            INT UNSIGNED,
    unidad_id           INT UNSIGNED,
    titulo_tema         VARCHAR(500) NOT NULL,
    fecha_asignada      DATE NOT NULL,
    hora_inicio         TIME NOT NULL,
    hora_fin            TIME NOT NULL,
    duracion_minutos    INT NOT NULL DEFAULT 60,
    status              ENUM('draft','published','error') NOT NULL DEFAULT 'draft',
    metadata            JSON,
    created_at          DATETIME NOT NULL DEFAULT NOW(),
    updated_at          DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
    FOREIGN KEY (user_id) REFERENCES perfiles(id) ON DELETE CASCADE,
    FOREIGN KEY (ciclo_id) REFERENCES ciclos_escolares(id) ON DELETE SET NULL,
    FOREIGN KEY (unidad_id) REFERENCES ciclos(id) ON DELETE SET NULL,
    INDEX idx_user_ciclo (user_id, ciclo_id),
    INDEX idx_fecha (fecha_asignada)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Materiales generados (documentos/presentaciones en Drive)
CREATE TABLE IF NOT EXISTS materiales_generados (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id                 INT UNSIGNED NOT NULL,
    course_id               VARCHAR(255) NOT NULL,
    planeacion_id           INT UNSIGNED,
    classroom_topic_id      VARCHAR(255),
    titulo                  VARCHAR(500) NOT NULL,
    tipo                    ENUM('document','presentation') NOT NULL,
    drive_file_id           VARCHAR(255) NOT NULL,
    drive_url               TEXT NOT NULL,
    classroom_material_id   VARCHAR(255),
    created_at              DATETIME NOT NULL DEFAULT NOW(),
    updated_at              DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
    FOREIGN KEY (user_id) REFERENCES perfiles(id) ON DELETE CASCADE,
    INDEX idx_user_course (user_id, course_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Actividades evaluables (tareas con rúbrica en Classroom)
CREATE TABLE IF NOT EXISTS actividades_evaluables (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         INT UNSIGNED NOT NULL,
    course_id       VARCHAR(255) NOT NULL,
    course_work_id  VARCHAR(255),
    rubrica_json    JSON,
    fecha_cierre    DATETIME NOT NULL,
    estado          ENUM('pendiente','evaluando','completado','error') NOT NULL DEFAULT 'pendiente',
    created_at      DATETIME NOT NULL DEFAULT NOW(),
    updated_at      DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
    FOREIGN KEY (user_id) REFERENCES perfiles(id) ON DELETE CASCADE,
    INDEX idx_user_course (user_id, course_id),
    INDEX idx_estado_fecha (estado, fecha_cierre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Registro de versiones de migraciones
CREATE TABLE IF NOT EXISTS schema_migrations (
    version     VARCHAR(50) PRIMARY KEY,
    applied_at  DATETIME NOT NULL DEFAULT NOW()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations (version) VALUES ('001_initial_schema');
