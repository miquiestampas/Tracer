import type { GpsLectura, GpsCapa, LocalizacionInteres } from '../types/data';

const CACHE_KEYS = {
  LECTURAS: (casoId: number, matricula: string) => `gps_lecturas_${casoId}_${matricula}`,
  CAPAS: (casoId: number) => `gps_capas_${casoId}`,
  LOCALIZACIONES: (casoId: number) => `gps_localizaciones_${casoId}`,
};

const CACHE_EXPIRY = 1000 * 60 * 60; // 1 hora en milisegundos

interface CacheItem<T> {
  data: T;
  timestamp: number;
}

export const gpsCache = {
  // Guardar lecturas en caché
  setLecturas: (casoId: number, matricula: string, lecturas: GpsLectura[]) => {
    const cacheItem: CacheItem<GpsLectura[]> = {
      data: lecturas,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEYS.LECTURAS(casoId, matricula), JSON.stringify(cacheItem));
  },

  // Obtener lecturas de caché
  getLecturas: (casoId: number, matricula: string): GpsLectura[] | null => {
    const cached = localStorage.getItem(CACHE_KEYS.LECTURAS(casoId, matricula));
    if (!cached) return null;

    const cacheItem: CacheItem<GpsLectura[]> = JSON.parse(cached);
    if (Date.now() - cacheItem.timestamp > CACHE_EXPIRY) {
      localStorage.removeItem(CACHE_KEYS.LECTURAS(casoId, matricula));
      return null;
    }

    return cacheItem.data;
  },

  // Guardar capas en caché
  setCapas: (casoId: number, capas: GpsCapa[]) => {
    const cacheItem: CacheItem<GpsCapa[]> = {
      data: capas,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEYS.CAPAS(casoId), JSON.stringify(cacheItem));
  },

  // Obtener capas de caché
  getCapas: (casoId: number): GpsCapa[] | null => {
    const cached = localStorage.getItem(CACHE_KEYS.CAPAS(casoId));
    if (!cached) return null;

    const cacheItem: CacheItem<GpsCapa[]> = JSON.parse(cached);
    if (Date.now() - cacheItem.timestamp > CACHE_EXPIRY) {
      localStorage.removeItem(CACHE_KEYS.CAPAS(casoId));
      return null;
    }

    return cacheItem.data;
  },

  // Guardar localizaciones en caché
  setLocalizaciones: (casoId: number, localizaciones: LocalizacionInteres[]) => {
    const cacheItem: CacheItem<LocalizacionInteres[]> = {
      data: localizaciones,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEYS.LOCALIZACIONES(casoId), JSON.stringify(cacheItem));
  },

  // Obtener localizaciones de caché
  getLocalizaciones: (casoId: number): LocalizacionInteres[] | null => {
    const cached = localStorage.getItem(CACHE_KEYS.LOCALIZACIONES(casoId));
    if (!cached) return null;

    const cacheItem: CacheItem<LocalizacionInteres[]> = JSON.parse(cached);
    if (Date.now() - cacheItem.timestamp > CACHE_EXPIRY) {
      localStorage.removeItem(CACHE_KEYS.LOCALIZACIONES(casoId));
      return null;
    }

    return cacheItem.data;
  },

  // Limpiar caché para un caso específico
  clearCache: (casoId: number) => {
    // Eliminar todas las entradas de caché relacionadas con el caso
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(`gps_`) && key.includes(`_${casoId}_`)) {
        localStorage.removeItem(key);
      }
    });
  },

  // Limpiar toda la caché de GPS
  clearAllCache: () => {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(`gps_`)) {
        localStorage.removeItem(key);
      }
    });
  },
}; 