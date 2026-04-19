const { getClassroomClient } = require('../../clients/google/classroomClient');
const { buildAuthenticatedClient } = require('../../clients/google/oauth2Client');
const authRepo = require('../auth/auth.repository');
const ApiError = require('../../utils/ApiError');

async function buildAuthForUser(userId) {
    const user = await authRepo.findById(userId);
    if (!user || !user.refresh_token) throw ApiError.unauthorized('Sin credenciales de Google');
    return buildAuthenticatedClient(null, user.refresh_token);
}

async function listCourses(userId) {
    const auth = await buildAuthForUser(userId);
    const classroom = getClassroomClient(auth);
    const { data } = await classroom.courses.list({ courseStates: ['ACTIVE'], teacherId: 'me' });
    return (data.courses || []).map(c => ({ id: c.id, name: c.name, section: c.section }));
}

async function listTopics(userId, courseId) {
    const auth = await buildAuthForUser(userId);
    const classroom = getClassroomClient(auth);
    const { data } = await classroom.courses.topics.list({ courseId });
    return (data.topic || []).map(t => ({
        topicId: t.topicId,
        name: t.name,
        updateTime: t.updateTime,
    }));
}

async function createTopic(userId, courseId, name) {
    const auth = await buildAuthForUser(userId);
    const classroom = getClassroomClient(auth);
    const { data } = await classroom.courses.topics.create({ courseId, requestBody: { name } });
    return data;
}

async function updateTopic(userId, courseId, topicId, name) {
    const auth = await buildAuthForUser(userId);
    const classroom = getClassroomClient(auth);
    const { data } = await classroom.courses.topics.patch({
        courseId,
        id: topicId,
        updateMask: 'name',
        requestBody: { name },
    });
    return data;
}

async function deleteTopic(userId, courseId, topicId) {
    const auth = await buildAuthForUser(userId);
    const classroom = getClassroomClient(auth);
    await classroom.courses.topics.delete({ courseId, id: topicId });
    return { success: true };
}

async function listAssignments(userId, courseId) {
    const auth = await buildAuthForUser(userId);
    const classroom = getClassroomClient(auth);
    const { data } = await classroom.courses.courseWork.list({ courseId });
    return (data.courseWork || []).map(w => ({ id: w.id, title: w.title, description: w.description }));
}

module.exports = { listCourses, listTopics, createTopic, updateTopic, deleteTopic, listAssignments, buildAuthForUser };
