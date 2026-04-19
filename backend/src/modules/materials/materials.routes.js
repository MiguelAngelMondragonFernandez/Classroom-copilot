const { Router } = require('express');
const { requireAuth } = require('../../middlewares/auth');
const c = require('./materials.controller');

const router = Router();
router.use(requireAuth);

router.get('/drive/folder', c.getDriveFolder);
router.post('/drive/folder', c.createDriveFolder);
router.post('/drive/upload', c.uploadFile);
router.post('/drive/document', c.createDriveDocument);
router.post('/drive/presentation', c.createDrivePresentation);
router.post('/classroom/publish', c.publishToClassroom);

router.get('/courses/:courseId', c.listMateriales);
router.post('/', c.saveMaterial);
router.patch('/:id', c.updateMaterial);

module.exports = router;
