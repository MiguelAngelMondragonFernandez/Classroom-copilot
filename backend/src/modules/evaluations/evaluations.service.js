const { buildAuthenticatedClient } = require('../../clients/google/oauth2Client');
const { getClassroomClient } = require('../../clients/google/classroomClient');
const authRepo = require('../auth/auth.repository');
const evaluationsRepo = require('./evaluations.repository');
const coursesService = require('../courses/courses.service');
const ApiError = require('../../utils/ApiError');
const logger = require('../../utils/logger');
const geminiClient = require('../../clients/google/geminiClient');

async function buildAuth(userId) {
    const user = await authRepo.findById(userId);
    if (!user?.refresh_token) throw ApiError.unauthorized('Sin credenciales de Google');
    return buildAuthenticatedClient(null, user.refresh_token);
}

function transformRubricToGoogleFormat(aiRubric) {
    return {
        criteria: aiRubric.map(crit => ({
            title: crit.criterio,
            description: crit.descripcion || '',
            levels: (crit.niveles || []).map(niv => ({
                title: niv.nivel,
                points: niv.puntos || 0,
                description: niv.descripcion || '',
            })),
        })),
    };
}

function computeMaxPointsFromRubric(rubric) {
    if (!Array.isArray(rubric) || rubric.length === 0) return 100;
    let total = 0;
    for (const crit of rubric) {
        if (typeof crit?.puntos_maximos_criterio === 'number' && crit.puntos_maximos_criterio > 0) {
            total += crit.puntos_maximos_criterio;
            continue;
        }
        if (Array.isArray(crit?.niveles) && crit.niveles.length > 0) {
            const maxNivel = crit.niveles.reduce((max, niv) => Math.max(max, Number(niv?.puntos || 0)), 0);
            total += maxNivel;
        }
    }
    return total > 0 ? total : 100;
}

function isRetryableGoogleError(err) {
    const code = err?.code || err?.status || err?.response?.status;
    return [408, 429, 500, 502, 503, 504].includes(code);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry(fn, maxAttempts = 3, baseDelayMs = 400) {
    let lastErr;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            if (attempt >= maxAttempts || !isRetryableGoogleError(err)) break;
            await sleep(baseDelayMs * Math.pow(2, attempt - 1));
        }
    }
    throw lastErr;
}

async function loadStudentsNameMap(classroom, courseId) {
    const map = new Map();
    let pageToken = null;
    try {
        do {
            const resp = await classroom.courses.students.list({ courseId, pageSize: 100, pageToken });
            const students = resp?.data?.students || [];
            for (const st of students) {
                map.set(st.userId, st?.profile?.name?.fullName || st?.profile?.emailAddress || st.userId);
            }
            pageToken = resp?.data?.nextPageToken || null;
        } while (pageToken);
    } catch (err) {
        logger.warn({ err, courseId }, 'No se pudo resolver nombres de alumnos; se usarán IDs');
    }
    return map;
}

function toSnakeUpdatePayload(payload) {
    const mapped = {};
    for (const [key, value] of Object.entries(payload || {})) {
        if (key === 'teacherGrade') mapped.teacher_grade = value;
        else if (key === 'teacherJustification') mapped.teacher_justification = value;
        else mapped[key.replace(/([A-Z])/g, '_$1').toLowerCase()] = value;
    }
    return mapped;
}

async function createActivity(userId, { courseId, activity, topicId, topicName, publishState }) {
    const auth = await buildAuth(userId);
    const classroom = getClassroomClient(auth);

    // Basic activity presence
    if (!activity || typeof activity !== 'object') {
        throw ApiError.badRequest('Actividad inválida', [{ field: 'activity' }]);
    }

    let resolvedTopicId = topicId ? String(topicId).trim() : null;
    if (resolvedTopicId === '') resolvedTopicId = null;

    if (resolvedTopicId) {
        try {
            await classroom.courses.topics.get({ courseId, id: resolvedTopicId });
        } catch (err) {
            logger.warn({ err, courseId, topicId: resolvedTopicId }, 'TopicId inválido, se intentará resolver por nombre');
            resolvedTopicId = null;
        }
    }

    if (!resolvedTopicId && topicName) {
        try {
            const normalizedName = topicName.trim().toLowerCase();
            const topics = await coursesService.listTopics(userId, courseId);
            const existing = topics.find(t => t.name.toLowerCase() === normalizedName);
            if (existing) {
                resolvedTopicId = existing.topicId;
            } else {
                const newTopic = await coursesService.createTopic(userId, courseId, topicName.trim());
                resolvedTopicId = newTopic.topicId;
            }
        } catch (tErr) {
            logger.warn({ err: tErr, courseId, topicName }, 'Error resolviendo/creando topic, se continúa sin topic');
        }
    }

    // Normalize and validate title/description
    const title = String(activity.titulo || '').trim();
    const description = String(activity.instrucciones || '').trim();
    if (!title) throw ApiError.badRequest('Título requerido', [{ field: 'activity.titulo' }]);
    if (!description) throw ApiError.badRequest('Instrucciones requeridas', [{ field: 'activity.instrucciones' }]);
    if (title.length > 3000) throw ApiError.badRequest('Título excede límite (3000 caracteres)', [{ field: 'activity.titulo' }]);
    if (description.length > 30000) throw ApiError.badRequest('Instrucciones exceden límite (30000 caracteres)', [{ field: 'activity.instrucciones' }]);

    // Normalize max points
    let maxPoints = activity.puntos_maximos;
    if (typeof maxPoints === 'string') maxPoints = Number(maxPoints);
    if (isNaN(maxPoints) || maxPoints <= 0) maxPoints = 100;

    // Parse and validate date (YYYY-MM-DD) and time (HH:MM)
    let year, month, day;
    let hours = 23, minutes = 59;
    let dateAutocorrected = false;

    if (activity.fecha_entrega) {
        const match = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(activity.fecha_entrega);
        if (match) {
            year = Number(match[1]);
            month = Number(match[2]);
            day = Number(match[3]);
            const d = new Date(year, month - 1, day);
            if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
                dateAutocorrected = true;
            }
        } else {
            dateAutocorrected = true;
        }
    } else {
        dateAutocorrected = true;
    }

    if (activity.hora_entrega) {
        const parts = (activity.hora_entrega || '').split(':').map(Number);
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]) && parts[0] >= 0 && parts[0] <= 23 && parts[1] >= 0 && parts[1] <= 59) {
            hours = parts[0];
            minutes = parts[1];
        } else {
            // keep default 23:59
        }
    }

    if (dateAutocorrected) {
        const dt = new Date();
        dt.setDate(dt.getDate() + 7);
        year = dt.getFullYear();
        month = dt.getMonth() + 1;
        day = dt.getDate();
        logger.warn({ userId, courseId, actividadTitulo: title }, 'Fecha inválida autocorregida a +7 días');
    }

    const courseWorkPayload = {
        title,
        description,
        materials: [],
        state: publishState || 'DRAFT',
        workType: 'ASSIGNMENT',
        maxPoints,
        ...(resolvedTopicId && { topicId: resolvedTopicId }),
        ...(year && month && day && { dueDate: { year, month, day } }),
        ...(!isNaN(hours) && !isNaN(minutes) && { dueTime: { hours, minutes } }),
    };

    let cwData;
    try {
        const resp = await classroom.courses.courseWork.create({
            courseId,
            requestBody: courseWorkPayload,
        });
        cwData = resp.data;
    } catch (err) {
        logger.error({ err, userId, courseId, payload: courseWorkPayload }, 'Error al crear courseWork en Google Classroom');
        // Map common Google API errors to ApiError
        const status = err.code || err.status || err?.response?.status;
        const googleErrors = err.errors || err?.response?.data?.error || err.message;
        if (status === 400) {
            logger.error({ googleErrors }, 'Detalles de error 400 de Google Classroom');
            throw ApiError.badRequest('Datos inválidos para Google Classroom', googleErrors);
        }
        if (status === 401) throw ApiError.unauthorized('Credenciales de Google inválidas');
        if (status === 403) throw ApiError.forbidden('Permisos insuficientes en Google Classroom');
        if (status === 404) throw ApiError.notFound('Recurso de Google no encontrado');

        // For other/unexpected errors, return a controlled internal error
        throw ApiError.internal('Error en integración con Google Classroom');
    }

    let rubricError = null;
    if (activity.rubrica && Array.isArray(activity.rubrica)) {
        try {
            const rubricPayload = transformRubricToGoogleFormat(activity.rubrica);
            await classroom.courses.courseWork.rubrics.create({
                courseId,
                courseWorkId: cwData.id,
                requestBody: rubricPayload,
            });
        } catch (rubricErr) {
            logger.warn({ err: rubricErr, userId, courseId, courseWorkId: cwData?.id }, 'No se pudo crear rúbrica nativa, inyectando en descripción');
            try {
                let textoRubrica = '\n\n════════════════════════════\n📋 GUÍA DE EVALUACIÓN (Rúbrica)\n════════════════════════════\n';
                activity.rubrica.forEach(crit => {
                    textoRubrica += `\n▸ ${crit.criterio.toUpperCase()}\n  ${crit.descripcion || ''}\n`;
                    (crit.niveles || []).forEach(niv => {
                        textoRubrica += `    • ${niv.puntos} pts – ${niv.nivel}: ${niv.descripcion || ''}\n`;
                    });
                });
                textoRubrica += '\n════════════════════════════\n';

                await classroom.courses.courseWork.patch({
                    courseId,
                    id: cwData.id,
                    updateMask: 'description',
                    requestBody: { description: (description || '') + textoRubrica },
                });
                rubricError = 'Tu cuenta no permite rúbricas automáticas. Se incluyó la guía en las instrucciones.';
            } catch (patchErr) {
                rubricError = `La tarea se creó pero la rúbrica no pudo vincularse: ${rubricErr.message}`;
            }
        }
    }

    const fechaCierreIso = year ? new Date(year, (month || 1) - 1, day || 1, hours || 23, minutes || 59).toISOString() : new Date().toISOString();
    const fechaCierre = fechaCierreIso.slice(0, 19).replace('T', ' ');
    await evaluationsRepo.createActividad(userId, {
        courseId,
        courseWorkId: cwData.id,
        rubricaJson: activity.rubrica,
        fechaCierre,
        estado: 'pendiente',
    });

    return { courseWorkId: cwData.id, alternateLink: cwData.alternateLink || null, rubricError, classroomTopicId: resolvedTopicId, autocorrectedDueDate: !!dateAutocorrected };
}

async function deleteActivity(userId, courseId, courseWorkId) {
    const auth = await buildAuth(userId);
    const classroom = getClassroomClient(auth);
    await classroom.courses.courseWork.delete({ courseId, id: courseWorkId });
    return { success: true };
}

async function listActividades(userId, courseId) {
    const activities = await evaluationsRepo.listActividades(userId, courseId);

    // Intentar sincronizar estados con Google Classroom cuando sea posible.
    let auth = null;
    try { auth = await buildAuth(userId); } catch (e) { auth = null; }
    if (!auth) return activities;

    const classroom = getClassroomClient(auth);

    const mapClassroomStateToLocal = (classroomState) => {
        const mapping = {
            'PUBLISHED': 'pendiente',
            'DRAFT': 'pendiente',
            'RETURNED': 'evaluando',
            'DELETED': 'error'
        };
        return mapping[classroomState] || 'pendiente';
    };

    for (const act of activities) {
        if (!act || !act.course_work_id) continue;
        try {
            const courseIdToUse = act.course_id || courseId;
            const resp = await classroom.courses.courseWork.get({ courseId: courseIdToUse, id: act.course_work_id });
            const cw = resp?.data;
            if (cw) {
                const estadoClassroom = mapClassroomStateToLocal(cw.state);
                if (estadoClassroom && estadoClassroom !== act.estado) {
                    try {
                        await evaluationsRepo.updateEstado(act.id, userId, estadoClassroom);
                        act.estado = estadoClassroom;
                    } catch (e) {
                        // No bloquear, dejar registro local sin cambio
                    }
                }
            }
        } catch (err) {
            // Si falla Classroom para esta actividad, lo registramos y seguimos
        }
    }

    return activities;
}

async function deleteActividadLocal(id, userId) {
    return evaluationsRepo.deleteActividad(id, userId);
}

async function updateEstado(id, userId, estado) {
    return evaluationsRepo.updateEstado(id, userId, estado);
}

module.exports = { createActivity, deleteActivity, listActividades, deleteActividadLocal, updateEstado };

// --- New draft/submissions/publish flow
async function listSubmissions(userId, activityId, { courseId, page = 1, limit = 25 } = {}) {
    // Read cached draft rows if exists; otherwise return empty
    const draft = await evaluationsRepo.findDraftByActivityAndUser(activityId, userId);
    if (!draft) return { draftId: null, submissions: [], total: 0, page, limit };
    const rows = await evaluationsRepo.listDraftRowsByDraftId(draft.id, page, limit);
    return { draftId: draft.id, submissions: rows.map(r => ({ ...r })), total: Number(draft.submission_count || rows.length), page, limit };
}

async function generateDraft(userId, activityId, { courseId, idempotencyKey } = {}) {
    // If a draft exists reuse it
    const existing = await evaluationsRepo.findDraftByActivityAndUser(activityId, userId);
    if (existing) return { status: 'existing', draftId: existing.id };

    // Fetch activity to get courseWorkId and rubric
    const actividad = await evaluationsRepo.getActividadById(activityId);
    if (!actividad) throw ApiError.notFound('Actividad no encontrada');
    const courseWorkId = actividad.course_work_id;
    const courseIdToUse = courseId || actividad.course_id;
    if (!courseIdToUse || !courseWorkId) throw ApiError.badRequest('Falta courseId o courseWorkId para la actividad');

    // Build auth and classroom client
    const auth = await buildAuth(userId);
    const classroom = getClassroomClient(auth);
    const studentNames = await loadStudentsNameMap(classroom, courseIdToUse);

    // Paginate studentSubmissions from Classroom
    const submissions = [];
    let pageToken = null;
    try {
        do {
            const resp = await classroom.courses.courseWork.studentSubmissions.list({
                courseId: courseIdToUse,
                courseWorkId,
                pageSize: 100,
                pageToken,
            });
            const items = resp?.data?.studentSubmissions || [];
            for (const s of items) {
                const attachments = [];
                const asg = s.assignmentSubmission || null;
                if (asg && Array.isArray(asg.attachments)) {
                    for (const a of asg.attachments) {
                        if (a.driveFile) attachments.push({ title: a.driveFile.title, id: a.driveFile.id, url: a.driveFile.alternateLink, mimeType: 'drive' });
                        if (a.link) attachments.push({ title: a.link.title || a.link.url, url: a.link.url, mimeType: 'link' });
                        if (a.youtubeVideo) attachments.push({ title: a.youtubeVideo.title || 'Video', url: a.youtubeVideo.alternateLink, mimeType: 'youtube' });
                    }
                }
                submissions.push({
                    studentSubmissionId: s.id,
                    studentId: s.userId,
                    studentName: studentNames.get(s.userId) || s?.userId || null,
                    submissionTime: s.creationTime ? new Date(s.creationTime).toISOString() : null,
                    state: s.state || null,
                    late: s.late || false,
                    draftGrade: s.draftGrade || null,
                    assignedGrade: s.assignedGrade || null,
                    alternateLink: s.alternateLink || null,
                    attachments,
                });
            }
            pageToken = resp?.data?.nextPageToken || null;
        } while (pageToken);
    } catch (err) {
        logger.error({ err, userId, activityId }, 'Error fetching studentSubmissions from Classroom');
        throw ApiError.internal('No se pudieron obtener las entregas desde Classroom');
    }

    // Create draft record
    const draft = await evaluationsRepo.createDraft(userId, { activityId, courseId: courseIdToUse, courseWorkId, rubricSnapshot: actividad.rubrica_json || null, idempotencyKey, aiModel: process.env.GEMINI_MODEL || null, submissionCount: submissions.length });

    // If no submissions, finish quickly
    if (submissions.length === 0) {
        await evaluationsRepo.setDraftStatus(draft.id, 'draft');
        return { status: 'completed', draftId: draft.id, submissionCount: 0 };
    }

    // Chunk submissions and call Gemini per chunk
    const chunkSize = parseInt(process.env.EVAL_CHUNK_SIZE || '15', 10);
    const chunks = [];
    for (let i = 0; i < submissions.length; i += chunkSize) chunks.push(submissions.slice(i, i + chunkSize));

    const allRows = [];
    for (const chunk of chunks) {
        // Build prompt: include rubric snapshot and simple per-student item with attachments links
        const promptParts = [];
        promptParts.push('Devuelve un JSON array con objetos {"studentSubmissionId","grade","justification"} evaluando cada entrega según la rúbrica proporcionada.');
        promptParts.push('Rúbrica: ' + JSON.stringify(actividad.rubrica_json || []));
        promptParts.push('MaxPoints: ' + computeMaxPointsFromRubric(actividad.rubrica_json || []));
        promptParts.push('Entregas:');
        for (const s of chunk) {
            promptParts.push(JSON.stringify({ studentSubmissionId: s.studentSubmissionId, attachments: s.attachments.map(a => ({ title: a.title, url: a.url })) }));
        }
        promptParts.push('Respuesta: JSON array. Ejemplo: [{"studentSubmissionId":"AbC...","grade":85,"justification":"..."}, ...]');
        const prompt = promptParts.join('\n');

        let gen;
        try {
            gen = await geminiClient.generateContent(prompt);
        } catch (gerr) {
            logger.error({ gerr, userId, activityId }, 'Gemini generateContent failed for chunk');
            // Mark AI results null for these students
            for (const s of chunk) {
                allRows.push({ student_submission_id: s.studentSubmissionId, student_id: s.studentId, student_name: s.studentName, submission_state: s.state, submission_time: s.submissionTime, attachments: s.attachments, ai_grade: null, ai_justification: null, ai_version: process.env.GEMINI_MODEL || null });
            }
            continue;
        }

        // Extract text from Gemini response robustly
        let text = '';
        try {
            if (gen && gen.candidates && gen.candidates[0] && gen.candidates[0].content) {
                const parts = gen.candidates[0].content.parts || [];
                text = parts.map(p => p.text || '').join('');
            } else if (typeof gen === 'string') {
                text = gen;
            } else {
                text = JSON.stringify(gen);
            }
        } catch (e) { text = JSON.stringify(gen); }

        let parsed = null;
        try {
            parsed = JSON.parse(text);
        } catch (e) {
            // try to extract JSON substring
            const m = text.match(/\[\s*\{[\s\S]*\}\s*\]/m);
            if (m) {
                try { parsed = JSON.parse(m[0]); } catch (e2) { parsed = null; }
            }
        }

        if (!Array.isArray(parsed)) {
            // fallback: mark nulls
            for (const s of chunk) {
                allRows.push({ student_submission_id: s.studentSubmissionId, student_id: s.studentId, student_name: s.studentName, submission_state: s.state, submission_time: s.submissionTime, attachments: s.attachments, ai_grade: null, ai_justification: null, ai_version: process.env.GEMINI_MODEL || null });
            }
        } else {
            // map parsed results to students
            const mapById = new Map(parsed.map(p => [String(p.studentSubmissionId), p]));
            for (const s of chunk) {
                const p = mapById.get(String(s.studentSubmissionId));
                if (p) {
                    const grade = (typeof p.grade === 'number') ? p.grade : (p.grade ? Number(p.grade) : null);
                    allRows.push({ student_submission_id: s.studentSubmissionId, student_id: s.studentId, student_name: s.studentName, submission_state: s.state, submission_time: s.submissionTime, attachments: s.attachments, ai_grade: isNaN(grade) ? null : grade, ai_justification: p.justification || null, ai_version: process.env.GEMINI_MODEL || null });
                } else {
                    allRows.push({ student_submission_id: s.studentSubmissionId, student_id: s.studentId, student_name: s.studentName, submission_state: s.state, submission_time: s.submissionTime, attachments: s.attachments, ai_grade: null, ai_justification: null, ai_version: process.env.GEMINI_MODEL || null });
                }
            }
        }
    }

    // Insert rows in DB
    try {
        await evaluationsRepo.insertDraftRowsBulk(draft.id, allRows.map(r => ({
            student_submission_id: r.student_submission_id,
            student_id: r.student_id,
            student_name: r.student_name,
            submission_state: r.submission_state,
            submission_time: r.submission_time,
            attachments: r.attachments,
            ai_grade: r.ai_grade,
            ai_justification: r.ai_justification,
            ai_version: r.ai_version
        })));
        await evaluationsRepo.updateDraftSubmissionCount(draft.id, allRows.length);
        await evaluationsRepo.setDraftStatus(draft.id, 'draft');
    } catch (err) {
        logger.error({ err, draftId: draft.id }, 'Error saving draft rows');
        await evaluationsRepo.setDraftStatus(draft.id, 'error');
        throw ApiError.internal('Error guardando borrador');
    }

    return { status: 'completed', draftId: draft.id, submissionCount: allRows.length };
}

async function getDraft(userId, draftId) {
    const draft = await evaluationsRepo.getDraftById(draftId);
    if (!draft) throw ApiError.notFound('Draft not found');
    if (draft.user_id !== userId) throw ApiError.forbidden('Not authorized');
    const rows = await evaluationsRepo.listDraftRowsByDraftId(draftId, 1, 1000);
    return { ...draft, submissions: rows };
}

async function updateDraftSubmission(userId, draftId, studentSubmissionId, payload) {
    const draft = await evaluationsRepo.getDraftById(draftId);
    if (!draft) throw ApiError.notFound('Draft not found');
    if (draft.user_id !== userId) throw ApiError.forbidden('Not authorized');
    const updated = await evaluationsRepo.updateDraftRow(draftId, studentSubmissionId, toSnakeUpdatePayload(payload));
    return updated;
}

async function publishDraft(userId, draftId, { courseId } = {}) {
    const draft = await evaluationsRepo.getDraftById(draftId);
    if (!draft) throw ApiError.notFound('Draft not found');
    if (draft.user_id !== userId) throw ApiError.forbidden('No autorizado para publicar este borrador');

    const courseIdToUse = courseId || draft.course_id;
    if (!courseIdToUse || !draft.course_work_id) throw ApiError.badRequest('Falta courseId o courseWorkId');

    await evaluationsRepo.setDraftStatus(draftId, 'publishing');

    // Fetch all rows
    const rows = await evaluationsRepo.listDraftRowsByDraftId(draftId, 1, 10000);
    const chunkSize = parseInt(process.env.EVAL_CHUNK_SIZE || '15', 10);
    const chunks = [];
    for (let i = 0; i < rows.length; i += chunkSize) chunks.push(rows.slice(i, i + chunkSize));

    const auth = await buildAuth(userId);
    const classroom = getClassroomClient(auth);

    const results = [];
    let succeeded = 0, failed = 0;

    for (const chunk of chunks) {
        for (const r of chunk) {
            const finalGrade = (r.teacher_grade !== null && r.teacher_grade !== undefined) ? r.teacher_grade : r.ai_grade;
            if (finalGrade === null || finalGrade === undefined) {
                await evaluationsRepo.markPublishResult(draftId, r.student_submission_id, { success: false, error: 'No grade to publish' });
                results.push({ studentSubmissionId: r.student_submission_id, success: false, error: 'No grade to publish' });
                failed++;
                continue;
            }

            try {
                // Patch assignedGrade
                await withRetry(() => classroom.courses.courseWork.studentSubmissions.patch({
                    courseId: courseIdToUse,
                    courseWorkId: draft.course_work_id,
                    id: r.student_submission_id,
                    updateMask: 'assignedGrade',
                    requestBody: { assignedGrade: Number(finalGrade) }
                }));

                // Try to return submission so student sees grade (best-effort)
                try {
                    if (typeof classroom.courses.courseWork.studentSubmissions.return === 'function') {
                        await withRetry(() => classroom.courses.courseWork.studentSubmissions.return({ courseId: courseIdToUse, courseWorkId: draft.course_work_id, id: r.student_submission_id }));
                    } else if (typeof classroom.courses.courseWork.studentSubmissions.returnSubmission === 'function') {
                        await withRetry(() => classroom.courses.courseWork.studentSubmissions.returnSubmission({ courseId: courseIdToUse, courseWorkId: draft.course_work_id, id: r.student_submission_id }));
                    }
                } catch (retErr) {
                    // Non-fatal: comment that return failed
                    logger.warn({ retErr, draftId, studentSubmissionId: r.student_submission_id }, 'No se pudo marcar devolución de entrega, continuar');
                }

                await evaluationsRepo.markPublishResult(draftId, r.student_submission_id, { success: true });
                const hasJustification = !!(r.teacher_justification || r.ai_justification);
                results.push({
                    studentSubmissionId: r.student_submission_id,
                    success: true,
                    warning: hasJustification ? 'Google Classroom API no expone endpoint oficial para publicar justificación como comentario privado en studentSubmissions.' : null,
                });
                succeeded++;
            } catch (err) {
                const msg = err?.message || 'Error publishing';
                await evaluationsRepo.markPublishResult(draftId, r.student_submission_id, { success: false, error: msg });
                results.push({ studentSubmissionId: r.student_submission_id, success: false, error: msg });
                failed++;
            }
        }
    }

    const publishedAt = new Date().toISOString();
    const finalStatus = failed === 0 ? 'published' : (succeeded === 0 ? 'error' : 'publish_partial');
    await evaluationsRepo.setDraftStatus(draftId, finalStatus);

    return { publishedAt, total: rows.length, succeeded, failed, results };
}

async function getPublishStatus(userId, draftId) {
    const draft = await evaluationsRepo.getDraftById(draftId);
    if (!draft) throw ApiError.notFound('Draft not found');
    if (draft.user_id !== userId) throw ApiError.forbidden('Not authorized');
    const rows = await evaluationsRepo.listDraftRowsByDraftId(draftId, 1, 1000);
    const summary = rows.map(r => ({ studentSubmissionId: r.student_submission_id, publishState: r.publish_state, publishError: r.publish_error }));
    return { draftId, rows: summary };
}

module.exports = Object.assign(module.exports, { listSubmissions, generateDraft, getDraft, updateDraftSubmission, publishDraft, getPublishStatus });
