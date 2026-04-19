import api from '../../services/api';

export const listadoMaterialesGenerados = async (courseId) => {
    try {
        return await api.get(`/api/materials/courses/${courseId}`) || [];
    } catch (error) {
        console.error('Error al obtener materiales:', error);
        return [];
    }
};

export const guardarMaterialGenerado = async (material) => {
    try {
        const data = await api.post('/api/materials', material);
        return { success: true, data: [data] };
    } catch (error) {
        console.error('Error al guardar material:', error);
        return { success: false, error: error.message };
    }
};

export const actualizarMaterialGenerado = async (materialId, updates) => {
    try {
        const data = await api.patch(`/api/materials/${materialId}`, updates);
        return { success: true, data: [data] };
    } catch (error) {
        console.error('Error al actualizar material:', error);
        return { success: false, error: error.message };
    }
};

export const calcularSemanaActual = (fechaInicioCiclo) => {
    const hoy = new Date();
    const inicio = new Date(`${fechaInicioCiclo}T00:00:00`);
    if (hoy < inicio) return 1;
    const diffDays = Math.floor(Math.abs(hoy - inicio) / (1000 * 60 * 60 * 24));
    return Math.floor(diffDays / 7) + 1;
};
