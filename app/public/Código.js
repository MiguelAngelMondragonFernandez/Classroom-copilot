/**
 * Punto de entrada para peticiones GET (Proxy de Identidad)
 */
function doGet(e) {
    const action = e.parameter.action;
    const userToken = e.parameter.token;

    if (!userToken) return createJsonResponse({ success: false, error: "No token provided" }, 401);

    const headers = { "Authorization": "Bearer " + userToken };

    try {
        let result;

        if (action === 'getCourses') {
            // Filtramos por profesor con teacherId=me
            const url = "https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE&teacherId=me";
            const response = UrlFetchApp.fetch(url, { headers, muteHttpExceptions: true });
            const data = JSON.parse(response.getContentText());

            if (data.error) {
                throw new Error("Google API Error: " + data.error.message);
            }

            result = (data.courses || []).map(c => ({
                id: c.id,
                name: c.name,
                section: c.section
            }));
        }

        else if (action === 'getDriveFolder') {
            // Buscamos si ya existe la carpeta "Classroom Copilot Materiales" en el Drive del usuario
            const folderName = "Classroom Copilot Materiales";
            const folderUrl = "https://www.googleapis.com/drive/v3/files?q=name='" + folderName + "' and mimeType='application/vnd.google-apps.folder' and trashed=false";
            const response = UrlFetchApp.fetch(folderUrl, { headers, muteHttpExceptions: true });
            result = JSON.parse(response.getContentText());
        }

        else if (action === 'createDriveFolder') {
            const folderName = "Classroom Copilot Materiales";
            const url = "https://www.googleapis.com/drive/v3/files";
            const response = UrlFetchApp.fetch(url, {
                method: "POST",
                headers: {
                    "Authorization": "Bearer " + userToken,
                    "Content-Type": "application/json"
                },
                payload: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder' }),
                muteHttpExceptions: true
            });
            result = JSON.parse(response.getContentText());
        }

        else if (action === 'getAssignments') {
            const courseId = e.parameter.courseId;
            const url = "https://classroom.googleapis.com/v1/courses/" + courseId + "/courseWork";
            const response = UrlFetchApp.fetch(url, { headers, muteHttpExceptions: true });
            const data = JSON.parse(response.getContentText());
            result = (data.courseWork || []).map(w => ({
                id: w.id,
                title: w.title,
                description: w.description
            }));
        }

        else if (action === 'getTopics') {
            const courseId = e.parameter.courseId;
            const url = "https://classroom.googleapis.com/v1/courses/" + courseId + "/topics";
            const response = UrlFetchApp.fetch(url, { headers, muteHttpExceptions: true });
            const data = JSON.parse(response.getContentText());
            result = (data.topic || []).map(t => ({
                topicId: t.topicId,
                name: t.name,
                updateTime: t.updateTime
            }));
            if (data.error) throw new Error("Google API Error: " + data.error.message);
        }

        else if (action === 'createTopic') {
            const courseId = e.parameter.courseId;
            const topicName = e.parameter.name;
            const url = "https://classroom.googleapis.com/v1/courses/" + courseId + "/topics";
            const response = UrlFetchApp.fetch(url, {
                method: "POST",
                headers: {
                    "Authorization": "Bearer " + userToken,
                    "Content-Type": "application/json"
                },
                payload: JSON.stringify({ name: topicName }),
                muteHttpExceptions: true
            });
            result = JSON.parse(response.getContentText());
            if (result.error) throw new Error("Google API Error: " + result.error.message);
        }

        else if (action === 'updateTopic') {
            const courseId = e.parameter.courseId;
            const topicId = e.parameter.topicId;
            const topicName = e.parameter.name;
            const url = "https://classroom.googleapis.com/v1/courses/" + courseId + "/topics/" + topicId + "?updateMask=name";
            const response = UrlFetchApp.fetch(url, {
                method: "PATCH",
                headers: {
                    "Authorization": "Bearer " + userToken,
                    "Content-Type": "application/json"
                },
                payload: JSON.stringify({ name: topicName }),
                muteHttpExceptions: true
            });
            result = JSON.parse(response.getContentText());
            if (result.error) throw new Error("Google API Error: " + result.error.message);
        }

        else if (action === 'deleteActivity') {
            const courseId = e.parameter.courseId;
            const id = e.parameter.id;
            const url = "https://classroom.googleapis.com/v1/courses/" + courseId + "/courseWork/" + id;
            const response = UrlFetchApp.fetch(url, {
                method: "DELETE",
                headers: { "Authorization": "Bearer " + userToken },
                muteHttpExceptions: true
            });
            result = { success: true };
            const status = response.getResponseCode();
            if (status >= 400) {
                const errData = JSON.parse(response.getContentText());
                throw new Error("Google API Error: " + (errData.error?.message || "Error al eliminar actividad"));
            }
        }

        else if (action === 'deleteTopic') {
            const courseId = e.parameter.courseId;
            const topicId = e.parameter.topicId;
            const url = "https://classroom.googleapis.com/v1/courses/" + courseId + "/topics/" + topicId;
            const response = UrlFetchApp.fetch(url, {
                method: "DELETE",
                headers: { "Authorization": "Bearer " + userToken },
                muteHttpExceptions: true
            });
            // DELETE suele devolver vacío o un objeto simple {}
            result = { success: true };
            const status = response.getResponseCode();
            if (status >= 400) {
                const errData = JSON.parse(response.getContentText());
                throw new Error("Google API Error: " + (errData.error?.message || "Error al eliminar topic"));
            }
        }

        else {
            throw new Error('Acción no reconocida: ' + action);
        }

        return createJsonResponse({
            success: true,
            data: result || []
        });

    } catch (error) {
        return createJsonResponse({
            success: false,
            error: error.toString()
        });
    }
}

/**
 * Punto de entrada para peticiones POST (Subida de archivos)
 */
/**
 * Punto de entrada para peticiones POST (Subida de archivos y Proxy IA)
 */
function doPost(e) {
    try {
        const body = JSON.parse(e.postData.contents);
        const action = body.action || 'uploadFile'; // Default to upload for backward compatibility
        const userToken = body.token;

        if (!userToken && action !== 'askGemini') throw new Error("No token provided");

        // --- ACCIÓN: PREGUNTAR A GEMINI (PROXY IA) ---
        if (action === 'askGemini') {
            const props = PropertiesService.getScriptProperties();
            const API_KEY = props.getProperty('GEMINI_API_KEY');
            const userId = body.userId; // UID de Firebase
            const prompt = body.prompt;

            if (!API_KEY) throw new Error("GEMINI_API_KEY no configurada en el servidor");
            if (!userId) throw new Error("userId requerido para validación de créditos");

            // 1. Validación de Aduana (Saldo en Supabase)
            if (!checkUserCredits(userId)) {
                return createJsonResponse({ success: false, error: "Saldo insuficiente o usuario no registrado" }, 403);
            }

            // 2. Llamada a Gemini (Modelo Flash 1.5)
            const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=" + API_KEY;

            const payload = {
                contents: [{ parts: [{ text: prompt }] }]
            };

            const response = UrlFetchApp.fetch(url, {
                method: "post",
                contentType: "application/json",
                payload: JSON.stringify(payload),
                muteHttpExceptions: true
            });

            const result = JSON.parse(response.getContentText());

            if (result.error) {
                throw new Error("Gemini API Error: " + result.error.message);
            }

            // 3. Extracción de Metadatos de Uso
            const usage = result.usageMetadata || { totalTokenCount: 0 };
            const answer = (result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts[0]) 
                ? result.candidates[0].content.parts[0].text 
                : "Lo siento, no pude generar una respuesta.";

            // 4. Actualización en Supabase (Descontar tokens)
            updateTokenConsumption(userId, usage.totalTokenCount);

            return createJsonResponse({
                success: true,
                data: {
                    answer: answer,
                    usage: usage
                }
            });
        }

        // --- ACCIÓN: SINCRONIZAR PERFIL (VIA PROXY PARA BYPASS RLS) ---
        else if (action === 'syncProfile') {
            const userId = body.userId;
            const profileData = body.profile;

            if (!userId || !profileData) throw new Error("userId y profile son requeridos");

            const result = callSupabase('/perfiles', {
                method: 'POST',
                headers: { 'Prefer': 'resolution=merge-duplicates' },
                payload: JSON.stringify({
                    id: userId,
                    nombre_completo: profileData.nombre_completo,
                    updated_at: new Date().toISOString()
                })
            });

            return createJsonResponse({ success: true, data: result });
        }

        // --- ACCIÓN: SYNC PLANEACION BATCH (CON MANEJO DE TIMEOUT) ---
        else if (action === 'syncPlaneacionBatch') {
            const items = body.items || [];
            const courseId = body.courseId;
            const calendarId = body.calendarId || 'primary';
            const results = [];

            // Tiempo límite de GAS (6 mins = 360,000 ms). Dejamos 30 seg de colchón (330,000 ms).
            const startTime = new Date().getTime();
            const MAX_EXECUTION_TIME = 330000;

            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                let itemStatus = {
                    id: item.id,
                    titulo: item.titulo_tema,
                    status: 'success',
                    error: null,
                    calendarEventId: null,
                    classroomTopicId: null
                };

                // Verificar que no nos pasemos del tiempo de ejecución permitido
                if (new Date().getTime() - startTime > MAX_EXECUTION_TIME) {
                    itemStatus.status = 'timeout';
                    itemStatus.error = 'Límite de tiempo aprox. de Google Script alcanzado. Reintenta los faltantes.';
                    results.push(itemStatus);
                    continue; // Skip the rest, mark as timeout
                }

                try {
                    // 1. Sincronización con Classroom (Borrador de Material)
                    if (courseId) {
                        const unitName = item.unidad_nombre || item.ciclos?.nombre || 'General';
                        let topicId = null;

                        // Intentar obtener o crear el Topic (Unidad)
                        try {
                            const topicsUrl = "https://classroom.googleapis.com/v1/courses/" + courseId + "/topics";
                            const topicsResp = UrlFetchApp.fetch(topicsUrl, { headers: { "Authorization": "Bearer " + userToken }, muteHttpExceptions: true });
                            const topicsData = JSON.parse(topicsResp.getContentText());

                            const listadoTopics = topicsData.topic || topicsData.topics || [];
                            const existingTopic = listadoTopics.find(t => t.name.toLowerCase() === unitName.toLowerCase());

                            if (existingTopic) {
                                topicId = existingTopic.topicId;
                            } else {
                                const createTopicResp = UrlFetchApp.fetch(topicsUrl, {
                                    method: "POST",
                                    headers: { "Authorization": "Bearer " + userToken, "Content-Type": "application/json" },
                                    payload: JSON.stringify({ name: unitName }),
                                    muteHttpExceptions: true
                                });
                                if (createTopicResp.getResponseCode() < 400) {
                                    const newTopic = JSON.parse(createTopicResp.getContentText());
                                    topicId = newTopic.topicId;
                                } else {
                                    console.warn("No se pudo crear el topic:", createTopicResp.getContentText());
                                }
                            }
                        } catch (tErr) {
                            console.error("Error con Topic en Classroom:", tErr);
                        }

                        itemStatus.classroomTopicId = topicId;
                        // No se crea borrador: el material se publicará solo cuando el profesor genere contenido
                    }

                } catch (err) {
                    itemStatus.status = 'error';
                    itemStatus.error = err.toString();
                }

                results.push(itemStatus);
            }

            return createJsonResponse({
                success: true,
                data: { results: results }
            });
        }

        // --- ACCIÓN: SUBIDA DE ARCHIVOS (EXISTENTE) ---
        else if (action === 'uploadFile') {
            const fileName = body.fileName;
            const base64Data = body.fileData;
            const mimeType = body.mimeType || 'application/octet-stream';
            const parentFolderId = body.parentFolderId;

            const url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=media";
            const options = {
                method: "POST",
                headers: { "Authorization": "Bearer " + userToken },
                contentType: mimeType,
                payload: Utilities.base64Decode(base64Data),
                muteHttpExceptions: true
            };

            const response = UrlFetchApp.fetch(url, options);
            const fileInfo = JSON.parse(response.getContentText());

            if (fileInfo.error) throw new Error(fileInfo.error.message);

            if (fileInfo.id && fileName) {
                const updateUrl = "https://www.googleapis.com/drive/v3/files/" + fileInfo.id;
                UrlFetchApp.fetch(updateUrl, {
                    method: "PATCH",
                    headers: {
                        "Authorization": "Bearer " + userToken,
                        "Content-Type": "application/json"
                    },
                    payload: JSON.stringify({ name: fileName, parents: parentFolderId ? [parentFolderId] : [] }),
                    muteHttpExceptions: true
                });
            }

            return createJsonResponse({
                success: true,
                data: { fileId: fileInfo.id, fileName: fileName }
            });
        }

        // --- ACCIÓN: BORRAR PLANEACIÓN BATCH (Classroom y Calendar) ---
        else if (action === 'deletePlaneacionBatch') {
            const results = [];
            const userToken = body.token;
            const calendarId = body.calendarId || 'primary';

            // 1. Borrar Materiales en Google Classroom
            const materialIds = body.materialIds || [];
            if (materialIds.length > 0 && body.courseId) {
                for (let i = 0; i < materialIds.length; i++) {
                    const materialId = materialIds[i];
                    try {
                        const deleteUrl = "https://classroom.googleapis.com/v1/courses/" + body.courseId + "/courseWorkMaterials/" + materialId;
                        UrlFetchApp.fetch(deleteUrl, {
                            method: "DELETE",
                            headers: { "Authorization": "Bearer " + userToken },
                            muteHttpExceptions: true
                        });
                        results.push({ id: materialId, type: 'classroom-material', status: 'deleted' });
                    } catch (e) {
                        results.push({ id: materialId, type: 'classroom-material', status: 'error', error: e.message });
                    }
                }
            }

            // 1.5 Borrar Actividades (CourseWork) en Google Classroom
            const courseWorkIds = body.courseWorkIds || [];
            if (courseWorkIds.length > 0 && body.courseId) {
                for (let i = 0; i < courseWorkIds.length; i++) {
                    const cwId = courseWorkIds[i];
                    try {
                        const deleteUrl = "https://classroom.googleapis.com/v1/courses/" + body.courseId + "/courseWork/" + cwId;
                        UrlFetchApp.fetch(deleteUrl, {
                            method: "DELETE",
                            headers: { "Authorization": "Bearer " + userToken },
                            muteHttpExceptions: true
                        });
                        results.push({ id: cwId, type: 'classroom-coursework', status: 'deleted' });
                    } catch (e) {
                        results.push({ id: cwId, type: 'classroom-coursework', status: 'error', error: e.message });
                    }
                }
            }

            // 2. Borrar Temas (Topics) en Google Classroom
            const topicIds = body.topicIds || [];
            if (topicIds.length > 0 && body.courseId) {
                for (let i = 0; i < topicIds.length; i++) {
                    const topicId = topicIds[i];
                    try {
                        const deleteUrl = "https://classroom.googleapis.com/v1/courses/" + body.courseId + "/topics/" + topicId;
                        UrlFetchApp.fetch(deleteUrl, {
                            method: "DELETE",
                            headers: { "Authorization": "Bearer " + userToken },
                            muteHttpExceptions: true
                        });
                        results.push({ id: topicId, type: 'classroom-topic', status: 'deleted' });
                    } catch (e) {
                        results.push({ id: topicId, type: 'classroom-topic', status: 'error', error: e.message });
                    }
                }
            }

            // 3. Borrar en Google Calendar
            const calendarEventIds = body.calendarEventIds || [];
            if (calendarEventIds.length > 0) {
                for (let i = 0; i < calendarEventIds.length; i++) {
                    const eventId = calendarEventIds[i];
                    try {
                        const deleteUrl = "https://www.googleapis.com/calendar/v3/calendars/" + calendarId + "/events/" + eventId;
                        UrlFetchApp.fetch(deleteUrl, {
                            method: "DELETE",
                            headers: { "Authorization": "Bearer " + userToken },
                            muteHttpExceptions: true
                        });
                        results.push({ id: eventId, type: 'calendar', status: 'deleted' });
                    } catch (e) {
                        results.push({ id: eventId, type: 'calendar', status: 'error', error: e.message });
                    }
                }
            }

            return createJsonResponse({
                success: true,
                data: { results: results }
            });
        }

        // --- ACCIÓN: CREAR DOCUMENTO DE DRIVE Y MATERIAL EN CLASSROOM ---
        else if (action === 'createDriveDocument') {
            const title = body.title;
            const htmlContent = body.content;
            const courseId = body.courseId;
            const topicId = body.topicId;

            // 1. Crear el Documento en Google Drive
            const createUrl = "https://www.googleapis.com/drive/v3/files";
            const createResp = UrlFetchApp.fetch(createUrl, {
                method: "POST",
                headers: { "Authorization": "Bearer " + userToken, "Content-Type": "application/json" },
                payload: JSON.stringify({
                    name: title,
                    mimeType: "application/vnd.google-apps.document"
                }),
                muteHttpExceptions: true
            });
            const fileInfo = JSON.parse(createResp.getContentText());
            if (createResp.getResponseCode() >= 400) throw new Error("Drive API Error: " + fileInfo.error.message);

            // 2. Insertar el contenido
            const doc = DocumentApp.openById(fileInfo.id);
            doc.getBody().setText(htmlContent.replace(/<[^>]*>?/gm, ''));
            doc.saveAndClose();

            // 3. (Eliminado: publicación automática a Classroom)

            return createJsonResponse({
                success: true,
                data: { fileId: fileInfo.id, webViewLink: "https://docs.google.com/document/d/" + fileInfo.id + "/edit", classroomMaterialId: null }
            });
        }

        // --- ACCIÓN: CREAR PRESENTACIÓN DE DRIVE Y MATERIAL EN CLASSROOM ---
        else if (action === 'createDrivePresentation') {
            const title = body.title;
            const slidesData = typeof body.content === 'string' ? JSON.parse(body.content) : body.content;
            const courseId = body.courseId;
            const topicId = body.topicId;

            // 1. Crear la Presentación
            const createUrl = "https://www.googleapis.com/drive/v3/files";
            const createResp = UrlFetchApp.fetch(createUrl, {
                method: "POST",
                headers: { "Authorization": "Bearer " + userToken, "Content-Type": "application/json" },
                payload: JSON.stringify({
                    name: title,
                    mimeType: "application/vnd.google-apps.presentation"
                }),
                muteHttpExceptions: true
            });
            const fileInfo = JSON.parse(createResp.getContentText());
            if (createResp.getResponseCode() >= 400) throw new Error("Drive API Error: " + fileInfo.error.message);

            // 2. Llenar la presentación
            const presentation = SlidesApp.openById(fileInfo.id);
            const masterSlides = presentation.getSlides();

            if (slidesData.slides && Array.isArray(slidesData.slides)) {
                slidesData.slides.forEach((s, idx) => {
                    // Usar la primera slide existente o crear nuevas
                    const slide = (idx === 0 && masterSlides.length > 0) ? masterSlides[0] : presentation.appendSlide(SlidesApp.PredefinedLayout.TITLE_AND_BODY);

                    // Llenar el Título
                    const titlePh = slide.getPlaceholder(SlidesApp.PlaceholderType.TITLE) ||
                        slide.getPlaceholder(SlidesApp.PlaceholderType.CENTERED_TITLE);
                    if (titlePh) {
                        titlePh.asShape().getText().setText(s.title || "");
                    }

                    // Llenar el Cuerpo/Contenido
                    const bodyPh = slide.getPlaceholder(SlidesApp.PlaceholderType.BODY);
                    if (bodyPh) {
                        bodyPh.asShape().getText().setText(s.content || "");
                    }
                });
            }
            presentation.saveAndClose();

            // 3. (Eliminado: publicación automática a Classroom)

            return createJsonResponse({
                success: true,
                data: { fileId: fileInfo.id, webViewLink: "https://docs.google.com/presentation/d/" + fileInfo.id + "/edit", classroomMaterialId: null }
            });
        }

        // --- ACCIÓN: VINCULAR ARCHIVO DE DRIVE A CLASSROOM ---
        else if (action === 'publishToClassroom') {
            const fileId = body.fileId;
            const courseId = body.courseId;
            let topicId = body.topicId;
            const title = body.title;
            const unitName = body.unitName;

            const existingMaterialId = body.existingMaterialId;

            if (!courseId) throw new Error("courseId es requerido para publicar en Classroom");

            // --- LÓGICA DE RESOLUCIÓN DE TOPIC (UNIDAD) ---
            if (!topicId && unitName) {
                try {
                    const topicsUrl = "https://classroom.googleapis.com/v1/courses/" + courseId + "/topics";
                    const topicsResp = UrlFetchApp.fetch(topicsUrl, { headers: { "Authorization": "Bearer " + userToken }, muteHttpExceptions: true });
                    const topicsData = JSON.parse(topicsResp.getContentText());

                    const listadoTopics = topicsData.topic || topicsData.topics || [];
                    const existingTopic = listadoTopics.find(t => t.name.toLowerCase() === unitName.toLowerCase());

                    if (existingTopic) {
                        topicId = existingTopic.topicId;
                    } else {
                        // Crear el topic si no existe
                        const createTopicResp = UrlFetchApp.fetch(topicsUrl, {
                            method: "POST",
                            headers: { "Authorization": "Bearer " + userToken, "Content-Type": "application/json" },
                            payload: JSON.stringify({ name: unitName }),
                            muteHttpExceptions: true
                        });
                        if (createTopicResp.getResponseCode() < 400) {
                            const newTopic = JSON.parse(createTopicResp.getContentText());
                            topicId = newTopic.topicId;
                        }
                    }
                } catch (tErr) {
                    console.error("Error resolviendo topicId en GAS:", tErr);
                }
            }

            const materialPayload = {
                title: title,
                state: "PUBLISHED",
                topicId: topicId,
                materials: [{ driveFile: { driveFile: { id: fileId } } }]
            };

            // Crear el material publicado directamente (POST)
            const materialUrl = "https://classroom.googleapis.com/v1/courses/" + courseId + "/courseWorkMaterials";
            const materialResp = UrlFetchApp.fetch(materialUrl, {
                method: "POST",
                headers: { "Authorization": "Bearer " + userToken, "Content-Type": "application/json" },
                payload: JSON.stringify(materialPayload),
                muteHttpExceptions: true
            });

            const matData = JSON.parse(materialResp.getContentText());
            if (materialResp.getResponseCode() >= 400) {
                throw new Error("Classroom API Error: " + (matData.error?.message || "Error al publicar material"));
            }

            return createJsonResponse({
                success: true,
                data: { classroomMaterialId: matData.id, classroomTopicId: topicId }
            });
        }

        // --- ACCIÓN: CREAR TAREA EVALUABLE (CLASSROOM + SUPABASE) ---
        else if (action === 'createActivity') {
            const courseId = body.courseId;
            const activity = body.activity; // El JSON de la IA
            const userId = body.userId;
            let topicId = body.topicId;
            const topicName = body.topicName;

            if (!courseId || !activity || !userId) throw new Error("Faltan datos para crear la actividad.");

            // Resolver topicId si falta pero tenemos el nombre
            if (!topicId && topicName) {
                try {
                    const topicsUrl = "https://classroom.googleapis.com/v1/courses/" + courseId + "/topics";
                    const topicsResp = UrlFetchApp.fetch(topicsUrl, { headers: { "Authorization": "Bearer " + userToken }, muteHttpExceptions: true });
                    const topicsData = JSON.parse(topicsResp.getContentText());
                    const listadoTopics = topicsData.topic || topicsData.topics || [];
                    const existingTopic = listadoTopics.find(t => t.name.toLowerCase() === topicName.toLowerCase());
                    if (existingTopic) {
                        topicId = existingTopic.topicId;
                    }
                } catch (tErr) {
                    console.error("Error resolviendo topicId en createActivity:", tErr);
                }
            }

            // Normalizar topicId: Classroom API falla si envías una cadena vacía ""
            if (!topicId || topicId === "") {
                topicId = null;
            }

            // 1. Preparar el payload de Classroom
            const dateParts = (activity.fecha_entrega || "").split('-').map(Number);
            const timeParts = (activity.hora_entrega || "").split(':').map(Number);
            
            const [year, month, day] = dateParts;
            const [hours, minutes] = timeParts;

            // El frontend puede elegir entre DRAFT y PUBLISHED
            const publishState = body.publishState || "DRAFT";

            const courseWorkPayload = {
                title: activity.titulo,
                description: activity.instrucciones,
                materials: [],
                state: publishState,
                workType: "ASSIGNMENT",
                maxPoints: activity.puntos_maximos || 100,
                topicId: topicId,
            };

            // Solo añadir fecha/hora si los valores son números válidos (evita NaN que rompe el JSON)
            if (!isNaN(year) && !isNaN(month) && !isNaN(day) && year > 0) {
                courseWorkPayload.dueDate = { year, month, day };
            }
            if (!isNaN(hours) && !isNaN(minutes)) {
                courseWorkPayload.dueTime = { hours, minutes };
            }

            const cwUrl = "https://classroom.googleapis.com/v1/courses/" + courseId + "/courseWork";
            const cwResp = UrlFetchApp.fetch(cwUrl, {
                method: "POST",
                headers: { "Authorization": "Bearer " + userToken, "Content-Type": "application/json" },
                payload: JSON.stringify(courseWorkPayload),
                muteHttpExceptions: true
            });

            const cwData = JSON.parse(cwResp.getContentText());
            if (cwResp.getResponseCode() >= 400) {
                const detailedError = cwData.error?.details ? JSON.stringify(cwData.error.details) : (cwData.error?.message || "Error desconocido");
                throw new Error("Classroom API Error (" + cwResp.getResponseCode() + "): " + detailedError);
            }

            // 2. Crear la Rúbrica en Classroom (si existe en el JSON de la IA)
            let rubricError = null;
            let rubricFallbackUsed = false;
            if (activity.rubrica && Array.isArray(activity.rubrica)) {
                try {
                    const rubricPayload = transformRubricToGoogleFormat(activity.rubrica);
                    const rubricUrl = "https://classroom.googleapis.com/v1/courses/" + courseId + "/courseWork/" + cwData.id + "/rubrics";

                    const rubricResp = UrlFetchApp.fetch(rubricUrl, {
                        method: "POST",
                        headers: { "Authorization": "Bearer " + userToken, "Content-Type": "application/json" },
                        payload: JSON.stringify(rubricPayload),
                        muteHttpExceptions: true
                    });

                    if (rubricResp.getResponseCode() >= 400) {
                        const rubricErrBody = rubricResp.getContentText();
                        console.warn("Error al crear rúbrica nativa:", rubricErrBody);

                        // PLAN B: Si es error de licencia (403), inyectar rúbrica en la descripción
                        if (rubricResp.getResponseCode() === 403 || rubricErrBody.includes("UserIneligibleToModifyRubrics")) {
                            console.log("Plan B: Inyectando rúbrica como texto en la descripción de la tarea...");
                            rubricFallbackUsed = true;

                            let textoRubrica = "\n\n════════════════════════════\n📋 GUÍA DE EVALUACIÓN (Rúbrica)\n════════════════════════════\n";
                            activity.rubrica.forEach(function(crit) {
                                textoRubrica += "\n▸ " + crit.criterio.toUpperCase() + "\n";
                                textoRubrica += "  " + (crit.descripcion || "") + "\n";
                                (crit.niveles || []).forEach(function(niv) {
                                    textoRubrica += "    • " + niv.puntos + " pts – " + niv.nivel + ": " + (niv.descripcion || "") + "\n";
                                });
                            });
                            textoRubrica += "\n════════════════════════════\n";

                            // PATCH para actualizar la descripción con la rúbrica incluida
                            const patchUrl = "https://classroom.googleapis.com/v1/courses/" + courseId + "/courseWork/" + cwData.id + "?updateMask=description";
                            const nuevaDescripcion = (activity.instrucciones || "") + textoRubrica;

                            UrlFetchApp.fetch(patchUrl, {
                                method: "PATCH",
                                headers: { "Authorization": "Bearer " + userToken, "Content-Type": "application/json" },
                                payload: JSON.stringify({ description: nuevaDescripcion }),
                                muteHttpExceptions: true
                            });

                            rubricError = "Tu cuenta de Google Workspace no permite rúbricas automáticas. Se incluyó la guía de evaluación dentro de las instrucciones de la tarea.";
                        } else {
                            rubricError = "La tarea se creó pero la rúbrica no pudo vincularse: " + rubricErrBody;
                        }
                    } else {
                        console.log("Rúbrica creada exitosamente para la tarea " + cwData.id);
                    }
                } catch (rubricErr) {
                    console.error("Error en proceso de rúbrica:", rubricErr);
                    rubricError = "Error interno al crear rúbrica: " + rubricErr.toString();
                }
            }

            // 3. Registrar en Supabase
            const fechaCierreISO = new Date(year, month - 1, day, hours, minutes).toISOString();

            callSupabase('/actividades_evaluables', {
                method: 'POST',
                payload: JSON.stringify({
                    user_id: userId,
                    course_id: courseId,
                    course_work_id: cwData.id,
                    rubrica_json: activity.rubrica,
                    fecha_cierre: fechaCierreISO,
                    estado: 'pendiente'
                })
            });

            return createJsonResponse({
                success: true,
                data: {
                    courseWorkId: cwData.id,
                    alternateLink: cwData.alternateLink || null,
                    rubricError: rubricError
                }
            });
        }

        else {
            throw new Error("Acción POST no reconocida: " + action);
        }

    } catch (error) {
        console.error("Error en doPost:", error.toString());
        return createJsonResponse({
            success: false,
            error: error.toString()
        }, 500);
    }
}

// --- FASE 4: DISPARADOR DE EVALUACIÓN ---

/**
 * Busca tareas vencidas en Supabase e inicia el proceso de evaluación.
 * Se ejecuta vía Cronjob (Trigger de tiempo).
 */
function procesarEvaluacionesPendientes() {
    console.log("Revisando evaluaciones pendientes...");
    try {
        // 1. Consultar actividades vencidas
        const ahora = new Date().toISOString();
        const pendientes = callSupabase('/actividades_evaluables?estado=eq.pendiente&fecha_cierre=lte.' + ahora);

        if (!pendientes || pendientes.length === 0) {
            console.log("No hay actividades pendientes por evaluar.");
            return;
        }

        console.log(`Encontradas ${pendientes.length} actividades para evaluar.`);

        for (let i = 0; i < pendientes.length; i++) {
            const act = pendientes[i];

            try {
                // Prevenir duplicidad marcando como 'evaluando'
                callSupabase('/actividades_evaluables?id=eq.' + act.id, {
                    method: 'PATCH',
                    payload: JSON.stringify({ estado: 'evaluando' })
                });

                console.log(`Iniciando evaluación de tarea: ${act.course_work_id}`);

                // --- FUTURA CONEXIÓN CON GEMINI EVALUATOR ---
                // Aquí se llamaría a una función que:
                // 1. Obtenga entregas de Classroom.
                // 2. Lea archivos de Drive de los alumnos.
                // 3. Pase el contenido + rúbrica a Gemini.
                // 4. Guarde resultados.

                // Por ahora marcamos como completado para probar el flujo
                callSupabase('/actividades_evaluables?id=eq.' + act.id, {
                    method: 'PATCH',
                    payload: JSON.stringify({ estado: 'completado' })
                });

            } catch (err) {
                console.error(`Error procesando actividad ${act.id}:`, err);
                callSupabase('/actividades_evaluables?id=eq.' + act.id, {
                    method: 'PATCH',
                    payload: JSON.stringify({ estado: 'error' })
                });
            }
        }
    } catch (e) {
        console.error("Error general en procesarEvaluacionesPendientes:", e);
    }
}

/**
 * Instala el disparador de tiempo para la evaluación.
 * Ejecutar manualmente UNA VEZ desde el editor de GAS.
 */
function setupEvaluadorCron() {
    // Borrar triggers previos para evitar duplicados
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(t => {
        if (t.getHandlerFunction() === 'procesarEvaluacionesPendientes') {
            ScriptApp.deleteTrigger(t);
        }
    });

    // Crear nuevo trigger cada hora
    ScriptApp.newTrigger('procesarEvaluacionesPendientes')
        .timeBased()
        .everyHours(1)
        .create();

    console.log("Trigger 'procesarEvaluacionesPendientes' instalado correctamente.");
}


/**
 * Transforma el JSON de rúbrica de la IA al formato esperado por Classroom API
 */
function transformRubricToGoogleFormat(aiRubric) {
    return {
        criteria: aiRubric.map(crit => ({
            title: crit.criterio,
            description: crit.descripcion || "",
            levels: (crit.niveles || []).map(niv => ({
                title: niv.nivel,
                points: niv.puntos || 0,
                description: niv.descripcion || ""
            }))
        }))
    };
}


// --- FUNCIONES DE PERSISTENCIA (SUPABASE) ---

/**
 * Gestiona la comunicación con Supabase desde Google Apps Script.
 */
function callSupabase(path, options = {}) {
    const props = PropertiesService.getScriptProperties();
    const url = props.getProperty('SUPABASE_URL');
    const key = props.getProperty('SUPABASE_SERVICE_ROLE_KEY'); // Se requiere Service Role para bypass RLS/Updates seguros

    if (!url || !key) {
        throw new Error("Configuración de Supabase faltante en Script Properties (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)");
    }

    const defaultOptions = {
        method: 'GET',
        contentType: 'application/json',
        headers: {
            'apikey': key,
            'Authorization': 'Bearer ' + key,
            'Prefer': 'return=representation'
        },
        muteHttpExceptions: true
    };

    const finalOptions = { ...defaultOptions, ...options };
    if (options.headers) {
        finalOptions.headers = { ...defaultOptions.headers, ...options.headers };
    }

    const response = UrlFetchApp.fetch(url + '/rest/v1' + path, finalOptions);
    const status = response.getResponseCode();
    const content = response.getContentText();

    if (status >= 400) {
        console.error("Supabase Error:", content);
        throw new Error("Supabase API Error: " + content);
    }

    return JSON.parse(content);
}

/**
 * Valida si el docente tiene saldo suficiente en Supabase.
 * @param {string} userId - UID de Firebase del docente.
 * @returns {boolean}
 */
// Localiza la función checkUserCredits en Código.js (aprox línea 841)
function checkUserCredits(userId) {
    console.log("DEBUG: Buscando créditos para el ID ->", userId); // <--- AÑADE ESTO
    try {
        const data = callSupabase('/perfiles?id=eq.' + userId + '&select=token_balance');
        console.log("DEBUG: Resultado de Supabase ->", JSON.stringify(data)); // <--- AÑADE ESTO
        if (data && data.length > 0) {
            return (data[0].token_balance || 0) > 0;
        }
        return false;
    } catch (e) {
        console.error("Error en checkUserCredits:", e.toString());
        return false;
    }
}


/**
 * Actualiza el consumo de tokens en Supabase.
 * @param {string} userId - UID del docente.
 * @param {number} tokens - Cantidad de tokens a descontar.
 */
function updateTokenConsumption(userId, tokens) {
    try {
        const data = callSupabase('/perfiles?id=eq.' + userId + '&select=token_balance,total_consumed');
        if (data && data.length > 0) {
            const currentBalance = data[0].token_balance || 0;
            const currentConsumed = data[0].total_consumed || 0;

            callSupabase('/perfiles?id=eq.' + userId, {
                method: 'PATCH',
                payload: JSON.stringify({
                    token_balance: currentBalance - tokens,
                    total_consumed: currentConsumed + tokens
                })
            });
        }
    } catch (e) {
        console.error("Error en updateTokenConsumption:", e.toString());
    }
}

function createJsonResponse(data, status = 200) {
    return ContentService.createTextOutput(JSON.stringify(data))
        .setMimeType(ContentService.MimeType.JSON);
}

function testPermissions() {
    UrlFetchApp.fetch("https://www.google.com");
    console.log("Permisos de red OK");
}


function mostrarIdsReales() {
    const respuesta = clss.Courses.list();
    const cursos = respuesta.courses;

    if (cursos && cursos.length > 0) {
        console.log("--- COPIA EL ID DE AQUÍ ---");
        cursos.forEach(c => {
            console.log(`CURSO: ${c.name} | ID: ${c.id}`);
        });
    } else {
        console.log("No se encontraron cursos activos.");
    }
}


/**
 * Limpia el contenido de un curso (Tareas, Materiales, Anuncios y Temas)
 * Mantiene intactos a los Profesores y Alumnos.
 * @param {string} courseId - El ID del curso a resetear.
 */function limpiarAulaDePruebas() {
    // 1. FORZAR EL ID A STRING (Crucial)
    const courseId = "413726323410";
    console.log("--- Iniciando Purga de Classroom ---");

    try {
        // 2. Limpiar Tareas (CourseWork / Coursework)
        // Probamos ambas variantes por seguridad de la versión del servicio
        const cwResource = clss.Courses.CourseWork || clss.Courses.Coursework;

        if (cwResource) {
            const resTasks = cwResource.list(courseId);
            if (resTasks && resTasks.courseWork) {
                resTasks.courseWork.forEach(task => {
                    cwResource.remove(courseId, task.id);
                    console.log(`Eliminado: Tarea -> ${task.title}`);
                });
            }
        } else {
            console.warn("No se encontró el recurso CourseWork en clss.Courses. Revisa el autocompletado del editor.");
        }

        // 3. Limpiar Materiales
        const cwmResource = clss.Courses.CourseWorkMaterial || clss.Courses.CourseworkMaterial;
        if (cwmResource) {
            const resMaterials = cwmResource.list(courseId);
            if (resMaterials && resMaterials.courseWorkMaterial) {
                resMaterials.courseWorkMaterial.forEach(mat => {
                    cwmResource.remove(courseId, mat.id);
                    console.log(`Eliminado: Material -> ${mat.title}`);
                });
            }
        }

        // 4. Limpiar Anuncios
        if (clss.Courses.Announcements) {
            const resAnnouncements = clss.Courses.Announcements.list(courseId);
            if (resAnnouncements && resAnnouncements.announcements) {
                resAnnouncements.announcements.forEach(ann => {
                    clss.Courses.Announcements.remove(courseId, ann.id);
                    console.log("Eliminado: Anuncio/Post");
                });
            }
        }

        // 5. Limpiar Temas
        if (clss.Courses.Topics) {
            const resTopics = clss.Courses.Topics.list(courseId);
            if (resTopics && resTopics.topic) {
                resTopics.topic.forEach(topic => {
                    clss.Courses.Topics.remove(courseId, topic.topicId);
                    console.log(`Eliminado: Tema -> ${topic.name}`);
                });
            }
        }

        console.log("--- Classroom Copilot: Ambiente de pruebas limpio ---");

    } catch (e) {
        console.error("Fallo en la limpieza: " + e.message);
        console.log("Stack Trace: " + e.stack); // Esto nos dirá la línea exacta
    }
}

function purgaTotalPersonal() {
    const courseId = "413726323410"; // Asegúrate de que sea el string del ID numérico
    console.log("--- Iniciando Purga en Cuenta Personal ---");

    // Función interna para no repetir código
    const eliminarRecurso = (recurso, listaKey, nombreLog) => {
        try {
            const lista = recurso.list(courseId);
            if (lista && lista[listaKey]) {
                lista[listaKey].forEach(item => {
                    const id = item.id || item.topicId;
                    recurso.remove(courseId, id);
                    console.log(`✅ ${nombreLog} eliminado: ${item.title || item.name || id}`);
                });
            }
        } catch (e) {
            console.warn(`⚠️ Error eliminando ${nombreLog}: ${e.message}`);
        }
    };

    // Ejecución en orden lógico
    eliminarRecurso(clss.Courses.CourseWork, 'courseWork', 'Tarea');
    eliminarRecurso(clss.Courses.CourseWorkMaterial, 'courseWorkMaterial', 'Material');
    eliminarRecurso(clss.Courses.Announcements, 'announcements', 'Anuncio');
    eliminarRecurso(clss.Courses.Topics, 'topic', 'Tema');

    console.log("--- Proceso terminado ---");
}


function PROBAR_CONEXION_SUPABASE() {
    const testId = "oe4yJAuxTxNK4bo7AAwTiq3qFmm2"; // Tu ID de la base de datos
    try {
        const data = callSupabase('/perfiles?id=eq.' + testId + '&select=token_balance');
        console.log("CONEXIÓN EXITOSA:");
        console.log("Resultado:", JSON.stringify(data));
        if (data.length > 0) {
            console.log("Saldo del usuario:", data[0].token_balance);
        } else {
            console.warn("ADVERTENCIA: No se encontró el usuario en la tabla 'perfiles'.");
        }
    } catch (e) {
        console.error("ERROR CRÍTICO DE CONEXIÓN:");
        console.error(e.toString());
    }
}
function TEST_DIRECTO() {
    // 1. REEMPLAZA ESTO CON TU SERVICE_ROLE_KEY REAL (la de Supabase Dash -> API)
    const key = "AQUÍ_COPIA_Y_PEGA_TU_SERVICE_ROLE_KEY_ COMPLETA";
    const url = "https://yubfyqnbumfozqfayjzm.supabase.co/rest/v1/perfiles";

    const options = {
        method: 'GET',
        headers: {
            'apikey': key,
            'Authorization': 'Bearer ' + key
        },
        muteHttpExceptions: true
    };

    const resp = UrlFetchApp.fetch(url, options);
    console.log("Status:", resp.getResponseCode());
    console.log("Body:", resp.getContentText());
}
