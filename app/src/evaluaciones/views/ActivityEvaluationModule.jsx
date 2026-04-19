import React, { useState, useEffect } from 'react';
import { useCourse } from '../../context/CourseContext';
import * as EvaluacionService from '../js/EvaluacionService';
import * as SubmissionService from '../js/SubmissionService';
import { Button } from 'primereact/button';
import { DataTable } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { InputNumber } from 'primereact/inputnumber';
import { InputTextarea } from 'primereact/inputtextarea';
import { Dropdown } from 'primereact/dropdown';
import { Tag } from 'primereact/tag';
import Swal from 'sweetalert2';

export default function ActivityEvaluationModule() {
    const { selectedCourse } = useCourse();
    const [activities, setActivities] = useState([]);
    const [selectedActivity, setSelectedActivity] = useState(null);
    const [draftId, setDraftId] = useState(null);
    const [submissions, setSubmissions] = useState([]);
    const [rowEdits, setRowEdits] = useState({});
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [publishing, setPublishing] = useState(false);

    useEffect(() => {
        if (!selectedCourse) return;
        loadActivities();
    }, [selectedCourse]);

    useEffect(() => {
        if (!selectedActivity || !selectedCourse) return;
        loadSubmissions();
    }, [selectedActivity, selectedCourse]);

    const loadActivities = async () => {
        setLoading(true);
        try {
            const data = await EvaluacionService.listadoActividades(selectedCourse.id);
            setActivities(data || []);
        } catch (e) {
            console.error('Error cargando actividades', e);
            Swal.fire('Error', 'No se pudieron cargar las actividades', 'error');
        } finally {
            setLoading(false);
        }
    };

    const loadSubmissions = async () => {
        if (!selectedActivity) return;
        setLoading(true);
        try {
            const data = await SubmissionService.getSubmissions(selectedActivity.id, selectedCourse.id);
            setDraftId(data?.draftId || null);
            setSubmissions(data?.submissions || []);
            setRowEdits({});
        } catch (e) {
            console.error('Error cargando entregas', e);
            Swal.fire('Error', 'No se pudieron cargar las entregas', 'error');
        } finally { setLoading(false); }
    };

    const handleGenerateDraft = async () => {
        if (!selectedActivity || !selectedCourse) return;
        setGenerating(true);
        try {
            const result = await SubmissionService.generateDraft(selectedActivity.id, selectedCourse.id, `draft-${selectedActivity.id}`);
            if (result?.draftId) setDraftId(result.draftId);
            await loadSubmissions();
            Swal.fire('Listo', result?.status === 'existing' ? 'Se reutilizó el borrador existente' : 'Borrador generado', 'success');
        } catch (e) {
            console.error('Error generando borrador', e);
            Swal.fire('Error', e.message || 'No se pudo generar el borrador', 'error');
        } finally {
            setGenerating(false);
        }
    };

    const handleEditChange = (submissionId, field, value) => {
        setRowEdits(prev => ({
            ...prev,
            [submissionId]: {
                ...(prev[submissionId] || {}),
                [field]: value,
            },
        }));
    };

    const handleSaveRow = async (row) => {
        if (!draftId) {
            Swal.fire('Atención', 'Primero genera un borrador', 'warning');
            return;
        }
        const edit = rowEdits[row.student_submission_id];
        if (!edit) return;

        const payload = {
            teacherGrade: edit.teacherGrade ?? row.teacher_grade ?? row.ai_grade ?? null,
            teacherJustification: edit.teacherJustification ?? row.teacher_justification ?? row.ai_justification ?? '',
        };

        try {
            await SubmissionService.updateDraftSubmission(draftId, row.student_submission_id, payload);
            setSubmissions(prev => prev.map(item => {
                if (item.student_submission_id !== row.student_submission_id) return item;
                return {
                    ...item,
                    teacher_grade: payload.teacherGrade,
                    teacher_justification: payload.teacherJustification,
                };
            }));
            setRowEdits(prev => {
                const next = { ...prev };
                delete next[row.student_submission_id];
                return next;
            });
            Swal.fire('Guardado', 'Se actualizó la calificación del alumno', 'success');
        } catch (e) {
            console.error('Error guardando fila', e);
            Swal.fire('Error', e.message || 'No se pudo guardar', 'error');
        }
    };

    const openSubmission = (row) => {
        const first = Array.isArray(row.attachments) ? row.attachments[0] : null;
        if (!first?.url) {
            Swal.fire('Sin entrega', 'El alumno no tiene adjuntos visibles', 'info');
            return;
        }
        window.open(first.url, '_blank', 'noopener,noreferrer');
    };

    const handlePublish = async () => {
        if (!draftId || !selectedCourse) {
            Swal.fire('Atención', 'No hay borrador para publicar', 'warning');
            return;
        }
        const confirm = await Swal.fire({
            title: 'Publicar calificaciones',
            text: 'Se enviarán las calificaciones al Classroom del curso',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Publicar',
            cancelButtonText: 'Cancelar',
        });
        if (!confirm.isConfirmed) return;

        setPublishing(true);
        try {
            const result = await SubmissionService.publishDraft(draftId, selectedCourse.id);
            const succeeded = Number(result?.succeeded || 0);
            const failed = Number(result?.failed || 0);
            await loadSubmissions();
            await Swal.fire({
                title: 'Publicación finalizada',
                html: `<p>Publicadas: <b>${succeeded}</b></p><p>Con error: <b>${failed}</b></p>`,
                icon: failed > 0 ? 'warning' : 'success',
            });
        } catch (e) {
            console.error('Error publicando', e);
            Swal.fire('Error', e.message || 'No se pudo publicar', 'error');
        } finally {
            setPublishing(false);
        }
    };

    const gradeBody = (row) => {
        const edit = rowEdits[row.student_submission_id];
        const value = edit?.teacherGrade ?? row.teacher_grade ?? row.ai_grade ?? null;
        return (
            <InputNumber
                value={value}
                onValueChange={(e) => handleEditChange(row.student_submission_id, 'teacherGrade', e.value)}
                min={0}
                max={100}
                className="w-full"
            />
        );
    };

    const justificationBody = (row) => {
        const edit = rowEdits[row.student_submission_id];
        const value = edit?.teacherJustification ?? row.teacher_justification ?? row.ai_justification ?? '';
        return (
            <InputTextarea
                value={value}
                onChange={(e) => handleEditChange(row.student_submission_id, 'teacherJustification', e.target.value)}
                rows={2}
                className="w-full"
                autoResize
            />
        );
    };

    const statusBody = (row) => {
        const st = row.submission_state || row.state || 'UNKNOWN';
        const sev = st === 'TURNED_IN' ? 'success' : st === 'RETURNED' ? 'info' : 'warning';
        return <Tag value={st} severity={sev} />;
    };

    const actionsBody = (row) => (
        <div className="flex gap-2">
            <Button icon="pi pi-save" rounded text severity="success" onClick={() => handleSaveRow(row)} tooltip="Guardar" />
            <Button icon="pi pi-external-link" rounded text severity="info" onClick={() => openSubmission(row)} tooltip="Ver entrega" />
        </div>
    );

    const activityOptions = activities.map(a => ({
        label: `ID ${a.id} · ${a.course_work_id}`,
        value: a,
    }));

    return (
        <div className="p-3">
            <h3>Evaluación por Actividad</h3>
            <div className="flex flex-column md:flex-row gap-2 mb-3">
                <Dropdown
                    value={selectedActivity}
                    options={activityOptions}
                    onChange={(e) => setSelectedActivity(e.value)}
                    placeholder="Selecciona una actividad"
                    className="w-full"
                    optionLabel="label"
                />
                <Button label="Generar Borrador" icon="pi pi-sparkles" onClick={handleGenerateDraft} loading={generating} disabled={!selectedActivity || !selectedCourse} />
                <Button icon="pi pi-refresh" rounded outlined onClick={loadSubmissions} loading={loading} disabled={!selectedActivity} />
                <Button label="Publicar" icon="pi pi-send" severity="success" onClick={handlePublish} loading={publishing} disabled={!draftId} />
            </div>
            <DataTable value={submissions} paginator rows={25} loading={loading} className="p-datatable-sm" emptyMessage="No hay entregas para mostrar">
                <Column field="student_name" header="Alumno" />
                <Column header="Estado" body={statusBody} />
                <Column field="ai_justification" header="Justificación IA" />
                <Column header="Justificación Final" body={justificationBody} style={{ minWidth: '16rem' }} />
                <Column header="Calificación" body={gradeBody} />
                <Column header="Acciones" body={actionsBody} />
            </DataTable>
        </div>
    );
}
