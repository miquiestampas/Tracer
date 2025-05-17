import axios from 'axios';

// Define la URL base de tu API FastAPI
// Asegúrate de que coincida con donde se está ejecutando tu backend
// Si ejecutas ambos localmente, probablemente sea algo así:
const API_BASE_URL = 'http://localhost:8000'; // O el puerto que use FastAPI/Uvicorn
const JWT_TOKEN_KEY = 'jwt_access_token'; // Clave que usa AuthContext para guardar el token JWT

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
    const jwtToken = localStorage.getItem(JWT_TOKEN_KEY); // Obtener el token JWT
    if (jwtToken) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${jwtToken}`; // Usar Bearer token
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
    // Podríamos añadir lógica aquí para desloguear si el error es 401 (Unauthorized)
    // por ejemplo, llamando a una función logout importada de AuthContext o emitiendo un evento.
    // if (error.response && error.response.status === 401) {
    //   // Aquí se podría llamar a AuthContext.logout() o similar
    //   // Cuidado con dependencias circulares si AuthContext importa apiClient.
    //   // Una forma más robusta sería emitir un evento que AuthContext escuche.
    //   console.warn('Token inválido o expirado. Se debería cerrar sesión.');
    //   // auth.logout(); // Esto requeriría importar auth o tener una referencia
    //   // window.dispatchEvent(new Event('unauthorized'));
    // }
    return Promise.reject(error);
  }
);

export default apiClient; 