-- Migration 004: Evaluation drafts and draft rows
SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS evaluacion_borradores (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    activity_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    course_id VARCHAR(255) NOT NULL,
    course_work_id VARCHAR(255) NOT NULL,
    rubric_snapshot_json JSON,
    status ENUM('draft','approved','publishing','published','publish_partial','error') NOT NULL DEFAULT 'draft',
    idempotency_key VARCHAR(255) DEFAULT NULL,
    ai_model VARCHAR(255) DEFAULT NULL,
    submission_count INT NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT NOW(),
    updated_at DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
    INDEX idx_activity_user (activity_id, user_id),
    UNIQUE KEY ux_activity_idempotency (activity_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS evaluacion_borrador_filas (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    draft_id INT UNSIGNED NOT NULL,
    student_submission_id VARCHAR(255) NOT NULL,
    student_id VARCHAR(255) DEFAULT NULL,
    student_name VARCHAR(255) DEFAULT NULL,
    submission_state VARCHAR(50) DEFAULT NULL,
    submission_time DATETIME DEFAULT NULL,
    attachments JSON,
    ai_grade DECIMAL(6,2) DEFAULT NULL,
    ai_justification TEXT DEFAULT NULL,
    ai_version VARCHAR(255) DEFAULT NULL,
    teacher_grade DECIMAL(6,2) DEFAULT NULL,
    teacher_justification TEXT DEFAULT NULL,
    publish_state ENUM('pending','succeeded','failed') NOT NULL DEFAULT 'pending',
    publish_error TEXT DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT NOW(),
    updated_at DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
    FOREIGN KEY (draft_id) REFERENCES evaluacion_borradores(id) ON DELETE CASCADE,
    UNIQUE KEY ux_draft_submission (draft_id, student_submission_id)
);

-- Optional audit/log table
CREATE TABLE IF NOT EXISTS evaluacion_publish_log (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    draft_id INT UNSIGNED NOT NULL,
    student_submission_id VARCHAR(255),
    event_type VARCHAR(100) NOT NULL,
    message TEXT,
    actor_user_id INT UNSIGNED DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT NOW(),
    FOREIGN KEY (draft_id) REFERENCES evaluacion_borradores(id) ON DELETE CASCADE
);

INSERT IGNORE INTO schema_migrations (version) VALUES ('004_evaluation_drafts');
