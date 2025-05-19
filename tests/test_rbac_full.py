import pytest
import httpx
import asyncio

API_URL = "http://localhost:8000"
SUPERADMIN_USER = "117020"
SUPERADMIN_PASS = "0902"

# Datos de prueba (User debe ser int)
USUARIOS = [
    {"User": 20001, "Contraseña": "testpass123", "Rol": "admingrupo", "ID_Grupo": None},
    {"User": 20002, "Contraseña": "testpass123", "Rol": "admingrupo", "ID_Grupo": None},
    {"User": 20003, "Contraseña": "testpass123", "Rol": "user_consulta", "ID_Grupo": None},
    {"User": 20004, "Contraseña": "testpass123", "Rol": "user_consulta", "ID_Grupo": None},
]
GRUPOS = [
    {"Nombre": "GrupoTestA", "Descripcion": "Grupo de prueba A"},
    {"Nombre": "GrupoTestB", "Descripcion": "Grupo de prueba B"},
]

@pytest.mark.asyncio
async def test_rbac_full():
    async with httpx.AsyncClient(base_url=API_URL) as client:
        # 1. Login superadmin
        token_superadmin = await login(client, SUPERADMIN_USER, SUPERADMIN_PASS)
        headers_superadmin = {"Authorization": f"Bearer {token_superadmin}"}

        # 2. Crear grupos de prueba
        grupo_ids = []
        for grupo in GRUPOS:
            gid = await ensure_grupo(client, grupo, headers_superadmin)
            grupo_ids.append(gid)
        # Asignar ID_Grupo a usuarios
        USUARIOS[0]["ID_Grupo"] = grupo_ids[0]  # admingrupoA
        USUARIOS[1]["ID_Grupo"] = grupo_ids[1]  # admingrupoB
        USUARIOS[2]["ID_Grupo"] = grupo_ids[0]  # consultaA
        USUARIOS[3]["ID_Grupo"] = grupo_ids[1]  # consultaB

        # 3. Crear usuarios de prueba
        user_ids = {}
        for u in USUARIOS:
            uid = await ensure_usuario(client, u, headers_superadmin)
            user_ids[u["User"]] = uid

        # 4. Login con cada usuario
        tokens = {}
        for u in USUARIOS:
            tokens[u["User"]] = await login(client, u["User"], u["Contraseña"])

        # 5. Crear casos de prueba (uno por grupo)
        casos = []
        for i, gid in enumerate(grupo_ids):
            caso = {
                "Nombre_del_Caso": f"CasoTest{chr(65+i)}",
                "Año": 2024,
                "Descripcion": f"Caso de prueba {chr(65+i)}",
                "ID_Grupo": gid
            }
            resp = await client.post("/casos", json=caso, headers=headers_superadmin)
            assert resp.status_code == 201, f"No se pudo crear caso: {resp.text}"
            casos.append(resp.json())

        # 7. Pruebas de acceso y filtrado para cada rol
        # Ejemplo: admingrupoA solo ve casos de su grupo
        await check_casos_filtrado(client, tokens[20001], grupo_ids[0], casos)
        await check_casos_filtrado(client, tokens[20002], grupo_ids[1], casos)
        await check_casos_filtrado(client, tokens[20003], grupo_ids[0], casos)
        await check_casos_filtrado(client, tokens[20004], grupo_ids[1], casos)
        # Superadmin ve todos
        await check_casos_superadmin(client, token_superadmin, casos)

        # 8. Pruebas de permisos (crear, editar, borrar)
        await check_permisos(client, tokens, token_superadmin, casos, grupo_ids)

        # 9. Limpieza: borrar casos, usuarios, grupos
        await cleanup(client, token_superadmin, casos, user_ids, grupo_ids)

        print("\n\033[92mRBAC TESTS COMPLETOS Y EXITOSOS\033[0m\n")

# --- Helpers ---
async def login(client, user, password):
    resp = await client.post("/api/auth/token", data={"username": user, "password": password})
    assert resp.status_code == 200, f"Login fallido para {user}: {resp.text}"
    return resp.json()["access_token"]

async def ensure_grupo(client, grupo, headers):
    resp = await client.get("/api/grupos", headers=headers)
    assert resp.status_code == 200, f"No se pudo listar grupos: {resp.text}"
    for g in resp.json():
        if g["Nombre"] == grupo["Nombre"]:
            return g["ID_Grupo"]
    # Crear si no existe
    resp = await client.post("/api/grupos", json=grupo, headers=headers)
    assert resp.status_code in (200, 201), f"No se pudo crear grupo: {resp.text}"
    return resp.json()["ID_Grupo"]

async def ensure_usuario(client, usuario, headers):
    resp = await client.get("/api/usuarios", headers=headers)
    assert resp.status_code == 200, f"No se pudo listar usuarios: {resp.text}"
    for u in resp.json():
        if int(u["User"]) == int(usuario["User"]):
            return u["User"]
    # Crear si no existe
    resp = await client.post("/api/usuarios", json=usuario, headers=headers)
    assert resp.status_code in (200, 201), f"No se pudo crear usuario: {resp.text}"
    return resp.json()["User"]

async def check_casos_filtrado(client, token, id_grupo, casos):
    headers = {"Authorization": f"Bearer {token}"}
    resp = await client.get("/casos", headers=headers)
    assert resp.status_code == 200, f"No se pudo listar casos para grupo {id_grupo}: {resp.text}"
    casos_vistos = resp.json()
    for caso in casos_vistos:
        assert caso["ID_Grupo"] == id_grupo, f"Caso {caso['ID_Caso']} visible fuera de su grupo"

async def check_casos_superadmin(client, token, casos):
    headers = {"Authorization": f"Bearer {token}"}
    resp = await client.get("/casos", headers=headers)
    assert resp.status_code == 200, f"Superadmin no pudo listar casos: {resp.text}"
    ids = {c["ID_Caso"] for c in casos}
    ids_vistos = {c["ID_Caso"] for c in resp.json()}
    assert ids.issubset(ids_vistos), "Superadmin no ve todos los casos"

async def check_permisos(client, tokens_usuarios, token_superadmin_directo, casos, grupo_ids):
    # Ejemplo: consultaA no puede crear casos
    headers_consulta_A = {"Authorization": f"Bearer {tokens_usuarios[20003]}"}
    caso_payload_no_permitido = {
        "Nombre_del_Caso": "CasoNoPermitidoPorConsulta",
        "Año": 2025,
        "Descripcion": "Consulta no debería poder crear este caso",
        "ID_Grupo": grupo_ids[0]
    }
    resp_consulta_crea = await client.post("/casos", json=caso_payload_no_permitido, headers=headers_consulta_A)
    assert resp_consulta_crea.status_code in (401, 403), f"user_consulta pudo crear caso (status: {resp_consulta_crea.status_code}, resp: {resp_consulta_crea.text})"

    # admingrupoA puede crear caso en su grupo
    headers_admingrupo_A = {"Authorization": f"Bearer {tokens_usuarios[20001]}"}
    caso_payload_permitido_admingrupo = {
        "Nombre_del_Caso": "CasoPermitidoPorAdminGrupoA",
        "Año": 2025,
        "Descripcion": "AdminGrupoA crea este caso en su grupo",
        "ID_Grupo": grupo_ids[0]
    }
    resp_admingrupo_crea = await client.post("/casos", json=caso_payload_permitido_admingrupo, headers=headers_admingrupo_A)
    assert resp_admingrupo_crea.status_code == 201, f"admingrupoA no pudo crear caso en su grupo (status: {resp_admingrupo_crea.status_code}, resp: {resp_admingrupo_crea.text})"
    id_caso_creado_admingrupoA = resp_admingrupo_crea.json()["ID_Caso"]

    # admingrupoA no puede borrar caso de otro grupo
    id_caso_otro_grupo = next((c["ID_Caso"] for c in casos if c["ID_Grupo"] == grupo_ids[1]), None)
    assert id_caso_otro_grupo is not None, "No se encontró un caso del grupo B para la prueba de borrado no permitido"
    resp_admingrupo_borra_otro = await client.delete(f"/casos/{id_caso_otro_grupo}", headers=headers_admingrupo_A)
    assert resp_admingrupo_borra_otro.status_code in (401, 403), f"admingrupoA pudo borrar caso de otro grupo (status: {resp_admingrupo_borra_otro.status_code}, resp: {resp_admingrupo_borra_otro.text})"

    # Superadmin puede borrar cualquier caso
    headers_superadmin_directo = {"Authorization": f"Bearer {token_superadmin_directo}"}
    resp_superadmin_borra = await client.delete(f"/casos/{id_caso_creado_admingrupoA}", headers=headers_superadmin_directo)
    assert resp_superadmin_borra.status_code == 204, f"Superadmin no pudo borrar el caso creado por admingrupoA (status: {resp_superadmin_borra.status_code}, resp: {resp_superadmin_borra.text})"

async def cleanup(client, token_superadmin, casos, user_ids, grupo_ids):
    headers = {"Authorization": f"Bearer {token_superadmin}"}
    # Borrar casos
    for caso in casos:
        await client.delete(f"/casos/{caso['ID_Caso']}", headers=headers)
    # Borrar usuarios
    for uid_key in user_ids:
        uid = user_ids[uid_key]
        if str(uid) != SUPERADMIN_USER:
            await client.delete(f"/api/usuarios/{uid}", headers=headers)
    # Borrar grupos
    for gid in grupo_ids:
        await client.delete(f"/api/grupos/{gid}", headers=headers) 