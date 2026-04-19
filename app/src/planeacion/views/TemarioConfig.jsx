import React, { useState, useEffect } from 'react';
import * as ConfigTemarioJS from '../js/ConfigTemario';
import * as ConfigUnidadesJS from '../js/ConfigUnidades';
import { useCourse } from '../../context/CourseContext';
import { useAuth } from '../../context/AuthContext';
import { callGasApi } from '../../services/gasApi';
import { openGooglePicker } from '../../services/googlePicker';
import { askGemini } from '../../services/geminiApi';
import Swal from 'sweetalert2';
import 'animate.css';

// PrimeReact Components
import { Button } from 'primereact/button';
import { InputText } from 'primereact/inputtext';
import { Card } from 'primereact/card';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Message } from 'primereact/message';
import { Divider } from 'primereact/divider';
import { Dropdown } from 'primereact/dropdown';
import { InputTextarea } from 'primereact/inputtextarea';
import { Tag } from 'primereact/tag';
import { Dialog } from 'primereact/dialog';
import { InputNumber } from 'primereact/inputnumber';

function TemarioConfig() {
    const { selectedCourse } = useCourse();
    const { user, googleToken, refreshGoogleToken } = useAuth();
    const [unidades, setUnidades] = useState([]);
    const [filterUnidad, setFilterUnidad] = useState(null); // null means "All"
    const [temas, setTemas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingUnidades, setLoadingUnidades] = useState(false);
    const [editing, setEditing] = useState(null); // null, 'new', or id
    const [expandedCards, setExpandedCards] = useState({}); // Tracking which cards are expanded
    const [uploading, setUploading] = useState(false);

    // Form state initial
    const initialFormState = {
        nombre: '',
        recomendaciones: '',
        // El campo material ha sido eliminado a favor de drive_files
        drive_files: [], // Array de objetos {id, name}
        orden: 1,
        estado: 'pendiente',
        ciclo_id: null
    };

    const [formData, setFormData] = useState(initialFormState);
    const [saving, setSaving] = useState(false);
    const [generatingAI, setGeneratingAI] = useState(false);

    const estados = [
        { label: 'Pendiente', value: 'pendiente' },
        { label: 'En Progreso', value: 'en_progreso' },
        { label: 'Completado', value: 'completado' }
    ];

    useEffect(() => {
        if (selectedCourse) {
            cargarUnidades();
            cargarTemas();
        } else {
            setUnidades([]);
            setTemas([]);
        }
    }, [selectedCourse]);

    useEffect(() => {
        if (selectedCourse) {
            cargarTemas();
        }
    }, [filterUnidad]);

    const cargarUnidades = async () => {
        try {
            setLoadingUnidades(true);
            const data = await ConfigUnidadesJS.listadoUnidades(selectedCourse.id);
            setUnidades(data);
        } catch (error) {
            console.error("Error cargando unidades:", error);
        } finally {
            setLoadingUnidades(false);
        }
    };

    const cargarTemas = async () => {
        try {
            setLoading(true);
            const data = await ConfigTemarioJS.listadoTemarios(selectedCourse.id, filterUnidad);
            // Pedir estados computados y combinar (no persistimos cambios aquí)
            const syncData = await ConfigTemarioJS.syncEstadosTemarios(selectedCourse.id, filterUnidad);
            const syncMap = (syncData || []).reduce((acc, t) => { acc[t.id] = t; return acc; }, {});
            const merged = (data || []).map(t => ({ ...t, computedEstado: (syncMap[t.id] && syncMap[t.id].computedEstado) || t.estado }));
            setTemas(merged);
        } catch (error) {
            console.error("Error cargando temas:", error);
        } finally {
            setLoading(false);
        }
    };

    // IA Recommendations Flow
    useEffect(() => {
        // Se dispara cuando hay un ciclo seleccionado y un nombre de tema, 
        // pero las recomendaciones aún están vacías (o estamos en modo nuevo)
        if (formData.ciclo_id && formData.nombre && !formData.recomendaciones && !generatingAI) {
            handleGenerarRecomendaciones();
        }
    }, [formData.ciclo_id, formData.nombre]);

    const handleGenerarRecomendaciones = async () => {
        if (!formData.nombre || !formData.ciclo_id || !user) return;

        setGeneratingAI(true);
        try {
            const unidadNombre = unidades.find(u => u.id === formData.ciclo_id)?.nombre || 'esta unidad';

            const prompt = `Actúa como un experto en pedagogía. Para el tema "${formData.nombre}" (Unidad: "${unidadNombre}"), genera:
1. Una descripción de máximo 2 líneas.
2. Tres recomendaciones didácticas prácticas en formato de viñetas.
No incluyas saludos ni texto de relleno. Sé conciso, directo y dirígete al docente en español.`;
            // Llamada real al Proxy de Gemini con validación de créditos
            const result = await askGemini(user.uid, prompt);

            setFormData(prev => ({
                ...prev,
                recomendaciones: result.answer
            }));

            console.log("IA Usage:", result.usage);

        } catch (error) {
            console.error("Error al generar recomendaciones con IA:", error);
            // Si el error es de saldo, lo mostramos claramente
            if (error.message.includes("Saldo insuficiente")) {
                Swal.fire('Saldo Insuficiente', 'No tienes suficientes créditos de IA para esta operación.', 'warning');
            }
        } finally {
            setGeneratingAI(false);
        }
    };


    const handleEdit = (tema) => {
        setEditing(tema.id);
        const savedFiles = Array.isArray(tema.drive_files) ? tema.drive_files : [];
        setFormData({
            nombre: tema.nombre,
            recomendaciones: tema.recomendaciones || '',
            drive_files: savedFiles,
            orden: tema.semana_orden || tema.orden || 1,
            estado: tema.estado || 'pendiente',
            ciclo_id: tema.ciclo_id
        });
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
            setUploading(true);

            // Convertir archivo a Base64 para enviarlo a GAS
            const reader = new FileReader();
            const fileBase64 = await new Promise((resolve, reject) => {
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.onerror = error => reject(error);
                reader.readAsDataURL(file);
            });

            // 1. Obtener o crear la carpeta en Drive
            let folderId = localStorage.getItem('drive_folder_id');
            if (!folderId) {
                const folders = await callGasApi('getDriveFolder', {});
                if (folders.files && folders.files.length > 0) {
                    folderId = folders.files[0].id;
                } else {
                    const newFolder = await callGasApi('createDriveFolder', {}, 'POST');
                    folderId = newFolder.id;
                }
                localStorage.setItem('drive_folder_id', folderId);
            }

            // 2. Subir el archivo mediante API propia
            const uploadResponse = await callGasApi('uploadFile', {
                fileName: file.name,
                fileData: fileBase64,
                mimeType: file.type,
                parentFolderId: folderId
            }, 'POST');

            if (uploadResponse.fileId) {
                const newFile = { id: uploadResponse.fileId, name: uploadResponse.fileName || file.name };
                setFormData(prev => ({
                    ...prev,
                    drive_files: [...prev.drive_files, newFile]
                }));
                Swal.fire({
                    icon: 'success',
                    title: 'Archivo subido',
                    text: 'Se ha añadido a la lista de materiales',
                    timer: 1500,
                    showConfirmButton: false
                });
            }
        } catch (error) {
            console.error("Error al subir archivo:", error);
            Swal.fire('Error', 'No se pudo subir el archivo a Drive: ' + error.message, 'error');
        } finally {
            setUploading(false);
            if (e.target) e.target.value = ''; // Reset input
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
                setFormData(prev => ({
                    ...prev,
                    drive_files: [...prev.drive_files, ...files]
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

    const removeFile = (id) => {
        setFormData(prev => ({
            ...prev,
            drive_files: prev.drive_files.filter(f => f.id !== id)
        }));
    };

    const handleCancel = () => {
        setEditing(null);
        setFormData(initialFormState);
    };

    const toggleExpand = (id) => {
        setExpandedCards(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!selectedCourse) return;

        if (!formData.nombre.trim()) {
            Swal.fire('Atención', 'El nombre del tema es obligatorio', 'warning');
            return;
        }

        if (!formData.ciclo_id) {
            Swal.fire('Atención', 'Debes asignar el tema a una unidad', 'warning');
            return;
        }

        setSaving(true);
        try {
            const payload = {
                ...formData,
                course_id: selectedCourse.id,
                orden: Math.max(1, parseInt(formData.orden, 10) || 1),
                semana_orden: Math.max(1, parseInt(formData.orden, 10) || 1),
            };

            let response;
            if (editing === 'new') {
                response = await ConfigTemarioJS.guardarTema(payload);
            } else {
                response = await ConfigTemarioJS.actualizarTema(editing, payload);
            }

            if (response.success) {
                await cargarTemas();
                handleCancel();
                Swal.fire({
                    icon: 'success',
                    title: 'Éxito',
                    text: 'Tema guardado correctamente.',
                    timer: 1500,
                    showConfirmButton: false
                });
            } else {
                throw new Error(response.error);
            }
        } catch (error) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: error.message
            });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (id) => {
        const temaToDelete = temas.find(t => t.id === id);

        Swal.fire({
            title: `¿Eliminar tema "${temaToDelete?.nombre}"?`,
            text: "Esta acción eliminará el tema del temario local. No se puede deshacer.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Sí, eliminar todo'
        }).then(async (result) => {
            if (result.isConfirmed) {
                const response = await ConfigTemarioJS.eliminarTema(id);
                if (response.success) {
                    cargarTemas();
                    Swal.fire('Eliminado', 'El tema ha sido borrado correctamente.', 'success');
                }
            }
        });
    };


    const getStatusSeverity = (status) => {
        switch (status) {
            case 'completado': return 'success';
            case 'tema_visto': return 'info';
            case 'debio_verse': return 'danger';
            case 'en_progreso': return 'info';
            case 'pendiente': return 'warning';
            default: return 'info';
        }
    };

    const renderForm = () => (
        <Card className="shadow-4 border-round-2xl mb-5 animate__animated animate__fadeIn">
            <h4 className="m-0 mb-4 text-primary font-bold flex align-items-center">
                <i className={`${editing === 'new' ? 'pi pi-plus-circle' : 'pi pi-pencil'} mr-2 text-2xl`}></i>
                {editing === 'new' ? 'Nuevo Tema' : 'Editar Tema'}
            </h4>
            <form onSubmit={handleSubmit} className="grid text-left">
                <div className="col-12 md:col-6 mb-3">
                    <label className="block mb-2 text-sm text-600 font-bold uppercase">Unidad</label>
                    <Dropdown
                        value={formData.ciclo_id}
                        options={unidades}
                        onChange={(e) => setFormData({ ...formData, ciclo_id: e.value })}
                        optionLabel="nombre"
                        optionValue="id"
                        placeholder="Asignar a una unidad"
                        className={`w-full p-inputtext-lg surface-100 border-none ${!formData.ciclo_id ? 'p-invalid' : ''}`}
                        required
                    />
                </div>
                <div className="col-12 md:col-6 mb-3">
                    <label className="block mb-2 text-sm text-600 font-bold uppercase">Estado</label>
                    <Dropdown
                        value={formData.estado}
                        options={estados}
                        onChange={(e) => setFormData({ ...formData, estado: e.value })}
                        className="w-full p-inputtext-lg surface-100 border-none"
                    />
                </div>
                <div className="col-12 md:col-9 mb-3">
                    <label className="block mb-2 text-sm text-600 font-bold uppercase">Nombre del Tema</label>
                    <InputText
                        className={`w-full p-inputtext-lg surface-100 border-none ${!formData.nombre.trim() ? 'p-invalid' : ''}`}
                        value={formData.nombre}
                        onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                        required
                    />
                    {!formData.nombre.trim() && (
                        <small className="p-error block mt-1">El nombre es obligatorio.</small>
                    )}
                </div>
                <div className="col-12 md:col-3 mb-3">
                    <label className="block mb-2 text-sm text-600 font-bold uppercase">Semana sugerida</label>
                    <InputText
                        type="number"
                        className="w-full p-inputtext-lg surface-100 border-none"
                        value={formData.orden}
                        min={1}
                        onChange={(e) => setFormData({ ...formData, orden: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                    />
                    <small className="text-500 block mt-1">Puedes asignar varios temas a la misma semana dentro de una unidad.</small>
                </div>
                <div className="col-12 mb-3">
                    <label className="block mb-2 text-sm text-600 font-bold uppercase flex align-items-center">
                        Descripción / Recomendaciones (IA)
                        {generatingAI && <i className="pi pi-spin pi-spinner ml-2 text-primary"></i>}
                    </label>
                    <InputTextarea
                        rows={4}
                        className="w-full p-inputtext-lg surface-100 border-none"
                        value={formData.recomendaciones}
                        onChange={(e) => setFormData({ ...formData, recomendaciones: e.target.value })}
                        placeholder={generatingAI ? "La IA está generando recomendaciones..." : "Las recomendaciones se generarán automáticamente al asignar una unidad..."}
                        autoResize
                        disabled={generatingAI}
                    />
                </div>
                <div className="col-12 mb-3">
                    <label className="block mb-2 text-sm text-600 font-bold uppercase">Archivos en Google Drive</label>
                    <div className="flex flex-column gap-3">
                        <div className="flex flex-column sm:flex-row gap-2">
                            <input
                                type="file"
                                id="file-upload"
                                style={{ display: 'none' }}
                                onChange={handleFileUpload}
                                disabled={uploading}
                            />
                            <Button
                                type="button"
                                label={uploading ? "Subiendo..." : "Añadir Archivo"}
                                icon={uploading ? "pi pi-spin pi-spinner" : "pi pi-plus"}
                                className="p-button-outlined p-button-sm w-full sm:w-auto"
                                onClick={() => document.getElementById('file-upload').click()}
                                disabled={uploading}
                            />
                            <Button
                                type="button"
                                label="Vincular desde Drive"
                                icon="pi pi-google"
                                className="p-button-secondary p-button-outlined p-button-sm w-full sm:w-auto"
                                onClick={handleLinkFromDrive}
                                disabled={uploading}
                            />
                        </div>

                        {formData.drive_files.length > 0 && (
                            <div className="grid">
                                {formData.drive_files.map((file, idx) => (
                                    <div key={`formfile-${file.id || 'new'}-${idx}`} className="col-12 flex align-items-center justify-content-between bg-white p-2 border-round-lg border-1 border-200 mb-2">
                                        <div className="flex align-items-center gap-2 overflow-hidden">
                                            <i className="pi pi-file text-primary"></i>
                                            <span className="text-sm text-700 truncate">{file.name}</span>
                                        </div>
                                        <Button
                                            icon="pi pi-times"
                                            className="p-button-text p-button-danger p-button-sm"
                                            onClick={() => removeFile(file.id)}
                                            tooltip="Quitar archivo"
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                <div className="col-12 flex flex-column sm:flex-row justify-content-end gap-3 mt-4">
                    <Button type="button" label="Cancelar" className="p-button-text p-button-secondary font-bold w-full sm:w-auto" onClick={handleCancel} disabled={saving} />
                    <Button type="submit" label="Guardar" icon={saving ? "pi pi-spin pi-spinner" : "pi pi-check"} className="p-button-rounded px-5 shadow-2 w-full sm:w-auto" disabled={saving || !formData.nombre} />
                </div>
            </form>
        </Card>
    );

    return (
        <div className="responsive-page--narrow p-4 md:p-6 lg:p-8">
            <div className="flex flex-column md:flex-row justify-content-between align-items-start md:align-items-center mb-6 gap-4">
                <div>
                    <h2 className="m-0 text-2xl md:text-3xl font-bold">Temario del Curso</h2>
                    <p className="text-600 m-0 mt-1">Listado completo de temas y recursos académicos.</p>
                </div>

                <div className="flex flex-column sm:flex-row gap-3 w-full md:w-auto">
                    <Dropdown
                        value={filterUnidad}
                        options={[{ nombre: 'Todas las unidades', id: null }, ...unidades]}
                        onChange={(e) => setFilterUnidad(e.value)}
                        optionLabel="nombre"
                        optionValue="id"
                        dataKey="id"
                        placeholder="Filtrar por Unidad"
                        className="w-full md:w-15rem shadow-1 border-round-lg"
                        loading={loadingUnidades}
                        showClear={filterUnidad != null}
                    />
                    {editing === null && (
                        <Button
                            label="Nuevo Tema"
                            icon="pi pi-plus"
                            className="p-button-rounded shadow-2 w-full sm:w-auto"
                            onClick={() => setEditing('new')}
                            disabled={!selectedCourse}
                        />
                    )}
                </div>
            </div>

            {!selectedCourse ? (
                <Message severity="warn" text="Por favor, selecciona un curso en la barra superior." className="w-full shadow-1 border-round-lg" />
            ) : (
                <>
                    {editing !== null && renderForm()}

                    <div className="grid animate__animated animate__fadeIn">
                        {loading ? (
                            <div className="col-12 flex justify-content-center py-8">
                                <ProgressSpinner style={{ width: '50px', height: '50px' }} />
                            </div>
                        ) : temas && temas.length > 0 ? (
                            temas.map((tema) => (
                                <div key={tema.id} className="col-12 mb-3">
                                    <Card className="shadow-2 border-none surface-card border-round-xl overflow-hidden hover:shadow-4 transition-all transition-duration-300">
                                        <div className="flex flex-column md:flex-row justify-content-between align-items-start md:align-items-center p-2 gap-3">
                                            <div className="flex align-items-center gap-3 flex-grow-1 cursor-pointer" onClick={() => toggleExpand(tema.id)}>
                                                <div className="bg-indigo-50 text-indigo-500 border-round-md flex align-items-center justify-content-center font-bold" style={{ width: '40px', height: '40px', minWidth: '40px' }}>
                                                    {tema.orden}
                                                </div>
                                                <div className="flex flex-column">
                                                    <span className="text-lg md:text-xl font-bold text-900 line-height-3">{tema.nombre}</span>
                                                    <small className="text-500 font-medium">Semana sugerida {tema.semana_orden || tema.orden}</small>
                                                    <div className="flex gap-2 align-items-center mt-1">
                                                        <Tag value={tema.ciclo_nombre || 'General'} className="bg-blue-100 text-blue-700 text-xs px-2" />
                                                        <Tag value={(tema.computedEstado || tema.estado).replace('_', ' ')} severity={getStatusSeverity(tema.computedEstado || tema.estado)} className="text-xs uppercase" />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex gap-2 w-full md:w-auto justify-content-end">
                                                <Button icon="pi pi-pencil" rounded text severity="secondary" onClick={() => handleEdit(tema)} />
                                                <Button icon="pi pi-trash" rounded text severity="danger" onClick={() => handleDelete(tema.id)} />
                                                <Button
                                                    icon={expandedCards[tema.id] ? "pi pi-chevron-up" : "pi pi-chevron-down"}
                                                    rounded
                                                    outlined
                                                    onClick={() => toggleExpand(tema.id)}
                                                />
                                            </div>
                                        </div>

                                        {expandedCards[tema.id] && (
                                            <div className="p-4 bg-gray-50 border-top-1 border-gray-100 animate__animated animate__fadeIn">
                                                <div className="grid">
                                                    <div className="col-12 md:col-6">
                                                        <h6 className="text-xs font-bold uppercase text-500 mb-2">Descripción y Recomendaciones</h6>
                                                        <p className="m-0 text-700 line-height-3">{tema.recomendaciones || 'Sin recomendaciones registradas.'}</p>
                                                    </div>
                                                    <div className="col-12 md:col-6">
                                                        <h6 className="text-xs font-bold uppercase text-500 mb-2">Archivos de Material</h6>
                                                        <div className="flex flex-column gap-2">
                                                            {Array.isArray(tema.drive_files) && tema.drive_files.length > 0 ? (
                                                                tema.drive_files.map((file, idx) => (
                                                                    <div key={`listfile-${file.id || 'new'}-${idx}`} className="flex align-items-center justify-content-between bg-white p-2 border-round-lg border-1 border-200">
                                                                        <div className="flex align-items-center gap-2 overflow-hidden">
                                                                            <i className="pi pi-file text-primary"></i>
                                                                            <span className="text-sm text-700 truncate">{file.name}</span>
                                                                        </div>
                                                                        <Button
                                                                            icon="pi pi-external-link"
                                                                            className="p-button-text p-button-sm"
                                                                            onClick={() => window.open(`https://drive.google.com/file/d/${file.id}/view`, '_blank')}
                                                                            tooltip="Ver en Drive"
                                                                        />
                                                                    </div>
                                                                ))
                                                            ) : (
                                                                <p className="m-0 text-500 text-sm italic">No hay archivos vinculados.</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </Card>
                                </div>
                            ))
                        ) : !loading && (
                            <div className="col-12">
                                <Message severity="info" text="No se encontraron temas. Ajusta el filtro o añade un nuevo tema." className="w-full shadow-1 border-round-lg" />
                            </div>
                        )}
                    </div>


                </>
            )}
        </div>
    );
}

export default TemarioConfig;