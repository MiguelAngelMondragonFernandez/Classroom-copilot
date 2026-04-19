const planningRepo = require('./planning.repository');
const coursesService = require('../courses/courses.service');
const materialsService = require('../materials/materials.service');
const { getClassroomClient } = require('../../clients/google/classroomClient');
const logger = require('../../utils/logger');
const { google } = require('googleapis');
const ApiError = require('../../utils/ApiError');

function normalizeDateOnly(value) {
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

function normalizeMetadata(value) {
    if (!value) return {};
    if (typeof value === 'object') return value;
    try {
        return typeof value === 'string' ? JSON.parse(value) : {};
    } catch {
        return {};
    }
}

async function ensureCicloEscolar(userId, cicloId) {
    const ciclo = await planningRepo.getCicloById(userId, cicloId);
    if (!ciclo) throw ApiError.notFound('El ciclo escolar indicado no existe.');
    return ciclo;
}

async function ensureUnidad(userId, unidadId) {
    const unidad = await planningRepo.getUnidadById(userId, unidadId);
    if (!unidad) throw ApiError.notFound('La unidad indicada no existe.');
    return unidad;
}

async function ensureTema(userId, temaId) {
    const tema = await planningRepo.getTemaById(userId, temaId);
    if (!tema) throw ApiError.notFound('El tema indicado no existe.');
    return tema;
}

async function validateUnidadPayload(userId, data, existingUnidad = null) {
    const courseId = data.course_id ?? data.courseId ?? existingUnidad?.course_id;
    if (!courseId) throw ApiError.badRequest('La unidad requiere un `course_id` válido.');

    const cicloEscolarId = data.ciclo_escolar_id ?? data.cicloEscolarId ?? existingUnidad?.ciclo_escolar_id ?? null;
    const fechaInicio = normalizeDateOnly(
        data.fecha_inicio ?? data.fechaInicio ?? existingUnidad?.fecha_inicio ?? existingUnidad?.fechaInicio
    );
    const fechaFin = normalizeDateOnly(
        data.fecha_fin ?? data.fechaTermino ?? existingUnidad?.fecha_fin ?? existingUnidad?.fechaTermino
    );

    if ((fechaInicio && !fechaFin) || (!fechaInicio && fechaFin)) {
        throw ApiError.badRequest('La unidad debe guardar ambas fechas o ninguna.');
    }
    if (fechaInicio && fechaFin && fechaInicio > fechaFin) {
        throw ApiError.badRequest('La fecha de inicio de la unidad no puede ser posterior a la fecha de fin.');
    }

    if (cicloEscolarId) {
        const cicloEscolar = await ensureCicloEscolar(userId, cicloEscolarId);
        if (cicloEscolar.course_id !== courseId) {
            throw ApiError.badRequest('La unidad debe pertenecer al mismo curso que el ciclo escolar.');
        }
        if (fechaInicio && fechaInicio < cicloEscolar.fecha_inicio) {
            throw ApiError.badRequest('La fecha de inicio de la unidad queda fuera del ciclo escolar.');
        }
        if (fechaFin && fechaFin > cicloEscolar.fecha_fin) {
            throw ApiError.badRequest('La fecha de fin de la unidad queda fuera del ciclo escolar.');
        }
    }

    return {
        ...data,
        course_id: courseId,
        ciclo_escolar_id: cicloEscolarId,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        nombre: data.nombre !== undefined ? String(data.nombre || '').trim() : existingUnidad?.nombre,
    };
}

async function validateTemaPayload(userId, data, existingTema = null) {
    const courseId = data.course_id ?? existingTema?.course_id;
    if (!courseId) throw ApiError.badRequest('El tema requiere un `course_id` válido.');

    const unidadId = data.ciclo_id ?? existingTema?.ciclo_id;
    if (!unidadId) throw ApiError.badRequest('El tema debe pertenecer a una unidad válida.');

    const unidad = await ensureUnidad(userId, unidadId);
    if (unidad.course_id !== courseId) {
        throw ApiError.badRequest('El tema y la unidad deben pertenecer al mismo curso.');
    }

    const nombre = data.nombre !== undefined ? String(data.nombre || '').trim() : existingTema?.nombre;
    if (!nombre) throw ApiError.badRequest('El nombre del tema es obligatorio.');

    const semanaOrden = normalizePositiveInteger(data.semana_orden ?? data.orden ?? existingTema?.orden, 1);

    return {
        ...data,
        course_id: courseId,
        ciclo_id: unidadId,
        nombre,
        orden: semanaOrden,
        semana_orden: semanaOrden,
    };
}

async function validatePlaneacionItems(userId, courseId, items) {
    if (!Array.isArray(items) || items.length === 0) {
        throw ApiError.badRequest('Debes enviar al menos un item de planeación.');
    }

    const ciclos = new Map();
    const unidades = new Map();
    let resolvedCourseId = courseId || null;

    const normalizedItems = [];
    for (const item of items) {
        if (!item?.ciclo_id) {
            throw ApiError.badRequest('Cada registro de planeación debe incluir `ciclo_id`.');
        }

        let ciclo = ciclos.get(item.ciclo_id);
        if (!ciclo) {
            ciclo = await ensureCicloEscolar(userId, item.ciclo_id);
            ciclos.set(item.ciclo_id, ciclo);
        }

        if (!resolvedCourseId) {
            resolvedCourseId = ciclo.course_id;
        } else if (ciclo.course_id !== resolvedCourseId) {
            throw ApiError.badRequest('Todos los registros de planeación deben pertenecer al mismo curso.');
        }

        if (item.unidad_id) {
            let unidad = unidades.get(item.unidad_id);
            if (!unidad) {
                unidad = await ensureUnidad(userId, item.unidad_id);
                unidades.set(item.unidad_id, unidad);
            }
            if (unidad.course_id !== resolvedCourseId) {
                throw ApiError.badRequest('La unidad indicada no pertenece al curso de la planeación.');
            }
        }

        const metadata = normalizeMetadata(item.metadata);
        const semanaSugerida = normalizePositiveInteger(
            item.semana_orden ?? item.orden ?? metadata.semana_sugerida,
            1
        );

        normalizedItems.push({
            ...item,
            orden: semanaSugerida,
            semana_orden: semanaSugerida,
            metadata: {
                ...metadata,
                semana_sugerida: semanaSugerida,
            },
        });
    }

    return { courseId: resolvedCourseId, items: normalizedItems };
}

// --- Ciclos escolares ---
async function listCiclos(userId) {
    return planningRepo.listCiclos(userId);
}
async function createCiclo(userId, data) {
    return planningRepo.createCiclo(userId, data);
}
async function deleteCiclo(userId, id) {
    return planningRepo.deleteCiclo(userId, id);
}

// --- Días inhábiles ---
async function listDiasInhabiles(userId, cicloId) {
    return planningRepo.listDiasInhabiles(userId, cicloId);
}
async function createDiaInhabil(userId, data) {
    return planningRepo.createDiaInhabil(userId, data);
}
async function deleteDiaInhabil(userId, id) {
    return planningRepo.deleteDiaInhabil(userId, id);
}

// --- Planeación ---
async function listPlaneacion(userId, cicloId) {
    return planningRepo.listPlaneacion(userId, cicloId);
}

async function deletePlaneacionByCiclo(userId, cicloId) {
    return planningRepo.deletePlaneacionByCiclo(userId, cicloId);
}

async function deletePlaneacionDraft(userId, cicloId) {
    return planningRepo.deletePlaneacionDraft(userId, cicloId);
}

async function savePlaneacionBatch(userId, courseId, items) {
    const validated = await validatePlaneacionItems(userId, courseId, items);
    return planningRepo.upsertPlaneacionBatch(userId, validated.courseId, validated.items);
}

async function syncPlaneacionBatch(userId, courseId, items) {
    const results = [];
    for (const item of items) {
        const itemResult = { id: item.id, titulo: item.titulo_tema, status: 'success', classroomTopicId: null, error: null };
        try {
            if (courseId) {
                const unitName = item.unidad_nombre || 'General';
                let topicId = null;
                try {
                    const topics = await coursesService.listTopics(userId, courseId);
                    const existing = topics.find(t => t.name.toLowerCase() === unitName.toLowerCase());
                    if (existing) {
                        topicId = existing.topicId;
                    } else {
                        const newTopic = await coursesService.createTopic(userId, courseId, unitName);
                        topicId = newTopic.topicId;
                    }
                } catch (tErr) {
                    logger.warn({ err: tErr }, 'Error sync topic en Classroom');
                }
                itemResult.classroomTopicId = topicId;

                if (item.id && topicId) {
                    const currentMeta = normalizeMetadata(item.metadata);
                    await planningRepo.updatePlaneacionMetadata(item.id, userId, {
                        ...currentMeta,
                        classroom_topic_id: topicId,
                    });
                }
            }
        } catch (err) {
            itemResult.status = 'error';
            itemResult.error = err.message;
        }
        results.push(itemResult);
    }
    return results;
}

async function deletePlaneacionBatch(userId, courseId, { topicIds = [], materialIds = [], courseWorkIds = [], calendarEventIds = [] }) {
    const results = [];

    // 1. Borrar materiales publicados de Classroom y DB local
    if (courseId && Array.isArray(materialIds) && materialIds.length) {
        try {
            const materialResults = await materialsService.deleteMaterialsFromClassroom(userId, courseId, materialIds);
            results.push(...materialResults);
        } catch (e) {
            logger.warn({ err: e, courseId }, 'Error borrando materiales de Classroom en deletePlaneacionBatch');
        }
    }

    // 1.5 Borrar actividades (courseWork) en Classroom si se proporcionan IDs
    if (courseId && Array.isArray(courseWorkIds) && courseWorkIds.length) {
        try {
            const auth = await coursesService.buildAuthForUser(userId);
            const classroom = getClassroomClient(auth);

            for (const cwId of courseWorkIds) {
                try {
                    await classroom.courses.courseWork.delete({ courseId, id: cwId });
                    results.push({ id: cwId, type: 'classroom-coursework', status: 'deleted' });
                } catch (e) {
                    results.push({ id: cwId, type: 'classroom-coursework', status: 'error', error: e.message });
                }
            }
        } catch (e) {
            logger.warn({ err: e, courseId }, 'Error borrando courseWork en deletePlaneacionBatch');
        }
    }

    // 2. Borrar topics en Classroom
    for (const topicId of topicIds) {
        try {
            await coursesService.deleteTopic(userId, courseId, topicId);
            results.push({ id: topicId, type: 'classroom-topic', status: 'deleted' });
        } catch (e) {
            results.push({ id: topicId, type: 'classroom-topic', status: 'error', error: e.message });
        }
    }

    // 3. Borrar eventos en Google Calendar (calendario principal)
    if (Array.isArray(calendarEventIds) && calendarEventIds.length) {
        try {
            const auth = await coursesService.buildAuthForUser(userId);
            const calendar = google.calendar({ version: 'v3', auth });
            for (const eventId of calendarEventIds) {
                try {
                    await calendar.events.delete({ calendarId: 'primary', eventId });
                    results.push({ id: eventId, type: 'calendar', status: 'deleted' });
                } catch (e) {
                    results.push({ id: eventId, type: 'calendar', status: 'error', error: e.message });
                }
            }
        } catch (e) {
            logger.warn({ err: e }, 'Error borrando eventos de calendario en deletePlaneacionBatch');
        }
    }

    return results;
}

// --- Unidades ---
async function listUnidades(userId, courseId) {
    return planningRepo.listUnidades(userId, courseId);
}
async function createUnidad(userId, data) {
    const payload = await validateUnidadPayload(userId, data);
    return planningRepo.createUnidad(userId, payload);
}
async function updateUnidad(id, userId, data) {
    const existingUnidad = await ensureUnidad(userId, id);
    const payload = await validateUnidadPayload(userId, data, existingUnidad);
    return planningRepo.updateUnidad(id, userId, payload);
}
async function deleteUnidad(id, userId) {
    await ensureUnidad(userId, id);
    return planningRepo.deleteUnidadesByIds(userId, [id]);
}
async function deleteUnidades(userId, ids) {
    return planningRepo.deleteUnidadesByIds(userId, ids);
}

// --- Temarios ---
async function listTemarios(userId, courseId, unidadId) {
    return planningRepo.listTemarios(userId, courseId, unidadId);
}

async function computeTemariosStates(userId, courseId, unidadId = null) {
    const temas = await planningRepo.listTemarios(userId, courseId, unidadId);
    const results = [];
    const today = new Date().toISOString().slice(0, 10);

    for (const tema of temas) {
        let computedEstado = tema.estado || 'pendiente';

        try {
            const unidad = tema.ciclo_id ? await planningRepo.getUnidadById(userId, tema.ciclo_id) : null;
            const unidadFechaFin = unidad?.fecha_fin || unidad?.fechaTermino || null;

            // Si existe fecha_fin de la unidad y ya pasó, y el tema no está completado ni marcado manualmente,
            // sugerimos un estado automático 'debio_verse' para indicar que debió impartirse.
            if (unidadFechaFin && unidadFechaFin < today) {
                if (tema.estado !== 'completado' && tema.estado !== 'tema_visto') {
                    computedEstado = 'debio_verse';
                }
            }
        } catch (e) {
            // No interrumpir por errores al leer unidad; dejar estado tal cual
        }

        results.push({ ...tema, computedEstado });
    }

    return results;
}
async function createTema(userId, data) {
    const payload = await validateTemaPayload(userId, data);
    return planningRepo.createTema(userId, payload);
}
async function updateTema(id, userId, data) {
    const existingTema = await ensureTema(userId, id);
    const payload = await validateTemaPayload(userId, data, existingTema);
    return planningRepo.updateTema(id, userId, payload);
}
async function deleteTema(id, userId) {
    await ensureTema(userId, id);
    return planningRepo.deleteTema(id, userId);
}

// --- Horarios ---
async function listHorarios(userId, courseId) { return planningRepo.listHorarios(userId, courseId); }
async function createHorario(userId, data) { return planningRepo.createHorario(userId, data); }
async function updateHorario(id, userId, data) { return planningRepo.updateHorario(id, userId, data); }
async function deleteHorario(id, userId) { return planningRepo.deleteHorario(id, userId); }

module.exports = {
    listCiclos, createCiclo, deleteCiclo,
    listDiasInhabiles, createDiaInhabil, deleteDiaInhabil,
    listPlaneacion, deletePlaneacionByCiclo, deletePlaneacionDraft, savePlaneacionBatch, syncPlaneacionBatch, deletePlaneacionBatch,
    listUnidades, createUnidad, updateUnidad, deleteUnidad, deleteUnidades,
    listTemarios, computeTemariosStates, createTema, updateTema, deleteTema,
    listHorarios, createHorario, updateHorario, deleteHorario,
};
