import api from '../../services/api';

const normalizeTema = (tema) => {
    if (!tema) return tema;
    const semanaOrden = tema.semana_orden ?? tema.orden ?? 1;
    return {
        ...tema,
        orden: semanaOrden,
        semana_orden: semanaOrden,
    };
};

export const listadoTemarios = async (courseId, unidadId = null) => {
    if (!courseId) return [];
    try {
        const hasUnidadFilter = unidadId != null && unidadId !== '' && !isNaN(Number(unidadId));
        const params = hasUnidadFilter ? { unidadId: Number(unidadId) } : {};
        const data = await api.get(`/api/planning/courses/${courseId}/temarios`, params);
        return (data || []).map(normalizeTema);
    } catch (error) {
        console.error('Error al obtener temarios:', error);
        return [];
    }
};

export const syncEstadosTemarios = async (courseId, unidadId = null) => {
    if (!courseId) return [];
    try {
        const params = unidadId != null ? { unidadId } : {};
        return await api.get(`/api/planning/courses/${courseId}/temarios/sync-state`, params) || [];
    } catch (error) {
        console.error('Error al sincronizar estados de temarios:', error);
        return [];
    }
};

export const guardarTema = async (tema) => {
    try {
        const payload = {
            ...tema,
            orden: tema.semana_orden ?? tema.orden ?? 1,
            semana_orden: tema.semana_orden ?? tema.orden ?? 1,
        };
        const data = await api.post(`/api/planning/courses/${tema.course_id}/temarios`, payload);
        return { success: true, data: normalizeTema(data) };
    } catch (error) {
        console.error('Error al guardar tema:', error);
        return { success: false, error: error.message };
    }
};

export const actualizarTema = async (id, tema) => {
    try {
        const payload = {
            ...tema,
            orden: tema.semana_orden ?? tema.orden ?? 1,
            semana_orden: tema.semana_orden ?? tema.orden ?? 1,
        };
        const data = await api.patch(`/api/planning/temarios/${id}`, payload);
        return { success: true, data: normalizeTema(data) };
    } catch (error) {
        console.error('Error al actualizar tema:', error);
        return { success: false, error: error.message };
    }
};

export const eliminarTema = async (id) => {
    try {
        await api.del(`/api/planning/temarios/${id}`);
        return { success: true };
    } catch (error) {
        console.error('Error al eliminar tema:', error);
        return { success: false, error: error.message };
    }
};

export const guardarTemarioBatch = async (temas) => {
    try {
        const results = [];
        for (const tema of temas) {
            const payload = {
                ...tema,
                orden: tema.semana_orden ?? tema.orden ?? 1,
                semana_orden: tema.semana_orden ?? tema.orden ?? 1,
            };
            const data = await api.post(`/api/planning/courses/${tema.course_id}/temarios`, payload);
            results.push(normalizeTema(data));
        }
        return { success: true, data: results };
    } catch (error) {
        console.error('Error en batch de temarios:', error);
        return { success: false, error: error.message };
    }
};
