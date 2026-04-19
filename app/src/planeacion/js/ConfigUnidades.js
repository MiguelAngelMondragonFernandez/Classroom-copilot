import api from '../../services/api';
import { callGasApi } from '../../services/gasApi';

const normalizeUnidad = (unidad) => {
    if (!unidad) return unidad;
    const fechaInicio = unidad.fecha_inicio ?? unidad.fechaInicio ?? null;
    const fechaTermino = unidad.fecha_fin ?? unidad.fechaTermino ?? null;
    return {
        ...unidad,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaTermino,
        fechaInicio,
        fechaTermino,
    };
};

export const obtenerCursosClassroom = async () => {
    try {
        return await callGasApi('getCourses', {});
    } catch (error) {
        console.error('Error al obtener cursos de Classroom:', error);
        return [];
    }
};

export const listadoUnidades = async (courseId) => {
    try {
        const data = await api.get(`/api/planning/courses/${courseId}/unidades`);
        return (data || []).map(normalizeUnidad);
    } catch (error) {
        console.error('Error al obtener unidades:', error);
        return [];
    }
};

export const guardarUnidad = async (unidad) => {
    try {
        const courseId = unidad.course_id ?? unidad.courseId;
        if (!courseId) {
            return { success: false, error: 'Falta course_id para guardar la unidad.' };
        }
        const payload = {
            ...unidad,
            course_id: courseId,
            fecha_inicio: unidad.fecha_inicio ?? unidad.fechaInicio ?? null,
            fecha_fin: unidad.fecha_fin ?? unidad.fechaTermino ?? null,
        };
        const data = await api.post(`/api/planning/courses/${courseId}/unidades`, payload);
        const normalized = Array.isArray(data) ? data.map(normalizeUnidad) : [normalizeUnidad(data)];
        return { success: true, data: normalized };
    } catch (error) {
        console.error('Error al guardar unidad:', error);
        return { success: false, error: error.message };
    }
};

export const actualizarUnidad = async (id, unidad) => {
    try {
        const payload = {
            ...unidad,
            fecha_inicio: unidad.fecha_inicio ?? unidad.fechaInicio,
            fecha_fin: unidad.fecha_fin ?? unidad.fechaTermino,
        };
        const data = await api.patch(`/api/planning/unidades/${id}`, payload);
        return { success: true, data: normalizeUnidad(data) };
    } catch (error) {
        console.error('Error al actualizar unidad:', error);
        return { success: false, error: error.message };
    }
};

export const eliminarUnidad = async (id) => {
    try {
        await api.del(`/api/planning/unidades/${id}`);
        return { success: true };
    } catch (error) {
        console.error('Error al eliminar unidad:', error);
        return { success: false, error: error.message };
    }
};
