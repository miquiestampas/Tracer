import React from 'react';
import { Container, Title, Tabs, rem, Text } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';

function AnalisisPage() {
    const iconStyle = { width: rem(16), height: rem(16) };

    return (
        <Container fluid>
            <Title order={2} mb="lg">Análisis Multi-Caso / Global</Title> 

            <Tabs defaultValue="busquedaGeneral">
                <Tabs.List>
                    <Tabs.Tab value="busquedaGeneral" leftSection={<IconSearch style={iconStyle} />}>
                        Búsqueda Multi-Caso
                    </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="busquedaGeneral" pt="lg">
                    <Text>Nueva funcionalidad en desarrollo</Text>
                </Tabs.Panel>
            </Tabs>
        </Container>
    );
}

export default AnalisisPage; 