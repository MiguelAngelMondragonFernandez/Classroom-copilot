const { Router } = require('express');
const { requireAuth } = require('../../middlewares/auth');
const coursesController = require('./courses.controller');

const router = Router();
router.use(requireAuth);

router.get('/', coursesController.listCourses);
router.get('/:courseId/topics', coursesController.listTopics);
router.post('/:courseId/topics', coursesController.createTopic);
router.patch('/:courseId/topics/:topicId', coursesController.updateTopic);
router.delete('/:courseId/topics/:topicId', coursesController.deleteTopic);
router.get('/:courseId/assignments', coursesController.listAssignments);

module.exports = router;
