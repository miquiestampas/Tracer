from sqlalchemy import create_engine, event, NullPool
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import psutil
import logging

# Define la URL de la base de datos (archivo SQLite en la raíz)
DATABASE_URL = "sqlite:///./tracer.db"

# Crea la clase base para los modelos
Base = declarative_base()

def get_optimal_cache_size():
    """
    Calcula el tamaño óptimo del caché basado en la memoria disponible del sistema.
    Usa el 35% de la memoria disponible, con un mínimo de 250MB y un máximo de 8GB.
    """
    try:
        # Obtener memoria total del sistema en bytes
        total_memory = psutil.virtual_memory().total
        
        # Convertir a MB y calcular el 35%
        memory_mb = (total_memory / (1024 * 1024)) * 0.35
        
        # Aplicar límites (entre 250MB y 8GB)
        memory_mb = max(250, min(memory_mb, 8192))  # 8GB = 8192MB
        
        # Convertir a kilobytes (valor negativo para SQLite)
        cache_size = int(-(memory_mb * 1024))
        
        logging.info(f"Memoria total del sistema: {total_memory / (1024*1024*1024):.2f}GB")
        logging.info(f"Tamaño de caché configurado: {abs(cache_size/1024):.2f}MB")
        
        return cache_size
    except Exception as e:
        logging.warning(f"Error al detectar memoria del sistema: {e}. Usando valor por defecto de 250MB")
        return -250000  # Valor por defecto de 250MB

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
    # Mejora el rendimiento al reducir las operaciones de I/O
    cursor.execute("PRAGMA journal_mode=WAL")
    # Configura el caché de manera dinámica basado en la memoria disponible
    cursor.execute(f"PRAGMA cache_size={get_optimal_cache_size()}")
    # Asegura la integridad de los datos
    cursor.execute("PRAGMA foreign_keys=ON")
    # Mantiene los índices en memoria para mejorar consultas
    cursor.execute("PRAGMA temp_store=MEMORY")
    # Mejora el rendimiento de las transacciones
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