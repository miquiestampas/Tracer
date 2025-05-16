from sqlalchemy import create_engine, event, NullPool
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Define la URL de la base de datos (archivo SQLite en la raíz)
DATABASE_URL = "sqlite:///./tracer.db"

# Crea la clase base para los modelos
Base = declarative_base()

# Configuración mejorada del motor con optimizaciones para SQLite
engine = create_engine(
    DATABASE_URL,
    connect_args={
        "check_same_thread": False,  # Necesario para SQLite con FastAPI/async
        "timeout": 30  # Aumentar timeout para operaciones largas
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
    # Permite a SQLite usar más memoria para operaciones
    cursor.execute("PRAGMA cache_size=-50000")  # 50MB de cache
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