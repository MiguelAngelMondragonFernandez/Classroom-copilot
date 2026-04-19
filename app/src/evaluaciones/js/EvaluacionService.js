import api from '../../services/api';

export const listadoActividades = async (courseId) => {
    if (!courseId) return [];
    try {
        return await api.get(`/api/evaluations/courses/${courseId}`) || [];
    } catch (error) {
        console.error('Error al obtener actividades:', error);
        return [];
    }
};

export const eliminarActividadSolicitud = async (id) => {
    try {
        await api.del(`/api/evaluations/${id}`);
        return { success: true };
    } catch (error) {
        console.error('Error al eliminar actividad de DB:', error);
        return { success: false, error: error.message };
    }
};

export const eliminarActividadCompleta = async (id, courseId, courseWorkId) => {
    try {
        await api.del(`/api/evaluations/${id}/classroom/${courseId}/${courseWorkId}`);
        return { success: true };
    } catch (error) {
        console.error('Error al eliminar actividad completa:', error);
        return { success: false, error: error.message };
    }
};

export const actualizarActividadEstado = async (id, estado) => {
    try {
        await api.patch(`/api/evaluations/${id}/estado`, { estado });
        return { success: true };
    } catch (error) {
        console.error('Error al actualizar estado:', error);
        return { success: false, error: error.message };
    }
};
