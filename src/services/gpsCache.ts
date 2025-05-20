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

class GpsCache {
  private cache = new Map<string, { data: any; timestamp: number }>();
  private readonly TTL = 5 * 60 * 1000; // 5 minutos

  set(key: string, data: any) {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  get(key: string) {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() - item.timestamp > this.TTL) {
      this.cache.delete(key);
      return null;
    }
    return item.data;
  }

  clear() {
    this.cache.clear();
  }

  // Métodos específicos para GPS
  setLecturas(casoId: number, matricula: string, lecturas: GpsLectura[]) {
    const cacheItem: CacheItem<GpsLectura[]> = {
      data: lecturas,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEYS.LECTURAS(casoId, matricula), JSON.stringify(cacheItem));
    this.set(`lecturas_${casoId}_${matricula}`, lecturas);
  }

  getLecturas(casoId: number, matricula: string): GpsLectura[] | null {
    const cached = localStorage.getItem(CACHE_KEYS.LECTURAS(casoId, matricula));
    if (cached) {
      const cacheItem: CacheItem<GpsLectura[]> = JSON.parse(cached);
      if (Date.now() - cacheItem.timestamp > CACHE_EXPIRY) {
        localStorage.removeItem(CACHE_KEYS.LECTURAS(casoId, matricula));
        return null;
      }
      return cacheItem.data;
    }
    return this.get(`lecturas_${casoId}_${matricula}`);
  }

  setCapas(casoId: number, capas: GpsCapa[]) {
    const cacheItem: CacheItem<GpsCapa[]> = {
      data: capas,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEYS.CAPAS(casoId), JSON.stringify(cacheItem));
    this.set(`capas_${casoId}`, capas);
  }

  getCapas(casoId: number): GpsCapa[] | null {
    const cached = localStorage.getItem(CACHE_KEYS.CAPAS(casoId));
    if (cached) {
      const cacheItem: CacheItem<GpsCapa[]> = JSON.parse(cached);
      if (Date.now() - cacheItem.timestamp > CACHE_EXPIRY) {
        localStorage.removeItem(CACHE_KEYS.CAPAS(casoId));
        return null;
      }
      return cacheItem.data;
    }
    return this.get(`capas_${casoId}`);
  }

  setLocalizaciones(casoId: number, localizaciones: LocalizacionInteres[]) {
    const cacheItem: CacheItem<LocalizacionInteres[]> = {
      data: localizaciones,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEYS.LOCALIZACIONES(casoId), JSON.stringify(cacheItem));
    this.set(`localizaciones_${casoId}`, localizaciones);
  }

  getLocalizaciones(casoId: number): LocalizacionInteres[] | null {
    const cached = localStorage.getItem(CACHE_KEYS.LOCALIZACIONES(casoId));
    if (cached) {
      const cacheItem: CacheItem<LocalizacionInteres[]> = JSON.parse(cached);
      if (Date.now() - cacheItem.timestamp > CACHE_EXPIRY) {
        localStorage.removeItem(CACHE_KEYS.LOCALIZACIONES(casoId));
        return null;
      }
      return cacheItem.data;
    }
    return this.get(`localizaciones_${casoId}`);
  }

  // Limpiar caché para un caso específico
  clearCache(casoId: number) {
    // Eliminar todas las entradas de caché relacionadas con el caso
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(`gps_`) && key.includes(`_${casoId}_`)) {
        localStorage.removeItem(key);
      }
    });
    this.clear();
  }

  // Limpiar toda la caché de GPS
  clearAllCache() {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(`gps_`)) {
        localStorage.removeItem(key);
      }
    });
    this.clear();
  }
}

export const gpsCache = new GpsCache(); 