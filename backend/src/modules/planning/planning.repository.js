const { getPool } = require('../../db/mysqlPool');

let unidadDateColumnsPromise = null;

function formatDateOnly(value) {
    if (!value) return null;
    if (typeof value === 'string') return value.slice(0, 10);
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const year = value.getUTCFullYear();
        const month = String(value.getUTCMonth() + 1).padStart(2, '0');
        const day = String(value.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    return null;
}

function normalizePositiveInteger(value, fallback = 1) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeJsonObject(val) {
    if (!val) return {};
    if (typeof val === 'object') return val;
    try {
        return typeof val === 'string' ? JSON.parse(val) : {};
    } catch {
        return {};
    }
}

function parseDriveFiles(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'object') return val;
    try {
        return typeof val === 'string' ? JSON.parse(val) : [];
    } catch {
        return [];
    }
}

function safeStringifyDriveFiles(val) {
    try {
        return typeof val === 'string'
            ? val
            : JSON.stringify(Array.isArray(val) ? val : (val && typeof val === 'object' ? val : []));
    } catch {
        return '[]';
    }
}

async function hasUnidadDateColumns(conn = getPool()) {
    if (!unidadDateColumnsPromise) {
        unidadDateColumnsPromise = conn.execute(
            `SELECT COUNT(*) AS total
             FROM information_schema.COLUMNS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = 'ciclos'
               AND COLUMN_NAME IN ('fecha_inicio', 'fecha_fin')`
        )
            .then(([rows]) => Number(rows[0]?.total) === 2)
            .catch((error) => {
                unidadDateColumnsPromise = null;
                throw error;
            });
    }

    return unidadDateColumnsPromise;
}

function mapCicloRow(row) {
    if (!row) return null;
    return {
        ...row,
        fecha_inicio: formatDateOnly(row.fecha_inicio),
        fecha_fin: formatDateOnly(row.fecha_fin),
    };
}

function mapUnidadRow(row) {
    if (!row) return null;
    const fechaInicio = formatDateOnly(row.fecha_inicio);
    const fechaTermino = formatDateOnly(row.fecha_fin);
    return {
        ...row,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaTermino,
        fechaInicio,
        fechaTermino,
    };
}

function mapTemaRow(row) {
    if (!row) return null;
    const semanaOrden = normalizePositiveInteger(row.orden, 1);
    return {
        ...row,
        drive_files: parseDriveFiles(row.drive_files),
        orden: semanaOrden,
        semana_orden: semanaOrden,
    };
}

function mapPlaneacionRow(row) {
    if (!row) return null;
    const metadata = normalizeJsonObject(row.metadata);
    const semanaSugerida = Number.parseInt(metadata.semana_sugerida, 10);
    return {
        ...row,
        metadata,
        fecha_asignada: formatDateOnly(row.fecha_asignada),
        unidad_fecha_inicio: formatDateOnly(row.unidad_fecha_inicio),
        unidad_fecha_fin: formatDateOnly(row.unidad_fecha_fin),
        semana_sugerida: Number.isInteger(semanaSugerida) && semanaSugerida > 0 ? semanaSugerida : null,
    };
}

async function getCicloById(userId, cicloId, conn = getPool()) {
    const [rows] = await conn.execute(
        'SELECT * FROM ciclos_escolares WHERE id = ? AND user_id = ? LIMIT 1',
        [cicloId, userId]
    );
    return mapCicloRow(rows[0]);
}

async function getUnidadById(userId, unidadId, conn = getPool()) {
    const [rows] = await conn.execute(
        'SELECT * FROM ciclos WHERE id = ? AND user_id = ? LIMIT 1',
        [unidadId, userId]
    );
    return mapUnidadRow(rows[0]);
}

async function getTemaById(userId, temaId, conn = getPool()) {
    const [rows] = await conn.execute(
        'SELECT * FROM temarios WHERE id = ? AND user_id = ? LIMIT 1',
        [temaId, userId]
    );
    return mapTemaRow(rows[0]);
}

async function recalculateUnidadDateRanges(conn, userId, unidadIds) {
    const uniqueIds = [...new Set((unidadIds || []).map(id => Number.parseInt(id, 10)).filter(Number.isInteger))];
    if (!uniqueIds.length) return;
    if (!(await hasUnidadDateColumns(conn))) return;

    for (const unidadId of uniqueIds) {
        const [rows] = await conn.execute(
            `SELECT MIN(fecha_asignada) AS fecha_inicio, MAX(fecha_asignada) AS fecha_fin
             FROM planeacion_detallada
             WHERE user_id = ? AND unidad_id = ? AND fecha_asignada IS NOT NULL`,
            [userId, unidadId]
        );

        const range = rows[0] || {};
        await conn.execute(
            `UPDATE ciclos
             SET fecha_inicio = ?, fecha_fin = ?, updated_at = NOW()
             WHERE id = ? AND user_id = ?`,
            [formatDateOnly(range.fecha_inicio), formatDateOnly(range.fecha_fin), unidadId, userId]
        );
    }
}

// --- Ciclos escolares ---

async function listCiclos(userId) {
    const [rows] = await getPool().execute(
        'SELECT * FROM ciclos_escolares WHERE user_id = ? ORDER BY fecha_inicio DESC',
        [userId]
    );
    return rows.map(mapCicloRow);
}

async function createCiclo(userId, ciclo) {
    const pool = getPool();
    const [result] = await pool.execute(
        `INSERT INTO ciclos_escolares (user_id, course_id, nombre, fecha_inicio, fecha_fin, created_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [userId, ciclo.course_id, ciclo.nombre, ciclo.fecha_inicio, ciclo.fecha_fin]
    );
    return getCicloById(userId, result.insertId, pool);
}

async function deleteCiclo(userId, cicloId) {
    await getPool().execute('DELETE FROM ciclos_escolares WHERE id = ? AND user_id = ?', [cicloId, userId]);
}

// --- Días inhábiles ---

async function listDiasInhabiles(userId, cicloId) {
    let query = 'SELECT * FROM dias_inhabiles WHERE user_id = ?';
    const params = [userId];
    if (cicloId) {
        query += ' AND ciclo_id = ?';
        params.push(cicloId);
    }
    query += ' ORDER BY fecha ASC';
    const [rows] = await getPool().execute(query, params);
    return rows.map(row => ({ ...row, fecha: formatDateOnly(row.fecha) }));
}

async function createDiaInhabil(userId, { ciclo_id, fecha, motivo }) {
    const pool = getPool();
    const [result] = await pool.execute(
        'INSERT INTO dias_inhabiles (user_id, ciclo_id, fecha, motivo) VALUES (?, ?, ?, ?)',
        [userId, ciclo_id, fecha, motivo]
    );
    const [rows] = await pool.execute('SELECT * FROM dias_inhabiles WHERE id = ?', [result.insertId]);
    return { ...rows[0], fecha: formatDateOnly(rows[0]?.fecha) };
}

async function deleteDiaInhabil(userId, id) {
    await getPool().execute('DELETE FROM dias_inhabiles WHERE id = ? AND user_id = ?', [id, userId]);
}

// --- Planeación detallada ---

async function listPlaneacion(userId, cicloId) {
    const includeUnidadDates = await hasUnidadDateColumns();
    const [rows] = await getPool().execute(
        `SELECT p.*, c.nombre AS unidad_nombre, c.classroom_topic_id,
                ${includeUnidadDates ? 'c.fecha_inicio' : 'NULL'} AS unidad_fecha_inicio,
                ${includeUnidadDates ? 'c.fecha_fin' : 'NULL'} AS unidad_fecha_fin
         FROM planeacion_detallada p
         LEFT JOIN ciclos c ON c.id = p.unidad_id
         WHERE p.ciclo_id = ? AND p.user_id = ?
         ORDER BY p.fecha_asignada ASC, p.hora_inicio ASC`,
        [cicloId, userId]
    );
    return rows.map(mapPlaneacionRow);
}

async function upsertPlaneacionBatch(userId, courseId, items) {
    const pool = getPool();
    const conn = await pool.getConnection();
    const results = [];
    const affectedUnidadIds = new Set();

    try {
        await conn.beginTransaction();

        for (const item of items) {
            const safe = (v) => (v === undefined ? null : v);
            const metadata = normalizeJsonObject(item.metadata);
            const semanaSugerida = normalizePositiveInteger(
                item.semana_orden ?? item.orden ?? metadata.semana_sugerida,
                1
            );
            const normalizedMetadata = { ...metadata, semana_sugerida: semanaSugerida };

            if (item.id) {
                const [currentRows] = await conn.execute(
                    'SELECT unidad_id FROM planeacion_detallada WHERE id = ? AND user_id = ? LIMIT 1',
                    [item.id, userId]
                );
                const previousUnidadId = currentRows[0]?.unidad_id;
                if (previousUnidadId) affectedUnidadIds.add(previousUnidadId);

                await conn.execute(
                    `UPDATE planeacion_detallada SET titulo_tema=?, fecha_asignada=?, hora_inicio=?, hora_fin=?,
                     duracion_minutos=?, unidad_id=?, status=?, metadata=?, updated_at=NOW()
                     WHERE id=? AND user_id=?`,
                    [
                        item.titulo_tema,
                        item.fecha_asignada,
                        item.hora_inicio,
                        item.hora_fin,
                        item.duracion_minutos,
                        item.unidad_id,
                        item.status || 'draft',
                        JSON.stringify(normalizedMetadata),
                        item.id,
                        userId,
                    ]
                );
                results.push({ id: item.id, status: 'updated' });
            } else {
                const [res] = await conn.execute(
                    `INSERT INTO planeacion_detallada
                     (user_id, ciclo_id, unidad_id, titulo_tema, fecha_asignada, hora_inicio, hora_fin, duracion_minutos, status, metadata, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                    [
                        userId,
                        safe(item.ciclo_id),
                        safe(item.unidad_id),
                        item.titulo_tema ?? '',
                        safe(item.fecha_asignada),
                        safe(item.hora_inicio),
                        safe(item.hora_fin),
                        item.duracion_minutos ?? 60,
                        item.status || 'draft',
                        JSON.stringify(normalizedMetadata),
                    ]
                );
                results.push({ id: res.insertId, status: 'created' });
            }

            if (item.unidad_id) affectedUnidadIds.add(item.unidad_id);
        }

        await upsertTemariosFromPlaneacion(conn, userId, courseId, items);
        await recalculateUnidadDateRanges(conn, userId, [...affectedUnidadIds]);
        await conn.commit();
    } catch (err) {
        await conn.rollback();
        throw err;
    } finally {
        conn.release();
    }

    return results;
}

async function deletePlaneacionByCiclo(userId, cicloId) {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [rows] = await conn.execute(
            'SELECT DISTINCT unidad_id FROM planeacion_detallada WHERE ciclo_id = ? AND user_id = ? AND unidad_id IS NOT NULL',
            [cicloId, userId]
        );
        await conn.execute(
            'DELETE FROM planeacion_detallada WHERE ciclo_id = ? AND user_id = ?',
            [cicloId, userId]
        );
        await recalculateUnidadDateRanges(conn, userId, rows.map(row => row.unidad_id));
        await conn.commit();
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
}

async function deletePlaneacionDraft(userId, cicloId) {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const [rows] = await conn.execute(
            'SELECT DISTINCT unidad_id FROM planeacion_detallada WHERE ciclo_id = ? AND user_id = ? AND unidad_id IS NOT NULL AND status <> \'published\'',
            [cicloId, userId]
        );
        await conn.execute(
            'DELETE FROM planeacion_detallada WHERE ciclo_id = ? AND user_id = ? AND status <> \'published\'',
            [cicloId, userId]
        );
        if (rows.length) {
            await recalculateUnidadDateRanges(conn, userId, rows.map(row => row.unidad_id));
        }
        await conn.commit();
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
}

async function updatePlaneacionMetadata(id, userId, metadata) {
    await getPool().execute(
        'UPDATE planeacion_detallada SET metadata = ?, status = ?, updated_at = NOW() WHERE id = ? AND user_id = ?',
        [JSON.stringify(metadata), 'published', id, userId]
    );
}

// --- Unidades (ciclos de planeación) ---

async function listUnidades(userId, courseId) {
    const [rows] = await getPool().execute(
        'SELECT * FROM ciclos WHERE user_id = ? AND course_id = ? ORDER BY created_at ASC',
        [userId, courseId]
    );
    return rows.map(mapUnidadRow);
}

async function createUnidad(userId, data) {
    const pool = getPool();
    const safe = (v) => (v === undefined ? null : v);
    const fechaInicio = formatDateOnly(data.fecha_inicio ?? data.fechaInicio);
    const fechaFin = formatDateOnly(data.fecha_fin ?? data.fechaTermino);
    const includeUnidadDates = await hasUnidadDateColumns(pool);

    const [result] = includeUnidadDates
        ? await pool.execute(
            `INSERT INTO ciclos (user_id, course_id, nombre, fecha_inicio, fecha_fin, ciclo_escolar_id, classroom_topic_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                userId,
                safe(data.course_id ?? data.courseId),
                data.nombre ?? '',
                safe(fechaInicio),
                safe(fechaFin),
                safe(data.ciclo_escolar_id ?? data.cicloEscolarId),
                safe(data.classroom_topic_id),
            ]
        )
        : await pool.execute(
            `INSERT INTO ciclos (user_id, course_id, nombre, ciclo_escolar_id, classroom_topic_id, created_at)
             VALUES (?, ?, ?, ?, ?, NOW())`,
            [
                userId,
                safe(data.course_id ?? data.courseId),
                data.nombre ?? '',
                safe(data.ciclo_escolar_id ?? data.cicloEscolarId),
                safe(data.classroom_topic_id),
            ]
        );
    return getUnidadById(userId, result.insertId, pool);
}

async function updateUnidad(id, userId, data) {
    const safe = (v) => (v === undefined ? null : v);
    const updates = [];
    const values = [];
    const includeUnidadDates = await hasUnidadDateColumns();

    if (data.nombre !== undefined) {
        updates.push('nombre = ?');
        values.push(data.nombre ?? '');
    }
    if (includeUnidadDates && (data.fecha_inicio !== undefined || data.fechaInicio !== undefined)) {
        updates.push('fecha_inicio = ?');
        values.push(formatDateOnly(data.fecha_inicio ?? data.fechaInicio));
    }
    if (includeUnidadDates && (data.fecha_fin !== undefined || data.fechaTermino !== undefined)) {
        updates.push('fecha_fin = ?');
        values.push(formatDateOnly(data.fecha_fin ?? data.fechaTermino));
    }
    if (data.classroom_topic_id !== undefined) {
        updates.push('classroom_topic_id = ?');
        values.push(safe(data.classroom_topic_id));
    }
    if (data.ciclo_escolar_id !== undefined || data.cicloEscolarId !== undefined) {
        updates.push('ciclo_escolar_id = ?');
        values.push(safe(data.ciclo_escolar_id ?? data.cicloEscolarId));
    }

    if (updates.length) {
        values.push(id, userId);
        await getPool().execute(
            `UPDATE ciclos SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ? AND user_id = ?`,
            values
        );
    }

    return getUnidadById(userId, id);
}

async function deleteUnidadesByIds(userId, ids) {
    if (!ids.length) return;
    const placeholders = ids.map(() => '?').join(',');
    await getPool().execute(
        `DELETE FROM ciclos WHERE id IN (${placeholders}) AND user_id = ?`,
        [...ids, userId]
    );
}

async function updateUnidadTopicId(id, userId, classroomTopicId) {
    return updateUnidad(id, userId, { classroom_topic_id: classroomTopicId });
}

// --- Temarios ---

async function listTemarios(userId, courseId, unidadId) {
    let query = `SELECT t.*, c.nombre AS ciclo_nombre
                 FROM temarios t LEFT JOIN ciclos c ON c.id = t.ciclo_id
                 WHERE t.user_id = ? AND t.course_id = ?`;
    const params = [userId, courseId];
    const parsedUnidadId = unidadId != null && unidadId !== '' ? Number.parseInt(unidadId, 10) : null;
    if (Number.isInteger(parsedUnidadId)) {
        query += ' AND t.ciclo_id = ?';
        params.push(parsedUnidadId);
    }
    query += ' ORDER BY t.orden ASC, t.created_at ASC';
    const [rows] = await getPool().execute(query, params);
    return rows.map(mapTemaRow);
}

async function upsertTemariosFromPlaneacion(conn, userId, courseId, items) {
    const safe = (v) => (v === undefined ? null : v);
    if (!courseId || !Array.isArray(items) || !items.length) return;

    for (const item of items) {
        const unidadId = item.unidad_id ?? null;
        const nombre = item.titulo_tema?.trim();
        if (!unidadId || !nombre) continue;

        const metadata = normalizeJsonObject(item.metadata);
        const recomendaciones = metadata.notas_ai || null;
        const driveFiles = metadata.materiales_usados || [];
        const classroomTopicId = metadata.classroom_topic_id;
        const semanaOrden = normalizePositiveInteger(
            item.semana_orden ?? item.orden ?? metadata.semana_sugerida,
            1
        );

        const [existingRows] = await conn.execute(
            `SELECT id, classroom_topic_id
             FROM temarios
             WHERE user_id = ? AND course_id = ? AND ciclo_id = ? AND nombre = ? AND orden = ?
             LIMIT 1`,
            [userId, courseId, unidadId, nombre, semanaOrden]
        );

        if (existingRows.length) {
            const existing = existingRows[0];
            await conn.execute(
                `UPDATE temarios
                 SET recomendaciones = ?, orden = ?, estado = ?, drive_files = ?, classroom_topic_id = ?, updated_at = NOW()
                 WHERE id = ? AND user_id = ?`,
                [
                    recomendaciones,
                    semanaOrden,
                    'pendiente',
                    safeStringifyDriveFiles(driveFiles),
                    safe(classroomTopicId ?? existing.classroom_topic_id),
                    existing.id,
                    userId,
                ]
            );
            continue;
        }

        await conn.execute(
            `INSERT INTO temarios
             (user_id, course_id, ciclo_id, nombre, recomendaciones, orden, estado, drive_files, classroom_topic_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [
                userId,
                courseId,
                unidadId,
                nombre,
                recomendaciones,
                semanaOrden,
                'pendiente',
                safeStringifyDriveFiles(driveFiles),
                safe(classroomTopicId),
            ]
        );
    }
}

async function createTema(userId, tema) {
    const pool = getPool();
    const safe = (v) => (v === undefined ? null : v);
    const semanaOrden = normalizePositiveInteger(tema.semana_orden ?? tema.orden, 1);
    const [result] = await pool.execute(
        `INSERT INTO temarios (user_id, course_id, ciclo_id, nombre, recomendaciones, orden, estado, drive_files, classroom_topic_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
            userId,
            safe(tema.course_id),
            safe(tema.ciclo_id),
            tema.nombre ?? '',
            safe(tema.recomendaciones),
            semanaOrden,
            tema.estado || 'pendiente',
            safeStringifyDriveFiles(tema.drive_files),
            safe(tema.classroom_topic_id),
        ]
    );
    return getTemaById(userId, result.insertId, pool);
}

async function updateTema(id, userId, tema) {
    const safe = (v) => (v === undefined ? null : v);
    const semanaOrden = normalizePositiveInteger(tema.semana_orden ?? tema.orden, 1);
    await getPool().execute(
        `UPDATE temarios SET nombre=?, recomendaciones=?, orden=?, estado=?, drive_files=?,
         classroom_topic_id=?, ciclo_id=?, updated_at=NOW() WHERE id=? AND user_id=?`,
        [
            tema.nombre,
            tema.recomendaciones || null,
            semanaOrden,
            tema.estado || 'pendiente',
            safeStringifyDriveFiles(tema.drive_files),
            tema.classroom_topic_id || null,
            safe(tema.ciclo_id),
            id,
            userId,
        ]
    );
    return getTemaById(userId, id);
}

async function deleteTema(id, userId) {
    await getPool().execute('DELETE FROM temarios WHERE id = ? AND user_id = ?', [id, userId]);
}

// --- Horarios ---

async function listHorarios(userId, courseId) {
    const [rows] = await getPool().execute(
        'SELECT * FROM horarios WHERE user_id = ? AND course_id = ? ORDER BY dia_index ASC, hora_inicio ASC',
        [userId, courseId]
    );
    return rows;
}

async function createHorario(userId, { course_id, dia_index, hora_inicio, hora_fin, duracion_minutos }) {
    const pool = getPool();
    const dur = duracion_minutos || null;
    const [result] = await pool.execute(
        'INSERT INTO horarios (user_id, course_id, dia_index, hora_inicio, hora_fin, duracion_minutos) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, course_id, dia_index, hora_inicio, hora_fin, dur]
    );
    const [rows] = await pool.execute('SELECT * FROM horarios WHERE id = ?', [result.insertId]);
    return rows[0];
}

async function updateHorario(id, userId, data) {
    const fields = ['dia_index', 'hora_inicio', 'hora_fin', 'duracion_minutos']
        .filter(k => data[k] !== undefined)
        .map(k => `${k} = ?`).join(', ');
    const values = ['dia_index', 'hora_inicio', 'hora_fin', 'duracion_minutos']
        .filter(k => data[k] !== undefined)
        .map(k => data[k]);
    if (!fields) return null;
    await getPool().execute(`UPDATE horarios SET ${fields}, updated_at = NOW() WHERE id = ? AND user_id = ?`, [...values, id, userId]);
    const [rows] = await getPool().execute('SELECT * FROM horarios WHERE id = ?', [id]);
    return rows[0];
}

async function deleteHorario(id, userId) {
    await getPool().execute('DELETE FROM horarios WHERE id = ? AND user_id = ?', [id, userId]);
}

module.exports = {
    listCiclos, createCiclo, deleteCiclo, getCicloById,
    listDiasInhabiles, createDiaInhabil, deleteDiaInhabil,
    listPlaneacion, upsertPlaneacionBatch, deletePlaneacionByCiclo, deletePlaneacionDraft, updatePlaneacionMetadata,
    listUnidades, createUnidad, updateUnidad, deleteUnidadesByIds, updateUnidadTopicId, getUnidadById,
    listTemarios, createTema, updateTema, deleteTema, getTemaById,
    listHorarios, createHorario, updateHorario, deleteHorario,
};
