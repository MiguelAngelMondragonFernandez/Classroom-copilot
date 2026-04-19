const coursesService = require('./courses.service');

async function listCourses(req, res, next) {
    try {
        const data = await coursesService.listCourses(req.user.id);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

async function listTopics(req, res, next) {
    try {
        const data = await coursesService.listTopics(req.user.id, req.params.courseId);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

async function createTopic(req, res, next) {
    try {
        const data = await coursesService.createTopic(req.user.id, req.params.courseId, req.body.name);
        res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
}

async function updateTopic(req, res, next) {
    try {
        const data = await coursesService.updateTopic(req.user.id, req.params.courseId, req.params.topicId, req.body.name);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

async function deleteTopic(req, res, next) {
    try {
        const data = await coursesService.deleteTopic(req.user.id, req.params.courseId, req.params.topicId);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

async function listAssignments(req, res, next) {
    try {
        const data = await coursesService.listAssignments(req.user.id, req.params.courseId);
        res.json({ success: true, data });
    } catch (err) { next(err); }
}

module.exports = { listCourses, listTopics, createTopic, updateTopic, deleteTopic, listAssignments };
