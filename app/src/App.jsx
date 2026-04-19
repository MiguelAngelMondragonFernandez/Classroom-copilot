import React from 'react';
import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import NavBar from './utils/view/NavBar';
import ConfigUnidades from './planeacion/views/ConfigUnidades';
import ConfigHorario from './planeacion/views/ConfigHorario';
import TemarioConfig from './planeacion/views/TemarioConfig';
import PlaneacionBuilder from './planeacion/views/PlaneacionBuilder';
import GeneracionMaterial from './materiales/views/GeneracionMaterial';
import EvaluacionModule from './evaluaciones/views/EvaluacionModule';
import ActivityEvaluationModule from './evaluaciones/views/ActivityEvaluationModule';
import Login from './utils/view/Login';
import AuthSuccess from './utils/view/AuthSuccess';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CourseProvider } from './context/CourseContext';
import { Button } from 'primereact/button';
import { Card } from 'primereact/card';

// Componente para proteger rutas privadas
const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null; // O un spinner de carga

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

const Home = () => {
  const { user } = useAuth();

  return (
    <div className="flex flex-column align-items-center justify-content-center p-4 md:p-6 lg:p-8 animate__animated animate__fadeIn">
      <Card className="text-center shadow-4 border-round-2xl p-4 md:p-6 w-full" style={{ maxWidth: '600px' }}>
        <i className="pi pi-discord text-primary" style={{ fontSize: '5rem' }}></i>
        <h1 className="text-3xl md:text-5xl font-bold mt-4 mb-2">Bienvenido a Classroom Copilot</h1>
        <p className="text-600 text-base md:text-xl line-height-3 mb-4">Tu asistente inteligente para la gestión académica y planeación escolar eficiente.</p>

        {user ? (
          <div className="flex flex-wrap gap-3 justify-content-center mt-6 w-full">
            <Link to="/planeacion-ciclo" className="no-underline w-full sm:w-auto">
              <Button label="Planeación AI" icon="pi pi-bolt" rounded severity="help" className="px-5 py-3 shadow-2" />
            </Link>
            <Link to="/actividades" className="no-underline w-full sm:w-auto">
              <Button label="Actividades" icon="pi pi-check-square" rounded severity="success" className="px-5 py-3 shadow-2" />
            </Link>
            <Link to="/configuracion-unidades" className="no-underline w-full sm:w-auto">
              <Button label="Unidades" icon="pi pi-calendar" rounded className="px-5 py-3 shadow-2" />
            </Link>
            <Link to="/configuracion-horarios" className="no-underline w-full sm:w-auto">
              <Button label="Horarios" icon="pi pi-clock" rounded outlined className="px-5 py-3 shadow-2" />
            </Link>
            <Link to="/temario" className="no-underline w-full sm:w-auto">
              <Button label="Temario" icon="pi pi-list" rounded outlined className="px-5 py-3 shadow-2" />
            </Link>
            <Link to="/generar-material" className="no-underline w-full sm:w-auto">
              <Button label="Material AI" icon="pi pi-file-edit" rounded severity="warning" className="px-5 py-3 shadow-2" />
            </Link>
          </div>
        ) : (
          <div className="mt-6">
            <Link to="/login" className="no-underline">
              <Button label="Comenzar Ahora" icon="pi pi-google" rounded className="px-5 py-3 shadow-2" />
            </Link>
            <p className="text-500 mt-3 text-sm italic">Inicia sesión con Google para acceder a las herramientas.</p>
          </div>
        )}
      </Card>
    </div>
  );
};

function AppContent() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen surface-ground">
      <NavBar />
      <div className="container mx-auto px-3 md:px-4 pb-6 md:pb-8">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/auth/success" element={<AuthSuccess />} />
          <Route
            path="/configuracion-unidades"
            element={
              <PrivateRoute>
                <ConfigUnidades />
              </PrivateRoute>
            }
          />
          <Route
            path="/configuracion-horarios"
            element={
              <PrivateRoute>
                <ConfigHorario />
              </PrivateRoute>
            }
          />
          <Route
            path="/temario"
            element={
              <PrivateRoute>
                <TemarioConfig />
              </PrivateRoute>
            }
          />
          <Route
            path="/planeacion-ciclo"
            element={
              <PrivateRoute>
                <PlaneacionBuilder />
              </PrivateRoute>
            }
          />
          <Route
            path="/generar-material"
            element={
              <PrivateRoute>
                <GeneracionMaterial />
              </PrivateRoute>
            }
          />
          <Route
            path="/actividades"
            element={
              <PrivateRoute>
                <EvaluacionModule />
              </PrivateRoute>
            }
          />
          <Route
            path="/evaluacion-actividad"
            element={
              <PrivateRoute>
                <ActivityEvaluationModule />
              </PrivateRoute>
            }
          />
        </Routes>
      </div>
    </div>
  );
}

const App = () => (
  <AuthProvider>
    <CourseProvider>
      <AppContent />
    </CourseProvider>
  </AuthProvider>
);

export default App;
