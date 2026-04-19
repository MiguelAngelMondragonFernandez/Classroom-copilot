---
name: Planeacion por unidades
overview: Alinearé el módulo de planeación para que las unidades persistan fechas reales derivadas del horario del curso, y los temas queden ligados a una unidad con semana sugerida, permitiendo varios temas por semana.
todos:
  - id: db-migration-units-dates
    content: Crear migración para agregar `fecha_inicio` y `fecha_fin` a la tabla de unidades (`ciclos`).
    status: completed
  - id: backend-planning-contract
    content: Actualizar repositorio, servicio y controlador de planeación para persistir y validar fechas de unidad y orden semanal de temas.
    status: completed
  - id: batch-save-week-metadata
    content: Ajustar guardado batch para conservar semana sugerida por tema y recalcular rango real de cada unidad desde las sesiones guardadas.
    status: completed
  - id: frontend-align-contract
    content: Alinear ConfigUnidades, TemarioConfig y PlaneacionBuilder con el nuevo contrato y la semántica semanal.
    status: completed
  - id: verify-scheduling-flow
    content: Verificar el flujo completo con horario configurado, múltiples temas por semana y sincronización con Classroom.
    status: completed
isProject: false
---

# Implementar planeación por unidades y semanas

## Objetivo

Actualizar el módulo de planeación docente para que:

- las `unidades` persistan `nombre`, `fecha_inicio` y `fecha_fin`;
- los `temas` sigan perteneciendo a una unidad, pero su `orden` represente la semana sugerida dentro de la unidad, permitiendo varios temas en la misma semana;
- la planeación detallada derive fechas reales a partir del `horario` configurado del curso y use esas fechas para calcular el rango real de cada unidad.

## Cambios de datos

- Agregar una nueva migración sobre [backend/database/migrations/001_initial_schema.sql](backend/database/migrations/001_initial_schema.sql) para extender `ciclos` (tabla usada hoy como unidades) con `fecha_inicio` y `fecha_fin`.
- Mantener `temarios.ciclo_id` como vínculo tema -> unidad y conservar `orden`, pero documentarlo y tratarlo como `semana_orden` a nivel de API/validación.
- Evaluar si `planeacion_detallada.metadata` debe guardar el `orden` semanal calculado para no recomputarlo solo en UI.

Snippet actual relevante: en [backend/src/modules/planning/planning.repository.js](backend/src/modules/planning/planning.repository.js) `createUnidad()` inserta solo `course_id`, `nombre`, `ciclo_escolar_id` y `classroom_topic_id`, por eso hoy las fechas capturadas en frontend no se guardan.

## Backend

- Ajustar [backend/src/modules/planning/planning.repository.js](backend/src/modules/planning/planning.repository.js) para que `listUnidades`, `createUnidad` y `updateUnidad` lean/escriban `fecha_inicio` y `fecha_fin`.
- Añadir validaciones en [backend/src/modules/planning/planning.service.js](backend/src/modules/planning/planning.service.js) y/o [backend/src/modules/planning/planning.controller.js](backend/src/modules/planning/planning.controller.js):
  - la unidad debe quedar dentro del ciclo escolar;
  - un tema debe tener `ciclo_id` válido;
  - `orden` del tema debe ser entero positivo y semánticamente semanal.
- Fortalecer `upsertTemariosFromPlaneacion()` para que no deduzca duplicados solo por `nombre`, ya que con varios temas por semana puede haber colisiones si la IA reutiliza nombres.
- Ajustar `savePlaneacionBatch` / `upsertPlaneacionBatch` para persistir en `metadata` el dato de semana sugerida y, al guardar sesiones, recalcular por unidad su `fecha_inicio` mínima y `fecha_fin` máxima.

## Lógica de generación

- Reusar la lógica de slots de [app/src/services/aiPlannerApi.js](app/src/services/aiPlannerApi.js) y [app/src/planeacion/js/ConfigPlaneacion.js](app/src/planeacion/js/ConfigPlaneacion.js) como fuente oficial del horario efectivo.
- Cambiar el contrato de generación para que la IA devuelva unidades con temas que incluyan semana sugerida dentro de la unidad, mientras el sistema asigna las fechas reales consumiendo `slotsDisponibles`.
- Al insertar planeación desde [app/src/planeacion/views/PlaneacionBuilder.jsx](app/src/planeacion/views/PlaneacionBuilder.jsx), usar las fechas reales resultantes para actualizar automáticamente el rango de cada unidad.
- Mantener compatibilidad con Classroom: las unidades siguen mapeadas a `topics`, pero las fechas se calculan localmente y no dependen de Classroom.

## Frontend

- Alinear [app/src/planeacion/views/ConfigUnidades.jsx](app/src/planeacion/views/ConfigUnidades.jsx) con el nuevo contrato backend: las fechas ya no serán solo de captura visual, sino datos persistidos/actualizados por el sistema.
- Ajustar [app/src/planeacion/js/ConfigUnidades.js](app/src/planeacion/js/ConfigUnidades.js) y [app/src/planeacion/js/ConfigTemario.js](app/src/planeacion/js/ConfigTemario.js) para enviar/recibir los campos con nombres consistentes (`fecha_inicio`/`fecha_fin` en backend; mapeo a `fechaInicio`/`fechaTermino` en UI si conviene).
- Actualizar [app/src/planeacion/views/TemarioConfig.jsx](app/src/planeacion/views/TemarioConfig.jsx) para dejar explícito que `orden` es semana sugerida, no posición lineal absoluta.
- Ajustar [app/src/planeacion/views/PlaneacionBuilder.jsx](app/src/planeacion/views/PlaneacionBuilder.jsx) para dejar de calcular la semana solo contra el inicio del ciclo completo cuando ya exista un rango propio por unidad.

## Verificación

- Probar un curso con horario semanal, 2-3 unidades y varios temas en la misma semana.
- Confirmar que al generar/guardar planeación:
  - cada sesión cae en un slot válido del horario;
  - cada tema queda ligado a su unidad;
  - cada unidad termina con `fecha_inicio` y `fecha_fin` derivadas de sus sesiones reales;
  - la UI muestra semanas y rangos correctos sin perder compatibilidad con `topics` de Classroom.

