import React, { useState, useEffect } from 'react';
import * as ConfigHorarioJS from '../js/ConfigHorario';
import { useCourse } from '../../context/CourseContext';
import { useAuth } from '../../context/AuthContext';
import Swal from 'sweetalert2';
import 'animate.css';

// PrimeReact Components
import { Button } from 'primereact/button';
import { Card } from 'primereact/card';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Message } from 'primereact/message';
import { Divider } from 'primereact/divider';
import { Dropdown } from 'primereact/dropdown';
import { Calendar } from 'primereact/calendar';

function ConfigHorario() {
    const { selectedCourse } = useCourse();
    const [horarios, setHorarios] = useState([]);
    const [loading, setLoading] = useState(false);
    const [editing, setEditing] = useState(null); // null, 'new', or id
    const [saving, setSaving] = useState(false);

    // Convención 0-6: 0=Domingo, 1=Lunes, ..., 6=Sábado (alineado con JS getDay() y BD)
    const diasSemana = [
        { label: 'Domingo', value: 'Domingo', index: 0 },
        { label: 'Lunes', value: 'Lunes', index: 1 },
        { label: 'Martes', value: 'Martes', index: 2 },
        { label: 'Miércoles', value: 'Miércoles', index: 3 },
        { label: 'Jueves', value: 'Jueves', index: 4 },
        { label: 'Viernes', value: 'Viernes', index: 5 },
        { label: 'Sábado', value: 'Sábado', index: 6 }
    ];
    const DIA_INDEX_TO_LABEL = Object.fromEntries(diasSemana.map(d => [d.index, d.label]));

    // Form state initial
    const initialFormState = {
        dia_semana: 'Lunes',
        dia_index: 1,
        hora_inicio: null,
        hora_fin: null
    };

    const [formData, setFormData] = useState(initialFormState);

    useEffect(() => {
        if (selectedCourse) {
            cargarHorarios();
        } else {
            setHorarios([]);
        }
    }, [selectedCourse]);

    const parseHora = (val) => {
        if (!val) return null;
        if (val instanceof Date) return val;
        const str = typeof val === 'string' ? val.split('.')[0] : String(val);
        if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(str)) return new Date(`2000-01-01T${str}`);
        return null;
    };

    const cargarHorarios = async () => {
        try {
            setLoading(true);
            const data = await ConfigHorarioJS.listadoHorarios(selectedCourse.id);

            // Transform: añadir dia_semana desde dia_index, parsear horas
            const formattedData = data.map(h => ({
                ...h,
                dia_semana: DIA_INDEX_TO_LABEL[h.dia_index === 7 ? 0 : h.dia_index] ?? `Día ${h.dia_index}`,
                hora_inicio: parseHora(h.hora_inicio),
                hora_fin: parseHora(h.hora_fin)
            }));

            setHorarios(formattedData);
        } catch (error) {
            console.error("Error cargando horarios:", error);
            Swal.fire('Error', 'No se pudieron cargar los horarios', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (horario) => {
        setEditing(horario.id);
        const diaIdx = horario.dia_index === 7 ? 0 : horario.dia_index;
        const diaLabel = DIA_INDEX_TO_LABEL[diaIdx] ?? horario.dia_semana ?? 'Lunes';
        setFormData({
            dia_semana: diaLabel,
            dia_index: diaIdx,
            hora_inicio: horario.hora_inicio,
            hora_fin: horario.hora_fin
        });
    };

    const handleCancel = () => {
        setEditing(null);
        setFormData(initialFormState);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedCourse) return;

        if (!formData.hora_inicio || !formData.hora_fin) {
            Swal.fire('Atención', 'Debes ingresar hora de inicio y fin', 'warning');
            return;
        }

        if (formData.hora_inicio >= formData.hora_fin) {
            Swal.fire('Atención', 'La hora de fin debe ser posterior a la de inicio', 'warning');
            return;
        }

        // Check for exact duplicates
        const hInicioStr = formData.hora_inicio.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        const hFinStr = formData.hora_fin.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        const toHoraStr = (d) => d && d.toLocaleTimeString ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '';

        const mismoDia = (a, b) => a === b || (a === 7 && b === 0) || (a === 0 && b === 7);
        const isDuplicate = horarios.some(h =>
            h.id !== editing &&
            mismoDia(h.dia_index, formData.dia_index) &&
            toHoraStr(h.hora_inicio) === hInicioStr &&
            toHoraStr(h.hora_fin) === hFinStr
        );

        if (isDuplicate) {
            Swal.fire('Atención', 'Ya existe un horario para este día en el mismo rango de tiempo', 'warning');
            return;
        }

        setSaving(true);
        Swal.fire({
            title: 'Guardando...',
            allowOutsideClick: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });
        try {
            // Format sessions to HH:mm string for DB
            const payload = {
                course_id: selectedCourse.id,
                dia_semana: formData.dia_semana,
                dia_index: formData.dia_index,
                hora_inicio: formData.hora_inicio.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
                hora_fin: formData.hora_fin.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
            };

            let response;
            if (editing === 'new') {
                response = await ConfigHorarioJS.guardarHorario(payload);
            } else {
                response = await ConfigHorarioJS.actualizarHorario(editing, payload);
            }

            if (response.success) {
                await cargarHorarios();
                handleCancel();
                Swal.fire({
                    icon: 'success',
                    title: 'Guardado',
                    text: 'Horario configurado correctamente',
                    timer: 1500,
                    showConfirmButton: false
                });
            } else {
                throw new Error(response.error);
            }
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (id) => {
        Swal.fire({
            title: '¿Eliminar este horario?',
            text: "Esta acción no se puede deshacer.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Sí, eliminar'
        }).then(async (result) => {
            if (result.isConfirmed) {
                const response = await ConfigHorarioJS.eliminarHorario(id);
                if (response.success) {
                    cargarHorarios();
                    Swal.fire('Eliminado', 'El horario ha sido borrado.', 'success');
                }
            }
        });
    };

    const renderForm = () => (
        <Card className="shadow-4 border-round-2xl mb-5 animate__animated animate__fadeIn">
            <h4 className="m-0 mb-4 text-primary font-bold flex align-items-center">
                <i className={`${editing === 'new' ? 'pi pi-plus-circle' : 'pi pi-pencil'} mr-2 text-2xl`}></i>
                {editing === 'new' ? 'Nuevo Horario de Clase' : 'Editar Horario'}
            </h4>
            <form onSubmit={handleSubmit} className="grid text-left">
                <div className="col-12 md:col-4 mb-3">
                    <label className="block mb-2 text-sm text-600 font-bold uppercase">Día de la Semana</label>
                    <Dropdown
                        value={formData.dia_semana}
                        options={diasSemana}
                        onChange={(e) => {
                            const selectedDay = diasSemana.find(d => d.value === e.value);
                            setFormData({ ...formData, dia_semana: e.value, dia_index: selectedDay.index });
                        }}
                        placeholder="Selecciona un día"
                        className={`w-full p-inputtext-lg surface-100 border-none ${!formData.dia_semana ? 'p-invalid' : ''}`}
                        required
                    />
                </div>
                <div className="col-12 md:col-4 mb-3">
                    <label className="block mb-2 text-sm text-600 font-bold uppercase">Hora Inicio</label>
                    <Calendar
                        value={formData.hora_inicio}
                        onChange={(e) => setFormData({ ...formData, hora_inicio: e.value })}
                        timeOnly
                        hourFormat="24"
                        placeholder="00:00"
                        className="w-full"
                        inputClassName={`p-inputtext-lg surface-100 border-none w-full ${!formData.hora_inicio ? 'p-invalid' : ''}`}
                        required
                    />
                </div>
                <div className="col-12 md:col-4 mb-3">
                    <label className="block mb-2 text-sm text-600 font-bold uppercase">Hora Fin</label>
                    <Calendar
                        value={formData.hora_fin}
                        onChange={(e) => setFormData({ ...formData, hora_fin: e.value })}
                        timeOnly
                        hourFormat="24"
                        placeholder="00:00"
                        className="w-full"
                        inputClassName={`p-inputtext-lg surface-100 border-none w-full ${!formData.hora_fin || (formData.hora_inicio && formData.hora_fin <= formData.hora_inicio) ? 'p-invalid' : ''}`}
                        required
                    />
                    {formData.hora_inicio && formData.hora_fin && formData.hora_fin <= formData.hora_inicio && (
                        <small className="p-error block mt-1">Debe ser posterior al inicio.</small>
                    )}
                </div>
                <div className="col-12 flex flex-column sm:flex-row justify-content-end gap-3 mt-4">
                    <Button type="button" label="Cancelar" className="p-button-text p-button-secondary font-bold w-full sm:w-auto" onClick={handleCancel} disabled={saving} />
                    <Button type="submit" label="Guardar" icon={saving ? "pi pi-spin pi-spinner" : "pi pi-check"} className="p-button-rounded px-5 shadow-2 w-full sm:w-auto" disabled={saving} />
                </div>
            </form>
        </Card>
    );

    return (
        <div className="responsive-page--narrow p-4 md:p-6 lg:p-8">
            <div className="flex flex-column md:flex-row justify-content-between align-items-start md:align-items-center mb-6 gap-4">
                <div>
                    <h2 className="m-0 text-2xl md:text-3xl font-bold">Horario de Clases</h2>
                    <p className="text-600 m-0 mt-1">Configura los días y horas de atención para este curso.</p>
                </div>
                {editing === null && (
                    <Button
                        label="Añadir Horario"
                        icon="pi pi-plus"
                        className="p-button-rounded shadow-2 w-full md:w-auto"
                        onClick={() => setEditing('new')}
                        disabled={!selectedCourse}
                    />
                )}
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
                        ) : horarios && horarios.length > 0 ? (
                            horarios.map((horario) => (
                                <div key={horario.id} className="col-12 md:col-6 lg:col-4 mb-3">
                                    <Card className="shadow-2 border-none surface-card border-round-xl overflow-hidden hover:shadow-4 transition-all transition-duration-300">
                                        <div className="flex justify-content-between align-items-center mb-3">
                                            <div className="flex align-items-center gap-2">
                                                <div className="bg-indigo-50 text-indigo-500 border-round-md flex align-items-center justify-content-center font-bold" style={{ width: '32px', height: '32px' }}>
                                                    <i className="pi pi-clock"></i>
                                                </div>
                                                <span className="text-xl font-bold text-900">{horario.dia_semana}</span>
                                            </div>
                                            <div className="flex gap-1">
                                                <Button icon="pi pi-pencil" rounded text severity="secondary" size="small" onClick={() => handleEdit(horario)} />
                                                <Button icon="pi pi-trash" rounded text severity="danger" size="small" onClick={() => handleDelete(horario.id)} />
                                            </div>
                                        </div>
                                        <div className="flex align-items-center justify-content-center py-3 bg-indigo-50 border-round-lg">
                                            <span className="text-2xl font-semibold text-indigo-700">
                                                {horario.hora_inicio?.toLocaleTimeString?.([], { hour: '2-digit', minute: '2-digit' }) ?? '--:--'}
                                                <span className="mx-2 text-indigo-300">-</span>
                                                {horario.hora_fin?.toLocaleTimeString?.([], { hour: '2-digit', minute: '2-digit' }) ?? '--:--'}
                                            </span>
                                        </div>
                                    </Card>
                                </div>
                            ))
                        ) : !loading && (
                            <div className="col-12 text-center py-8">
                                <i className="pi pi-calendar-times text-400 mb-3" style={{ fontSize: '3rem' }}></i>
                                <p className="text-600">No hay horarios configurados para este curso.</p>
                                <Button label="Configurar mi primer horario" icon="pi pi-plus" text className="mt-2" onClick={() => setEditing('new')} />
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

export default ConfigHorario;
