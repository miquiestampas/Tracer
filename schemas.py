from pydantic import BaseModel, Field, validator, SkipValidation
from typing import Optional, List, Union, Tuple, Dict, Any, Literal
import datetime
import enum # Importar enum

# Importar el Enum desde models.py
from models import EstadoCasoEnum 

# --- Schemas Base ---
class GrupoBase(BaseModel):
    Nombre: str = Field(..., example="Grupo de Investigación 1")
    Descripcion: Optional[str] = Field(None, example="Grupo especializado en investigaciones de tráfico")

class CasoBase(BaseModel):
    Nombre_del_Caso: str = Field(..., example="Robo Banco Central")
    Año: int = Field(..., example=2024)
    NIV: Optional[str] = Field(None, example="ABC123XYZ789DEF", max_length=50) # Añadir max_length si se usa String(50) en el modelo
    Descripcion: Optional[str] = Field(None, example="Investigación sobre el robo ocurrido el...")
    Estado: Optional[str] = Field(default=EstadoCasoEnum.NUEVO.value, example=EstadoCasoEnum.NUEVO.value)
    ID_Grupo: int = Field(..., example=1)

class ArchivoExcelBase(BaseModel):
    Nombre_del_Archivo: str = Field(..., example="camaras_entrada_sur.xlsx")
    Tipo_de_Archivo: str = Field(..., example="LPR", pattern="^(GPS|LPR)$")

class LecturaBase(BaseModel):
    Matricula: str = Field(..., example="1234ABC")
    Fecha_y_Hora: SkipValidation[datetime.datetime] = Field(..., example="2023-10-27T10:30:00")
    Carril: Optional[str] = Field(None, example="1")
    Velocidad: Optional[float] = Field(None, example=85.5)
    ID_Lector: Optional[str] = Field(None, example="CAM001")
    Coordenada_X: Optional[float] = Field(None, example=-3.703790)
    Coordenada_Y: Optional[float] = Field(None, example=40.416775)
    Tipo_Fuente: str = Field(..., example="LPR", pattern="^(GPS|LPR)$")

class VehiculoBase(BaseModel):
    Matricula: str = Field(..., example="1234ABC")
    Marca: Optional[str] = Field(None, example="Toyota")
    Modelo: Optional[str] = Field(None, example="Corolla")
    Color: Optional[str] = Field(None, example="Azul")
    Observaciones: Optional[str] = Field(None, example="Visto en múltiples puntos")
    Alquiler: Optional[bool] = Field(False, example=True)
    Comprobado: Optional[bool] = Field(False, example=True)
    Sospechoso: Optional[bool] = Field(False, example=True)

# --- Schemas para Creación (POST) ---
class GrupoCreate(GrupoBase):
    pass

class CasoCreate(CasoBase):
    pass

class ArchivoExcelCreate(ArchivoExcelBase):
    ID_Caso: int

class LecturaCreate(LecturaBase):
    ID_Archivo: int

class VehiculoCreate(VehiculoBase):
    pass

class VehiculoUpdate(BaseModel):
    Marca: Optional[str] = None
    Modelo: Optional[str] = None
    Color: Optional[str] = None
    Observaciones: Optional[str] = None
    Alquiler: Optional[bool] = None
    Comprobado: Optional[bool] = None
    Sospechoso: Optional[bool] = None

class Vehiculo(VehiculoBase):
    ID_Vehiculo: int
    
    class Config:
        from_attributes = True

# Nuevo esquema para vehículos con estadísticas
class VehiculoWithStats(Vehiculo):
    """Esquema de vehículo con estadísticas adicionales para optimizar consultas"""
    num_lecturas_lpr: int = Field(0, description="Número de lecturas LPR asociadas a este vehículo")
    num_lecturas_gps: int = Field(0, description="Número de lecturas GPS asociadas a este vehículo")
    
    class Config:
        from_attributes = True

# --- Actualizar Schemas Lector ---

# Base: Campos comunes y obligatorios (solo ID y coords originales)
# Ajustamos Base para reflejar el estado *mínimo* de un lector auto-creado
class LectorBase(BaseModel):
    ID_Lector: str = Field(..., example="MAD001", max_length=50)
    Nombre: Optional[str] = Field(None, example="Cámara M-30 Pk 7", max_length=100)
    Carretera: Optional[str] = Field(None, example="M-30", max_length=100)
    Provincia: Optional[str] = Field(None, example="Madrid", max_length=50)
    Localidad: Optional[str] = Field(None, example="Madrid", max_length=100)
    Sentido: Optional[str] = Field(None, example="Norte", max_length=50)
    Orientacion: Optional[str] = Field(None, example="Salida", max_length=100)
    Organismo_Regulador: Optional[str] = Field(None, example="Ayuntamiento de Madrid", max_length=100)
    Contacto: Optional[str] = Field(None, example="policia@madrid.es", max_length=255)
    Coordenada_X: Optional[float] = Field(None, example=-3.703790)
    Coordenada_Y: Optional[float] = Field(None, example=40.416775)
    Texto_Libre: Optional[str] = Field(None, example="Notas adicionales sobre la cámara")
    Imagen_Path: Optional[str] = Field(None, example="/static/images/cam001.jpg", max_length=255)

# Create: Hereda de Base, permite añadir los campos opcionales al crear manualmente
class LectorCreate(LectorBase):
    pass

# Update: Todos los campos son opcionales para permitir actualización parcial
class LectorUpdate(BaseModel):
    Nombre: Optional[str] = Field(None, max_length=100)
    Carretera: Optional[str] = Field(None, max_length=100)
    Provincia: Optional[str] = Field(None, max_length=50)
    Localidad: Optional[str] = Field(None, max_length=100)
    Sentido: Optional[str] = Field(None, max_length=50)
    Orientacion: Optional[str] = Field(None, max_length=100)
    Organismo_Regulador: Optional[str] = Field(None, max_length=100)
    Contacto: Optional[str] = Field(None, max_length=255)
    Coordenada_X: Optional[float] = None # Manejado por UbicacionInput en el endpoint
    Coordenada_Y: Optional[float] = None # Manejado por UbicacionInput en el endpoint
    Texto_Libre: Optional[str] = None
    Imagen_Path: Optional[str] = Field(None, max_length=255)
    UbicacionInput: Optional[str] = Field(None, description="Input de texto para coordenadas o enlace Google Maps")

# Lectura (GET): Devuelve todos los campos de la BD
class Lector(LectorBase): # Hereda ID_Lector, Coordenada_X, Coordenada_Y
    Nombre: Optional[str] = None
    Carretera: Optional[str] = None
    Provincia: Optional[str] = None
    Localidad: Optional[str] = None
    Sentido: Optional[str] = None
    Orientacion: Optional[str] = None
    Organismo_Regulador: Optional[str] = None
    Contacto: Optional[str] = None
    Texto_Libre: Optional[str] = None
    Imagen_Path: Optional[str] = None
    # lecturas: List[Lectura] = [] # Evitar referencias circulares profundas aquí
    
    class Config:
        from_attributes = True

# --- Schemas para Actualización (PUT) ---
class VehiculoUpdate(BaseModel):
    # Todos opcionales para permitir actualización parcial
    Marca: Optional[str] = Field(None, example="Seat")
    Modelo: Optional[str] = Field(None, example="Ibiza")
    Color: Optional[str] = Field(None, example="Rojo")
    Observaciones: Optional[str] = Field(None, example="Actualización de notas")
    Alquiler: Optional[bool] = Field(None)
    Comprobado: Optional[bool] = Field(None)
    Sospechoso: Optional[bool] = Field(None)

# --- Schemas para Actualización (PUT/PATCH) ---
# Nuevo schema para actualizar solo el estado
class CasoEstadoUpdate(BaseModel):
    Estado: str = Field(..., example=EstadoCasoEnum.EN_ANALISIS.value)

# --- Schemas para Actualización Parcial (PATCH) ---
class CasoUpdate(BaseModel):
    Nombre_del_Caso: Optional[str] = None
    Año: Optional[int] = None
    NIV: Optional[str] = None
    Descripcion: Optional[str] = None
    Estado: Optional[str] = None
    ID_Grupo: Optional[int] = None

# --- Schemas para Lectura (GET) ---
class Grupo(GrupoBase):
    ID_Grupo: int
    Fecha_Creacion: datetime.date
    # casos: List['Caso'] = []  # Eliminado para evitar recursión

    class Config:
        from_attributes = True

# NUEVO: Schema simplificado para Caso, usado como referencia para evitar ciclos
class CasoReferencia(CasoBase):
    ID_Caso: int
    Fecha_de_Creacion: datetime.date
    grupo: Optional[Grupo] = None
    # NO incluye 'archivos: List[ArchivoExcel]' para romper el ciclo

    class Config:
        from_attributes = True

class Caso(CasoBase):
    ID_Caso: int
    Fecha_de_Creacion: datetime.date
    grupo: Optional[Grupo] = None
    archivos: List['ArchivoExcel'] = Field(default_factory=list)

    class Config:
        from_attributes = True

class ArchivoExcel(ArchivoExcelBase):
    ID_Archivo: int
    ID_Caso: int
    Fecha_de_Importacion: datetime.date
    Total_Registros: int = Field(0, description="Número total de lecturas en este archivo")
    caso: Optional[CasoReferencia] = None  # MODIFICADO: Usa CasoReferencia en lugar de Caso
    # lecturas: List['Lectura'] = []

    class Config:
        from_attributes = True  # Reemplaza orm_mode en Pydantic v2

class Lectura(LecturaBase):
    ID_Lectura: int
    ID_Archivo: int
    archivo: Optional[ArchivoExcel] = None  # <-- Añadido para exponer el archivo y su caso
    # Incluir información de relevancia opcionalmente
    relevancia: Optional['LecturaRelevante'] = None # Usar string forward reference
    # Añadir el lector asociado para obtener Sentido/Orientacion
    lector: Optional[Lector] = None # Añadir lector opcional
    duracion_parada_min: Optional[float] = None  # Duración de la parada en minutos

    class Config:
        from_attributes = True  # Reemplaza orm_mode en Pydantic v2

class Vehiculo(VehiculoBase):
    ID_Vehiculo: int
    total_lecturas_lpr_caso: Optional[int] = None # <-- NUEVO CAMPO

    class Config:
        from_attributes = True  # Reemplaza orm_mode en Pydantic v2

# --- Schemas para Lecturas Relevantes ---
class LecturaRelevanteBase(BaseModel):
    Nota: Optional[str] = Field(None, example="Posible vehículo de escape visto en C/ Falsa 123")

class LecturaRelevanteCreate(LecturaRelevanteBase):
    # ID_Lectura se podría requerir aquí o tomar de la URL dependiendo de la API
    pass

class LecturaRelevanteUpdate(LecturaRelevanteBase):
    # Mantener Nota como opcional para permitir borrarla si se envía null o vacío
    Nota: Optional[str] = None
    caso_id: Optional[int] = None # <-- Añadir caso_id opcional

class LecturaRelevante(LecturaRelevanteBase):
    ID_Relevante: int
    ID_Lectura: int
    Fecha_Marcada: SkipValidation[datetime.datetime]

    class Config:
        from_attributes = True  # Reemplaza orm_mode en Pydantic v2

# --- NUEVO: Schema para respuesta paginada de lecturas ---
class LecturasResponse(BaseModel):
    total_count: int = Field(..., description="Número total de lecturas que coinciden con los filtros")
    lecturas: List[Lectura] = Field(..., description="Lista de lecturas para la página actual")

# --- NUEVO: Schema para respuesta de subida de archivo ---
class UploadResponse(BaseModel):
    archivo: ArchivoExcel
    total_registros: int
    errores: Optional[List[str]] = None
    lectores_no_encontrados: Optional[List[str]] = None
    lecturas_duplicadas: Optional[List[str]] = None
    nuevos_lectores_creados: Optional[List[str]] = None

# --- NUEVO: Schema para respuesta paginada de lectores ---
class LectoresResponse(BaseModel):
    total_count: int
    lectores: List[Lector]

# === NUEVO: Esquema para datos de lector en el mapa ===
class LectorCoordenadas(BaseModel):
    ID_Lector: str
    Nombre: Optional[str] = None
    Coordenada_Y: float # Latitud (obligatoria para el mapa)
    Coordenada_X: float # Longitud (obligatoria para el mapa)
    Provincia: Optional[str] = None
    Carretera: Optional[str] = None
    Organismo_Regulador: Optional[str] = None

    class Config:
        from_attributes = True  # Reemplaza orm_mode en Pydantic v2

# --- Schema reutilizable para opciones de Select/MultiSelect ---
class SelectOption(BaseModel):
    value: str
    label: str

# --- NUEVO: Schema para la Respuesta de Filtros Disponibles por Caso ---
class FiltrosDisponiblesResponse(BaseModel):
    # Usar la clase SelectOption definida arriba
    lectores: List[SelectOption] = Field(default_factory=list, description="Lectores con lecturas en este caso")
    carreteras: List[SelectOption] = Field(default_factory=list, description="Carreteras asociadas a los lectores con lecturas en este caso")

# === NUEVO: Esquema para Sugerencias en Edición de Lector ===
class LectorSugerenciasResponse(BaseModel):
    provincias: List[str] = []
    localidades: List[str] = []
    carreteras: List[str] = []
    organismos: List[str] = []
    contactos: List[str] = []

# --- NUEVO: Schema para la Petición POST de Intersección ---
class LecturaIntersectionRequest(BaseModel):
    matriculas: List[str]
    caso_id: int
    tipo_fuente: str

# --- Schemas para Búsquedas Guardadas ---
class SavedSearchBase(BaseModel):
    name: str = Field(..., example="Vehículos sospechosos Zona Norte")
    filters: Dict[str, Any] = Field(..., example={
        "fechaInicio": "2024-01-10",
        "fechaFin": "2024-01-20",
        "timeFrom": "10:00",
        "timeTo": "18:00",
        "selectedLectores": ["CAM001", "CAM005"],
        "selectedCarreteras": ["M-30", "A-6"],
        "selectedSentidos": ["Norte", "Sur"],
        "matricula": "1234???",
        "minPasos": 2,
        "maxPasos": 10
    })

class SavedSearchCreate(SavedSearchBase):
    caso_id: int
    results: List[Dict[str, Any]]

class SavedSearchUpdate(BaseModel):
    name: Optional[str] = None
    filters: Optional[Dict[str, Any]] = None
    results: Optional[List[Dict[str, Any]]] = None

class SavedSearch(SavedSearchBase):
    id: int
    caso_id: int
    results: List[Dict[str, Any]]
    created_at: datetime.datetime
    updated_at: datetime.datetime

    class Config:
        from_attributes = True  # Reemplaza orm_mode en Pydantic v2

# Caso.update_forward_refs()
# ArchivoExcel.update_forward_refs()
# Lector.update_forward_refs() 

# --- Schemas Relacionados (con relaciones anidadas) ---
# (Puedes definir esquemas aquí que muestren las relaciones completas si es necesario)
# Ejemplo:
# class LecturaCompleta(Lectura):
#     archivo: ArchivoExcel
#     lector: Optional[Lector]
#     vehiculo: Optional[Vehiculo]

# Actualizar referencias si es necesario (Pydantic v2 maneja mejor los forward refs)
# Caso.model_rebuild()
# ArchivoExcel.model_rebuild()
# Lector.model_rebuild()
# Lectura.model_rebuild()
# LecturaRelevante.model_rebuild() 

# --- Schemas para Detección de Vehículo Lanzadera ---
class LanzaderaRequest(BaseModel):
    matricula: str = Field(..., description="Matrícula del vehículo objetivo a analizar")
    fecha_inicio: Optional[str] = Field(None, description="Fecha de inicio del análisis (YYYY-MM-DD)")
    fecha_fin: Optional[str] = Field(None, description="Fecha de fin del análisis (YYYY-MM-DD)")
    ventana_minutos: int = Field(10, description="Ventana temporal en minutos para considerar vehículos acompañantes")
    diferencia_minima: int = Field(5, description="Diferencia mínima en minutos entre lecturas para considerar repetición")

class LanzaderaDetalle(BaseModel):
    matricula: str = Field(..., description="Matrícula del vehículo lanzadera u objetivo")
    fecha: str = Field(..., description="Fecha de la lectura (YYYY-MM-DD)")
    hora: str = Field(..., description="Hora de la lectura (HH:MM)")
    lector: str = Field(..., description="ID del lector donde se detectó la coincidencia")
    tipo: str = Field(..., description="Tipo de lectura: 'Objetivo' o 'Lanzadera'")

class LanzaderaResponse(BaseModel):
    vehiculos_lanzadera: List[str] = Field(..., description="Lista de matrículas detectadas como lanzaderas")
    detalles: List[LanzaderaDetalle] = Field(..., description="Detalles de todas las coincidencias encontradas")

# --- Schemas ANTIGUOS (Relacionados con ResultadoLanzadera...) --- 
# Los comentamos o eliminamos ya que no se usarán con el nuevo enfoque
# class ResultadoLanzaderaSchema(BaseModel):
#     matriculas_convoy: List[str] = Field(..., min_length=2, max_length=2, description="Las dos matrículas que viajan juntas")
#     numero_coincidencias: int
#     class Config:
#         from_attributes = True 

# class ResultadoLanzaderaDetalladoSchema(ResultadoLanzaderaSchema):
#     detalles: List[CoincidenciaDetalleSchema] = Field(default_factory=list, description="Lista de co-ocurrencias específicas (lector, timestamp, coords)")

# Nuevo schema que incluye detalles y coordenadas
# class ResultadoLanzaderaDetalladoSchema(ResultadoLanzaderaSchema):
#     detalles: List[CoincidenciaDetalleSchema] = Field(default_factory=list, description="Lista de co-ocurrencias específicas (lector, timestamp, coords)")
#     # Podríamos añadir un dict mapeando lector_id a coords si los detalles no las incluyen
#     # coordenadas_lectores: Dict[str, Tuple[float, float]] = Field(default_factory=dict) 

class EstadisticasGlobales(BaseModel):
    total_casos: int
    total_lecturas: int
    total_vehiculos: int
    tamanio_bd: str

class GpsCapaBase(BaseModel):
    nombre: str
    color: str
    activa: bool
    lecturas: List[dict]
    filtros: dict
    descripcion: Optional[str] = None

class GpsCapaCreate(GpsCapaBase):
    pass

class GpsCapaUpdate(GpsCapaBase):
    pass

class GpsCapaOut(GpsCapaBase):
    id: int
    caso_id: int
    class Config:
        from_attributes = True  # Reemplaza orm_mode en Pydantic v2

class LocalizacionInteresBase(BaseModel):
    titulo: str
    descripcion: Optional[str] = None
    fecha_hora: str
    icono: str
    color: str
    coordenada_x: float
    coordenada_y: float
    id_lectura: Optional[int] = None

class LocalizacionInteresCreate(LocalizacionInteresBase):
    pass

class LocalizacionInteresUpdate(LocalizacionInteresBase):
    pass

class LocalizacionInteresOut(LocalizacionInteresBase):
    id: int
    caso_id: int
    class Config:
        from_attributes = True

class RolUsuarioEnum(str, enum.Enum):
    superadmin = "superadmin"
    admingrupo = "admingrupo"
    user_consulta = "user_consulta"

class UsuarioBase(BaseModel):
    User: int = Field(..., example=12345)
    Rol: RolUsuarioEnum = Field(..., example="admingrupo")
    ID_Grupo: Optional[int] = Field(None, example=1)

class UsuarioCreate(UsuarioBase):
    Contraseña: str = Field(..., example="12345")

class UsuarioUpdate(BaseModel):
    Rol: Optional[RolUsuarioEnum] = None
    ID_Grupo: Optional[int] = None
    Contraseña: Optional[str] = None

class Usuario(UsuarioBase):
    grupo: Optional[Grupo] = None

    class Config:
        from_attributes = True

# --- Schemas para Autenticación con Tokens ---
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None
    # Podríamos añadir roles u otros datos aquí si fuera necesario en el payload del token

# --- Schemas para Actualización (PUT) ---
class GrupoUpdate(BaseModel):
    Nombre: Optional[str] = Field(None, example="Grupo de Investigación 1")
    Descripcion: Optional[str] = Field(None, example="Grupo especializado en investigaciones de tráfico")