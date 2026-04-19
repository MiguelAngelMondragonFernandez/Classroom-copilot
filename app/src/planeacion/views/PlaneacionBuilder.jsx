import React, { useState, useEffect } from 'react';
import { Card } from 'primereact/card';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import { Calendar } from 'primereact/calendar';
import { InputText } from 'primereact/inputtext';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Message } from 'primereact/message';
import { Divider } from 'primereact/divider';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Dialog } from 'primereact/dialog';
import { InputTextarea } from 'primereact/inputtextarea';
import { Slider } from 'primereact/slider';
import { InputNumber } from 'primereact/inputnumber';
import { Checkbox } from 'primereact/checkbox';
import { FileUpload } from 'primereact/fileupload';
import { ProgressBar } from 'primereact/progressbar';
import { callGasApi } from '../../services/gasApi';
import { useCourse } from '../../context/CourseContext';
import { useAuth } from '../../context/AuthContext';
import * as ConfigPlaneacionJS from '../js/ConfigPlaneacion';
import * as ConfigHorarioJS from '../js/ConfigHorario';
import * as ConfigUnidadesJS from '../js/ConfigUnidades';
import { generarPlaneacionAI } from '../../services/aiPlannerApi';
import { openGooglePicker } from '../../services/googlePicker';
import Swal from 'sweetalert2';

const PlaneacionBuilder = () => {
    const { selectedCourse } = useCourse();
    const { user, googleToken, refreshGoogleToken } = useAuth();

    const [loading, setLoading] = useState(false);
    const [generatingAI, setGeneratingAI] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [showAIDialog, setShowAIDialog] = useState(false);
    
    const [aiConfig, setAiConfig] = useState({
        temaMateria: '',
        alcances: '',
        teoriaPorcentaje: 50,
        numeroUnidades: 3,
        usarFechasExistentes: false,
        herramientas: '',
        materiales: [] // Almacenará { id, name, type }
    });

    const [ciclos, setCiclos] = useState([]);
    const [selectedCiclo, setSelectedCiclo] = useState(null);
    const [horario, setHorario] = useState([]);
    const [planeacion, setPlaneacion] = useState([]);

    // Estados para creación de nuevo ciclo
    const [showNewCiclo, setShowNewCiclo] = useState(false);
    const [newCicloData, setNewCicloData] = useState({
        nombre: '',
        fecha_inicio: null,
        fecha_fin: null
    });

    useEffect(() => {
        cargarDatosBase();
    }, [selectedCourse]);

    const cargarDatosBase = async () => {
        setLoading(true);
        try {
            const [ciclosData, horarioData] = await Promise.all([
                ConfigPlaneacionJS.listadoCiclosEscolares(),
                ConfigHorarioJS.listadoHorarios(selectedCourse?.id)
            ]);
            // Filtrar ciclos por curso seleccionado para que horario y ciclo coincidan
            const ciclosFiltrados = selectedCourse?.id
                ? (ciclosData || []).filter(c => c.course_id === selectedCourse.id)
                : (ciclosData || []);
            setCiclos(ciclosFiltrados);
            setHorario(horarioData || []);

            if (ciclosFiltrados.length > 0) {
                // Por defecto seleccionamos el más reciente
                setSelectedCiclo(ciclosFiltrados[0]);
                cargarDetallePlaneacion(ciclosFiltrados[0].id);
            } else {
                setSelectedCiclo(null);
            }
        } catch (error) {
            console.error("Error al cargar datos iniciales:", error);
        } finally {
            setLoading(false);
        }
    };

    const cargarDetallePlaneacion = async (cicloId) => {
        const data = await ConfigPlaneacionJS.listadoPlaneacion(cicloId);
        
        // Enriquecer datos con número de semana
        if (selectedCiclo && data.length > 0) {
            const startDate = new Date(`${selectedCiclo.fecha_inicio}T00:00:00`);
            
            const enrichedData = data.map(item => {
                let itemDate = null;
                if (item.fecha_asignada instanceof Date && !isNaN(item.fecha_asignada.getTime())) {
                    itemDate = item.fecha_asignada;
                } else if (item.fecha_asignada && /^\d{4}-\d{2}-\d{2}$/.test(String(item.fecha_asignada).trim())) {
                    itemDate = new Date(`${item.fecha_asignada}T00:00:00`);
                    itemDate = isNaN(itemDate.getTime()) ? null : itemDate;
                }
                if (!itemDate || isNaN(itemDate)) {
                    return { ...item, week_number: 0, grouping_key: `${item.unidad_id}_0` };
                }
                const diffTime = Math.abs(itemDate - startDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                // Si el itemDate es anterior a startDate (poco probable pero por seguridad)
                if (itemDate < startDate) return { ...item, week_number: 0, grouping_key: `${item.unidad_id}_0` };
                
                // Calcular semana (Semana 1 empieza en el día 0)
                const weekNumber = Math.floor(diffDays / 7) + 1;
                // Clave de agrupación compuesta para unidad + semana
                const groupingKey = `${item.unidad_id}_${weekNumber}`;
                return { ...item, week_number: weekNumber, grouping_key: groupingKey };
            });
            setPlaneacion(enrichedData);
        } else {
            const basicEnriched = data.map(item => ({ ...item, week_number: 1, grouping_key: `${item.unidad_id}_1` }));
            setPlaneacion(basicEnriched);
        }
    };

    const handleCreateCiclo = async () => {
        if (!newCicloData.nombre || !newCicloData.fecha_inicio || !newCicloData.fecha_fin) {
            Swal.fire('Incompleto', 'Por favor llena todos los campos del ciclo', 'warning');
            return;
        }

        setLoading(true);
        const res = await ConfigPlaneacionJS.guardarCicloEscolar({
            ...newCicloData,
            course_id: selectedCourse?.id,
            fecha_inicio: newCicloData.fecha_inicio.toLocaleDateString('en-CA'),
            fecha_fin: newCicloData.fecha_fin.toLocaleDateString('en-CA')
        });

        if (res.success) {
            Swal.fire('¡Éxito!', 'Ciclo escolar creado correctamente', 'success');
            setShowNewCiclo(false);
            cargarDatosBase();
        } else {
            Swal.fire('Error', res.error, 'error');
        }
        setLoading(false);
    };

    const handleGenerateAI = async () => {
        if (!selectedCourse?.id) {
            Swal.fire('Atención', 'Selecciona un curso primero.', 'warning');
            return;
        }
        if (!selectedCiclo) {
            Swal.fire('Atención', 'Selecciona un ciclo escolar primero.', 'warning');
            return;
        }
        if (horario.length === 0) {
            Swal.fire('Atención', 'Necesitas tener horario configurado para poder generar la planeación.', 'warning');
            return;
        }

        try {
            setGeneratingAI(true);
            Swal.fire({
                title: 'Generando Planeación',
                text: 'La Inteligencia Artificial está procesando tu horario y construyendo el cronograma. Esto puede tardar unos segundos...',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            const iaResponse = await generarPlaneacionAI(selectedCiclo, horario, user.uid, aiConfig);
            
            // 1. Obtener unidades existentes para evitar duplicados
            const unidadesExistentes = await ConfigUnidadesJS.listadoUnidades(selectedCourse.id);
            
            let itemsToInsert = [];
            
            for (const unidadInfo of iaResponse.unidades) {
                let unidadIdBD = null;
                
                // Buscar si la unidad ya existe por nombre
                const unidadEncontrada = unidadesExistentes.find(u => 
                    u.nombre.toLowerCase().trim() === unidadInfo.nombre.toLowerCase().trim()
                );

                if (unidadEncontrada) {
                    unidadIdBD = unidadEncontrada.id;
                } else {
                    // Si no existe, crearla
                    const resUnidad = await ConfigUnidadesJS.guardarUnidad({
                        nombre: unidadInfo.nombre,
                        course_id: selectedCourse.id,
                        ciclo_escolar_id: selectedCiclo.id
                    });
                    
                    if (resUnidad.success && resUnidad.data && resUnidad.data[0]) {
                        unidadIdBD = resUnidad.data[0].id;
                        // Opcional: añadir a la lista local para no repetirla en este mismo loop si la IA duplicó
                        unidadesExistentes.push(resUnidad.data[0]);
                    }
                }

                if (unidadInfo.temas && Array.isArray(unidadInfo.temas)) {
                    unidadInfo.temas.forEach((tema, index) => {
                        itemsToInsert.push({
                            ciclo_id: selectedCiclo.id,
                            unidad_id: unidadIdBD ?? null,
                            fecha_asignada: tema.fecha_asignada ?? null,
                            hora_inicio: tema.hora_inicio ?? null,
                            hora_fin: tema.hora_fin ?? null,
                            titulo_tema: tema.titulo_tema ?? '',
                            duracion_minutos: tema.duracion_minutos ?? 60,
                            orden: index + 1, 
                            status: 'draft',
                            metadata: { 
                                notas_ai: tema.notas_ai ?? '', 
                                duracion_minutos: tema.duracion_minutos ?? 60,
                                materiales_usados: aiConfig.materiales ?? [] 
                            }
                        });
                    });
                }
            }

            if (itemsToInsert.length > 0) {
               const saveResult = await ConfigPlaneacionJS.guardarPlaneacionBatch(itemsToInsert, selectedCourse.id);

               if(saveResult.success) {
                    Swal.fire('Completado', 'La planeación ha sido generada con éxito', 'success');
                    cargarDetallePlaneacion(selectedCiclo.id);
               } else {
                    throw new Error(saveResult.error);
               }
            } else {
               Swal.fire('Atención', 'La IA no devolvió temas para agendar.', 'warning');
            }

        } catch (error) {
            console.error("Error en flujo de IA:", error);
            if (error.message.includes("Saldo insuficiente")) {
                 Swal.fire('Saldo Insuficiente', 'No tienes suficientes créditos de IA.', 'warning');
            } else {
                 Swal.fire('Error al Generar', error.message, 'error');
            }
        } finally {
            setGeneratingAI(false);
        }
    };

    /**
     * Lógica de "Efecto Dominó"
     * Si un tema cambia de fecha, los siguientes se desplazan al siguiente slot disponible.
     */
    const aplicarEfectoDomino = async (indexCambiado, fechaActual, horaInicioActual) => {
        Swal.fire({
            title: 'Ajuste Dominó',
            text: "¿Qué deseas hacer con esta clase y todas las siguientes?",
            icon: 'question',
            showCancelButton: true,
            showDenyButton: true,
            confirmButtonText: 'Retrasar (Perdí esta clase)',
            denyButtonText: 'Adelantar (Voy más rápido)',
            cancelButtonText: 'Cancelar'
        }).then(async (result) => {
            if (result.isConfirmed || result.isDenied) {
                const isPushingForward = result.isConfirmed; // true si retrasa (empuja hacia el futuro), false si adelanta

                try {
                    setLoading(true);
                    
                    const diasInhabilesDB = await ConfigPlaneacionJS.listadoDiasInhabiles(selectedCiclo.id);
                    const diasInhabiles = diasInhabilesDB.map(d => d.fecha);
                    
                    // Calculamos slots desde el inicio del ciclo
                    const slotsTotales = ConfigPlaneacionJS.calcularBloquesDisponibles(
                        selectedCiclo.fecha_inicio, 
                        selectedCiclo.fecha_fin, 
                        diasInhabiles, 
                        horario
                    );
                    
                    // Buscamos en qué slot total cae el primer item afectado
                    let slotStartIndex = slotsTotales.findIndex(s => 
                        s.fecha === fechaActual && s.horaInicio.substring(0, 5) === horaInicioActual.substring(0, 5)
                    );
                    
                    if (slotStartIndex === -1) {
                         // Fallback
                         slotStartIndex = 0;
                    }

                    if (isPushingForward) {
                        // Si empujamos al futuro, el tema actual tomará el slot S+1
                        slotStartIndex += 1;
                    } else {
                        // Si tiramos al pasado, tomará S-1
                        slotStartIndex -= 1;
                    }

                    if (slotStartIndex < 0) {
                        Swal.fire('Error', 'No se puede adelantar más, este es el primer bloque disponible del ciclo.', 'error');
                        setLoading(false);
                        return;
                    }

                    const itemsAfectados = planeacion.slice(indexCambiado);
                    const slotsParaAfectados = slotsTotales.slice(slotStartIndex);

                    if (slotsParaAfectados.length < itemsAfectados.length) {
                         Swal.fire('Advertencia', 'No hay suficientes días hacia el final del ciclo escolar para acomodar todos los temas desplazados. Algunos quedarán fuera.', 'warning');
                    }
                    
                    let itemsActualizados = [];
                    for(let i=0; i < itemsAfectados.length; i++) {
                        const slot = slotsParaAfectados[i];
                        if(slot) {
                            itemsActualizados.push({
                                ...itemsAfectados[i],
                                fecha_asignada: slot.fecha,
                                hora_inicio: slot.horaInicio,
                                hora_fin: slot.horaFin,
                                ciclos: undefined // Evitar enviarlo a upsert porque da error de relación
                            });
                        }
                    }
                    
                    const saveResult = await ConfigPlaneacionJS.guardarPlaneacionBatch(itemsActualizados, selectedCourse.id);
                    
                    if(saveResult.success) {
                        Swal.fire('Completado', 'Cronograma ajustado con efecto dominó.', 'success');
                        cargarDetallePlaneacion(selectedCiclo.id);
                    } else {
                        throw new Error(saveResult.error);
                    }
                } catch (err) {
                    Swal.fire('Error', err.message || 'Error al ajustar planeación', 'error');
                } finally {
                    setLoading(false);
                }
            }
        });
    };



    const handleUploadMaterial = async (event) => {
        const file = event.files[0];
        if (!file) return;

        setUploading(true);
        try {
            // 1. Asegurar que existe la carpeta
            let folderId = localStorage.getItem('drive_folder_id'); // Unificado con TemarioConfig
            if (!folderId) {
                const folderRes = await callGasApi('getDriveFolder', { token: googleToken });
                if (folderRes.files && folderRes.files.length > 0) {
                    folderId = folderRes.files[0].id;
                } else {
                    const createRes = await callGasApi('createDriveFolder', { token: googleToken }, 'POST');
                    if (createRes && createRes.id) {
                        folderId = createRes.id;
                    }
                }
                if (folderId) localStorage.setItem('drive_folder_id', folderId);
            }

            // 2. Convertir a base64 y subir
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const base64Data = e.target.result.split(',')[1];
                    
                    const data = await callGasApi('uploadFile', {
                        token: googleToken,
                        fileName: file.name,
                        fileData: base64Data,
                        mimeType: file.type,
                        parentFolderId: folderId
                    }, 'POST');

                    // callGasApi ya valida result.success y devuelve result.data
                    if (data && data.fileId) {
                        setAiConfig(prev => ({
                            ...prev,
                            materiales: [...prev.materiales, { 
                                id: data.fileId, 
                                name: data.fileName, 
                                type: file.type 
                            }]
                        }));
                        Swal.fire('Cargado', `Archivo ${file.name} subido a Drive correctamente.`, 'success');
                    } else {
                        throw new Error('No se recibió el ID del archivo subido');
                    }
                } catch (error) {
                    console.error("Error al procesar subida:", error);
                    // Si el error es de autenticación expirada, callGasApi ya disparará el evento auth-session-expired
                    Swal.fire('Error', error.message || 'No se pudo subir el archivo a Google Drive.', 'error');
                } finally {
                    setUploading(false);
                }
            };
            reader.readAsDataURL(file);
        } catch (error) {
            console.error("Error al subir archivo:", error);
            Swal.fire('Error', 'No se pudo subir el archivo a Google Drive.', 'error');
            setUploading(false);
        }
    };

    const handleLinkFromDrive = async () => {
        try {
            let token = googleToken;
            if (!token && refreshGoogleToken) {
                token = await refreshGoogleToken();
            }
            if (!token) {
                Swal.fire('Error', 'No se pudo obtener acceso a Google Drive. Intenta iniciar sesión de nuevo.', 'error');
                return;
            }
            const files = await openGooglePicker(token);
            if (files && files.length > 0) {
                setAiConfig(prev => ({
                    ...prev,
                    materiales: [
                        ...prev.materiales, 
                        ...files.map(f => ({ id: f.id, name: f.name, type: f.mimeType }))
                    ]
                }));
                Swal.fire({
                    icon: 'success',
                    title: 'Archivos vinculados',
                    text: `Se han añadido ${files.length} archivo(s) desde Drive`,
                    timer: 1500,
                    showConfirmButton: false
                });
            }
        } catch (error) {
            console.error("Error al vincular desde Drive:", error);
            Swal.fire('Error', 'No se pudo abrir el selector de Google Drive: ' + error.message, 'error');
        }
    };

    const handleRejectPlaneacion = async () => {
        Swal.fire({
            title: 'Rechazar Propuesta',
            text: '¿Estás seguro de que quieres descartar esta propuesta de la IA? Se borrarán todos los temas no publicados.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Sí, rechazar y borrar',
            cancelButtonText: 'Cancelar'
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    setLoading(true);
                    const res = await ConfigPlaneacionJS.eliminarPlaneacionDraft(selectedCiclo.id);
                    
                    if (res.success) {
                        Swal.fire('Eliminada', 'La propuesta ha sido descartada.', 'success');
                        cargarDetallePlaneacion(selectedCiclo.id);
                    } else {
                        throw new Error(res.error || 'Error al eliminar');
                    }
                } catch (error) {
                    Swal.fire('Error', error.message, 'error');
                } finally {
                    setLoading(false);
                }
            }
        });
    };

    const handleDeletePublishedPlaneacion = async () => {
        Swal.fire({
            title: 'Eliminar Planeación Publicada',
            text: 'Esto borrará los materiales creados en Google Classroom y los registros de la base de datos. (Si existen eventos de calendario antiguos, también se limpiarán). ¿Deseas continuar?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'Sí, borrar todo',
            cancelButtonText: 'Cancelar'
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    setLoading(true);
                    Swal.fire({
                        title: 'Eliminando...',
                        text: 'Estamos limpiando tu calendario y base de datos.',
                        allowOutsideClick: false,
                        didOpen: () => Swal.showLoading()
                    });

                    const res = await ConfigPlaneacionJS.eliminarPlaneacionPublicada(planeacion, googleToken, selectedCourse.id);

                    if (res.success) {
                        Swal.fire('Eliminado', 'La planeación y los materiales de Classroom han sido borrados de la base de datos.', 'success');
                        setPlaneacion([]);
                        cargarDetallePlaneacion(selectedCiclo.id);
                    } else {
                        throw new Error(res.error);
                    }
                } catch (error) {
                    Swal.fire('Error', error.message, 'error');
                } finally {
                    setLoading(false);
                }
            }
        });
    };

    const handleSyncPlaneacion = async () => {
        if (!googleToken) {
            Swal.fire('Autenticación Requerida', 'Falta el token de Google. Inicia sesión de nuevo para obtener permisos de classroom.', 'warning');
            return;
        }

        const itemsToSync = planeacion.filter(p => !p.status || p.status === 'draft');
        if (itemsToSync.length === 0) return;

        Swal.fire({
            title: 'Sincronizar con Google Classroom',
            text: `Vas a publicar ${itemsToSync.length} clases en tu Google Classroom. ¿Estás de acuerdo?`,
            icon: 'info',
            showCancelButton: true,
            confirmButtonText: 'Sí, Sincronizar',
            cancelButtonText: 'Cancelar'
        }).then(async (result) => {
            if (result.isConfirmed) {
                try {
                    setLoading(true);
                    const res = await ConfigPlaneacionJS.sincronizarPlaneacionBatch(itemsToSync, selectedCourse.id, googleToken);
                    
                    if (res.success) {
                        Swal.fire('¡Éxito!', 'Las clases se han añadido a Google Classroom y la planeación ha sido publicada.', 'success');
                        cargarDetallePlaneacion(selectedCiclo.id);
                    } else {
                        throw new Error(res.error || 'Error al sincronizar');
                    }
                } catch (error) {
                    Swal.fire('Error', error.message, 'error');
                } finally {
                    setLoading(false);
                }
            }
        });
    };

    if (!selectedCourse) {
        return (
            <div className="p-8 text-center mt-8">
                <i className="pi pi-info-circle text-6xl text-primary mb-4"></i>
                <h2>Selecciona un curso para comenzar</h2>
                <p>Necesitamos saber para qué clase estás planeando el ciclo.</p>
            </div>
        );
    }

    return (
        <div className="grid p-2 md:p-3 animate__animated animate__fadeIn">
            <div className="col-12 lg:col-4">
                <Card title="Configuración del Ciclo" className="shadow-2 border-round-xl">
                    <div className="flex flex-column gap-3">
                        <label className="font-bold">Ciclo Seleccionado</label>
                        <Dropdown
                            value={selectedCiclo}
                            options={ciclos}
                            onChange={(e) => {
                                setSelectedCiclo(e.value);
                                cargarDetallePlaneacion(e.value.id);
                            }}
                            optionLabel="nombre"
                            placeholder="Selecciona un ciclo"
                            className="w-full"
                        />
                        <Button
                            label="Crear Nuevo Ciclo"
                            icon="pi pi-plus"
                            text
                            onClick={() => setShowNewCiclo(true)}
                        />
                    </div>

                    {horario.length === 0 && (
                        <Message
                            severity="error"
                            text="No has configurado tu horario de clases. Ve al módulo de Horarios antes de planear."
                            className="mt-4 w-full"
                        />
                    )}
                </Card>

                {showNewCiclo && (
                    <Card title="Nuevo Ciclo Escolar" className="mt-4 shadow-3 border-round-xl animate__animated animate__zoomIn">
                        <div className="flex flex-column gap-3">
                            <InputText
                                placeholder="Nombre (Ej: Otoño 2026)"
                                value={newCicloData.nombre}
                                onChange={(e) => setNewCicloData({ ...newCicloData, nombre: e.target.value })}
                            />
                            <Calendar
                                placeholder="Fecha Inicio"
                                value={newCicloData.fecha_inicio}
                                onChange={(e) => setNewCicloData({ ...newCicloData, fecha_inicio: e.value })}
                                showIcon
                            />
                            <Calendar
                                placeholder="Fecha Fin"
                                value={newCicloData.fecha_fin}
                                onChange={(e) => setNewCicloData({ ...newCicloData, fecha_fin: e.value })}
                                showIcon
                            />
                            <div className="flex flex-column sm:flex-row gap-2">
                                <Button label="Guardar" icon="pi pi-check" onClick={handleCreateCiclo} loading={loading} className="w-full sm:w-auto" />
                                <Button label="Cancelar" severity="secondary" text onClick={() => setShowNewCiclo(false)} className="w-full sm:w-auto" />
                            </div>
                        </div>
                    </Card>
                )}
            </div>

            <div className="col-12 lg:col-8">
                <Card title="Cronograma de Planeación" className="shadow-2 border-round-xl overflow-hidden">
                    {loading ? (
                        <div className="flex justify-content-center p-8">
                            <ProgressSpinner />
                        </div>
                        ) : planeacion.length > 0 ? (
                        <>
                        <div className="px-3 mb-4">
                            <div className="flex flex-column sm:flex-row justify-content-between align-items-center gap-3 p-3 bg-gray-50 border-round-xl border-1 border-200">
                                <div className="flex flex-column gap-1">
                                    <span className="font-bold text-900">Acciones de Planeación</span>
                                    <span className="text-600 text-sm">Gestiona la publicación y limpieza de tu cronograma.</span>
                                </div>
                                <div className="flex gap-2 flex-wrap justify-content-center sm:justify-content-end">
                                    {planeacion.some(p => p.status !== 'published') && (
                                        <>
                                            <Button 
                                                label="Sincronizar con Classroom" 
                                                icon="pi pi-cloud-upload" 
                                                severity="success" 
                                                onClick={handleSyncPlaneacion} 
                                                className="shadow-1 w-full sm:w-auto"
                                                tooltip="Sincroniza las clases marcadas como borradores o con errores."
                                            />
                                            <Button 
                                                label="Descartar Borradores" 
                                                icon="pi pi-trash" 
                                                severity="danger" 
                                                outlined
                                                onClick={handleRejectPlaneacion} 
                                                className="w-full sm:w-auto"
                                                tooltip="Elimina permanentemente los temas que aún no han sido publicados."
                                            />
                                        </>
                                    )}
                                    
                                    {planeacion.some(p => p.status === 'published' || p.metadata?.classroom_material_id || p.metadata?.calendar_event_id) && (
                                        <Button 
                                            label="Limpiar Publicados (Classroom)" 
                                            icon="pi pi-history" 
                                            severity="danger" 
                                            text
                                            onClick={handleDeletePublishedPlaneacion} 
                                            tooltip="Borrará los materiales y unidades en Classroom, así como los registros en la base de datos."
                                            className="ml-auto w-full sm:w-auto"
                                        />
                                    )}
                                </div>
                            </div>
                        </div>
                            <DataTable 
                                value={planeacion} 
                                rowGroupMode="subheader" 
                                groupRowsBy="grouping_key"
                                sortMode="single" 
                                sortField="fecha_asignada" 
                                sortOrder={1}
                                responsiveLayout="stack" 
                                breakpoint="960px" 
                                stripedRows 
                                className="p-datatable-sm"
                                rowGroupHeaderTemplate={(rowData, options) => {
                                    // Determinar si es una nueva unidad comparando con el registro anterior en el array original
                                    const currentIndex = planeacion.findIndex(p => p.id === rowData.id);
                                    const prevRow = currentIndex > 0 ? planeacion[currentIndex - 1] : null;
                                    const isNewUnit = !prevRow || prevRow.unidad_id !== rowData.unidad_id;

                                    return (
                                        <React.Fragment>
                                            {/* Cabecera de UNIDAD - Solo si la unidad cambió */}
                                            {isNewUnit && (
                                                <div className={`flex align-items-center gap-2 w-full py-3 px-3 surface-200 border-round-top shadow-1 ${currentIndex > 0 ? 'mt-6' : 'mt-2'}`} style={{ borderLeft: '8px solid var(--primary-600)' }}>
                                                    <div className="flex flex-column">
                                                        <span className="text-xs text-600 font-bold uppercase line-height-1 mb-1">Unidad Académica</span>
                                                        <span className="font-bold text-xl text-primary" style={{ letterSpacing: '0.5px' }}>
                                                            {rowData.ciclos?.nombre || 'General / Introducción'}
                                                        </span>
                                                    </div>
                                                    <i className="pi pi-bookmark-fill ml-auto text-primary text-2xl opacity-50"></i>
                                                </div>
                                            )}
                                            
                                            {/* Cabecera de SEMANA - Siempre dentro de la agrupación key */}
                                            <div className="flex align-items-center gap-3 w-full py-2 px-3 surface-100 border-round-bottom-0 border-top-1 border-300 shadow-sm">
                                                <div className="bg-primary text-white border-round-md px-3 py-1 font-bold text-sm shadow-1">
                                                    SEMANA {rowData.week_number}
                                                </div>
                                                <Divider layout="vertical" className="mx-0" />
                                                <span className="text-sm font-semibold text-600 italic">Cronograma de actividades</span>
                                            </div>
                                        </React.Fragment>
                                    )
                                }}
                            >
                                <Column field="fecha_asignada" header="Fecha" style={{ width: '120px' }} body={(rowData) => {
                                    const raw = rowData.fecha_asignada;
                                    let d = null;
                                    if (raw instanceof Date && !isNaN(raw.getTime())) {
                                        d = raw;
                                    } else if (raw && typeof raw === 'string') {
                                        const trimmed = raw.trim();
                                        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
                                            d = new Date(`${trimmed}T12:00:00`);
                                        } else {
                                            d = new Date(trimmed);
                                        }
                                        d = isNaN(d.getTime()) ? null : d;
                                    }
                                    return (
                                        <div className="flex align-items-center gap-2">
                                            <i className="pi pi-calendar text-400 text-xs"></i>
                                            <span className="font-medium">{d ? d.toLocaleDateString() : 'Sin fecha'}</span>
                                        </div>
                                    );
                                }} />
                                <Column field="hora_inicio" header="Horario" style={{ width: '140px' }} body={(rowData) => {
                                    const st = rowData.hora_inicio ? String(rowData.hora_inicio).substring(0, 5) : '--:--';
                                    const ed = rowData.hora_fin ? String(rowData.hora_fin).substring(0, 5) : '--:--';
                                    return (
                                        <div className="flex align-items-center gap-2">
                                            <i className="pi pi-clock text-400 text-xs"></i>
                                            <span>{st} - {ed}</span>
                                        </div>
                                    );
                                }} />
                                <Column field="titulo_tema" header="Contenido del Tema" body={(rowData) => (
                                    <span className="font-semibold text-900">{rowData.titulo_tema}</span>
                                )} />
                                <Column header="Acciones" style={{ width: '150px' }} body={(rowData, options) => {
                                    const tieneFechaValida = rowData.fecha_asignada && /^\d{4}-\d{2}-\d{2}$/.test(String(rowData.fecha_asignada).trim());
                                    return (
                                <div className="flex gap-2">
                                    <Button 
                                        icon="pi pi-calendar-edit" 
                                        rounded 
                                        text 
                                        severity="info" 
                                        disabled={!tieneFechaValida}
                                        onClick={() => aplicarEfectoDomino(options.rowIndex, rowData.fecha_asignada, rowData.hora_inicio)} 
                                        tooltip={tieneFechaValida ? "Ajustar Fecha (Dominó)" : "Sin fecha asignada"} 
                                    />
                                    {rowData.status === 'published' && (
                                        <Button icon="pi pi-check-circle" rounded text severity="success" tooltip="Sincronizado con Classroom" />
                                    )}
                                    {rowData.metadata?.notas_ai && (
                                       <Button icon="pi pi-info-circle" rounded text severity="help" onClick={() => Swal.fire('Nota de IA', rowData.metadata.notas_ai, 'info')} tooltip="Notas IA" />
                                    )}
                                </div>
                            );
                            }} />
                        </DataTable>
                        </>
                    ) : (
                        <div className="text-center p-8">
                            <i className="pi pi-sparkles text-6xl text-indigo-400 mb-4"></i>
                            <h3 className="text-900">Tu planeación está vacía</h3>
                            <p className="text-600 mb-5">Usa la Inteligencia Artificial para distribuir tus temas automáticamente utilizando tus horarios y configuración de Unidades.</p>
                            <Button label="Generar Planeación con AI" icon={generatingAI ? "pi pi-spin pi-spinner" : "pi pi-bolt"} className="p-button-rounded p-button-lg shadow-4" onClick={() => setShowAIDialog(true)} disabled={generatingAI} />
                        </div>
                    )}
                </Card>
            </div>

            <Dialog header="Configuración de la Planeación (IA)" visible={showAIDialog} style={{ width: '95vw', maxWidth: '600px' }} onHide={() => setShowAIDialog(false)} baseZIndex={1000}>
                <div className="flex flex-column gap-4 py-3">
                    <div className="flex flex-column gap-2">
                        <label htmlFor="temaMateria" className="font-bold">Tema o enfoque de la materia</label>
                        <InputText id="temaMateria" value={aiConfig.temaMateria} onChange={(e) => setAiConfig({...aiConfig, temaMateria: e.target.value})} placeholder="Ej. Introducción a la Programación con JS" />
                    </div>
                    
                    <div className="flex flex-column gap-2">
                        <label htmlFor="alcances" className="font-bold">Alcances esperados</label>
                        <InputTextarea id="alcances" rows={3} value={aiConfig.alcances} onChange={(e) => setAiConfig({...aiConfig, alcances: e.target.value})} placeholder="Ej. Que el alumno sea capaz de construir una aplicación web básica..." autoResize />
                    </div>
                    
                    <div className="flex flex-column gap-3">
                        <label className="font-bold">Proporción Teoría vs Práctica</label>
                        <div className="flex justify-content-between text-sm text-600">
                            <span>Teoría ({aiConfig.teoriaPorcentaje}%)</span>
                            <span>Práctica ({100 - aiConfig.teoriaPorcentaje}%)</span>
                        </div>
                        <Slider value={aiConfig.teoriaPorcentaje} onChange={(e) => setAiConfig({...aiConfig, teoriaPorcentaje: e.value})} />
                    </div>
                    
                    <div className="flex flex-column gap-2">
                        <label htmlFor="numeroUnidades" className="font-bold">Número de unidades propuestas</label>
                        <InputNumber id="numeroUnidades" value={aiConfig.numeroUnidades} onValueChange={(e) => setAiConfig({...aiConfig, numeroUnidades: e.value})} min={1} max={20} showButtons />
                    </div>
                    
                    <div className="flex flex-column gap-2">
                        <label htmlFor="herramientas" className="font-bold">Herramientas a utilizar durante el curso</label>
                        <InputText id="herramientas" value={aiConfig.herramientas} onChange={(e) => setAiConfig({...aiConfig, herramientas: e.target.value})} placeholder="Ej. Visual Studio Code, React, Node.js" />
                    </div>

                    <div className="flex flex-column gap-2 mt-2">
                        <label className="font-bold">Material de clase (PDF, Word, etc.)</label>
                        <p className="text-sm text-500 m-0">Los archivos se subirán a tu Google Drive para que la IA los analice.</p>
                        <div className="flex flex-column sm:flex-row gap-2">
                            <FileUpload 
                                mode="basic" 
                                name="demo[]" 
                                auto 
                                customUpload 
                                uploadHandler={handleUploadMaterial} 
                                disabled={uploading} 
                                chooseLabel={uploading ? "Subiendo..." : "Subir Material"}
                                className="p-button-outlined w-full sm:w-auto"
                            />
                            <Button 
                                type="button" 
                                label="Vincular desde Drive" 
                                icon="pi pi-google" 
                                className="p-button-secondary p-button-outlined w-full sm:w-auto" 
                                onClick={handleLinkFromDrive} 
                                disabled={uploading} 
                            />
                        </div>
                        {uploading && <ProgressBar mode="indeterminate" style={{ height: '6px' }}></ProgressBar>}
                        
                        {aiConfig.materiales.length > 0 && (
                            <div className="flex flex-column gap-1 bg-bluegray-50 p-2 border-round">
                                {aiConfig.materiales.map((m, i) => (
                                    <div key={i} className="flex align-items-center gap-2 text-sm">
                                        <i className="pi pi-file text-primary"></i>
                                        <span>{m.name}</span>
                                        <i className="pi pi-check-circle text-success ml-auto"></i>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex align-items-center gap-2 mt-2">
                        <Checkbox inputId="usarFechas" checked={aiConfig.usarFechasExistentes} onChange={(e) => setAiConfig({...aiConfig, usarFechasExistentes: e.checked})} />
                        <label htmlFor="usarFechas">Respetar fechas de unidades ya existentes y solo rellenar (si existen)</label>
                    </div>
                </div>
                <div className="flex flex-column sm:flex-row justify-content-end gap-2 mt-4">
                    <Button label="Cancelar" icon="pi pi-times" onClick={() => setShowAIDialog(false)} className="p-button-text w-full sm:w-auto" />
                    <Button label="Generar con AI" icon="pi pi-bolt" onClick={() => { setShowAIDialog(false); handleGenerateAI(); }} autoFocus loading={generatingAI} className="w-full sm:w-auto" />
                </div>
            </Dialog>
        </div>
    );
};

export default PlaneacionBuilder;
