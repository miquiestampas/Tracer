import React, { useEffect, useState } from 'react';
import { Box, Progress, Text, Alert, Group, Stack, Paper, Transition } from '@mantine/core';
import { IconAlertCircle, IconCheck, IconX, IconFileSpreadsheet, IconLoader, IconX as IconClose } from '@tabler/icons-react';
import apiClient from '../../services/api';

interface TaskStatus {
    status: string;
    message: string;
    progress: number;
    total?: number;
    result?: any;
    stage?: string;
}

interface TaskStatusMonitorProps {
    taskId: string;
    onComplete?: (result: any) => void;
    onError?: (error: string) => void;
    pollingInterval?: number;
    onClose?: () => void;
}

const STAGES = [
    { key: 'reading_file', label: 'Leyendo archivo...' },
    { key: 'parsing_mapping', label: 'Procesando mapeo de columnas...' },
    { key: 'preparing_data', label: 'Creando estructura de datos...' },
    { key: 'processing', label: 'Procesando registros...' },
];

const TaskStatusMonitor: React.FC<TaskStatusMonitorProps> = ({
    taskId,
    onComplete,
    onError,
    pollingInterval = 2000,
    onClose
}) => {
    const [status, setStatus] = useState<TaskStatus | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(true);

    useEffect(() => {
        let isMounted = true;
        let timeoutId: NodeJS.Timeout;

        const checkStatus = async () => {
            try {
                const response = await apiClient.get(`/api/tasks/${taskId}/status`);
                if (!isMounted) return;

                const newStatus = response.data;
                setStatus(newStatus);
                setError(null);

                if (newStatus.status === 'completed') {
                    onComplete?.(newStatus.result);
                    // Auto-close after 3 seconds on completion
                    setTimeout(() => {
                        if (isMounted) {
                            setMounted(false);
                            onClose?.();
                        }
                    }, 3000);
                } else if (newStatus.status === 'failed') {
                    setError(newStatus.message);
                    onError?.(newStatus.message);
                } else {
                    // Continue polling if task is still running
                    timeoutId = setTimeout(checkStatus, pollingInterval);
                }
            } catch (err: any) {
                if (!isMounted) return;
                const errorMessage = err.response?.data?.detail || err.message || 'Error checking task status';
                setError(errorMessage);
                onError?.(errorMessage);
            }
        };

        checkStatus();

        return () => {
            isMounted = false;
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [taskId, pollingInterval, onComplete, onError, onClose]);

    if (!status) {
        return null;
    }

    // Determinar el estado de cada paso
    const currentStageIndex = STAGES.findIndex(s => s.key === status.stage);
    const isFailed = status.status === 'failed';
    const isCompleted = status.status === 'completed';

    return (
        <Transition mounted={mounted} transition="slide-up" duration={400}>
            {(styles) => (
                <Paper
                    shadow="md"
                    p="md"
                    style={{
                        ...styles,
                        position: 'fixed',
                        bottom: 20,
                        right: 20,
                        width: 400,
                        zIndex: 1000,
                        backgroundColor: 'white',
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                    }}
                >
                    <Group justify="space-between" mb="xs">
                        <Text size="sm" fw={500}>Estado de la Importación</Text>
                        <IconClose
                            size={16}
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                                setMounted(false);
                                onClose?.();
                            }}
                        />
                    </Group>
                    <Stack gap="xs">
                        {STAGES.map((stage, idx) => {
                            let icon = <IconLoader size={16} color="#aaa" style={{ animation: 'spin 1s linear infinite' }} />;
                            let color = 'gray';
                            let text = stage.label;
                            let showProgress = false;
                            let showError = false;
                            let progressValue: number = 0;
                            let extra: React.ReactNode = null;

                            if (isCompleted || idx < currentStageIndex) {
                                icon = <IconCheck size={16} color="green" />;
                                color = 'green';
                            } else if (isFailed && idx === currentStageIndex) {
                                icon = <IconX size={16} color="red" />;
                                color = 'red';
                                showError = true;
                            } else if (idx === currentStageIndex) {
                                icon = <IconLoader size={16} color="#228be6" style={{ animation: 'spin 1s linear infinite' }} />;
                                color = 'blue';
                                if (stage.key === 'processing' || stage.key === 'preparing_data') {
                                    showProgress = true;
                                    progressValue = typeof status.progress === 'number' ? status.progress : 0;
                                    extra = status.total ? (
                                        <Text size="xs" c="dimmed">{Math.round(status.progress)}% ({status.total})</Text>
                                    ) : (
                                        <Text size="xs" c="dimmed">{Math.round(status.progress)}%</Text>
                                    );
                                }
                            }

                            return (
                                <Group key={stage.key} align="center" gap="xs" wrap="nowrap">
                                    {icon}
                                    <Text size="xs" c={color} style={{ minWidth: 180 }}>{text}</Text>
                                    {showProgress && (
                                        <Progress value={progressValue} size="xs" radius="xl" style={{ flex: 1, minWidth: 80, maxWidth: 120 }} />
                                    )}
                                    {extra}
                                </Group>
                            );
                        })}
                        {error && (
                            <Alert color="red" icon={<IconAlertCircle size={16} />} mt="xs">
                                {error}
                            </Alert>
                        )}
                    </Stack>
                </Paper>
            )}
        </Transition>
    );
};

export default TaskStatusMonitor;

// CSS para animar el loader
const style = document.createElement('style');
style.innerHTML = `@keyframes spin { 100% { transform: rotate(360deg); } }`;
document.head.appendChild(style); 