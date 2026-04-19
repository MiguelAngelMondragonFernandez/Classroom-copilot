const { Router } = require('express');
const { requireAuth } = require('../../middlewares/auth');
const c = require('./planning.controller');

const router = Router();
router.use(requireAuth);

// Ciclos escolares
router.get('/ciclos', c.listCiclos);
router.post('/ciclos', c.createCiclo);
router.delete('/ciclos/:id', c.deleteCiclo);

// Días inhábiles
router.get('/dias-inhabiles', c.listDiasInhabiles);
router.post('/dias-inhabiles', c.createDiaInhabil);
router.delete('/dias-inhabiles/:id', c.deleteDiaInhabil);

// Planeación detallada
router.get('/ciclos/:cicloId/items', c.listPlaneacion);
router.delete('/ciclos/:cicloId/items', c.deletePlaneacionByCiclo);
router.post('/batch/save', c.savePlaneacionBatch);
router.post('/batch/sync', c.syncPlaneacionBatch);
router.post('/batch/delete', c.deletePlaneacionBatch);
router.post('/batch/delete-draft', c.deletePlaneacionDraft);

// Unidades (por curso)
router.get('/courses/:courseId/unidades', c.listUnidades);
router.post('/courses/:courseId/unidades', c.createUnidad);
router.patch('/unidades/:id', c.updateUnidad);
router.delete('/unidades/:id', c.deleteUnidad);

// Temarios (por curso)
router.get('/courses/:courseId/temarios', c.listTemarios);
router.get('/courses/:courseId/temarios/sync-state', c.syncTemariosState);
router.post('/courses/:courseId/temarios', c.createTema);
router.patch('/temarios/:id', c.updateTema);
router.delete('/temarios/:id', c.deleteTema);

// Horarios semanales
router.get('/courses/:courseId/horarios', c.listHorarios);
router.post('/courses/:courseId/horarios', c.createHorario);
router.patch('/horarios/:id', c.updateHorario);
router.delete('/horarios/:id', c.deleteHorario);

module.exports = router;
