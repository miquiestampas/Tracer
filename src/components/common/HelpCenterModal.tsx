import React, { useState } from 'react';
import { Modal, Accordion, Button, Group } from '@mantine/core';
import helpTexts from '../../help/helpTexts';

const helpSections = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'investigaciones', label: 'Investigaciones (General)' },
  { key: 'archivos', label: 'Archivos Importados' },
  { key: 'analisis-lpr', label: 'Lecturas LPR' },
  { key: 'lanzadera', label: 'Análisis Avanzado' },
  { key: 'lecturas-relevantes', label: 'Lecturas Relevantes' },
  { key: 'vehiculos', label: 'Vehículos' },
  { key: 'mapa', label: 'Mapa' },
  { key: 'mapa-gps', label: 'Mapa GPS' },
  { key: 'datos-gps', label: 'Datos GPS' },
  { key: 'busqueda-multicaso', label: 'Búsqueda Multi-Caso' },
  { key: 'gestion-lectores', label: 'Gestión de Lectores' },
];

interface HelpCenterModalProps {
  opened: boolean;
  onClose: () => void;
}

const HelpCenterModal: React.FC<HelpCenterModalProps> = ({ opened, onClose }) => {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Centro de Ayuda"
      size="xl"
      centered
      overlayProps={{ opacity: 0.55, blur: 2 }}
      styles={{ content: { maxWidth: '1200px', width: '90%' } }}
    >
      <Accordion chevronPosition="left" variant="separated" multiple>
        {helpSections.map(section => (
          <Accordion.Item value={section.key} key={section.key}>
            <Accordion.Control>{section.label}</Accordion.Control>
            <Accordion.Panel>{helpTexts[section.key] as React.ReactNode}</Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
      <Group justify="flex-end" mt="md">
        <Button onClick={onClose} variant="light">Cerrar</Button>
      </Group>
    </Modal>
  );
};

export default HelpCenterModal; 