import axios from 'axios';

// Define la URL base de tu API FastAPI
// Asegúrate de que coincida con donde se está ejecutando tu backend
// Si ejecutas ambos localmente, probablemente sea algo así:
const API_BASE_URL = 'http://localhost:8000'; // O el puerto que use FastAPI/Uvicorn

// Crea una instancia de Axios sin Content-Type por defecto
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  // Quitar la cabecera Content-Type por defecto
  // headers: {
  //   'Content-Type': 'application/json',
  // },
});

// Puedes añadir interceptores si necesitas manejar errores globalmente o tokens
apiClient.interceptors.response.use(
  (response) => response, // Simplemente devuelve la respuesta si es exitosa
  (error) => {
    // Manejo básico de errores
    console.error('Error en la petición API:', error.response || error.message);
    // Puedes lanzar el error de nuevo o devolver una promesa rechazada
    // para manejarlo específicamente en cada llamada
    return Promise.reject(error);
  }
);

export default apiClient; 