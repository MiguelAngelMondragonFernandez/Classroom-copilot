const { Router } = require('express');
const { requireAuth } = require('../../middlewares/auth');
const { validate } = require('../../middlewares/validate');
const { z } = require('zod');
const c = require('./evaluations.controller');

const router = Router();
router.use(requireAuth);

// Zod schema for POST /api/evaluations
const createActivitySchema = z.object({
	body: z.object({
		courseId: z.string().min(1, 'courseId requerido'),
		activity: z.object({
			titulo: z.string().min(1, 'Título requerido'),
			instrucciones: z.string().min(1, 'Instrucciones requeridas'),
			puntos_maximos: z.union([z.number().int().positive(), z.string().regex(/^\d+$/).transform(v => Number(v))]).optional(),
			fecha_entrega: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
			hora_entrega: z.string().regex(/^\d{2}:\d{2}$/).optional(),
			rubrica: z.array(z.object({
				criterio: z.string().min(1),
				descripcion: z.string().optional(),
				puntos_maximos_criterio: z.number().positive(),
				niveles: z.array(z.object({
					nivel: z.string(),
					puntos: z.number(),
					descripcion: z.string().optional(),
				})).min(1)
			})).optional()
		}),
		topicId: z.string().nullable().optional(),
		topicName: z.string().optional(),
		publishState: z.enum(['DRAFT', 'PUBLISHED']).optional()
	})
});

const generateDraftSchema = z.object({
	body: z.object({
		courseId: z.string().min(1, 'courseId requerido'),
		idempotencyKey: z.string().optional(),
	}).partial(),
});

const patchDraftSubmissionSchema = z.object({
	params: z.object({ draftId: z.string(), studentSubmissionId: z.string() }),
	body: z.object({
		teacherGrade: z.union([z.number().min(0), z.null()]).optional(),
		teacherJustification: z.string().optional(),
	}).partial()
});

router.get('/courses/:courseId', c.listActividades);
router.post('/', validate(createActivitySchema), c.createActivity);
router.delete('/:id/classroom/:courseId/:courseWorkId', c.deleteActivity);
router.delete('/:id', c.deleteActividadLocal);
router.patch('/:id/estado', c.updateEstado);

// New routes for drafts, submissions and publish flow
router.get('/:activityId/submissions', c.getSubmissions); // paginated list from DB cache
router.post('/:activityId/drafts/generate', validate(generateDraftSchema), c.generateDraft); // generate draft via IA (idempotent)
router.get('/drafts/:draftId', c.getDraft);
router.patch('/drafts/:draftId/submissions/:studentSubmissionId', validate(patchDraftSubmissionSchema), c.patchDraftSubmission);
router.post('/drafts/:draftId/publish', c.publishDraft);
router.get('/drafts/:draftId/publish-status', c.getPublishStatus);

module.exports = router;
