const { getPool } = require('../../db/mysqlPool');
const ApiError = require('../../utils/ApiError');

async function listMateriales(userId, courseId) {
    const [rows] = await getPool().execute(
        'SELECT * FROM materiales_generados WHERE user_id = ? AND course_id = ? ORDER BY created_at DESC',
        [userId, courseId]
    );
    return rows;
}

async function createMaterial(userId, material) {
    const pool = getPool();
    const [result] = await pool.execute(
        `INSERT INTO materiales_generados
         (user_id, course_id, planeacion_id, classroom_topic_id, titulo, tipo, drive_file_id, drive_url, classroom_material_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [userId, material.course_id, material.planeacion_id || null, material.classroom_topic_id || null,
         material.titulo, material.tipo, material.drive_file_id, material.drive_url,
         material.classroom_material_id || null]
    );
    const [rows] = await pool.execute('SELECT * FROM materiales_generados WHERE id = ?', [result.insertId]);
    return rows[0];
}

async function updateMaterial(id, userId, updates) {
    const allowedFields = ['classroom_material_id', 'classroom_topic_id', 'drive_url', 'drive_file_id', 'titulo'];
    const safeUpdates = Object.fromEntries(
        Object.entries(updates || {}).filter(([key, value]) => allowedFields.includes(key) && value !== undefined)
    );

    const fields = Object.keys(safeUpdates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(safeUpdates);
    if (!fields) throw ApiError.badRequest('No se proporcionaron cambios válidos para el material.');

    await getPool().execute(
        `UPDATE materiales_generados SET ${fields}, updated_at = NOW() WHERE id = ? AND user_id = ?`,
        [...values, id, userId]
    );
    const [rows] = await getPool().execute('SELECT * FROM materiales_generados WHERE id = ?', [id]);
    return rows[0];
}

async function deleteByClassroomMaterialIds(userId, courseId, classroomMaterialIds) {
    if (!Array.isArray(classroomMaterialIds) || !classroomMaterialIds.length) return;
    const placeholders = classroomMaterialIds.map(() => '?').join(',');
    const params = [userId, courseId, ...classroomMaterialIds];
    await getPool().execute(
        `DELETE FROM materiales_generados WHERE user_id = ? AND course_id = ? AND classroom_material_id IN (${placeholders})`,
        params
    );
}

module.exports = { listMateriales, createMaterial, updateMaterial, deleteByClassroomMaterialIds };
