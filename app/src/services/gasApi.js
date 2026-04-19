/**
 * Adaptador de compatibilidad: mantiene la firma callGasApi(action, params, method)
 * pero ahora redirige al backend Express propio en lugar de Google Apps Script.
 *
 * Mapa de acciones -> endpoint REST:
 *   getCourses              GET  /api/courses
 *   getTopics               GET  /api/courses/:courseId/topics
 *   createTopic             POST /api/courses/:courseId/topics
 *   updateTopic             PATCH /api/courses/:courseId/topics/:topicId
 *   deleteTopic             DELETE /api/courses/:courseId/topics/:topicId
 *   syncPlaneacionBatch     POST /api/planning/batch/sync
 *   deletePlaneacionBatch   POST /api/planning/batch/delete
 *   uploadFile              POST /api/materials/drive/upload
 *   createDriveDocument     POST /api/materials/drive/document
 *   createDrivePresentation POST /api/materials/drive/presentation
 *   publishToClassroom      POST /api/materials/classroom/publish
 *   getDriveFolder          GET  /api/materials/drive/folder
 *   createDriveFolder       POST /api/materials/drive/folder
 *   createActivity          POST /api/evaluations
 *   deleteActivity          DELETE /api/evaluations/classroom/:courseId/:courseWorkId
 *   syncProfile             PATCH /api/users/me
 */

import api from './api';

const ACTION_MAP = {
    getCourses:             () => api.get('/api/courses'),
    getTopics:              (p) => api.get(`/api/courses/${p.courseId}/topics`),
    createTopic:            (p) => api.post(`/api/courses/${p.courseId}/topics`, { name: p.name }),
    updateTopic:            (p) => api.patch(`/api/courses/${p.courseId}/topics/${p.topicId}`, { name: p.name }),
    deleteTopic:            (p) => api.del(`/api/courses/${p.courseId}/topics/${p.topicId}`),

    syncPlaneacionBatch:    (p) => api.post('/api/planning/batch/sync', { courseId: p.courseId, items: p.items }),
    deletePlaneacionBatch:  (p) => api.post('/api/planning/batch/delete', p),

    uploadFile:             (p) => api.post('/api/materials/drive/upload', p),
    createDriveDocument:    (p) => api.post('/api/materials/drive/document', p),
    createDrivePresentation:(p) => api.post('/api/materials/drive/presentation', p),
    publishToClassroom:     (p) => api.post('/api/materials/classroom/publish', p),
    getDriveFolder:         ()  => api.get('/api/materials/drive/folder'),
    createDriveFolder:      ()  => api.post('/api/materials/drive/folder', {}),

    createActivity:         (p) => api.post('/api/evaluations', p),
    deleteActivity:         (p) => api.del(`/api/evaluations/classroom/${p.courseId}/${p.id}`),

    syncProfile:            (p) => api.patch('/api/users/me', p.profile),
    // Evaluation drafts and submissions
    getSubmissions:         (p) => api.get(`/api/evaluations/${p.activityId}/submissions?courseId=${encodeURIComponent(p.courseId)}&page=${p.page||1}&limit=${p.limit||25}`),
    generateDraft:          (p) => api.post(`/api/evaluations/${p.activityId}/drafts/generate`, { courseId: p.courseId, idempotencyKey: p.idempotencyKey }),
    getDraft:               (p) => api.get(`/api/evaluations/drafts/${p.draftId}`),
    updateDraftSubmission:  (p) => api.patch(`/api/evaluations/drafts/${p.draftId}/submissions/${p.studentSubmissionId}`, p.payload),
    publishDraft:           (p) => api.post(`/api/evaluations/drafts/${p.draftId}/publish`, { courseId: p.courseId }),
    getPublishStatus:       (p) => api.get(`/api/evaluations/drafts/${p.draftId}/publish-status`),
};

export const callGasApi = async (action, params = {}, _method = 'GET') => {
    const handler = ACTION_MAP[action];
    if (!handler) {
        console.error(`[API] Acción no mapeada: ${action}`);
        throw new Error(`Acción no reconocida: ${action}`);
    }
    //https://classroom.googleapis.com/v1/courses/{courseId}/courseWork/{id}

    // El token de Google ya no se pasa manualmente; el backend lo gestiona por sesión.
    const { token, ...rest } = params;

    try {
        const data = await handler(rest);
        console.log(`[API] ${action}:`, data);
        return data;
    } catch (error) {
        console.error(`[API] Error en ${action}:`, error.message);
        throw error;
    }
};
