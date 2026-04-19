# Documentación Global: Classroom Copilot (Gemini.md)

Este documento centraliza el contexto, la estructura, los modelos de datos, la arquitectura y los patrones de desarrollo del proyecto **Classroom Copilot**. Actúa como la fuente de verdad y la guía para cualquier nueva implementación.

> [!IMPORTANT]
> Las instrucciones específicas de operación para la IA (Antigravity) se encuentran en [ANTIGRAVITY.md](./ANTIGRAVITY.md).

---

## 1. Contexto del Proyecto
**Classroom Copilot** es una plataforma orientada a docentes diseñada para optimizar y automatizar tareas educativas mediante inteligencia artificial, integrada fuertemente con **Google Classroom** y **Google Drive**.

**Módulos Principales de Funcionalidad:**
- **Planeación:** Creación de ciclos escolares, unidades temáticas, temarios (cronogramas) y cálculo de clases y días inhábiles.
- **Materiales:** Generación automatizada de recursos didácticos (presentaciones, documentos) subidos automáticamente a Google Drive.
- **Evaluaciones y Actividades:** Creación de actividades, tareas evaluables, y rúbricas (exportadas o inyectadas en Classroom).
- **Control de IA:** Gestión de tokens para uso de modelos generativos (geminiApi / aiPlannerApi).

---

## 2. Tecnologías (Stack)

### Frontend (`/app`)
- **Core:** React 19, Vite.
- **UI/Framework Componentes:** PrimeReact y PrimeFlex, SweetAlert2.
- **Estilos:** Vanilla CSS / PrimeFlex Utilities.
- **Estado y Enrutamiento:** React Router DOM V7, React Context API (`AuthContext`, `CourseContext`).
- **Servicios Cloud (Cliente):** `firebase`.

### Backend (`/backend`)
- **Core:** Node.js, Express.
- **Base de Datos:** MySQL (usando el driver `mysql2`).
- **Seguridad/Logs:** Helmet, Cors, JsonWebToken (JWT), Express-Rate-Limit, Pino (pino-http).
- **Procesamiento y Validación:** Zod.
- **Integraciones Third-Party:** `googleapis` (Drive y Classroom) para la gestión de archivos y cursos.

---

## 3. Arquitectura y Estructura Organizacional

El proyecto utiliza una arquitectura de monolito modular para el backend y una Single Page Application (SPA) para el frontend.

### Frontend (`/app/src`)
- **`/assets`**: Imágenes genéricas o estilos base (`index.css`).
- **`/context`**: Proveedores de estado global para sesión e información contextual del usuario (`AuthContext`, `CourseContext`).
- **`/services`**: Archivos de centralización de fetch a APIs internas y externas (ej. `api.js`, `googlePicker.js`, `aiPlannerApi.js`).
- **Dominios/Módulos Visuales**: Carpetas específicas por módulo funcional de negocio (ej. `/evaluaciones`, `/materiales`, `/planeacion`).
- **`/utils`**: Funciones auxiliares genéricas.

### Backend (`/backend/src`)
- Arquitectura basada en **Módulos Independientes** (`/modules/*`).
- Se utiliza el patrón **Ruta -> Controlador -> Servicio**:
  - **Routes (`*.routes.js`)**: Entradas a los endpoints, aplicación de middlewares de autenticación/validación.
  - **Controllers (`*.controller.js`)**: Recepción de la request, delegación de lógica, manejo de respuestas de éxito y formateo, control básico de try/catch para capa HTTP.
  - **Services (`*.service.js`)**: Lógica de negocio pesada, manipulación de abstracciones, y sentencias de base de datos.
- **Módulos Actuales:** `ai`, `auth`, `courses`, `evaluations`, `materials`, `planning`, `users`.
- **Directorios de Soporte:** 
  - `/config`: Configuración de entorno.
  - `/db`: Conexiones a la base de datos MySQL.
  - `/middlewares`: Logs, auth, manejos de errores genéricos.
  - `/clients`: Interfaz o configuradores para APIs externas (Google, etc).
  - `/utils`: Funciones formatters, validadores reusables.
- **`/backend/database/migrations`**: Historial de scripts SQL de creación y alteración de esquema base de datos.

---

## 4. Modelos de Base de Datos (MySQL)

Las tablas principales que sostienen la lógica relacional o jerárquica:

1. **`perfiles`**: Contiene la identidad del docente (vinculada al `google_id`), tokens de IA disponibles e historia de consumo.
2. **`ciclos_escolares`**: Periodos semestrales o anuales definidos por el perfil asociado a un curso de Classroom (relación 1:N con `perfiles`).
3. **`ciclos` (Unidades temáticas)**: Bloques de aprendizaje jerárquicamente atados al `ciclo_escolar` y vinculados a *topics* en Classroom.
4. **`temarios`**: Los temas puntuales dentro de cada unidad (ciclo). Llevan un orden y archivos adjuntos de Drive.
5. **`planeacion_detallada`**: Asignación temporal (clase por clase) de un tema en fechas y horas específicas, permitiendo trazar el cronograma total.
6. **`materiales_generados`**: Referencias a recursos en Google Drive (Docs o Slides) atados a topics de Classroom generados por la IA.
7. **`actividades_evaluables`**: Trabajos/Assignments asignados en Classroom que cuentan con Rúbrica estructurada (JSON asociado).
8. **Otras de apoyo**: `dias_inhabiles`, `horarios`, `unidades_fechas`, `evaluation_drafts`.

---

## 5. Patrones del Proyecto
1. **Patrón de Centralización de Servicios (Frontend):** Todos los endpoints HTTP deben aislarse en los `/services`. Los componentes de UI (React) no hacen `fetch` directo al backend, deben consumir abstracciones limpias del servicio.
2. **Modularidad Estricta (Backend):** Toda funcionalidad de negocio pertenece a un directorio de dominio particular (`/src/modules/dominio_x/`). No hay archivos "flotando" en `src` que contengan lógica de negocio descontrolada.
3. **Separación Controller-Service:** El controlador expone y despacha el ciclo HTTP; el servicio ignora completamente `req` y `res`, se alimenta de `params` y devuelve estructuras estandarizadas para el controlador.

---

## 6. Reglas para Futuras Modificaciones e Implementaciones (Guidelines)

### Sistema Backend y Base de Datos
- **Cero Mutaciones Estructurales sin Migración:** Cualquier alteración, de índice, columna, o nueva tabla debe modelarse forzosamente como un archivo numerado y secuencial dentro de `backend/database/migrations/` (ej. `005_nueva_feature.sql`). 
  - *Jamás alterar la base de datos productiva directamente.*
- **Convención de Nomenclatura BD:** Todo debe ser `snake_case` estricto en la BD, plural para el esquema base (ej. `dias_inhabiles`).
- **Validación Fuerte:** Se debe usar Zod para toda carga útil de solicitud externa antes de inyectarlo al `Service`.
- **Borrado en Cascada Realista:** Si se elimina un nodo padre (ej. curso, ciclo escolar o unidad), *debe* asegurarse la lógica en el Backend para borrar de forma asíncrona o cascada tanto en MySQL como en Google Classroom.
- **Gestión de IA:** Toda invocación a IA debe hacer un `deduct` de tokens en el modelo de usuario antes o después de la petición, utilizando el sistema y tabla respectiva (`perfiles`).

### Frontend (SPA React)
- **Consistencia Visual:** Seguir utilizando la suite de PrimeReact para interactuar (botones rotatorios, diálogos de confirmación modales de Prime, Toast notifications de Prime o SweetAlert2 cuando esté dictaminado).
- **Gestión de Contexto:** Tratar de no polucionar el contexto global (`AuthContext`, `CourseContext`). Si un estado es exclusivo de un Módulo (ej. planeación), pasarlo vía *props* o crear un contexto adyacente cerrado (ej. `PlanningContext`) para no penalizar re-renders en la app.
- **Sin Funciones Huérfanas de Classroom/Drive:** Cualquier uso hacia las APIs de Google (Classroom topics, drive sheets, docs) que sea cliente-a-cliente debe encapsularse en un servicio (ej. `gasApi.js`, `googlePicker.js`). Nunca incrustar cliente de Google en Componentes.

### Calidad de Código y Estilo
- Usar variables descriptivas en **CamelCase** en JavaScript.
- Añadir bloques de comentario `JSDoc` a funciones críticas (Services en backend, Servicios de AI en Frontend).
- Proteger secretos y tokens; todas las llaves (OpenAI, Gemini) se leen de `.env` o a través del `process.env / import.meta.env`.
- **Manejo de Promesas:** Preferir encarecidamente `async/await` estructurado sobre cadenas extensas de `.then() / .catch()`, envolviéndolo en bloques `try/catch` centralizados para manejo de errores apropiado.
