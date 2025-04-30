import axios from 'axios';

export interface Activity {
  id: string;
  type: 'case_created' | 'import_completed' | 'reader_alert' | 'case_updated' | 'search_performed' | 'vehicle_added';
  title: string;
  description: string;
  timestamp: string;
  metadata?: {
    caseId?: string;
    fileName?: string;
    readerId?: string;
    recordsCount?: number;
    vehiclePlate?: string;
    vehicleType?: string;
    searchQuery?: string;
    searchResults?: number;
  };
}

// Función para registrar una nueva actividad
const registerActivity = async (activity: Omit<Activity, 'id' | 'timestamp'>): Promise<Activity> => {
  try {
    const response = await axios.post('/api/activities', activity);
    return response.data;
  } catch (error) {
    console.error('Error registering activity:', error);
    throw error;
  }
};

// Funciones específicas para cada tipo de actividad
export const registerCaseCreated = async (caseId: string, caseTitle: string) => {
  return registerActivity({
    type: 'case_created',
    title: 'Nuevo caso creado',
    description: `Se ha creado el caso "${caseTitle}"`,
    metadata: { caseId }
  });
};

export const registerImportCompleted = async (fileName: string, recordsCount: number) => {
  return registerActivity({
    type: 'import_completed',
    title: 'Importación completada',
    description: `Se han importado ${recordsCount} registros desde ${fileName}`,
    metadata: { fileName, recordsCount }
  });
};

export const registerReaderAlert = async (readerId: string, alertType: 'offline' | 'error' | 'warning') => {
  const alertMessages = {
    offline: 'está offline',
    error: 'ha reportado un error',
    warning: 'requiere atención'
  };

  return registerActivity({
    type: 'reader_alert',
    title: 'Alerta de lector',
    description: `El lector ${readerId} ${alertMessages[alertType]}`,
    metadata: { readerId }
  });
};

export const registerCaseUpdated = async (caseId: string, caseTitle: string, updateType: string) => {
  return registerActivity({
    type: 'case_updated',
    title: 'Caso actualizado',
    description: `Se ha actualizado el caso "${caseTitle}" (${updateType})`,
    metadata: { caseId }
  });
};

export const registerSearchPerformed = async (query: string, resultsCount: number) => {
  return registerActivity({
    type: 'search_performed',
    title: 'Búsqueda realizada',
    description: `Búsqueda: "${query}" (${resultsCount} resultados)`,
    metadata: { searchQuery: query, searchResults: resultsCount }
  });
};

export const registerVehicleAdded = async (plate: string, vehicleType: string, caseId?: string) => {
  return registerActivity({
    type: 'vehicle_added',
    title: 'Vehículo añadido',
    description: `Se ha añadido el vehículo ${plate} (${vehicleType})${caseId ? ' al caso' : ''}`,
    metadata: { vehiclePlate: plate, vehicleType, caseId }
  });
};

// Función existente para obtener actividades recientes
export const fetchRecentActivities = async (limit: number = 5): Promise<Activity[]> => {
  try {
    const response = await axios.get(`/api/activities/recent?limit=${limit}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching recent activities:', error);
    return [];
  }
};

// Actualización de las funciones de iconos y colores
export const getActivityIcon = (type: Activity['type']) => {
  switch (type) {
    case 'case_created':
      return 'IconFolder';
    case 'import_completed':
      return 'IconFileImport';
    case 'reader_alert':
      return 'IconAlertCircle';
    case 'case_updated':
      return 'IconEdit';
    case 'search_performed':
      return 'IconSearch';
    case 'vehicle_added':
      return 'IconCar';
    default:
      return 'IconActivity';
  }
};

export const getActivityColor = (type: Activity['type']) => {
  switch (type) {
    case 'case_created':
      return 'blue';
    case 'import_completed':
      return 'green';
    case 'reader_alert':
      return 'red';
    case 'case_updated':
      return 'yellow';
    case 'search_performed':
      return 'grape';
    case 'vehicle_added':
      return 'cyan';
    default:
      return 'gray';
  }
}; 