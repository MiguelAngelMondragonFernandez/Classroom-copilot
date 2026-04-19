import api from '../../services/api';
import { callGasApi } from '../../services/gasApi';

// --- Ciclos escolares ---

export const listadoCiclosEscolares = async () => {
    try {
        return await api.get('/api/planning/ciclos') || [];
    } catch (error) {
        console.error('Error al obtener ciclos escolares:', error);
        return [];
    }
};

export const guardarCicloEscolar = async (ciclo) => {
    try {
        const data = await api.post('/api/planning/ciclos', ciclo);
        return { success: true, data };
    } catch (error) {
        console.error('Error al guardar ciclo escolar:', error);
        return { success: false, error: error.message };
    }
};

// --- Días inhábiles ---

export const listadoDiasInhabiles = async (cicloId) => {
    try {
        return await api.get('/api/planning/dias-inhabiles', cicloId ? { cicloId } : {}) || [];
    } catch (error) {
        console.error('Error al obtener días inhábiles:', error);
        return [];
    }
};

export const guardarDiaInhabil = async (id_ciclo, fecha, motivo) => {
    try {
        const data = await api.post('/api/planning/dias-inhabiles', { ciclo_id: id_ciclo, fecha, motivo });
        return { success: true, data };
    } catch (error) {
        console.error('Error al guardar día inhábil:', error);
        return { success: false, error: error.message };
    }
};

// --- Cálculo local de bloques disponibles (lógica pura, sin API) ---

/** Normaliza hora a string "HH:MM" o "HH:MM:SS" para cálculos */
function toHoraString(val) {
    if (!val) return null;
    if (typeof val === 'string') return val.split('.')[0].substring(0, 8);
    if (val instanceof Date) return val.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    return null;
}

/** Normaliza horario para calcularBloquesDisponibles: dia_index 0-6, horas como string */
export const normalizarHorarioParaBloques = (horarioSemanal) => {
    if (!horarioSemanal || !Array.isArray(horarioSemanal)) return [];
    return horarioSemanal.map(h => {
        const diaIdx = h.dia_index === 7 ? 0 : (h.dia_index ?? 1);
        // Soportar tanto snake_case (API) como camelCase
        const horaIni = toHoraString(h.hora_inicio ?? h.horaInicio);
        const horaFin = toHoraString(h.hora_fin ?? h.horaFin);
        return { ...h, dia_index: diaIdx, hora_inicio: horaIni, hora_fin: horaFin };
    }).filter(h => h.hora_inicio && h.hora_fin);
};

export const calcularBloquesDisponibles = (fechaInicio, fechaFin, diasInhabiles, horarioSemanal) => {
    const horario = normalizarHorarioParaBloques(horarioSemanal);
    const slotsInfo = [];
    const currentDate = new Date(`${fechaInicio}T00:00:00`);
    const endDate = new Date(`${fechaFin}T00:00:00`);
    const inhabilitadosSet = new Set(diasInhabiles);

    while (currentDate <= endDate) {
        const dateString = currentDate.toLocaleDateString('en-CA');
        const dayOfWeek = currentDate.getDay();

        if (!inhabilitadosSet.has(dateString)) {
            const clasesDelDia = horario.filter(h => h.dia_index === dayOfWeek);
            clasesDelDia.forEach(clase => {
                let duracion = clase.duracionMinutos ?? clase.duracion_minutos;
                if (!duracion && clase.hora_inicio && clase.hora_fin) {
                    const partsIni = clase.hora_inicio.split(':').map(Number);
                    const partsFin = clase.hora_fin.split(':').map(Number);
                    const [hIni, mIni] = [partsIni[0] ?? 0, partsIni[1] ?? 0];
                    const [hFin, mFin] = [partsFin[0] ?? 0, partsFin[1] ?? 0];
                    duracion = (hFin * 60 + mFin) - (hIni * 60 + mIni);
                }
                slotsInfo.push({
                    fecha: dateString,
                    diaSemana: dayOfWeek,
                    horaInicio: clase.hora_inicio,
                    horaFin: clase.hora_fin,
                    duracionMinutos: duracion || 60,
                });
            });
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return slotsInfo.sort((a, b) =>
        a.fecha === b.fecha ? (a.horaInicio || '').localeCompare(b.horaInicio || '') : a.fecha.localeCompare(b.fecha)
    );
};

// --- Planeación detallada ---

export const listadoPlaneacion = async (cicloId) => {
    try {
        return await api.get(`/api/planning/ciclos/${cicloId}/items`) || [];
    } catch (error) {
        console.error('Error al obtener planeación:', error);
        return [];
    }
};

export const guardarPlaneacionBatch = async (items, courseId = null) => {
    try {
        const data = await api.post('/api/planning/batch/save', { items, courseId });
        return { success: true, data };
    } catch (error) {
        console.error('Error en batch de planeación:', error);
        return { success: false, error: error.message };
    }
};

export const sincronizarPlaneacionBatch = async (items, courseId) => {
    try {
        const gasResponse = await callGasApi('syncPlaneacionBatch', { courseId, items }, 'POST');
        const results = gasResponse?.results || [];
        return { success: true, gasResults: results };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

export const eliminarPlaneacionPublicada = async (items, _googleToken, courseId) => {
    try {
        const calendarEventIds = items.filter(it => it.status === 'published' && it.metadata?.calendar_event_id).map(it => it.metadata.calendar_event_id);
        const materialIds = items.filter(it => it.status === 'published' && it.metadata?.classroom_material_id).map(it => it.metadata.classroom_material_id);
        const topicIds = [...new Set(items.filter(it => it.status === 'published' && it.metadata?.classroom_topic_id).map(it => it.metadata.classroom_topic_id))];

        const cicloId = items[0]?.ciclo_id;

        await callGasApi('deletePlaneacionBatch', { calendarEventIds, materialIds, topicIds, courseId, cicloId }, 'POST');

        if (cicloId) {
            await api.del(`/api/planning/ciclos/${cicloId}/items`).catch(() => {});
        }

        return { success: true };
    } catch (error) {
        console.error('Error al eliminar planeación publicada:', error);
        return { success: false, error: error.message };
    }
};

export const eliminarPlaneacionDraft = async (cicloId) => {
    try {
        await api.post('/api/planning/batch/delete-draft', { cicloId });
        return { success: true };
    } catch (error) {
        console.error('Error al eliminar planeación draft:', error);
        return { success: false, error: error.message };
    }
};
