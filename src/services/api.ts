import axios from 'axios';

// Define la URL base de tu API FastAPI
// Asegúrate de que coincida con donde se está ejecutando tu backend
// Si ejecutas ambos localmente, probablemente sea algo así:
const API_BASE_URL = 'http://localhost:8000'; // O el puerto que use FastAPI/Uvicorn

// Crea una instancia de Axios con la configuración correcta
const apiClient = axios.create({
  baseURL: API_BASE_URL
  // headers: {
  //   'Content-Type': 'application/json',
  // },
});

// Interceptor para agregar el token de autenticación
apiClient.interceptors.request.use(
  (config) => {
    // Obtener el usuario del localStorage
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      if (user.token) {
        config.headers.Authorization = `Basic ${user.token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor para manejar errores
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('Error en la petición API:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export default apiClient; 