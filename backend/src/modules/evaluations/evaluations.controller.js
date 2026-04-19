const evaluationsService = require('./evaluations.service');

async function listActividades(req, res, next) {
    try { res.json({ success: true, data: await evaluationsService.listActividades(req.user.id, req.params.courseId) }); }
    catch (err) { next(err); }
}

async function createActivity(req, res, next) {
    try {
        const data = await evaluationsService.createActivity(req.user.id, req.body);
        res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
}

async function deleteActivity(req, res, next) {
    try {
        await evaluationsService.deleteActivity(req.user.id, req.params.courseId, req.params.courseWorkId);
        await evaluationsService.deleteActividadLocal(req.params.id, req.user.id);
        res.json({ success: true });
    } catch (err) { next(err); }
}

async function deleteActividadLocal(req, res, next) {
    try {
        await evaluationsService.deleteActividadLocal(req.params.id, req.user.id);
        res.json({ success: true });
    } catch (err) { next(err); }
}

async function updateEstado(req, res, next) {
    try {
        await evaluationsService.updateEstado(req.params.id, req.user.id, req.body.estado);
        res.json({ success: true });
    } catch (err) { next(err); }
}

module.exports = { listActividades, createActivity, deleteActivity, deleteActividadLocal, updateEstado };

async function getSubmissions(req, res, next) {
    try {
        const activityId = req.params.activityId;
        const courseId = req.query.courseId;
        const page = parseInt(req.query.page || '1', 10);
        const limit = parseInt(req.query.limit || '25', 10);
        const data = await evaluationsService.listSubmissions(req.user.id, activityId, { courseId, page, limit });
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

async function generateDraft(req, res, next) {
    try {
        const activityId = req.params.activityId;
        const { courseId, idempotencyKey } = req.body || req.query || {};
        const result = await evaluationsService.generateDraft(req.user.id, activityId, { courseId, idempotencyKey });
        // If generation started async, return 202
        if (result?.status === 'generating') return res.status(202).json({ success: true, data: result });
        res.status(201).json({ success: true, data: result });
    } catch (err) { next(err); }
}

async function getDraft(req, res, next) {
    try {
        const draftId = req.params.draftId;
        const data = await evaluationsService.getDraft(req.user.id, draftId);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

async function patchDraftSubmission(req, res, next) {
    try {
        const draftId = req.params.draftId;
        const studentSubmissionId = req.params.studentSubmissionId;
        const payload = req.body;
        const updated = await evaluationsService.updateDraftSubmission(req.user.id, draftId, studentSubmissionId, payload);
        res.json({ success: true, data: updated });
    } catch (err) { next(err); }
}

async function publishDraft(req, res, next) {
    try {
        const draftId = req.params.draftId;
        const { courseId } = req.body || req.query || {};
        const result = await evaluationsService.publishDraft(req.user.id, draftId, { courseId });
        res.status(200).json({ success: true, data: result });
    } catch (err) { next(err); }
}

async function getPublishStatus(req, res, next) {
    try {
        const draftId = req.params.draftId;
        const data = await evaluationsService.getPublishStatus(req.user.id, draftId);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

module.exports = {
    listActividades,
    createActivity,
    deleteActivity,
    deleteActividadLocal,
    updateEstado,
    getSubmissions,
    generateDraft,
    getDraft,
    patchDraftSubmission,
    publishDraft,
    getPublishStatus
};
