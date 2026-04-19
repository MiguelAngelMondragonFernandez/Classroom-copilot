import { askGemini } from './geminiApi';
import { listadoTemarios } from '../planeacion/js/ConfigTemario';
import { calcularBloquesDisponibles, normalizarHorarioParaBloques } from '../planeacion/js/ConfigPlaneacion';
import { listadoDiasInhabiles } from '../planeacion/js/ConfigPlaneacion';

/** Normaliza fecha a YYYY-MM-DD para cálculos */
function toFechaString(val) {
    if (!val) return null;
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
    if (val instanceof Date && !isNaN(val)) return val.toLocaleDateString('en-CA');
    if (typeof val === 'string') {
        const d = new Date(val);
        return !isNaN(d) ? d.toLocaleDateString('en-CA') : null;
    }
    return null;
}

/**
 * Genera la planeación usando Gemini, enviándole los temas existentes (o pidiendo que haga nuevos)
 * y los bloques de tiempo disponibles.
 * * @param {object} ciclo Objeto del ciclo escolar seleccionado
 * @param {array} horarioSemanal El horario del docente
 * @param {string} userId El ID del usuario en Firebase
 */
export const generarPlaneacionAI = async (ciclo, horarioSemanal, userId, aiConfig = {}) => {
    try {
        if (!ciclo || !horarioSemanal || horarioSemanal.length === 0) {
            throw new Error("Faltan datos requeridos (ciclo o horario) para generar la planeación.");
        }

        // Asegurar que horarioSemanal es un array (por si la API devuelve estructura anidada)
        const horarioArr = Array.isArray(horarioSemanal) ? horarioSemanal : (horarioSemanal?.data || []);

        // Normalizar fechas del ciclo
        const fechaInicio = toFechaString(ciclo.fecha_inicio);
        const fechaFin = toFechaString(ciclo.fecha_fin);

        if (!fechaInicio || !fechaFin) {
            throw new Error("El ciclo debe tener fechas de inicio y fin válidas (formato YYYY-MM-DD).");
        }
        if (fechaInicio > fechaFin) {
            throw new Error("La fecha de inicio del ciclo no puede ser posterior a la fecha de fin.");
        }

        // 1. Obtener días inhábiles (normalizar a YYYY-MM-DD para coincidir con calcularBloquesDisponibles)
        const diasInhabilesDB = await listadoDiasInhabiles(ciclo.id);
        const diasInhabiles = (diasInhabilesDB || [])
            .map(d => toFechaString(d.fecha) || d.fecha)
            .filter(Boolean);

        // 2. Verificar que el horario tiene entradas válidas tras normalización
        const horarioNormalizado = normalizarHorarioParaBloques(horarioArr);
        if (horarioNormalizado.length === 0) {
            throw new Error(
                "El horario no tiene bloques válidos (verifica que cada entrada tenga hora_inicio y hora_fin). " +
                "Revisa la configuración en el módulo de Horarios."
            );
        }

        // 3. Calcular Bloques (Slots)
        const slotsDisponibles = calcularBloquesDisponibles(
            fechaInicio,
            fechaFin,
            diasInhabiles,
            horarioArr
        );

        if (slotsDisponibles.length === 0) {
            throw new Error(
                "No hay bloques de tiempo disponibles en el rango de fechas proporcionado. " +
                "Verifica: 1) Que las fechas del ciclo sean correctas, 2) Que no todos los días estén marcados como inhábiles, " +
                "3) Que el horario tenga clases en días que caigan dentro del rango."
            );
        }

        // 3. Obtener temario actual (si existe) para dar contexto a la IA
        const temasActuales = await listadoTemarios(ciclo.course_id);

        // 4. Preparar el Prompt para la IA
        const systemPrompt = `
Eres un Asistente Académico Experto. Tu tarea es generar y distribuir un temario escolar en un calendario de clases disponible.

**CONTEXTO GENERAL DEL CICLO:**
- Curso Nombre: ${ciclo.nombre}
- Periodo del ciclo: Desde ${ciclo.fecha_inicio} hasta ${ciclo.fecha_fin}
- Total de Slots Disponibles: ${slotsDisponibles.length}
- Slots Disponibles (Orden Cronológico): ${JSON.stringify(slotsDisponibles)}
- Temas Actuales Registrados: ${JSON.stringify(temasActuales.map(t => ({ nombre: t.nombre, semana_orden: t.semana_orden ?? t.orden })))}

**REQUERIMIENTOS DEL DOCENTE:**
- Tema principal: ${aiConfig.temaMateria || 'General'}
- Alcances esperados: ${aiConfig.alcances || 'No especificados'}
- Distribución pedagógica: ${aiConfig.teoriaPorcentaje || 50}% Teoría, ${100 - (aiConfig.teoriaPorcentaje || 50)}% Práctica.
- Número de Unidades propuestas: ${aiConfig.numeroUnidades || 3}.
- Herramientas a utilizar: ${aiConfig.herramientas || 'Ninguna específica'}
- Materiales cargados: ${aiConfig.materiales?.map(m => m.name).join(', ') || 'Ninguno'}
- Lógica de fechas iniciales: ${aiConfig.usarFechasExistentes ? 'Respeta las fechas de las unidades existentes si las hay.' : 'Genera un cronograma nuevo desde cero.'}

**REGLAS DE FECHAS Y TIEMPOS (¡CRÍTICO!):**
1. ORDEN ESTRICTO: El sistema asignará las fechas reales consumiendo el arreglo de "Slots Disponibles" de izquierda a derecha (de la fecha más antigua a la más reciente).
2. DISTRIBUCIÓN PROPORCIONAL: Divide los ${slotsDisponibles.length} slots disponibles equitativamente entre las ${aiConfig.numeroUnidades || 3} unidades.
   - La Unidad 1 DEBE usar los primeros slots del arreglo (fechas iniciales del ciclo).
   - La Unidad 2 DEBE usar los slots de en medio.
   - La última Unidad DEBE usar los últimos slots (fechas finales del ciclo).
3. NO INVENTES FECHAS: NO devuelvas "fecha_asignada", "hora_inicio" ni "hora_fin" en tu respuesta. Solo debes devolver una "semana_sugerida" por tema dentro de su unidad.

**REGLAS ESTRUCTURALES:**
1. Crea una estructura jerárquica clara: "Unidades" agrupan a los "Temas" (clases individuales).
2. NUNCA crees una Unidad para cada clase individual.
3. Si los "Temas Actuales Registrados" coinciden con tu plan, prioriza sus nombres.
4. Puede haber varios temas en la misma semana de una unidad.
4. Tu respuesta debe ser ÚNICA y EXCLUSIVAMENTE en formato JSON válido, sin markdown adicional, sin \`\`\`json. NO AGREGUES TEXTO ANTES O DESPUES.

**ESTRUCTURA EXACTA DEL JSON DE RESPUESTA:**
{
  "unidades": [
    {
      "nombre": "Nombre de la Unidad Académica (Ej: Unidad 1: Fundamentos)",
      "temas": [
        {
          "titulo_tema": "Nombre de la Clase (Ej: Introducción a la IA)",
          "duracion_minutos": 90,
          "semana_sugerida": 1,
          "notas_ai": "Descripción pedagógica de la clase"
        }
      ]
    }
  ]
}`;

        // 5. Llamar a Gemini vía Proxy
        const result = await askGemini(userId, systemPrompt);
        
        let jsonResponse;
        try {
            // Limpiar posible markdown si Gemini se equivoca
            let cleanString = result.answer.trim();
            if (cleanString.startsWith("```json")) cleanString = cleanString.substring(7);
            if (cleanString.startsWith("```")) cleanString = cleanString.substring(3);
            if (cleanString.endsWith("```")) cleanString = cleanString.substring(0, cleanString.length - 3);
            
            jsonResponse = JSON.parse(cleanString.trim());
        } catch {
            console.error("Error parseando respuesta de Gemini:", result.answer);
            throw new Error("La IA no devolvió un formato válido JSON. Por favor, intenta de nuevo.");
        }

        if (!jsonResponse.unidades || !Array.isArray(jsonResponse.unidades)) {
            throw new Error("La estructura de la respuesta generada no es válida.");
        }

        // El sistema asigna las fechas reales a partir del horario y calcula el rango de cada unidad.
        let slotIndex = 0;
        for (const unidad of jsonResponse.unidades) {
            let firstFecha = null;
            let lastFecha = null;
            if (!unidad.temas || !Array.isArray(unidad.temas)) continue;

            for (let index = 0; index < unidad.temas.length; index += 1) {
                const tema = unidad.temas[index];
                const slot = slotsDisponibles[slotIndex];
                const semanaSugerida = Number.parseInt(tema?.semana_sugerida, 10);

                tema.semana_sugerida = Number.isInteger(semanaSugerida) && semanaSugerida > 0
                    ? semanaSugerida
                    : index + 1;

                if (slot) {
                    tema.fecha_asignada = slot.fecha;
                    tema.hora_inicio = slot.horaInicio;
                    tema.hora_fin = slot.horaFin;
                    firstFecha = firstFecha || slot.fecha;
                    lastFecha = slot.fecha;
                } else {
                    tema.fecha_asignada = null;
                    tema.hora_inicio = null;
                    tema.hora_fin = null;
                }
                slotIndex++;
            }

            unidad.fecha_inicio = firstFecha;
            unidad.fecha_fin = lastFecha;
        }

        return jsonResponse;

    } catch (error) {
        console.error("Error en generarPlaneacionAI:", error);
        throw error;
    }
};