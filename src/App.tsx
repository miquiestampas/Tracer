import React, { Suspense } from 'react';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { ModalsProvider } from '@mantine/modals';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout'; // Asumiendo esta ruta
import { lazy } from 'react';
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
          <BrowserRouter>
            {/* Envolver Routes con Suspense para el fallback */}
            <Suspense fallback={<div>Cargando página...</div>}> 
              <Routes>
                <Route path="/" element={<Layout />}>
                  <Route index element={<HomePage />} />
                  <Route path="casos" element={<CasosPage />} />
                  <Route path="casos/detalle/:idCaso" element={<CasoDetailPage />} />
                  <Route path="importar" element={<ImportarPage />} />
                  <Route path="lectores" element={<LectoresPage />} />
                  <Route path="busqueda" element={<BusquedaPage />} />
                  <Route path="admin" element={<AdminPage />} />
                  {/* <Route path="lectores" element={<LectoresPage />} /> */}
                  {/* <Route path="mapa" element={<MapaPage />} /> */}
                  {/* <Route path="busqueda" element={<BusquedaPage />} /> */}
                  {/* <Route path="patrones" element={<PatronesPage />} /> */}
                  <Route path="*" element={<div>404 - Página no encontrada</div>} />
                </Route>
              </Routes>
            </Suspense>
          </BrowserRouter>
        </ModalsProvider>
      </MantineProvider>
    </React.StrictMode>
  );
}

export default App; 