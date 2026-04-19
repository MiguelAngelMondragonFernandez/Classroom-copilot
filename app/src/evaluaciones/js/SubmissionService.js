import { callGasApi } from '../../services/gasApi';

export const getSubmissions = async (activityId, courseId, page = 1, limit = 25) => {
  return await callGasApi('getSubmissions', { activityId, courseId, page, limit });
};

export const generateDraft = async (activityId, courseId, idempotencyKey) => {
  return await callGasApi('generateDraft', { activityId, courseId, idempotencyKey });
};

export const getDraft = async (draftId) => {
  return await callGasApi('getDraft', { draftId });
};

export const updateDraftSubmission = async (draftId, studentSubmissionId, payload) => {
  return await callGasApi('updateDraftSubmission', { draftId, studentSubmissionId, payload });
};

export const publishDraft = async (draftId, courseId) => {
  return await callGasApi('publishDraft', { draftId, courseId });
};

export const getPublishStatus = async (draftId) => {
  return await callGasApi('getPublishStatus', { draftId });
};
