import React from 'react';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/layout/Layout'; // Asumiendo esta ruta
import DashboardPage from './pages/DashboardPage'; // Asumiendo esta ruta
import CasosPage from './pages/CasosPage'; // Asumiendo esta ruta
import ImportarPage from './pages/ImportarPage'; // Importar nueva página
import CasoDetailPage from './pages/CasoDetailPage'; // Importar nueva página
// Importa otras páginas aquí a medida que las crees
// import LectoresPage from './pages/LectoresPage';
// import MapaPage from './pages/MapaPage';
// import BusquedaPage from './pages/BusquedaPage';
// import PatronesPage from './pages/PatronesPage';

// Importa estilos globales de Mantine y notificaciones
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import { theme } from './theme'; // Importar el tema personalizado

function App() {
  // Aquí podrías definir tu tema personalizado para MantineProvider
  // const theme = { ... };

  return (
    <React.StrictMode>
      <MantineProvider theme={theme}>
        <Notifications />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<DashboardPage />} />
              <Route path="casos" element={<CasosPage />} />
              <Route path="casos/detalle/:idCaso" element={<CasoDetailPage />} />
              <Route path="importar" element={<ImportarPage />} />
              {/* <Route path="lectores" element={<LectoresPage />} /> */}
              {/* <Route path="mapa" element={<MapaPage />} /> */}
              {/* <Route path="busqueda" element={<BusquedaPage />} /> */}
              {/* <Route path="patrones" element={<PatronesPage />} /> */}
              <Route path="*" element={<div>404 - Página no encontrada</div>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </MantineProvider>
    </React.StrictMode>
  );
}

export default App; 