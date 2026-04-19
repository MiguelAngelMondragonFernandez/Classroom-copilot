const materialsService = require('./materials.service');

async function getDriveFolder(req, res, next) {
    try { res.json({ success: true, data: await materialsService.getDriveFolder(req.user.id) }); }
    catch (err) { next(err); }
}
async function createDriveFolder(req, res, next) {
    try { res.json({ success: true, data: await materialsService.createDriveFolder(req.user.id) }); }
    catch (err) { next(err); }
}
async function uploadFile(req, res, next) {
    try { res.json({ success: true, data: await materialsService.uploadFile(req.user.id, req.body) }); }
    catch (err) { next(err); }
}
async function createDriveDocument(req, res, next) {
    try { res.json({ success: true, data: await materialsService.createDriveDocument(req.user.id, req.body) }); }
    catch (err) { next(err); }
}
async function createDrivePresentation(req, res, next) {
    try {
        const slides = typeof req.body.content === 'string' ? JSON.parse(req.body.content).slides : req.body.content?.slides;
        res.json({ success: true, data: await materialsService.createDrivePresentation(req.user.id, { ...req.body, slides }) });
    } catch (err) { next(err); }
}
async function publishToClassroom(req, res, next) {
    try { res.json({ success: true, data: await materialsService.publishToClassroom(req.user.id, req.body) }); }
    catch (err) { next(err); }
}
async function listMateriales(req, res, next) {
    try { res.json({ success: true, data: await materialsService.listMateriales(req.user.id, req.params.courseId) }); }
    catch (err) { next(err); }
}
async function saveMaterial(req, res, next) {
    try { res.status(201).json({ success: true, data: await materialsService.saveMaterial(req.user.id, req.body) }); }
    catch (err) { next(err); }
}
async function updateMaterial(req, res, next) {
    try { res.json({ success: true, data: await materialsService.updateMaterial(req.params.id, req.user.id, req.body) }); }
    catch (err) { next(err); }
}

module.exports = { getDriveFolder, createDriveFolder, uploadFile, createDriveDocument, createDrivePresentation, publishToClassroom, listMateriales, saveMaterial, updateMaterial };
