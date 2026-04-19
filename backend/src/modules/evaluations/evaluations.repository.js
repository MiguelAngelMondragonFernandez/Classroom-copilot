const { getPool } = require('../../db/mysqlPool');

function parseJsonColumn(value) {
    if (value == null) return null;
    if (typeof value === 'string') return JSON.parse(value);
    return value;
}

async function listActividades(userId, courseId) {
    const [rows] = await getPool().execute(
        'SELECT * FROM actividades_evaluables WHERE user_id = ? AND course_id = ? ORDER BY created_at DESC',
        [userId, courseId]
    );
    return rows.map(r => ({ ...r, rubrica_json: parseJsonColumn(r.rubrica_json) }));
}

async function createActividad(userId, { courseId, courseWorkId, rubricaJson, fechaCierre, estado }) {
    const pool = getPool();
    const rubricaStr = (rubricaJson === undefined) ? null : JSON.stringify(rubricaJson);
    const [result] = await pool.execute(
        `INSERT INTO actividades_evaluables (user_id, course_id, course_work_id, rubrica_json, fecha_cierre, estado, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [userId, courseId, courseWorkId, rubricaStr, fechaCierre, estado || 'pendiente']
    );
    const [rows] = await pool.execute('SELECT * FROM actividades_evaluables WHERE id = ?', [result.insertId]);
    const row = rows[0];
    return { ...row, rubrica_json: parseJsonColumn(row.rubrica_json) };
}

async function deleteActividad(id, userId) {
    await getPool().execute('DELETE FROM actividades_evaluables WHERE id = ? AND user_id = ?', [id, userId]);
}

async function updateEstado(id, userId, estado) {
    await getPool().execute(
        'UPDATE actividades_evaluables SET estado = ?, updated_at = NOW() WHERE id = ? AND user_id = ?',
        [estado, id, userId]
    );
}

module.exports = { listActividades, createActividad, deleteActividad, updateEstado };

async function createDraft(userId, { activityId, courseId, courseWorkId, rubricSnapshot, idempotencyKey, aiModel, submissionCount }) {
    const pool = getPool();
    const rubricStr = rubricSnapshot === undefined ? null : JSON.stringify(rubricSnapshot);
    const [result] = await pool.execute(
        `INSERT INTO evaluacion_borradores (activity_id, user_id, course_id, course_work_id, rubric_snapshot_json, idempotency_key, ai_model, submission_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [activityId, userId, courseId, courseWorkId, rubricStr, idempotencyKey || null, aiModel || null, submissionCount || 0]
    );
    const [rows] = await pool.execute('SELECT * FROM evaluacion_borradores WHERE id = ?', [result.insertId]);
    const row = rows[0];
    return { ...row, rubric_snapshot_json: parseJsonColumn(row.rubric_snapshot_json) };
}

async function findDraftByActivityAndUser(activityId, userId) {
    const [rows] = await getPool().execute('SELECT * FROM evaluacion_borradores WHERE activity_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1', [activityId, userId]);
    if (!rows || rows.length === 0) return null;
    const r = rows[0];
    return { ...r, rubric_snapshot_json: parseJsonColumn(r.rubric_snapshot_json) };
}

async function getDraftById(draftId) {
    const [rows] = await getPool().execute('SELECT * FROM evaluacion_borradores WHERE id = ?', [draftId]);
    if (!rows || rows.length === 0) return null;
    const r = rows[0];
    return { ...r, rubric_snapshot_json: parseJsonColumn(r.rubric_snapshot_json) };
}

async function getActividadById(id) {
    const [rows] = await getPool().execute('SELECT * FROM actividades_evaluables WHERE id = ?', [id]);
    if (!rows || rows.length === 0) return null;
    const r = rows[0];
    return { ...r, rubrica_json: parseJsonColumn(r.rubrica_json) };
}

async function updateDraftSubmissionCount(draftId, count) {
    await getPool().execute('UPDATE evaluacion_borradores SET submission_count = ?, updated_at = NOW() WHERE id = ?', [count, draftId]);
}

async function insertDraftRowsBulk(draftId, rowsData) {
    if (!rowsData || rowsData.length === 0) return [];
    const pool = getPool();
    const values = [];
    const placeholders = rowsData.map(r => {
        values.push(draftId, r.student_submission_id, r.student_id || null, r.student_name || null, r.submission_state || null, r.submission_time || null, JSON.stringify(r.attachments || null), r.ai_grade || null, r.ai_justification || null, r.ai_version || null);
        return '(?,?,?,?,?,?,?,?,?,?)';
    }).join(',');
    const sql = `INSERT INTO evaluacion_borrador_filas (draft_id, student_submission_id, student_id, student_name, submission_state, submission_time, attachments, ai_grade, ai_justification, ai_version) VALUES ${placeholders}`;
    await pool.execute(sql, values);
    const [rows] = await pool.execute('SELECT * FROM evaluacion_borrador_filas WHERE draft_id = ?', [draftId]);
    return rows;
}

async function listDraftRowsByDraftId(draftId, page = 1, limit = 50) {
    const offset = (page - 1) * limit;
    const [rows] = await getPool().execute('SELECT * FROM evaluacion_borrador_filas WHERE draft_id = ? ORDER BY student_name LIMIT ? OFFSET ?', [draftId, limit, offset]);
    return rows.map(r => ({ ...r, attachments: parseJsonColumn(r.attachments) }));
}

async function updateDraftRow(draftId, studentSubmissionId, updates) {
    const fields = [];
    const params = [];
    if (updates.teacher_grade !== undefined) { fields.push('teacher_grade = ?'); params.push(updates.teacher_grade); }
    if (updates.teacher_justification !== undefined) { fields.push('teacher_justification = ?'); params.push(updates.teacher_justification); }
    if (fields.length === 0) return null;
    params.push(draftId, studentSubmissionId);
    const sql = `UPDATE evaluacion_borrador_filas SET ${fields.join(', ')}, updated_at = NOW() WHERE draft_id = ? AND student_submission_id = ?`;
    await getPool().execute(sql, params);
    const [rows] = await getPool().execute('SELECT * FROM evaluacion_borrador_filas WHERE draft_id = ? AND student_submission_id = ?', [draftId, studentSubmissionId]);
    if (!rows[0]) return null;
    return { ...rows[0], attachments: parseJsonColumn(rows[0].attachments) };
}

async function markPublishResult(draftId, studentSubmissionId, { success, error }) {
    if (success) {
        await getPool().execute('UPDATE evaluacion_borrador_filas SET publish_state = ?, publish_error = NULL, updated_at = NOW() WHERE draft_id = ? AND student_submission_id = ?', ['succeeded', draftId, studentSubmissionId]);
    } else {
        await getPool().execute('UPDATE evaluacion_borrador_filas SET publish_state = ?, publish_error = ?, updated_at = NOW() WHERE draft_id = ? AND student_submission_id = ?', ['failed', error || null, draftId, studentSubmissionId]);
    }
}

async function setDraftStatus(draftId, status) {
    await getPool().execute('UPDATE evaluacion_borradores SET status = ?, updated_at = NOW() WHERE id = ?', [status, draftId]);
}

module.exports = {
    listActividades,
    createActividad,
    deleteActividad,
    updateEstado,
    createDraft,
    findDraftByActivityAndUser,
    getDraftById,
    insertDraftRowsBulk,
    listDraftRowsByDraftId,
    updateDraftRow,
    markPublishResult,
    setDraftStatus,
    getActividadById,
    updateDraftSubmissionCount
};
