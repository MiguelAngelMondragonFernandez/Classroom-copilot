
import React, { useState, useEffect } from 'react';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';
import { Divider } from 'primereact/divider';
import { Toast } from 'primereact/toast';
import Swal from 'sweetalert2';
import { useAuth } from '../../context/AuthContext';
import { useCourse } from '../../context/CourseContext';
import * as MaterialesService from '../js/MaterialesService';
import * as ConfigPlaneacionJS from '../../planeacion/js/ConfigPlaneacion';
import { callGasApi } from '../../services/gasApi';
import { askGemini } from '../../services/geminiApi';

const GeneracionMaterial = () => {
    const { user } = useAuth();
    const { selectedCourse } = useCourse();
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(null); // ID del tema que se está generando
    const [temasSemana, setTemasSemana] = useState([]);
    const [materialesCreados, setMaterialesCreados] = useState([]);
    const [semanaActual, setSemanaActual] = useState(0);

    useEffect(() => {
        if (selectedCourse) {
            cargarDatos();
        }
    }, [selectedCourse]);

    const cargarDatos = async () => {
        setLoading(true);
        try {
            // 1. Obtener ciclo en curso para este curso
            const ciclos = await ConfigPlaneacionJS.listadoCiclosEscolares();
            const cicloCurso = ciclos.find(c => c.course_id === selectedCourse.id) || ciclos[0];

            if (!cicloCurso) {
                setTemasSemana([]);
                return;
            }

            // 2. Calcular semana actual
            const numSemana = MaterialesService.calcularSemanaActual(cicloCurso.fecha_inicio);
            setSemanaActual(numSemana);

            // 3. Obtener planeación detallada
            const planeacion = await ConfigPlaneacionJS.listadoPlaneacion(cicloCurso.id);

            // 4. Filtrar temas de la semana actual
            const startDate = new Date(`${cicloCurso.fecha_inicio}T00:00:00`);
            const temasDeLaSemana = planeacion.filter(item => {
                const itemDate = new Date(`${item.fecha_asignada}T00:00:00`);
                const diffTime = Math.abs(itemDate - startDate);
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                const weekNumber = Math.floor(diffDays / 7) + 1;
                return weekNumber === numSemana;
            });

            setTemasSemana(temasDeLaSemana);

            // 5. Obtener materiales ya generados
            const materiales = await MaterialesService.listadoMaterialesGenerados(selectedCourse.id);
            setMaterialesCreados(materiales);

        } catch (error) {
            console.error("Error al cargar temas de la semana:", error);
            Swal.fire('Error', 'No se pudieron cargar los temas de la semana.', 'error');
        } finally {
            setLoading(false);
        }
    }; const handleGenerarMaterial = async (tema, tipo) => {
        // Validar si ya existe
        const existe = materialesCreados.find(m => m.planeacion_id === tema.id && m.tipo === tipo);
        if (existe) {
            const result = await Swal.fire({
                title: 'Material ya existente',
                text: `Ya has generado un ${tipo === 'document' ? 'documento' : 'presentación'} para este tema. ¿Deseas generar uno nuevo?`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Sí, generar otro',
                cancelButtonText: 'Cancelar'
            });
            if (!result.isConfirmed) return;
        }

        setGenerating(tema.id + tipo);
        try {
            // 1. Pedir a Gemini que genere el contenido
            let prompt = "";

            if (tipo === 'document') {
                prompt = `Actúa como un experto creador de contenido educativo. Escribe un material de estudio exhaustivo y detallado dirigido directamente al ALUMNO para que pueda leer y comprender a profundidad el tema: "${tema.titulo_tema}" (Curso: "${selectedCourse.name}"). 
                
Contexto y notas del profesor: ${tema.metadata?.notas_ai || 'Ninguna'}.

Estructura el documento de la siguiente manera:
1. Título principal y una introducción clara al concepto.
2. Desarrollo profundo del tema (explicando el "qué", "cómo" y "por qué").
3. Ejemplos prácticos, analogías o casos de uso que faciliten la comprensión.
4. Resumen o puntos clave a recordar.

Formato: Devuelve el contenido con un formato HTML semántico y atractivo (usa <h1>, <h2>, <h3> para jerarquía, <p> para párrafos, <ul>/<li> para listas, y <strong> para resaltar conceptos clave). 
IMPORTANTE: Devuelve ÚNICAMENTE el código HTML directo (el contenido que iría dentro del body), sin etiquetas <html> ni <body>, sin saludos, y sin bloques de código markdown (como \`\`\`html).`;

            } else {
                prompt = `Actúa como un experto diseñador instruccional. Crea el contenido completo para una presentación de diapositivas dirigida al ALUMNO sobre el tema: "${tema.titulo_tema}" (Curso: "${selectedCourse.name}"). La presentación debe ser lo suficientemente detallada para que el alumno entienda el tema al leerla.

Contexto y notas del profesor: ${tema.metadata?.notas_ai || 'Ninguna'}.

Estructura lógica esperada (aprox. 6-10 diapositivas):
- Diapositiva de Portada / Título.
- Introducción al tema.
- Desarrollo (varias diapositivas explicando los conceptos a fondo).
- Ejemplos claros.
- Conclusiones o Cierre.

Formato: Devuelve ÚNICAMENTE un JSON válido que contenga un array de objetos llamado "slides". Cada objeto debe tener:
- "title": El título de la diapositiva.
- "content": Un texto o viñetas con la información sustancial y detallada (no solo palabras sueltas).
IMPORTANTE: No incluyas explicaciones fuera del JSON, y no uses bloques de código markdown (como \`\`\`json).`;
            }

            const aiResponse = await askGemini(user.uid, prompt);

            // Limpiar la respuesta de Gemini de posibles bloques de código markdown
            let content = aiResponse.answer;
            if (content.includes('```')) {
                content = content.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '').trim();
            }

            // 2. Crear archivo en Drive vía GAS
            Swal.fire({
                title: 'Creando archivos...',
                text: 'Generando archivo en Google Drive',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });

            const action = tipo === 'document' ? 'createDriveDocument' : 'createDrivePresentation';
            const gasResponse = await callGasApi(action, {
                title: `${tipo === 'document' ? 'Lectura' : 'Presentación'}: ${tema.titulo_tema}`,
                content: content,
                courseId: selectedCourse.id,
                topicId: tema.metadata?.classroom_topic_id,
                planeacionId: tema.id
            }, 'POST');

            if (gasResponse && gasResponse.fileId) {
                // 3. Guardar en Supabase (inicialmente sin classroom_material_id)
                const nuevoMaterial = {
                    course_id: selectedCourse.id,
                    planeacion_id: tema.id,
                    classroom_topic_id: tema.metadata?.classroom_topic_id,
                    titulo: tema.titulo_tema,
                    tipo: tipo,
                    drive_file_id: gasResponse.fileId,
                    drive_url: gasResponse.webViewLink,
                    classroom_material_id: null
                };

                const saveResult = await MaterialesService.guardarMaterialGenerado(nuevoMaterial);
                if (!saveResult.success || !saveResult.data?.[0]) {
                    throw new Error(saveResult.error || 'No se pudo guardar el material generado.');
                }
                const materialGuardado = saveResult.data[0];

                await cargarDatos(); // Recargar para mostrar tags

                // 4. Preguntar si desea publicar en Classroom
                const confirmRes = await Swal.fire({
                    title: 'Material generado en Drive',
                    text: 'El archivo se ha creado correctamente. ¿Deseas publicarlo ahora mismo en Google Classroom?',
                    icon: 'success',
                    showCancelButton: true,
                    confirmButtonText: '<i class="pi pi-external-link mr-2"></i> Sí, publicar',
                    cancelButtonText: 'Más tarde',
                    showDenyButton: true,
                    denyButtonText: 'Ver archivo',
                    customClass: {
                        confirmButton: 'p-button-success',
                        denyButton: 'p-button-info'
                    }
                });

                if (confirmRes.isConfirmed) {
                    await handlePublicarEnClassroom(materialGuardado, tema);
                } else if (confirmRes.isDenied) {
                    window.open(gasResponse.webViewLink, '_blank');
                }
            } else {
                throw new Error("No se pudo completar la creación del archivo en Drive.");
            }

        } catch (error) {
            console.error("Error al generar material:", error);
            Swal.fire('Error', error.message || 'Error al generar el material.', 'error');
        } finally {
            setGenerating(null);
        }
    };

    const handlePublicarEnClassroom = async (materialRecord, tema = null) => {
        setGenerating(materialRecord.planeacion_id + materialRecord.tipo + '_pub');
        try {
            Swal.fire({
                title: 'Publicando...',
                text: 'Subiendo material a Google Classroom',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });

            const gasResponse = await callGasApi('publishToClassroom', {
                courseId: selectedCourse.id,
                fileId: materialRecord.drive_file_id,
                topicId: materialRecord.classroom_topic_id || tema?.metadata?.classroom_topic_id,
                unitName: tema?.unidad_nombre || 'General',
                title: materialRecord.titulo,
                existingMaterialId: tema?.metadata?.classroom_material_id || null
            }, 'POST');

            if (gasResponse && gasResponse.classroomMaterialId) {
                await MaterialesService.actualizarMaterialGenerado(materialRecord.id, {
                    classroom_material_id: gasResponse.classroomMaterialId,
                    classroom_topic_id: gasResponse.classroomTopicId || materialRecord.classroom_topic_id
                });
                await cargarDatos();
                Swal.fire('¡Publicado!', 'El material ya está disponible en Classroom.', 'success');
            } else {
                throw new Error("No se pudo obtener la confirmación de Classroom. Verifica el script de Google.");
            }
        } catch (error) {
            console.error("Error al publicar en Classroom:", error);
            Swal.fire('Error', error.message || 'Error al publicar en Classroom.', 'error');
        } finally {
            setGenerating(null);
        }
    };

    if (!selectedCourse) {
        return (
            <div className="p-8 text-center mt-8">
                <i className="pi pi-info-circle text-6xl text-primary mb-4"></i>
                <h2>Selecciona un curso para comenzar</h2>
            </div>
        );
    }

    return (
        <div className="responsive-page p-4 md:p-6 lg:p-8 animate__animated animate__fadeIn">
            <div className="flex flex-column md:flex-row justify-content-between align-items-start md:align-items-end gap-3 mb-6">
                <div>
                    <h2 className="m-0 text-2xl md:text-3xl font-bold">Generación de Material</h2>
                    <p className="text-600 m-0 mt-1">Materiales recomendados para la <b>Semana {semanaActual}</b></p>
                </div>
                <Tag value={`SEMANA ${semanaActual}`} severity="info" className="text-sm md:text-xl px-3 md:px-4 py-2 border-round-xl shadow-2" />
            </div>

            {loading ? (
                <div className="flex justify-content-center py-8">
                    <ProgressSpinner />
                </div>
            ) : temasSemana.length > 0 ? (
                <div className="grid">
                    {temasSemana.map((tema) => {
                        const materialDoc = materialesCreados.find(m => m.planeacion_id === tema.id && m.tipo === 'document');
                        const materialSlide = materialesCreados.find(m => m.planeacion_id === tema.id && m.tipo === 'presentation');

                        return (
                            <div key={tema.id} className="col-12 md:col-6 lg:col-4 mb-4">
                                <Card className="shadow-2 border-round-2xl h-full flex flex-column">
                                    <div className="flex justify-content-between align-items-start mb-3">
                                        <span className="text-xs font-bold text-500 uppercase tracking-wider">TEMA {tema.orden}</span>
                                        <div className="flex gap-1">
                                            {materialDoc && (
                                                <a href={materialDoc.drive_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                                                    <Tag
                                                        severity={materialDoc.classroom_material_id ? "success" : "info"}
                                                        icon={materialDoc.classroom_material_id ? "pi pi-check-circle" : "pi pi-file"}
                                                        tooltip={materialDoc.classroom_material_id ? "Publicado en Classroom (clic para ver)" : "En Drive, pendiente Classroom (clic para ver)"}
                                                        className="cursor-pointer"
                                                    />
                                                </a>
                                            )}
                                            {materialSlide && (
                                                <a href={materialSlide.drive_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                                                    <Tag
                                                        severity={materialSlide.classroom_material_id ? "warning" : "info"}
                                                        icon={materialSlide.classroom_material_id ? "pi pi-check-circle" : "pi pi-images"}
                                                        tooltip={materialSlide.classroom_material_id ? "Publicado en Classroom (clic para ver)" : "En Drive, pendiente Classroom (clic para ver)"}
                                                        className="cursor-pointer"
                                                    />
                                                </a>
                                            )}
                                        </div>
                                    </div>

                                    <h5 className="m-0 mb-3 text-lg md:text-xl font-bold text-900 line-height-2">
                                        {tema.titulo_tema}
                                    </h5>

                                    <div className="flex align-items-center flex-wrap text-600 text-sm mb-4 gap-2">
                                        <i className="pi pi-calendar mr-2"></i>
                                        <span>{new Date(tema.fecha_asignada + 'T12:00:00').toLocaleDateString()}</span>
                                        <Divider layout="vertical" />
                                        <i className="pi pi-clock mr-2"></i>
                                        <span>{tema.hora_inicio.substring(0, 5)}</span>
                                    </div>

                                    <div className="mt-auto pt-4 flex flex-column gap-2">
                                        {/* Botón para Documento */}
                                        {!materialDoc ? (
                                            <Button
                                                label="Generar Lectura (Doc)"
                                                icon={generating === tema.id + 'document' ? "pi pi-spin pi-spinner" : "pi pi-file-edit"}
                                                className="p-button-outlined w-full"
                                                onClick={() => handleGenerarMaterial(tema, 'document')}
                                                disabled={generating !== null}
                                            />
                                        ) : !materialDoc.classroom_material_id ? (
                                            <Button
                                                label="Publicar Lectura"
                                                icon={generating === tema.id + 'document_pub' ? "pi pi-spin pi-spinner" : "pi pi-cloud-upload"}
                                                className="p-button-outlined p-button-info w-full"
                                                onClick={() => handlePublicarEnClassroom(materialDoc, tema)}
                                                disabled={generating !== null}
                                            />
                                        ) : (
                                            <Button
                                                label="Lectura en Classroom"
                                                icon="pi pi-check"
                                                className="p-button-outlined p-button-success w-full"
                                                disabled={true}
                                            />
                                        )}

                                        {/* Botón para Diapositivas */}
                                        {!materialSlide ? (
                                            <Button
                                                label="Generar Diapositivas"
                                                icon={generating === tema.id + 'presentation' ? "pi pi-spin pi-spinner" : "pi pi-images"}
                                                className="p-button-outlined severity-warning w-full"
                                                onClick={() => handleGenerarMaterial(tema, 'presentation')}
                                                disabled={generating !== null}
                                            />
                                        ) : !materialSlide.classroom_material_id ? (
                                            <Button
                                                label="Publicar Diapositivas"
                                                icon={generating === tema.id + 'presentation_pub' ? "pi pi-spin pi-spinner" : "pi pi-cloud-upload"}
                                                className="p-button-outlined p-button-info w-full"
                                                onClick={() => handlePublicarEnClassroom(materialSlide, tema)}
                                                disabled={generating !== null}
                                            />
                                        ) : (
                                            <Button
                                                label="Slides en Classroom"
                                                icon="pi pi-check"
                                                className="p-button-outlined p-button-success w-full"
                                                disabled={true}
                                            />
                                        )}
                                    </div>
                                </Card>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <Message severity="info" text="No hay temas planificados para esta semana actual. Revisa tu cronograma en el Planeador AI." className="w-full shadow-1 border-round-lg p-3" />
            )}
        </div>
    );
};

export default GeneracionMaterial;
