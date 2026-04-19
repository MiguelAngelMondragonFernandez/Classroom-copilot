import { askGemini } from './geminiApi';

/**
 * Genera una actividad evaluable basada en el tema y materiales proporcionados.
 * * @param {string} userId - UID del docente.
 * @param {string} tema - El tema de la clase.
 * @param {Array} materiales - Metadatos de materiales vinculados (opcional).
 * @param {Object} aiConfig - Configuraciones adicionales (nivel, enfoque, etc).
 * @returns {Promise<Object>} - El JSON estructurado de la actividad.
 */
export const generarActividadAI = async (userId, tema, materiales = [], aiConfig = {}) => {
    try {
        const materialNames = materiales.map(m => m.name).join(', ') || 'Ninguno específico';
        
        // CRÍTICO: Pasar la fecha actual para que la IA tenga un punto de partida real
        const fechaActual = new Date();
        const hoyStr = fechaActual.toISOString().split('T')[0];
        const diasPlazo = aiConfig.diasPlazo || 7; // Permite configurar el plazo, por defecto 7 días

        const systemPrompt = `
Eres un Diseñador Instruccional Senior experto en evaluación por competencias.
Tu objetivo es crear una actividad de aprendizaje (tarea) altamente estructurada para un sistema automatizado.

**CONTEXTO TEMPORAL Y DE SISTEMA:**
- Fecha actual del sistema: ${hoyStr}
- Plazo de entrega sugerido: ${diasPlazo} días naturales a partir de la fecha actual.

**CONTEXTO ACADÉMICO:**
- Tema: ${tema}
- Materiales de referencia: ${materialNames}
- Enfoque pedagógico: ${aiConfig.enfoque || 'Práctico y reflexivo'}
- Nivel educativo: ${aiConfig.nivel || 'Educación Superior'}
- Puntos totales requeridos: ${aiConfig.puntosTotales || 100}

**INSTRUCCIONES PARA TI:**
1. Genera un reto o tarea que obligue al alumno a aplicar el conocimiento, no solo memorizar.
2. Define la "fecha_entrega" calculando exactamente los ${diasPlazo} días a partir de la Fecha actual del sistema.
3. Estructura las instrucciones de la tarea separando el objetivo, los pasos exactos y el formato, para que otra IA pueda leerlo y auditarlo fácilmente.

**REGLAS DE RÚBRICA (¡CRÍTICO!):**
1. Genera entre 3 y 5 criterios de evaluación distintos y complementarios (ej. Contenido, Análisis, Presentación, Originalidad).
2. Cada criterio DEBE tener exactamente 3 niveles: Excelente, Suficiente e Insuficiente.
3. El nivel "Insuficiente" siempre tiene 0 puntos.
4. La sumatoria de los "puntos_maximos_criterio" de TODOS los criterios DEBE ser EXACTAMENTE ${aiConfig.puntosTotales || 100}. Distribuye equitativamente. Revisa tu matemática antes de responder.
5. El campo "puntos" del nivel "Excelente" de cada criterio DEBE coincidir con su "puntos_maximos_criterio".

**REGLA ESTRICTA DE FORMATO:**
Tu respuesta debe ser ÚNICA y EXCLUSIVAMENTE en formato JSON crudo válido. 
NO uses bloques de código markdown (no escribas \`\`\`json ni \`\`\`). NO agregues saludos, explicaciones, ni texto adicional fuera de las llaves {}.

**ESTRUCTURA EXACTA DEL JSON:**
{
  "titulo": "Un título corto y motivador",
  "instrucciones_estructuradas": {
    "objetivo_principal": "Qué debe lograr el alumno",
    "paso_a_paso": [
      "Paso 1 detallado",
      "Paso 2 detallado"
    ],
    "formato_entrega": "Especificaciones del archivo o evidencia",
    "advertencia_plagio": "Nota estricta sobre originalidad"
  },
  "puntos_maximos": ${aiConfig.puntosTotales || 100},
  "fecha_entrega": "YYYY-MM-DD",
  "hora_entrega": "23:59",
  "rubrica": [
    {
      "criterio": "Nombre del criterio (ej. Análisis Crítico)",
      "descripcion": "Descripción detallada de qué se evalúa",
      "puntos_maximos_criterio": 25,
      "niveles": [
        {"nivel": "Excelente", "puntos": 25, "descripcion": "Descripción concreta del desempeño excepcional"},
        {"nivel": "Suficiente", "puntos": 15, "descripcion": "Descripción del desempeño mínimo aprobatorio"},
        {"nivel": "Insuficiente", "puntos": 0, "descripcion": "Descripción de qué ocurre cuando no cumple"}
      ]
    },
    {
      "criterio": "Otro criterio...",
      "descripcion": "...",
      "puntos_maximos_criterio": 25,
      "niveles": [
        {"nivel": "Excelente", "puntos": 25, "descripcion": "..."},
        {"nivel": "Suficiente", "puntos": 15, "descripcion": "..."},
        {"nivel": "Insuficiente", "puntos": 0, "descripcion": "..."}
      ]
    }
  ]
}
`;

        const result = await askGemini(userId, systemPrompt);
        
        let jsonResponse;
        try {
            let cleanString = result.answer;
            
            // Extractor robusto: Busca el primer '{' y el último '}'
            // Esto ignora cualquier markdown o texto basura que la IA haya puesto antes o después.
            const jsonStartIndex = cleanString.indexOf('{');
            const jsonEndIndex = cleanString.lastIndexOf('}');
            
            if (jsonStartIndex === -1 || jsonEndIndex === -1) {
                throw new Error("No se detectó un objeto JSON en la respuesta.");
            }
            
            cleanString = cleanString.substring(jsonStartIndex, jsonEndIndex + 1);
            jsonResponse = JSON.parse(cleanString);
            
        } catch (parseError) {
            console.error("Error parseando JSON de Gemini:", result.answer);
            throw new Error("La IA no devolvió un formato de actividad válido. Intenta de nuevo.");
        }

        // Validación básica de estructura
        if (!jsonResponse.titulo || !jsonResponse.rubrica || !jsonResponse.instrucciones_estructuradas) {
            throw new Error("La actividad generada está incompleta o tiene un formato incorrecto.");
        }

        // Aplanar instrucciones estructuradas para compatibilidad con el sistema (Classroom/DB)
        const { objetivo_principal, paso_a_paso, formato_entrega, advertencia_plagio } = jsonResponse.instrucciones_estructuradas;
        
        jsonResponse.instrucciones = `### Objetivo\n${objetivo_principal}\n\n` +
            `### Desarrollo paso a paso\n${Array.isArray(paso_a_paso) ? paso_a_paso.map(p => `- ${p}`).join('\n') : paso_a_paso}\n\n` +
            `### Formato de entrega\n${formato_entrega}\n\n` +
            `### Nota sobre originalidad\n${advertencia_plagio}`;

        return jsonResponse;

    } catch (error) {
        console.error("Error en generarActividadAI:", error);
        throw error;
    }
};