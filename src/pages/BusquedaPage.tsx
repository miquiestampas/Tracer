import React from 'react';
import { Container, Title, Box } from '@mantine/core';
import BusquedaMulticasoPanel from '../components/busqueda/BusquedaMulticasoPanel';

function BusquedaPage() {
  return (
    <Container fluid style={{ paddingLeft: 32, paddingRight: 32 }}>
      <Title order={2} mt="md" mb="lg">Búsqueda Multicaso</Title>
      <Box>
        <BusquedaMulticasoPanel />
      </Box>
    </Container>
  );
}

export default BusquedaPage; 