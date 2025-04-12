from pydantic import BaseModel, Field, validator
from typing import Optional, List
import datetime
import enum # Importar enum

# Importar el Enum definido en models.py (o redefinirlo aquí)
# Si lo importas, asegúrate de que no cause importación circular
# Redefinirlo puede ser más seguro si la estructura es simple:
class EstadoCasoEnum(str, enum.Enum):
    NUEVO = "Nuevo"
    ESPERANDO_ARCHIVOS = "Esperando Archivos"
    EN_ANALISIS = "En Análisis"
    PENDIENTE_INFORME = "Pendiente Informe"
    CERRADO = "Cerrado"

# --- Schemas Base ---
class CasoBase(BaseModel):
    Nombre_del_Caso: str = Field(..., example="Robo Banco Central")
    Año: int = Field(..., example=2024)
    NIV: Optional[str] = Field(None, example="ABC123XYZ789DEF", max_length=50) # Añadir max_length si se usa String(50) en el modelo
    Descripcion: Optional[str] = Field(None, example="Investigación sobre el robo ocurrido el...")
    Estado: Optional[EstadoCasoEnum] = Field(default=EstadoCasoEnum.NUEVO, example=EstadoCasoEnum.NUEVO) # Añadir Estado, default Nuevo

class ArchivoExcelBase(BaseModel):
    Nombre_del_Archivo: str = Field(..., example="camaras_entrada_sur.xlsx")
    Tipo_de_Archivo: str = Field(..., example="LPR", pattern="^(GPS|LPR)$")

class LecturaBase(BaseModel):
    Matricula: str = Field(..., example="1234ABC")
    Fecha_y_Hora: datetime.datetime = Field(..., example="2023-10-27T10:30:00")
    Carril: Optional[str] = Field(None, example="1")
    Velocidad: Optional[float] = Field(None, example=85.5)
    ID_Lector: Optional[str] = Field(None, example="CAM001")
    Coordenada_X: Optional[float] = Field(None, example=-3.703790)
    Coordenada_Y: Optional[float] = Field(None, example=40.416775)
    Tipo_Fuente: str = Field(..., example="LPR", pattern="^(GPS|LPR)$")

class LectorBase(BaseModel):
    ID_Lector: str = Field(..., example="CAM001")
    Coordenada_X: float = Field(..., example=-3.703790)
    Coordenada_Y: float = Field(..., example=40.416775)
    Sentido_de_la_Marcha: Optional[str] = Field(None, example="Norte")
    Organismo: Optional[str] = Field(None, example="Ayuntamiento")

class VehiculoBase(BaseModel):
    Matricula: str = Field(..., example="1234ABC")
    Marca: Optional[str] = Field(None, example="Seat")
    Año: Optional[int] = Field(None, example=2020)
    Propietario: Optional[str] = Field(None, example="Juan Pérez")
    Alquiler: Optional[str] = Field(None, example="No", pattern="^(Si|No)$")
    Operaciones: Optional[str] = Field(None, example="Seguimiento activo")

# --- Schemas para Creación (POST) ---
class CasoCreate(CasoBase):
    pass # Hereda los campos necesarios

class ArchivoExcelCreate(ArchivoExcelBase):
    ID_Caso: int

class LecturaCreate(LecturaBase):
    ID_Archivo: int

class LectorCreate(LectorBase):
    pass

class VehiculoCreate(VehiculoBase):
    pass

# --- Schemas para Actualización (PUT) ---
class LectorUpdate(BaseModel):
    Coordenada_X: Optional[float] = None
    Coordenada_Y: Optional[float] = None
    Sentido_de_la_Marcha: Optional[str] = None
    Organismo: Optional[str] = None

class VehiculoUpdate(BaseModel):
    Marca: Optional[str] = None
    Año: Optional[int] = None
    Propietario: Optional[str] = None
    Alquiler: Optional[str] = Field(None, pattern="^(Si|No)$")
    Operaciones: Optional[str] = None

# --- Schemas para Actualización (PUT/PATCH) ---
# Nuevo schema para actualizar solo el estado
class CasoEstadoUpdate(BaseModel):
    Estado: EstadoCasoEnum = Field(..., example=EstadoCasoEnum.EN_ANALISIS)

# --- Schemas para Lectura (GET) ---
class Caso(CasoBase):
    ID_Caso: int
    Fecha_de_Creacion: datetime.date
    # archivos: List['ArchivoExcel'] = []

    class Config:
        from_attributes = True # Reemplaza orm_mode en Pydantic v2

class ArchivoExcel(ArchivoExcelBase):
    ID_Archivo: int
    ID_Caso: int
    Fecha_de_Importacion: datetime.date
    # lecturas: List['Lectura'] = []

    class Config:
        from_attributes = True

class Lectura(LecturaBase):
    ID_Lectura: int
    ID_Archivo: int

    class Config:
        from_attributes = True

class Lector(LectorBase):
    # lecturas: List[Lectura] = []
    class Config:
        from_attributes = True

class Vehiculo(VehiculoBase):
    Fecha_Añadido: datetime.date

    class Config:
        from_attributes = True

# Caso.update_forward_refs()
# ArchivoExcel.update_forward_refs()
# Lector.update_forward_refs() 