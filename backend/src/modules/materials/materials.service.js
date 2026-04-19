const { buildAuthenticatedClient } = require('../../clients/google/oauth2Client');
const { getDriveClient } = require('../../clients/google/driveClient');
const { getClassroomClient } = require('../../clients/google/classroomClient');
const authRepo = require('../auth/auth.repository');
const coursesService = require('../courses/courses.service');
const materialsRepo = require('./materials.repository');
const ApiError = require('../../utils/ApiError');

async function buildAuth(userId) {
    const user = await authRepo.findById(userId);
    if (!user?.refresh_token) throw ApiError.unauthorized('Sin credenciales de Google');
    return buildAuthenticatedClient(null, user.refresh_token);
}

async function getDriveFolder(userId) {
    const auth = await buildAuth(userId);
    const drive = getDriveClient(auth);
    const folderName = 'Classroom Copilot Materiales';
    const { data } = await drive.files.list({
        q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
    });
    return data;
}

async function createDriveFolder(userId) {
    const auth = await buildAuth(userId);
    const drive = getDriveClient(auth);
    const { data } = await drive.files.create({
        requestBody: { name: 'Classroom Copilot Materiales', mimeType: 'application/vnd.google-apps.folder' },
        fields: 'id, name',
    });
    return data;
}

async function uploadFile(userId, { fileName, fileData, mimeType, parentFolderId }) {
    const auth = await buildAuth(userId);
    const drive = getDriveClient(auth);
    const buffer = Buffer.from(fileData, 'base64');

    const { data: fileInfo } = await drive.files.create({
        requestBody: { name: fileName, parents: parentFolderId ? [parentFolderId] : [] },
        media: { mimeType, body: require('stream').Readable.from(buffer) },
        fields: 'id, name',
    });
    return { fileId: fileInfo.id, fileName: fileInfo.name };
}

async function createDriveDocument(userId, { title, content }) {
    const auth = await buildAuth(userId);
    const drive = getDriveClient(auth);
    const { google } = require('googleapis');
    const docsApi = google.docs({ version: 'v1', auth });

    const { data: fileInfo } = await drive.files.create({
        requestBody: { name: title, mimeType: 'application/vnd.google-apps.document' },
        fields: 'id',
    });

    const plainText = content.replace(/<[^>]*>?/gm, '');
    if (plainText.trim()) {
        await docsApi.documents.batchUpdate({
            documentId: fileInfo.id,
            requestBody: {
                requests: [{ insertText: { location: { index: 1 }, text: plainText } }],
            },
        });
    }

    return {
        fileId: fileInfo.id,
        webViewLink: `https://docs.google.com/document/d/${fileInfo.id}/edit`,
    };
}

function normalizeSlideText(value) {
    if (Array.isArray(value)) return value.filter(Boolean).join('\n');
    if (value === null || value === undefined) return '';
    return String(value).trim();
}

function buildPresentationRequests(slides) {
    return slides.flatMap((slide, idx) => {
        const slideId = `slide_${idx + 1}`;
        const titleId = `title_${idx + 1}`;
        const bodyId = `body_${idx + 1}`;
        const title = normalizeSlideText(slide?.title) || `Diapositiva ${idx + 1}`;
        const body = normalizeSlideText(slide?.content);

        const requests = [{
            createSlide: {
                objectId: slideId,
                insertionIndex: idx,
                slideLayoutReference: { predefinedLayout: idx === 0 ? 'TITLE_AND_BODY' : 'TITLE_AND_BODY' },
                placeholderIdMappings: [
                    {
                        layoutPlaceholder: { type: 'TITLE', index: 0 },
                        objectId: titleId,
                    },
                    {
                        layoutPlaceholder: { type: 'BODY', index: 0 },
                        objectId: bodyId,
                    },
                ],
            },
        }, {
            insertText: {
                objectId: titleId,
                insertionIndex: 0,
                text: title,
            },
        }];

        if (body) {
            requests.push({
                insertText: {
                    objectId: bodyId,
                    insertionIndex: 0,
                    text: body,
                },
            });
        }

        return requests;
    });
}

async function createDrivePresentation(userId, { title, slides }) {
    const auth = await buildAuth(userId);
    const { google } = require('googleapis');
    const drive = getDriveClient(auth);
    const slidesApi = google.slides({ version: 'v1', auth });

    const { data: fileInfo } = await drive.files.create({
        requestBody: { name: title, mimeType: 'application/vnd.google-apps.presentation' },
        fields: 'id',
    });

    if (slides && Array.isArray(slides) && slides.length > 0) {
        const { data: presentation } = await slidesApi.presentations.get({
            presentationId: fileInfo.id,
        });
        const defaultSlideId = presentation.slides?.[0]?.objectId;
        const requests = [
            ...(defaultSlideId ? [{ deleteObject: { objectId: defaultSlideId } }] : []),
            ...buildPresentationRequests(slides),
        ];

        await slidesApi.presentations.batchUpdate({
            presentationId: fileInfo.id,
            requestBody: { requests },
        });
    }

    return {
        fileId: fileInfo.id,
        webViewLink: `https://docs.google.com/presentation/d/${fileInfo.id}/edit`,
    };
}

async function publishToClassroom(userId, { courseId, fileId, title, topicId, unitName }) {
    const auth = await buildAuth(userId);
    const classroom = getClassroomClient(auth);

    let resolvedTopicId = topicId;
    if (!resolvedTopicId && unitName) {
        try {
            const topics = await coursesService.listTopics(userId, courseId);
            const existing = topics.find(t => t.name.toLowerCase() === unitName.toLowerCase());
            if (existing) {
                resolvedTopicId = existing.topicId;
            } else {
                const newTopic = await coursesService.createTopic(userId, courseId, unitName);
                resolvedTopicId = newTopic.topicId;
            }
        } catch { /* continúa sin topic */ }
    }

    const payload = {
        title,
        state: 'PUBLISHED',
        ...(resolvedTopicId && { topicId: resolvedTopicId }),
        materials: [{ driveFile: { driveFile: { id: fileId } } }],
    };

    const { data } = await classroom.courses.courseWorkMaterials.create({
        courseId,
        requestBody: payload,
    });

    return { classroomMaterialId: data.id, classroomTopicId: resolvedTopicId };
}

async function listMateriales(userId, courseId) {
    return materialsRepo.listMateriales(userId, courseId);
}

async function saveMaterial(userId, material) {
    return materialsRepo.createMaterial(userId, material);
}

async function updateMaterial(id, userId, updates) {
    return materialsRepo.updateMaterial(id, userId, updates);
}

async function deleteMaterialsFromClassroom(userId, courseId, classroomMaterialIds) {
    if (!Array.isArray(classroomMaterialIds) || !classroomMaterialIds.length) return [];

    const auth = await buildAuth(userId);
    const classroom = getClassroomClient(auth);
    const results = [];

    for (const materialId of classroomMaterialIds) {
        try {
            await classroom.courses.courseWorkMaterials.delete({ courseId, id: materialId });
            results.push({ id: materialId, type: 'classroom-material', status: 'deleted' });
        } catch (e) {
            results.push({ id: materialId, type: 'classroom-material', status: 'error', error: e.message });
        }
    }

    await materialsRepo.deleteByClassroomMaterialIds(userId, courseId, classroomMaterialIds);
    return results;
}

module.exports = {
    getDriveFolder, createDriveFolder, uploadFile,
    createDriveDocument, createDrivePresentation, publishToClassroom,
    listMateriales, saveMaterial, updateMaterial, deleteMaterialsFromClassroom,
};
