"""Make ID_Grupo nullable in usuarios

Revision ID: 5886f9c69def
Revises: efd3af6359bc
Create Date: 2024-05-13

"""
from alembic import op
import sqlalchemy as sa

revision = '5886f9c69def'
down_revision = 'efd3af6359bc'
branch_labels = None
depends_on = None

def upgrade():
    conn = op.get_bind()
    if conn.dialect.name == "sqlite":
        # 1. Rename old table
        op.execute("ALTER TABLE usuarios RENAME TO usuarios_old;")
        # 2. Create new table with ID_Grupo nullable
        op.create_table(
            'usuarios',
            sa.Column('User', sa.Integer(), primary_key=True, autoincrement=False),
            sa.Column('Contraseña', sa.String(length=128), nullable=False),
            sa.Column('Rol', sa.Enum('superadmin', 'admin_casos', name='rolusuarioenum'), nullable=False),
            sa.Column('ID_Grupo', sa.Integer(), nullable=True),
        )
        # 3. Copy data
        op.execute("""
            INSERT INTO usuarios (User, Contraseña, Rol, ID_Grupo)
            SELECT User, Contraseña, Rol, ID_Grupo FROM usuarios_old;
        """)
        # 4. Drop old table
        op.execute("DROP TABLE usuarios_old;")
    else:
        op.alter_column('usuarios', 'ID_Grupo',
            existing_type=sa.Integer(),
            nullable=True
        )

def downgrade():
    conn = op.get_bind()
    if conn.dialect.name == "sqlite":
        # 1. Rename current table
        op.execute("ALTER TABLE usuarios RENAME TO usuarios_new;")
        # 2. Create old table with ID_Grupo NOT NULL
        op.create_table(
            'usuarios',
            sa.Column('User', sa.Integer(), primary_key=True, autoincrement=False),
            sa.Column('Contraseña', sa.String(length=128), nullable=False),
            sa.Column('Rol', sa.Enum('superadmin', 'admin_casos', name='rolusuarioenum'), nullable=False),
            sa.Column('ID_Grupo', sa.Integer(), nullable=False),
        )
        # 3. Copy data (set ID_Grupo=1 for NULLs, adjust as needed)
        op.execute("""
            INSERT INTO usuarios (User, Contraseña, Rol, ID_Grupo)
            SELECT User, Contraseña, Rol, COALESCE(ID_Grupo, 1) FROM usuarios_new;
        """)
        # 4. Drop new table
        op.execute("DROP TABLE usuarios_new;")
    else:
        op.alter_column('usuarios', 'ID_Grupo',
            existing_type=sa.Integer(),
            nullable=False
        )
