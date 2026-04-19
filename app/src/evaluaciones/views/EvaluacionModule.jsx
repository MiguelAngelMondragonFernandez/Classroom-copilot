import React, { useState, useEffect } from 'react';
import { useCourse } from '../../context/CourseContext';
import { useAuth } from '../../context/AuthContext';
import * as EvaluacionService from '../js/EvaluacionService';
import * as ConfigUnidadesJS from '../../planeacion/js/ConfigUnidades';
import * as ConfigTemarioJS from '../../planeacion/js/ConfigTemario';
import { generarActividadAI } from '../../services/activityGeneratorApi';
import { callGasApi } from '../../services/gasApi';

// PrimeReact Components
import { Button } from 'primereact/button';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Tag } from 'primereact/tag';
import { Card } from 'primereact/card';
import { Dialog } from 'primereact/dialog';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Message } from 'primereact/message';
import { Dropdown } from 'primereact/dropdown';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { InputNumber } from 'primereact/inputnumber';
import { SelectButton } from 'primereact/selectbutton';
import Swal from 'sweetalert2';

export default function EvaluacionModule() {
    const { selectedCourse } = useCourse();
    const { user } = useAuth();
    const [actividades, setActividades] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedActividad, setSelectedActividad] = useState(null);
    const [showPreview, setShowPreview] = useState(false);

    // New states for activity creation
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [unidades, setUnidades] = useState([]);
    const [temas, setTemas] = useState([]);
    const [selectedUnidad, setSelectedUnidad] = useState(null);
    const [selectedTema, setSelectedTema] = useState(null);
    const [generatingActivity, setGeneratingActivity] = useState(false);
    const [previewActivity, setPreviewActivity] = useState(null);
    const [showPreviewDialog, setShowPreviewDialog] = useState(false);
    const [saving, setSaving] = useState(false);
    const [publishState, setPublishState] = useState('DRAFT');

    useEffect(() => {
        if (selectedCourse) {
            cargarActividades();
            cargarUnidades();
        }
    }, [selectedCourse]);

    const cargarUnidades = async () => {
        try {
            const data = await ConfigUnidadesJS.listadoUnidades(selectedCourse.id);
            setUnidades(data);
        } catch (error) {
            console.error("Error cargando unidades:", error);
        }
    };

    const handleUnidadChange = async (e) => {
        // Guardar el objeto unidad completo en selectedUnidad
        const unidadObj = e.value;
        setSelectedUnidad(unidadObj);
        setSelectedTema(null);
        setTemas([]);
        if (unidadObj) {
            try {
                const unidadId = unidadObj.id || unidadObj;
                const data = await ConfigTemarioJS.listadoTemarios(selectedCourse.id, unidadId);
                setTemas(data);
            } catch (error) {
                console.error("Error cargando temas:", error);
            }
        }
    };

    const handleGenerarActividad = async () => {
        if (!user || !selectedTema) return;
        
        setGeneratingActivity(true);
        try {
            const materiales = selectedTema.drive_files || [];
            const result = await generarActividadAI(user.uid, selectedTema.nombre, materiales, {
                enfoque: 'Práctico y basado en los materiales compartidos',
                nivel: 'Educación Superior'
            });
            
            setPreviewActivity(result);
            setShowPreviewDialog(true);
            setShowCreateDialog(false);
        } catch (error) {
            console.error("Error al generar actividad:", error);
            Swal.fire('Error', 'No se pudo generar la actividad: ' + error.message, 'error');
        } finally {
            setGeneratingActivity(false);
        }
    };

    const handleConfirmarActividad = async () => {
        if (!selectedCourse || !previewActivity || !selectedTema || !selectedUnidad) return;

        setSaving(true);
        try {
            const unidadTopicId = selectedUnidad.classroom_topic_id || null;
            const unidadTopicName = selectedUnidad.nombre || selectedTema.nombre;
            const response = await callGasApi('createActivity', {
                courseId: selectedCourse.id,
                userId: user.uid,
                topicId: unidadTopicId,
                topicName: unidadTopicName,
                activity: previewActivity,
                publishState: publishState
            }, 'POST');

            if (response.courseWorkId) {
                setShowPreviewDialog(false);
                setPreviewActivity(null);

                // Alerta de éxito mejorada
                let successText = `La actividad se ha creado como ${publishState === 'PUBLISHED' ? 'PUBLICADA' : 'BORRADOR'} en Classroom.`;
                let htmlExtra = '';

                if (response.rubricError) {
                    htmlExtra += `<p style="color:#e67e22;margin-top:10px"><i class="pi pi-exclamation-triangle"></i> <strong>Nota:</strong> ${response.rubricError}</p>`;
                }
                if (response.alternateLink) {
                    htmlExtra += `<p style="margin-top:10px"><a href="${response.alternateLink}" target="_blank" style="color:#4285F4;font-weight:bold">Ver en Google Classroom →</a></p>`;
                }

                Swal.fire({
                    icon: response.rubricError ? 'warning' : 'success',
                    title: 'Tarea Creada',
                    text: successText,
                    html: successText + htmlExtra,
                    confirmButtonText: 'Genial'
                });
                cargarActividades();
            }
        } catch (error) {
            console.error("Error al publicar actividad:", error);
            Swal.fire('Error', 'No se pudo publicar la actividad: ' + error.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const cargarActividades = async () => {
        setLoading(true);
        try {
            const data = await EvaluacionService.listadoActividades(selectedCourse.id);
            setActividades(data);
        } catch (error) {
            console.error("Error cargando actividades:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = (act) => {
        Swal.fire({
            title: '¿Eliminar actividad?',
            text: "Se eliminará permanentemente de Google Classroom y de la base de datos.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar de ambos',
            cancelButtonText: 'Cancelar',
            showLoaderOnConfirm: true,
            preConfirm: async () => {
                try {
                    const res = await EvaluacionService.eliminarActividadCompleta(act.id, selectedCourse.id, act.course_work_id);
                    if (!res.success) throw new Error(res.error);
                    return true;
                } catch (error) {
                    Swal.showValidationMessage(`Error: ${error.message}`);
                }
            }
        }).then((result) => {
            if (result.isConfirmed) {
                Swal.fire('Eliminado', 'La actividad ha sido eliminada de Classroom y la base de datos.', 'success');
                cargarActividades();
            }
        });
    };

    const handleViewRubric = (act) => {
        setSelectedActividad(act);
        setShowPreview(true);
    };

    const statusBodyTemplate = (rowData) => {
        return <Tag value={rowData.estado.toUpperCase()} severity={getStatusSeverity(rowData.estado)} />;
    };

    const getStatusSeverity = (status) => {
        switch (status) {
            case 'completado': return 'success';
            case 'evaluando': return 'info';
            case 'pendiente': return 'warning';
            case 'error': return 'danger';
            default: return 'info';
        }
    };

    const dateBodyTemplate = (rowData) => {
        return new Date(rowData.fecha_cierre).toLocaleString();
    };

    const actionBodyTemplate = (rowData) => {
        return (
            <div className="flex gap-2">
                <Button icon="pi pi-eye" rounded text severity="info" onClick={() => handleViewRubric(rowData)} tooltip="Ver Rúbrica" />
                <Button icon="pi pi-trash" rounded text severity="danger" onClick={() => handleDelete(rowData)} tooltip="Eliminar Registro" />
            </div>
        );
    };

    return (
        <div className="p-3 md:p-4 animate__animated animate__fadeIn">
            <Card className="shadow-2 border-round-xl">
                <div className="flex flex-column md:flex-row justify-content-between align-items-start md:align-items-center gap-3 mb-4">
                    <div>
                        <h2 className="m-0 font-bold text-primary">Gestión de Actividades Evaluables</h2>
                        <p className="text-600">Monitorea y gestiona las rúbricas y el estado de evaluación IA.</p>
                    </div>
                    <div className="flex gap-2 w-full md:w-auto justify-content-end">
                        <Button 
                            label="Nueva Actividad" 
                            icon="pi pi-plus" 
                            className="p-button-rounded shadow-2 w-full md:w-auto" 
                            onClick={() => setShowCreateDialog(true)} 
                            disabled={!selectedCourse}
                        />
                        <Button icon="pi pi-refresh" rounded outlined onClick={cargarActividades} loading={loading} />
                    </div>
                </div>

                {!selectedCourse ? (
                    <Message severity="warn" text="Selecciona un curso para ver sus actividades." className="w-full" />
                ) : loading ? (
                    <div className="flex justify-content-center p-8">
                        <ProgressSpinner />
                    </div>
                ) : (
                    <DataTable value={actividades} stripedRows paginator rows={10} responsiveLayout="stack" breakpoint="960px" className="p-datatable-sm shadow-1">
                        <Column field="course_work_id" header="ID Tarea" style={{ width: '15%' }} body={(r) => <span className="text-xs font-mono">{r.course_work_id}</span>}></Column>
                        <Column field="fecha_cierre" header="Cierre" body={dateBodyTemplate} sortable style={{ width: '20%' }}></Column>
                        <Column field="estado" header="Estado" body={statusBodyTemplate} style={{ width: '15%' }}></Column>
                        <Column header="Acciones" body={actionBodyTemplate} style={{ width: '15%' }}></Column>
                    </DataTable>
                )}
            </Card>

            <Dialog 
                header="Detalle de Rúbrica" 
                visible={showPreview} 
                style={{ width: '95vw', maxWidth: '900px' }} 
                onHide={() => setShowPreview(false)}
            >
                {selectedActividad && (
                    <div className="flex flex-column gap-3">
                        {selectedActividad.rubrica_json.map((crit, i) => (
                            <div key={i} className="surface-100 p-3 border-round-lg">
                                <h4 className="m-0 font-bold">{crit.criterio}</h4>
                                <p className="text-sm text-600 mb-2">{crit.descripcion}</p>
                                <div className="flex flex-wrap gap-2">
                                    {crit.niveles.map((niv, j) => (
                                        <div key={j} className="bg-white p-2 border-round shadow-1 flex-1 min-w-min">
                                            <div className="flex justify-content-between font-bold text-xs mb-1">
                                                <span>{niv.nivel}</span>
                                                <span className="text-primary">{niv.puntos} pts</span>
                                            </div>
                                            <p className="m-0 text-xs text-700">{niv.description || niv.descripcion}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Dialog>

            {/* Diálogo de Creación de Actividad */}
            <Dialog 
                header="Generar Nueva Actividad con IA" 
                visible={showCreateDialog} 
                style={{ width: '95vw', maxWidth: '450px' }} 
                onHide={() => setShowCreateDialog(false)}
                footer={
                    <div className="flex flex-column sm:flex-row justify-content-end gap-2">
                        <Button label="Cancelar" icon="pi pi-times" className="p-button-text w-full sm:w-auto" onClick={() => setShowCreateDialog(false)} />
                        <Button 
                            label="Generar con IA" 
                            icon={generatingActivity ? "pi pi-spin pi-spinner" : "pi pi-sparkles"} 
                            className="p-button-primary p-button-rounded shadow-2 w-full sm:w-auto" 
                            onClick={handleGenerarActividad} 
                            disabled={!selectedTema || generatingActivity} 
                        />
                    </div>
                }
            >
                <div className="flex flex-column gap-4 py-2">
                    <div className="flex flex-column gap-2">
                        <label className="font-bold text-sm text-600 uppercase">1. Selecciona la Unidad</label>
                        <Dropdown 
                            value={selectedUnidad} 
                            options={unidades} 
                            onChange={handleUnidadChange} 
                            optionLabel="nombre" 
                            placeholder="Seleccionar Unidad" 
                            className="w-full surface-50 border-none"
                        />
                    </div>
                    <div className="flex flex-column gap-2">
                        <label className="font-bold text-sm text-600 uppercase">2. Selecciona el Tema</label>
                        <Dropdown 
                            value={selectedTema} 
                            options={temas} 
                            onChange={(e) => setSelectedTema(e.value)} 
                            optionLabel="nombre" 
                            placeholder={selectedUnidad ? "Seleccionar Tema" : "Primero selecciona una unidad"} 
                            disabled={!selectedUnidad}
                            className="w-full surface-50 border-none"
                        />
                    </div>
                    {selectedTema && (
                        <div className="p-3 bg-blue-50 border-round-lg flex align-items-center gap-3">
                            <i className="pi pi-info-circle text-blue-500 text-xl"></i>
                            <div className="text-sm text-blue-800">
                                Se generará una actividad basada en: <br/>
                                <strong>{selectedTema.nombre}</strong>
                            </div>
                        </div>
                    )}
                </div>
            </Dialog>

            {/* Diálogo de Previsualización de Actividad IA */}
            <Dialog 
                header={<div className="flex align-items-center gap-2"><i className="pi pi-sparkles text-yellow-500"></i> Previsualización de Actividad IA</div>}
                visible={showPreviewDialog} 
                style={{ width: '90vw', maxWidth: '800px' }} 
                onHide={() => setShowPreviewDialog(false)}
                footer={
                    <div className="flex flex-column lg:flex-row justify-content-between align-items-stretch lg:align-items-center gap-3">
                        <SelectButton 
                            value={publishState} 
                            onChange={(e) => setPublishState(e.value)} 
                            options={[
                                { label: 'Guardar como Borrador', value: 'DRAFT' },
                                { label: 'Publicar Ahora', value: 'PUBLISHED' }
                            ]}
                            className="p-button-sm"
                        />
                        <div className="flex flex-column sm:flex-row gap-2 sm:gap-3">
                            <Button label="Cancelar" icon="pi pi-times" className="p-button-text w-full sm:w-auto" onClick={() => setShowPreviewDialog(false)} />
                            <Button label={publishState === 'PUBLISHED' ? 'Publicar en Classroom' : 'Guardar Borrador'} icon="pi pi-send" className="p-button-primary p-button-rounded shadow-2 w-full sm:w-auto" onClick={handleConfirmarActividad} loading={saving} />
                        </div>
                    </div>
                }
            >
                {previewActivity && (
                    <div className="flex flex-column gap-4 p-2">
                        <div className="grid">
                            <div className="col-12">
                                <label className="block text-sm font-bold uppercase text-500 mb-2">Título de la Actividad</label>
                                <InputText 
                                    value={previewActivity.titulo} 
                                    onChange={(e) => setPreviewActivity({...previewActivity, titulo: e.target.value})}
                                    className="w-full p-inputtext-lg surface-50 border-none font-bold text-primary"
                                />
                            </div>
                            <div className="col-12 md:col-4">
                                <label className="block text-sm font-bold uppercase text-500 mb-2">
                                    <i className="pi pi-calendar mr-1"></i> Fecha de Entrega
                                </label>
                                <InputText 
                                    value={previewActivity.fecha_entrega} 
                                    onChange={(e) => setPreviewActivity({...previewActivity, fecha_entrega: e.target.value})}
                                    className="w-full surface-50 border-none"
                                    placeholder="AAAA-MM-DD"
                                />
                            </div>
                            <div className="col-12 md:col-4">
                                <label className="block text-sm font-bold uppercase text-500 mb-2">
                                    <i className="pi pi-clock mr-1"></i> Hora de Entrega
                                </label>
                                <InputText 
                                    value={previewActivity.hora_entrega} 
                                    onChange={(e) => setPreviewActivity({...previewActivity, hora_entrega: e.target.value})}
                                    className="w-full surface-50 border-none"
                                    placeholder="HH:MM"
                                />
                            </div>
                            <div className="col-12 md:col-4">
                                <label className="block text-sm font-bold uppercase text-500 mb-2">
                                    <i className="pi pi-star mr-1"></i> Puntos
                                </label>
                                <InputNumber 
                                    value={previewActivity.puntos_maximos} 
                                    onValueChange={(e) => setPreviewActivity({...previewActivity, puntos_maximos: e.value})}
                                    className="w-full surface-50 border-none"
                                    min={0}
                                />
                            </div>
                        </div>
                        
                        <div>
                            <label className="block text-sm font-bold uppercase text-500 mb-2">Instrucciones</label>
                            <InputTextarea
                                rows={6}
                                className="w-full p-4 surface-100 border-none border-round-xl line-height-3 text-700"
                                value={previewActivity.instrucciones}
                                onChange={(e) => setPreviewActivity({...previewActivity, instrucciones: e.target.value})}
                                autoResize
                            />
                        </div>

                        <div>
                            <div className="flex justify-content-between align-items-center mb-2">
                                <label className="block text-sm font-bold uppercase text-500">Rúbrica de Evaluación (Editable)</label>
                                {(() => {
                                    const totalPuntos = previewActivity.rubrica.reduce((sum, c) => sum + (c.puntos_maximos_criterio || Math.max(...c.niveles.map(n => n.puntos))), 0);
                                    const isExact = totalPuntos === (previewActivity.puntos_maximos || 100);
                                    return (
                                        <span className={`text-sm font-bold ${isExact ? 'text-green-500' : 'text-red-500'}`}>
                                            <i className={`pi ${isExact ? 'pi-check-circle' : 'pi-exclamation-circle'} mr-1`}></i>
                                            {totalPuntos} / {previewActivity.puntos_maximos || 100} pts
                                        </span>
                                    );
                                })()}
                            </div>
                            <div className="grid">
                                {previewActivity.rubrica.map((crit, i) => (
                                    <div key={`crit-${i}`} className="col-12 mb-3">
                                        <div className="surface-card border-1 border-200 border-round-lg p-3">
                                            <InputText 
                                                value={crit.criterio} 
                                                onChange={(e) => {
                                                    const newRubric = [...previewActivity.rubrica];
                                                    newRubric[i].criterio = e.target.value;
                                                    setPreviewActivity({...previewActivity, rubrica: newRubric});
                                                }}
                                                className="w-full font-bold text-900 mb-2 border-none surface-50"
                                                placeholder="Nombre del Criterio"
                                            />
                                            <InputTextarea
                                                value={crit.descripcion}
                                                onChange={(e) => {
                                                    const newRubric = [...previewActivity.rubrica];
                                                    newRubric[i].descripcion = e.target.value;
                                                    setPreviewActivity({...previewActivity, rubrica: newRubric});
                                                }}
                                                rows={2}
                                                className="w-full text-sm text-600 m-0 mb-3 border-none surface-50"
                                                placeholder="Descripción del criterio..."
                                                autoResize
                                            />
                                            <div className="flex flex-wrap gap-2 mt-3">
                                                {crit.niveles.map((niv, j) => (
                                                    <div key={`niv-${j}`} className="flex-1 bg-gray-50 p-3 border-round border-1 border-100 min-w-min">
                                                        <InputText 
                                                            value={niv.nivel} 
                                                            onChange={(e) => {
                                                                const newRubric = [...previewActivity.rubrica];
                                                                newRubric[i].niveles[j].nivel = e.target.value;
                                                                setPreviewActivity({...previewActivity, rubrica: newRubric});
                                                            }}
                                                            className="w-full text-xs font-bold mb-1 border-none bg-transparent p-0"
                                                        />
                                                        <div className="flex align-items-center gap-1 mb-2">
                                                            <InputNumber 
                                                                value={niv.puntos} 
                                                                onValueChange={(e) => {
                                                                    const newRubric = [...previewActivity.rubrica];
                                                                    newRubric[i].niveles[j].puntos = e.value;
                                                                    setPreviewActivity({...previewActivity, rubrica: newRubric});
                                                                }}
                                                                className="w-3rem"
                                                                inputClassName="p-0 text-xs font-bold text-primary border-none bg-transparent"
                                                            />
                                                            <span className="text-xs text-500">pts</span>
                                                        </div>
                                                        <InputTextarea
                                                            value={niv.descripcion}
                                                            onChange={(e) => {
                                                                const newRubric = [...previewActivity.rubrica];
                                                                newRubric[i].niveles[j].descripcion = e.target.value;
                                                                setPreviewActivity({...previewActivity, rubrica: newRubric});
                                                            }}
                                                            rows={2}
                                                            className="w-full text-xs text-700 m-0 border-none bg-transparent p-0"
                                                            autoResize
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </Dialog>
        </div>
    );
}
