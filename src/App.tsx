import React, { Suspense } from 'react';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { ModalsProvider } from '@mantine/modals';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout'; // Asumiendo esta ruta
import { lazy } from 'react';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import { TaskProvider } from './contexts/TaskContext';
// Importa otras páginas aquí a medida que las crees
// import LectoresPage from './pages/LectoresPage';
// import MapaPage from './pages/MapaPage';
// import BusquedaPage from './pages/BusquedaPage';
// import PatronesPage from './pages/PatronesPage';

// Importa estilos globales de Mantine y notificaciones
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import { theme } from './theme'; // Importar el tema personalizado

// --- Lazy Loading de Páginas ---
const HomePage = lazy(() => import('./pages/DashboardPage'));
const CasosPage = lazy(() => import('./pages/CasosPage'));
const ImportarPage = lazy(() => import('./pages/ImportarPage'));
const CasoDetailPage = lazy(() => import('./pages/CasoDetailPage'));
const LectoresPage = lazy(() => import('./pages/LectoresPage'));
const BusquedaPage = lazy(() => import('./pages/BusquedaPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
// Añade aquí las demás páginas cuando las crees, usando React.lazy

function App() {
  // Aquí podrías definir tu tema personalizado para MantineProvider
  // const theme = { ... };

  return (
    <React.StrictMode>
      <MantineProvider theme={theme}>
        <Notifications />
        <ModalsProvider>
          <TaskProvider>
            <AuthProvider>
              <BrowserRouter>
                <Suspense fallback={<div>Cargando página...</div>}>
                  <Routes>
                    {/* Ruta pública de login */}
                    <Route path="/login" element={<LoginPage />} />
                    
                    {/* Rutas protegidas dentro del Layout */}
                    <Route path="/" element={
                      <ProtectedRoute>
                        <Layout />
                      </ProtectedRoute>
                    }>
                      <Route index element={<HomePage />} />
                      <Route path="casos" element={<CasosPage />} />
                      <Route path="casos/:idCaso" element={<CasoDetailPage />} />
                      <Route path="importar" element={<ImportarPage />} />
                      <Route path="lectores" element={<LectoresPage />} />
                      <Route path="busqueda" element={<BusquedaPage />} />
                      <Route path="admin" element={
                        <ProtectedRoute requireSuperAdmin>
                          <AdminPage />
                        </ProtectedRoute>
                      } />
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Route>
                  </Routes>
                </Suspense>
              </BrowserRouter>
            </AuthProvider>
          </TaskProvider>
        </ModalsProvider>
      </MantineProvider>
    </React.StrictMode>
  );
}

export default App; 