import React from 'react';
import ReactDOM from 'react-dom/client';
// Importar CSS global
import './index.css';
import App from './App'; // Importa tu componente principal

// Busca el elemento root en tu index.html
const rootElement = document.getElementById('root');

// Asegúrate de que el elemento root existe antes de renderizar
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} else {
  console.error("Elemento root no encontrado en el DOM.");
} 