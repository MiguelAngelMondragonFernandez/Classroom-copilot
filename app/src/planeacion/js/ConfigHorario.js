import api from '../../services/api';

export const listadoHorarios = async (courseId) => {
    if (!courseId) return [];
    try {
        return await api.get(`/api/planning/courses/${courseId}/horarios`) || [];
    } catch (error) {
        console.error('Error al obtener horarios:', error);
        return [];
    }
};

export const guardarHorario = async (horario) => {
    try {
        const data = await api.post(`/api/planning/courses/${horario.course_id}/horarios`, horario);
        return { success: true, data: [data] };
    } catch (error) {
        console.error('Error al guardar horario:', error);
        return { success: false, error: error.message };
    }
};

export const actualizarHorario = async (id, horario) => {
    try {
        const data = await api.patch(`/api/planning/horarios/${id}`, horario);
        return { success: true, data: [data] };
    } catch (error) {
        console.error('Error al actualizar horario:', error);
        return { success: false, error: error.message };
    }
};

export const eliminarHorario = async (id) => {
    try {
        await api.del(`/api/planning/horarios/${id}`);
        return { success: true };
    } catch (error) {
        console.error('Error al eliminar horario:', error);
        return { success: false, error: error.message };
    }
};
