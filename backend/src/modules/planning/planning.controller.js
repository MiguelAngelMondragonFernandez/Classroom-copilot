const planningService = require('./planning.service');

// Ciclos
async function listCiclos(req, res, next) {
    try { res.json({ success: true, data: await planningService.listCiclos(req.user.id) }); }
    catch (err) { next(err); }
}
async function createCiclo(req, res, next) {
    try { res.status(201).json({ success: true, data: await planningService.createCiclo(req.user.id, req.body) }); }
    catch (err) { next(err); }
}
async function deleteCiclo(req, res, next) {
    try { await planningService.deleteCiclo(req.user.id, req.params.id); res.json({ success: true }); }
    catch (err) { next(err); }
}

// Días inhábiles
async function listDiasInhabiles(req, res, next) {
    try { res.json({ success: true, data: await planningService.listDiasInhabiles(req.user.id, req.query.cicloId) }); }
    catch (err) { next(err); }
}
async function createDiaInhabil(req, res, next) {
    try { res.status(201).json({ success: true, data: await planningService.createDiaInhabil(req.user.id, req.body) }); }
    catch (err) { next(err); }
}
async function deleteDiaInhabil(req, res, next) {
    try { await planningService.deleteDiaInhabil(req.user.id, req.params.id); res.json({ success: true }); }
    catch (err) { next(err); }
}

// Planeación detallada
async function listPlaneacion(req, res, next) {
    try { res.json({ success: true, data: await planningService.listPlaneacion(req.user.id, req.params.cicloId) }); }
    catch (err) { next(err); }
}
async function deletePlaneacionByCiclo(req, res, next) {
    try {
        await planningService.deletePlaneacionByCiclo(req.user.id, req.params.cicloId);
        res.json({ success: true });
    } catch (err) { next(err); }
}
async function savePlaneacionBatch(req, res, next) {
    try {
        const { items, courseId } = req.body;
        const data = await planningService.savePlaneacionBatch(req.user.id, courseId, items);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}
async function syncPlaneacionBatch(req, res, next) {
    try {
        const { courseId, items } = req.body;
        const results = await planningService.syncPlaneacionBatch(req.user.id, courseId, items);
        res.json({ success: true, data: { results } });
    } catch (err) { next(err); }
}
async function deletePlaneacionBatch(req, res, next) {
    try {
        const { courseId, topicIds, materialIds, courseWorkIds, calendarEventIds, cicloId } = req.body;
        const results = await planningService.deletePlaneacionBatch(req.user.id, courseId, { topicIds, materialIds, courseWorkIds, calendarEventIds });
        if (cicloId) await planningService.deletePlaneacionByCiclo(req.user.id, cicloId);
        res.json({ success: true, data: { results } });
    } catch (err) { next(err); }
}

async function deletePlaneacionDraft(req, res, next) {
    try {
        const { cicloId } = req.body;
        await planningService.deletePlaneacionDraft(req.user.id, cicloId);
        res.json({ success: true });
    } catch (err) { next(err); }
}

// Unidades
async function listUnidades(req, res, next) {
    try { res.json({ success: true, data: await planningService.listUnidades(req.user.id, req.params.courseId) }); }
    catch (err) { next(err); }
}
async function createUnidad(req, res, next) {
    try {
        const body = { ...req.body, course_id: req.body.course_id ?? req.params.courseId };
        res.status(201).json({ success: true, data: await planningService.createUnidad(req.user.id, body) });
    } catch (err) { next(err); }
}
async function updateUnidad(req, res, next) {
    try {
        const data = await planningService.updateUnidad(req.params.id, req.user.id, req.body);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}
async function deleteUnidad(req, res, next) {
    try {
        await planningService.deleteUnidad(req.params.id, req.user.id);
        res.json({ success: true });
    } catch (err) { next(err); }
}

// Temarios
async function listTemarios(req, res, next) {
    try {
        const data = await planningService.listTemarios(req.user.id, req.params.courseId, req.query.unidadId);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}
async function syncTemariosState(req, res, next) {
    try {
        const unidadId = req.query.unidadId ?? null;
        const data = await planningService.computeTemariosStates(req.user.id, req.params.courseId, unidadId);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}
async function createTema(req, res, next) {
    try {
        const body = { ...req.body, course_id: req.body.course_id ?? req.params.courseId };
        res.status(201).json({ success: true, data: await planningService.createTema(req.user.id, body) });
    } catch (err) { next(err); }
}
async function updateTema(req, res, next) {
    try { res.json({ success: true, data: await planningService.updateTema(req.params.id, req.user.id, req.body) }); }
    catch (err) { next(err); }
}
async function deleteTema(req, res, next) {
    try { await planningService.deleteTema(req.params.id, req.user.id); res.json({ success: true }); }
    catch (err) { next(err); }
}

// Horarios
async function listHorarios(req, res, next) {
    try { res.json({ success: true, data: await planningService.listHorarios(req.user.id, req.params.courseId) }); }
    catch (err) { next(err); }
}
async function createHorario(req, res, next) {
    try { res.status(201).json({ success: true, data: await planningService.createHorario(req.user.id, { ...req.body, course_id: req.params.courseId }) }); }
    catch (err) { next(err); }
}
async function updateHorario(req, res, next) {
    try { res.json({ success: true, data: await planningService.updateHorario(req.params.id, req.user.id, req.body) }); }
    catch (err) { next(err); }
}
async function deleteHorario(req, res, next) {
    try { await planningService.deleteHorario(req.params.id, req.user.id); res.json({ success: true }); }
    catch (err) { next(err); }
}

module.exports = {
    listCiclos, createCiclo, deleteCiclo,
    listDiasInhabiles, createDiaInhabil, deleteDiaInhabil,
    listPlaneacion, deletePlaneacionByCiclo, savePlaneacionBatch, syncPlaneacionBatch, deletePlaneacionBatch, deletePlaneacionDraft,
    listUnidades, createUnidad, updateUnidad, deleteUnidad,
    listTemarios, syncTemariosState, createTema, updateTema, deleteTema,
    listHorarios, createHorario, updateHorario, deleteHorario,
};
