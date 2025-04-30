import React from 'react';
import { Container, Title, Tabs, rem } from '@mantine/core';
import { IconSearch, IconAnalyze, IconStar } from '@tabler/icons-react';
// Importar el panel reutilizable
import AnalisisLecturasPanel from '../components/analisis/AnalisisLecturasPanel';

// Eliminar imports que ya no se usan aquí (estados, DataTable, etc.)
// import { useState, useEffect } from 'react';
// import { Stack, Grid, Button, TextInput, Box, NumberInput, LoadingOverlay } from '@mantine/core';
// ... otros imports no necesarios ...

// Eliminar interfaces (se usan en el panel)
// interface Lector { ... }
// interface Lectura { ... }
// type SelectOption = { ... };

function AnalisisPage() {
    const iconStyle = { width: rem(16), height: rem(16) };

    // Eliminar todos los estados (filtros, listas, resultados, loading, etc.)
    // const [fechaInicio, ...] = useState(...);
    // ...

    // Eliminar useEffect para cargar datos iniciales
    // useEffect(() => { ... }, []);

    // Eliminar handleSearch
    // const handleSearch = async () => { ... };

    // Eliminar useMemo para datos ordenados/paginados
    // const sortedAndPaginatedResults = React.useMemo(() => { ... }, ...);

    return (
        <Container fluid>
            {/* Mantener el título de la página y las pestañas si queremos otras funcionalidades aquí */}
            <Title order={2} mb="lg">Análisis Multi-Caso / Global</Title> 

            <Tabs defaultValue="busquedaGeneral">
                <Tabs.List>
                    {/* Renombrar o ajustar pestañas según necesidad */}
                    <Tabs.Tab value="busquedaGeneral" leftSection={<IconSearch style={iconStyle} />}>
                        Búsqueda Multi-Caso
                    </Tabs.Tab>
                    {/* Podríamos añadir otras pestañas para análisis globales diferentes */}
                    {/* <Tabs.Tab value="estadisticasGlobales" leftSection={<IconAnalyze style={iconStyle} />}>
                        Estadísticas Globales
                    </Tabs.Tab> */}
                </Tabs.List>

                {/* Renderizar el panel reutilizable en la pestaña principal */}
                <Tabs.Panel value="busquedaGeneral" pt="lg">
                    <AnalisisLecturasPanel 
                        permitirSeleccionCaso={true} // Permitir seleccionar casos
                        mostrarTitulo={true} // Mostrar títulos internos
                        interactedMatriculas={new Set()}
                        addInteractedMatricula={() => {}}
                        // No pasar casoIdFijo
                    />
                </Tabs.Panel>

                {/* <Tabs.Panel value="estadisticasGlobales" pt="lg">
                    Contenido de Estadísticas Globales...
                </Tabs.Panel> */}
            </Tabs>
        </Container>
    );
}

export default AnalisisPage; 