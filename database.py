from sqlalchemy import create_engine, event, NullPool
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import psutil
import logging

# Define la URL de la base de datos (archivo SQLite en la raíz)
DATABASE_URL = "sqlite:///./tracer.db"

# Crea la clase base para los modelos
Base = declarative_base()

# --- Cálculo único de caché y memoria al arrancar el módulo ---
def _calcular_cache_y_log():
    try:
        total_memory = psutil.virtual_memory().total
        memory_mb = (total_memory / (1024 * 1024)) * 0.35
        memory_mb = max(250, min(memory_mb, 8192))
        cache_size = int(-(memory_mb * 1024))
        logging.info(f"Memoria total del sistema: {total_memory / (1024*1024*1024):.2f}GB")
        logging.info(f"Tamaño de caché configurado: {abs(cache_size/1024):.2f}MB")
        return cache_size
    except Exception as e:
        logging.warning(f"Error al detectar memoria del sistema: {e}. Usando valor por defecto de 250MB")
        return -250000

CACHE_SIZE = _calcular_cache_y_log()

# Configuración mejorada del motor con optimizaciones para SQLite
engine = create_engine(
    DATABASE_URL,
    connect_args={
        "check_same_thread": False,  # Necesario para SQLite con FastAPI/async
        "timeout": 60  # Aumentado a 60 segundos para operaciones largas
    },
    poolclass=NullPool,
    # Aumentar el pool_size para permitir más conexiones concurrentes (ya no aplica con NullPool)
    # pool_size=20,
    # max_overflow=40,
    # Habilitar el echo solo en modo debug
    echo=False
)

# Configuración de pragmas para SQLite para mejorar rendimiento
@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute(f"PRAGMA cache_size={CACHE_SIZE}")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA temp_store=MEMORY")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()

# Crea una fábrica de sesiones con optimizaciones
SessionLocal = sessionmaker(
    autocommit=False, 
    autoflush=False, 
    bind=engine,
    # Habilitar estas opciones solo si tienes muchas consultas concurrentes
    expire_on_commit=False  # Mejora rendimiento en aplicaciones con muchas sesiones
)

# Función para obtener una sesión de base de datos (dependencia de FastAPI)
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close() 