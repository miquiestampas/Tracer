from sqlalchemy import create_engine, Column, Integer, String, Text, Date, DateTime, Float, ForeignKey, CheckConstraint, Index, Enum as SQLAlchemyEnum, Boolean, JSON
from sqlalchemy.orm import relationship, declarative_base, Session
from sqlalchemy.sql import func
import datetime
import enum # Importar enum
from database import engine # Importar engine desde database.py

# Definir el Enum para los estados del caso
class EstadoCasoEnum(enum.Enum):
    NUEVO = "Nuevo"
    ESPERANDO_ARCHIVOS = "Esperando Archivos"
    EN_ANALISIS = "En Análisis"
    PENDIENTE_INFORME = "Pendiente Informe"
    CERRADO = "Cerrado"

Base = declarative_base()

class Caso(Base):
    __tablename__ = "Casos"
    ID_Caso = Column(Integer, primary_key=True, index=True, autoincrement=True)
    Nombre_del_Caso = Column(Text, unique=True, nullable=False, index=True)
    Año = Column(Integer, nullable=False) # Obligatorio
    NIV = Column(String(50), nullable=True) # Opcional, String con longitud por si acaso
    Descripcion = Column(Text)
    Fecha_de_Creacion = Column(Date, nullable=False, default=datetime.date.today)
    Estado = Column(String(50), default=EstadoCasoEnum.NUEVO.value, nullable=False, index=True)

    archivos = relationship("ArchivoExcel", back_populates="caso", cascade="all, delete-orphan")
    saved_searches = relationship("SavedSearch", back_populates="caso", cascade="all, delete-orphan")

class ArchivoExcel(Base):
    __tablename__ = "ArchivosExcel"
    ID_Archivo = Column(Integer, primary_key=True, index=True, autoincrement=True)
    ID_Caso = Column(Integer, ForeignKey("Casos.ID_Caso"), nullable=False)
    Nombre_del_Archivo = Column(Text, nullable=False)
    Tipo_de_Archivo = Column(Text, CheckConstraint("Tipo_de_Archivo IN ('GPS', 'LPR')"), nullable=False)
    Fecha_de_Importacion = Column(Date, nullable=False, default=datetime.date.today)

    caso = relationship("Caso", back_populates="archivos")
    lecturas = relationship("Lectura", back_populates="archivo", cascade="all, delete-orphan")

class Lector(Base):
    __tablename__ = 'lector'

    ID_Lector = Column(String(50), primary_key=True, index=True)
    Nombre = Column(String(100), nullable=True)
    Carretera = Column(String(100), nullable=True)
    Provincia = Column(String(50), nullable=True)
    Localidad = Column(String(100), nullable=True)
    Sentido = Column(String(50), nullable=True) # Ej: "Creciente", "Decreciente", "Norte", "Sur"
    Orientacion = Column(String(100), nullable=True) # Ej: "Hacia Madrid", "90 grados"
    Organismo_Regulador = Column(String(100), nullable=True, index=True)
    Contacto = Column(String(255), nullable=True)
    Coordenada_X = Column(Float, nullable=True) # Longitud
    Coordenada_Y = Column(Float, nullable=True) # Latitud
    Texto_Libre = Column(Text, nullable=True)
    Imagen_Path = Column(String(255), nullable=True) # Ruta a una imagen asociada
    
    # Relación con Lectura: Un lector puede tener muchas lecturas
    lecturas = relationship("Lectura", back_populates="lector")

class Lectura(Base):
    __tablename__ = 'lectura'

    ID_Lectura = Column(Integer, primary_key=True, index=True)
    ID_Archivo = Column(Integer, ForeignKey('ArchivosExcel.ID_Archivo'), nullable=False)
    Matricula = Column(String(20), index=True, nullable=False)
    Fecha_y_Hora = Column(DateTime, index=True, nullable=False)
    Carril = Column(String(50), nullable=True)
    Velocidad = Column(Float, nullable=True)
    # Asegurar que ForeignKey coincide con el tipo y longitud de Lector.ID_Lector
    ID_Lector = Column(String(50), ForeignKey('lector.ID_Lector'), nullable=True, index=True) 
    Coordenada_X = Column(Float, nullable=True)
    Coordenada_Y = Column(Float, nullable=True)
    Tipo_Fuente = Column(String(10), nullable=False) # 'LPR' o 'GPS'

    # Relación con ArchivoExcel
    archivo = relationship("ArchivoExcel", back_populates="lecturas")
    # Relación con Lector
    lector = relationship("Lector", back_populates="lecturas")
    # Relación con LecturaRelevante (uno a uno o cero)
    relevancia = relationship("LecturaRelevante", back_populates="lectura", uselist=False, cascade="all, delete-orphan")

# Nueva tabla para lecturas relevantes
class LecturaRelevante(Base):
    __tablename__ = "LecturasRelevantes"
    ID_Relevante = Column(Integer, primary_key=True, index=True, autoincrement=True)
    ID_Lectura = Column(Integer, ForeignKey("lectura.ID_Lectura"), unique=True, nullable=False)
    Fecha_Marcada = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)
    Nota = Column(Text, nullable=True)

    # Relación inversa
    lectura = relationship("Lectura", back_populates="relevancia")

class Vehiculo(Base):
    __tablename__ = "Vehiculos"
    Matricula = Column(Text, primary_key=True, index=True, nullable=False)
    Marca = Column(Text)
    Año = Column(Integer)
    Propietario = Column(Text)
    Alquiler = Column(Text, CheckConstraint("Alquiler IN ('Si', 'No')"))
    Operaciones = Column(Text, nullable=True) # Cambiado a Text por si es largo
    Fecha_Añadido = Column(Date, nullable=False, default=datetime.date.today)

# Nueva Tabla para Búsquedas Guardadas
class SavedSearch(Base):
    __tablename__ = "saved_searches"

    id = Column(Integer, primary_key=True, index=True)
    caso_id = Column(Integer, ForeignKey("Casos.ID_Caso", ondelete="CASCADE"), nullable=False, index=True)
    nombre = Column(String(150), nullable=False)
    # Usar JSON o JSONB si es PostgreSQL
    filtros = Column(JSON, nullable=False) 
    color = Column(String(7), nullable=True) # Para código hexadecimal #RRGGBB
    notas = Column(Text, nullable=True)
    result_count = Column(Integer, nullable=True) 
    unique_plates = Column(JSON, nullable=True) # Guardar matrículas como array JSON

    caso = relationship("Caso", back_populates="saved_searches")

# Función para crear las tablas (la llamaremos desde main.py)
def create_db_and_tables():
    Base.metadata.create_all(bind=engine) 