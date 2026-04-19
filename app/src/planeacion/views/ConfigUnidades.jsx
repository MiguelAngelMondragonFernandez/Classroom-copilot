import React, { useState, useEffect } from 'react'
import * as ConfigUnidadesJS from '../js/ConfigUnidades'
import Swal from 'sweetalert2'
import 'animate.css'

// PrimeReact Components
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Card } from 'primereact/card';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Message } from 'primereact/message';
import { Divider } from 'primereact/divider';
import { Tag } from 'primereact/tag';
import { useAuth } from '../../context/AuthContext';
import { useCourse } from '../../context/CourseContext';
import { callGasApi } from '../../services/gasApi';

function ConfigUnidades() {
    const { googleToken } = useAuth();
    const { selectedCourse } = useCourse();
    const [unidades, setUnidades] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(null); // null para lista, 'new' para nuevo, {id} para editar

    // Estado inicial del formulario
    const initialFormState = { nombre: '' };
    const [formData, setFormData] = useState(initialFormState);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        cargarUnidades();
    }, [selectedCourse]);

    const cargarUnidades = async () => {
        try {
            setLoading(true);
            const data = await ConfigUnidadesJS.listadoUnidades(selectedCourse?.id);
            const hoy = new Date();
            hoy.setHours(0, 0, 0, 0); // Solo comparar fechas, no horas

            const formattedData = data.map(u => {
                const inicio = u.fechaInicio ? new Date(u.fechaInicio + 'T00:00:00') : null;
                const termino = u.fechaTermino ? new Date(u.fechaTermino + 'T00:00:00') : null;

                // Lógica de estado automático
                let activo = false;
                if (inicio && termino) {
                    activo = hoy >= inicio && hoy <= termino;
                }

                return {
                    ...u,
                    fechaInicio: inicio,
                    fechaTermino: termino,
                    isActivoAuto: activo
                };
            });
            setUnidades(formattedData);
        } catch (err) {
            console.error("Error al cargar unidades:", err);
            Swal.fire({
                icon: 'error',
                title: 'Error de carga',
                text: 'No se pudieron obtener las unidades de la base de datos.',
                confirmButtonColor: '#6366f1'
            });
        } finally {
            setLoading(false);
            // Sincronización en segundo plano con Classroom
            await sincronizarConClassroomLocal();
        }
    };

    const sincronizarConClassroomLocal = async () => {
        if (!selectedCourse || !googleToken) return;
        try {
            const topics = await callGasApi('getTopics', {
                courseId: selectedCourse.id,
                token: googleToken
            });
            
            if (topics && topics.length > 0) {
                // Obtener las unidades actuales de nuestro estado (o refetch de la base)
                const currentUnidades = await ConfigUnidadesJS.listadoUnidades(selectedCourse.id);
                
                let detectadasNuevas = 0;
                for (const topic of topics) {
                    // Si no existe ninguna unidad en DB con este topicId ni con este nombre exacto
                    const existById = currentUnidades.find(u => u.classroom_topic_id === topic.topicId);
                    const existByName = currentUnidades.find(u => u.nombre.toLowerCase() === topic.name.toLowerCase());
                    
                    if (!existById && !existByName) {
                        // Crear automáticamente en nuestra DB
                        const payload = {
                            nombre: topic.name,
                            courseId: selectedCourse.id,
                            classroom_topic_id: topic.topicId
                        };
                        await ConfigUnidadesJS.guardarUnidad(payload);
                        detectadasNuevas++;
                    } else if (existByName && !existByName.classroom_topic_id) {
                        // Enlazar ID si lo creamos localmente antes y en classroom ya existe
                        await ConfigUnidadesJS.actualizarUnidad(existByName.id, { classroom_topic_id: topic.topicId });
                    }
                }

                // Borrar en cascada local (si existe en DB pero no en Classroom, y TENÍA id de classroom)
                for (const u of currentUnidades) {
                    if (u.classroom_topic_id && !topics.find(t => t.topicId === u.classroom_topic_id)) {
                        await ConfigUnidadesJS.eliminarUnidad(u.id);
                        detectadasNuevas++; // Usamos esto como flag de que hubo cambios
                    }
                }

                if (detectadasNuevas > 0) {
                     // Recargar de forma silenciosa si hubo cambios
                     const newData = await ConfigUnidadesJS.listadoUnidades(selectedCourse.id);
                     const hoy = new Date();
                     hoy.setHours(0, 0, 0, 0);
                     const formattedData = newData.map(u => {
                         const inicio = u.fechaInicio ? new Date(u.fechaInicio + 'T00:00:00') : null;
                         const termino = u.fechaTermino ? new Date(u.fechaTermino + 'T00:00:00') : null;
                         let activo = false;
                         if (inicio && termino) activo = (hoy >= inicio && hoy <= termino);
                         return { ...u, fechaInicio: inicio, fechaTermino: termino, isActivoAuto: activo };
                     });
                     setUnidades(formattedData);
                }
            }
        } catch (e) {
            console.error("Error al sincronizar silenciosamente con Classroom:", e);
        }
    };

    const handleEdit = (unidad) => {
        setEditing(unidad.id);
        setFormData({
            nombre: unidad.nombre,
        });
    };

    const handleCancel = () => {
        setEditing(null);
        setFormData(initialFormState);
    };

    const isFormValid = () => {
        if (!formData.nombre || formData.nombre.trim().length < 3) return false;
        return true;
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        // SweetAlert2 de confirmación
        Swal.fire({
            title: '¿Confirmar datos?',
            text: `¿Estás seguro de que los datos de la unidad "${formData.nombre}" son correctos?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#6366f1',
            cancelButtonColor: '#94a3b8',
            confirmButtonText: 'Sí, guardar',
            cancelButtonText: 'Revisar',
            showClass: { popup: 'animate__animated animate__zoomIn' },
            hideClass: { popup: 'animate__animated animate__zoomOut' }
        }).then(async (result) => {
            if (result.isConfirmed) {
                setSaving(true);

                // Mostrar modal de carga
                Swal.fire({
                    title: 'Guardando...',
                    text: 'Por favor, no cierres la ventana.',
                    allowOutsideClick: false,
                    didOpen: () => {
                        Swal.showLoading();
                    }
                });

                const payload = {
                    ...formData,
                    courseId: selectedCourse?.id,
                };

                let response;
                if (editing === 'new') {
                    // Crear en Classroom
                    try {
                        const gasResponse = await callGasApi('createTopic', {
                            token: googleToken,
                            courseId: selectedCourse.id,
                            name: formData.nombre
                        });
                        if (gasResponse && gasResponse.topicId) {
                            payload.classroom_topic_id = gasResponse.topicId;
                        }
                    } catch (gasErr) {
                        console.error("Error al crear la unidad en Classroom:", gasErr);
                        const isDuplicate = gasErr.toString().includes("already exists");
                        Swal.fire({
                            icon: 'error',
                            title: isDuplicate ? 'Tema duplicado en Classroom' : 'Error en Classroom',
                            text: isDuplicate 
                                ? 'Ya existe un tema con ese nombre en tu Classroom. Si no lo ves aquí, debería sincronizarse pronto o verifica recargando la página.' 
                                : 'No se pudo crear en Google Classroom: ' + gasErr.message,
                            confirmButtonColor: '#6366f1'
                        });
                        setSaving(false);
                        return; // Detener el guardado si falló en Classroom
                    }

                    // Proceder solo si no hubo error en Classroom
                    response = await ConfigUnidadesJS.guardarUnidad(payload);
                } else {
                    const oldUnidad = unidades.find(u => u.id === editing);
                    if (oldUnidad && oldUnidad.classroom_topic_id && oldUnidad.nombre !== formData.nombre) {
                        // Actualizar en Classroom
                        try {
                            await callGasApi('updateTopic', {
                                token: googleToken,
                                courseId: selectedCourse.id,
                                topicId: oldUnidad.classroom_topic_id,
                                name: formData.nombre
                            });
                        } catch (gasErr) {
                            console.error("Error al actualizar la unidad en Classroom:", gasErr);
                        }
                    }
                    response = await ConfigUnidadesJS.actualizarUnidad(editing, payload);
                }

                if (response.success) {
                    await cargarUnidades();
                    handleCancel();
                    Swal.fire({
                        icon: 'success',
                        title: '¡Guardado!',
                        text: 'La unidad ha sido registrada correctamente.',
                        timer: 2000,
                        showConfirmButton: false
                    });
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: 'Oops...',
                        text: 'Error al procesar la solicitud: ' + response.error.message,
                        confirmButtonColor: '#6366f1'
                    });
                }
                setSaving(false);
            }
        });
    };

    const handleDelete = (id) => {
        Swal.fire({
            title: '¿Estás seguro?',
            text: "Esta acción eliminará la unidad permanentemente y no se puede deshacer.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#94a3b8',
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar',
            reverseButtons: true
        }).then(async (result) => {
            if (result.isConfirmed) {
                Swal.fire({
                    title: 'Eliminando...',
                    allowOutsideClick: false,
                    didOpen: () => {
                        Swal.showLoading();
                    }
                });

                const unidadToDelete = unidades.find(u => u.id === id);

                // Check Classroom
                if (unidadToDelete && unidadToDelete.classroom_topic_id) {
                    try {
                        await callGasApi('deleteTopic', {
                            token: googleToken,
                            courseId: selectedCourse.id,
                            topicId: unidadToDelete.classroom_topic_id
                        });
                    } catch (e) {
                        console.error("Error eliminando desde Classroom:", e);
                        // Continúa borrando localmente aunque falle en remoto
                    }
                }

                const response = await ConfigUnidadesJS.eliminarUnidad(id);
                if (response.success) {
                    await cargarUnidades();
                    Swal.fire({
                        icon: 'success',
                        title: 'Eliminado',
                        text: 'El registro ha sido borrado.',
                        timer: 1500,
                        showConfirmButton: false
                    });
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: 'Error',
                        text: 'No se pudo eliminar: ' + response.error.message
                    });
                }
            }
        });
    };

    const renderForm = () => (
        <Card className="shadow-4 border-round-2xl mb-5 animate__animated animate__fadeIn">
            <h4 className="m-0 mb-4 text-primary font-bold flex align-items-center">
                <i className={`${editing === 'new' ? 'pi pi-plus-circle' : 'pi pi-pencil'} mr-2 text-2xl`}></i>
                {editing === 'new' ? 'Nueva Unidad' : 'Editar Unidad'}
            </h4>
            <form onSubmit={handleSubmit} className="grid text-left">
                <div className="col-12 mb-3">
                    <label className="block mb-2 text-sm text-600 font-bold uppercase line-height-3">Nombre de la Unidad</label>
                    <InputText
                        className={`w-full p-inputtext-lg surface-100 border-none ${formData.nombre && formData.nombre.trim().length < 3 ? 'p-invalid' : ''}`}
                        placeholder="Ej: Unidad 1"
                        value={formData.nombre}
                        onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                        required
                    />
                    {formData.nombre && formData.nombre.trim().length < 3 && (
                        <small className="p-error block mt-1">Mínimo 3 caracteres.</small>
                    )}
                </div>
                <div className="col-12 mb-3">
                    <Message
                        severity="info"
                        text="Las fechas de inicio y término de la unidad se calculan automáticamente a partir de la planeación generada y del horario configurado del curso."
                        className="w-full"
                    />
                </div>
                <div className="col-12 flex flex-column sm:flex-row justify-content-end gap-3 mt-4">
                    <Button
                        type="button"
                        label="Cancelar"
                        className="p-button-text p-button-secondary font-bold w-full sm:w-auto"
                        onClick={handleCancel}
                        disabled={saving}
                    />
                    <Button
                        type="submit"
                        label={editing === 'new' ? 'Crear Unidad' : 'Guardar Cambios'}
                        icon={saving ? "pi pi-spin pi-spinner" : "pi pi-check"}
                        className="p-button-rounded px-5 shadow-2 w-full sm:w-auto"
                        disabled={saving || !isFormValid()}
                    />
                </div>
            </form>
        </Card>
    );

    return (
        <div className="responsive-page--narrow p-4 md:p-6 lg:p-8">
            <div className="flex flex-column md:flex-row justify-content-between align-items-start md:align-items-center gap-4 mb-6">
                <div>
                    <h2 className="m-0 text-2xl md:text-3xl font-bold">Configuración de Unidades</h2>
                    <p className="text-600 m-0 mt-1">Gestiona las unidades de tu curso.</p>
                </div>
                {editing === null && (
                    <Button
                        label="Nueva Unidad"
                        icon="pi pi-plus"
                        className="p-button-rounded shadow-2 w-full md:w-auto"
                        onClick={() => setEditing('new')}
                        disabled={!selectedCourse}
                    />
                )}
            </div>

            {editing !== null ? renderForm() : (
                <div className="grid animate__animated animate__fadeIn">
                    {loading ? (
                        <div className="col-12 flex justify-content-center py-8">
                            <ProgressSpinner style={{ width: '50px', height: '50px' }} strokeWidth="8" fill="var(--surface-ground)" animationDuration=".5s" />
                        </div>
                    ) : unidades && unidades.length > 0 ? (
                        unidades.map((unidad) => (
                            <div key={unidad.id} className="col-12 mb-4">
                                <Card className="shadow-2 border-none surface-card border-round-xl overflow-hidden">
                                    <div className="flex flex-column sm:flex-row justify-content-between align-items-start gap-3 mb-4">
                                        <div className="flex align-items-center min-w-0">
                                            <div className="icon-badge mr-3 bg-indigo-500 text-white flex align-items-center justify-content-center border-round-md" style={{ width: '42px', height: '42px' }}>
                                                <i className="pi pi-calendar text-xl"></i>
                                            </div>
                                            <h5 className="m-0 text-lg md:text-xl font-bold text-900 line-height-3">{unidad.nombre}</h5>
                                        </div>
                                        <div className="flex gap-2 align-items-center w-full sm:w-auto justify-content-end">
                                            <Button
                                                icon="pi pi-pencil"
                                                className="p-button-rounded p-button-text surface-100 text-indigo-500 hover:surface-200"
                                                onClick={() => handleEdit(unidad)}
                                                tooltip="Editar"
                                            />
                                            <Button
                                                icon="pi pi-trash"
                                                className="p-button-rounded p-button-text surface-100 text-pink-500 hover:surface-200"
                                                onClick={() => handleDelete(unidad.id)}
                                                tooltip="Eliminar"
                                            />
                                            <Tag
                                                value={unidad.isActivoAuto ? 'Activo' : 'Inactivo'}
                                                severity={unidad.isActivoAuto ? 'success' : 'danger'}
                                                className="ml-2 font-bold px-3 border-round-pill"
                                            />
                                        </div>
                                    </div>
                                    <Divider className="my-4 opacity-50" />
                                    <div className="grid text-left">
                                        <div className="col-12 md:col-6">
                                            <p className="m-0 mb-1 text-xs text-500 font-bold uppercase letter-spacing-1">Fecha de Inicio</p>
                                            <p className="m-0 font-semibold text-800 flex align-items-center">
                                                <i className="pi pi-calendar-plus mr-2 text-indigo-500"></i>
                                                {unidad.fechaInicio?.toLocaleDateString() || 'Sin fecha'}
                                            </p>
                                        </div>
                                        <div className="col-12 md:col-6">
                                            <p className="m-0 mb-1 text-xs text-500 font-bold uppercase letter-spacing-1">Fecha de Término</p>
                                            <p className="m-0 font-semibold text-800 flex align-items-center">
                                                <i className="pi pi-calendar-minus mr-2 text-indigo-500"></i>
                                                {unidad.fechaTermino?.toLocaleDateString() || 'Sin fecha'}
                                            </p>
                                        </div>
                                    </div>
                                </Card>
                            </div>
                        ))
                    ) : !selectedCourse ? (
                        <div className="col-12">
                            <Message severity="warn" text="Por favor, selecciona un curso en la barra superior para gestionar sus unidades." className="w-full justify-content-start p-3 shadow-1 border-round-lg" />
                        </div>
                    ) : (
                        <div className="col-12">
                            <Message severity="info" text={`No hay unidades configuradas para el curso "${selectedCourse.name}". Haz clic en 'Nueva Unidad' para empezar.`} className="w-full justify-content-start p-3 shadow-1 border-round-lg" />
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default ConfigUnidades