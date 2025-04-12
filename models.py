from sqlalchemy import create_engine, Column, Integer, String, Text, Date, DateTime, Float, ForeignKey, CheckConstraint, Index, Enum as SQLAlchemyEnum
from sqlalchemy.orm import relationship, declarative_base
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
    Estado = Column(SQLAlchemyEnum(EstadoCasoEnum), default=EstadoCasoEnum.NUEVO, nullable=False, index=True)

    archivos = relationship("ArchivoExcel", back_populates="caso", cascade="all, delete-orphan")

class ArchivoExcel(Base):
    __tablename__ = "ArchivosExcel"
    ID_Archivo = Column(Integer, primary_key=True, index=True, autoincrement=True)
    ID_Caso = Column(Integer, ForeignKey("Casos.ID_Caso"), nullable=False)
    Nombre_del_Archivo = Column(Text, nullable=False)
    Tipo_de_Archivo = Column(Text, CheckConstraint("Tipo_de_Archivo IN ('GPS', 'LPR')"), nullable=False)
    Fecha_de_Importacion = Column(Date, nullable=False, default=datetime.date.today)

    caso = relationship("Caso", back_populates="archivos")
    lecturas = relationship("Lectura", back_populates="archivo")

class Lector(Base):
    __tablename__ = "Lectores"
    ID_Lector = Column(Text, primary_key=True, index=True, nullable=False)
    Coordenada_X = Column(Float, nullable=False)
    Coordenada_Y = Column(Float, nullable=False)
    Sentido_de_la_Marcha = Column(Text)
    Organismo = Column(Text)

    lecturas = relationship("Lectura", back_populates="lector")

class Lectura(Base):
    __tablename__ = "Lecturas"
    __table_args__ = (Index("ix_lecturas_matricula", "Matricula"), )

    ID_Lectura = Column(Integer, primary_key=True, index=True, autoincrement=True)
    ID_Archivo = Column(Integer, ForeignKey("ArchivosExcel.ID_Archivo"), nullable=False)
    Matricula = Column(Text, nullable=False)
    Fecha_y_Hora = Column(DateTime, nullable=False, index=True)
    Carril = Column(Text)
    Velocidad = Column(Float)
    ID_Lector = Column(String, ForeignKey("Lectores.ID_Lector"), nullable=True)
    Coordenada_X = Column(Float, nullable=True)
    Coordenada_Y = Column(Float, nullable=True)
    Tipo_Fuente = Column(String, nullable=False, index=True)

    archivo = relationship("ArchivoExcel", back_populates="lecturas")
    lector = relationship("Lector", back_populates="lecturas")

class Vehiculo(Base):
    __tablename__ = "Vehiculos"
    Matricula = Column(Text, primary_key=True, index=True, nullable=False)
    Marca = Column(Text)
    Año = Column(Integer)
    Propietario = Column(Text)
    Alquiler = Column(Text, CheckConstraint("Alquiler IN ('Si', 'No')"))
    Operaciones = Column(Text)
    Fecha_Añadido = Column(Date, nullable=False, default=datetime.date.today)

# Función para crear las tablas (la llamaremos desde main.py)
def create_db_and_tables():
    Base.metadata.create_all(bind=engine) 