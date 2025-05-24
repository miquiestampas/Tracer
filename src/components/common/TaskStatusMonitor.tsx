import React, { useEffect, useState } from 'react';
import { Box, Progress, Text, Alert, Group, Stack } from '@mantine/core';
import { IconAlertCircle, IconCheck, IconX, IconFileSpreadsheet, IconLoader } from '@tabler/icons-react';
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
    pollingInterval = 2000
}) => {
    const [status, setStatus] = useState<TaskStatus | null>(null);
    const [error, setError] = useState<string | null>(null);

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
    }, [taskId, pollingInterval, onComplete, onError]);

    if (!status) {
        return <Text size="sm">Cargando estado...</Text>;
    }

    // Determinar el estado de cada paso
    const currentStageIndex = STAGES.findIndex(s => s.key === status.stage);
    const isFailed = status.status === 'failed';
    const isCompleted = status.status === 'completed';

    return (
        <Stack gap="xs">
            {STAGES.map((stage, idx) => {
                let icon = <IconLoader size={18} color="#aaa" style={{ animation: 'spin 1s linear infinite' }} />;
                let color = 'gray';
                let text = stage.label;
                let showProgress = false;
                let showError = false;
                let progressValue: number = 0;
                let extra: React.ReactNode = null;

                if (isCompleted || idx < currentStageIndex) {
                    icon = <IconCheck size={18} color="green" />;
                    color = 'green';
                } else if (isFailed && idx === currentStageIndex) {
                    icon = <IconX size={18} color="red" />;
                    color = 'red';
                    showError = true;
                } else if (idx === currentStageIndex) {
                    icon = <IconLoader size={18} color="#228be6" style={{ animation: 'spin 1s linear infinite' }} />;
                    color = 'blue';
                    if (stage.key === 'processing' || stage.key === 'preparing_data') {
                        showProgress = true;
                        progressValue = typeof status.progress === 'number' ? status.progress : 0;
                        extra = status.total ? (
                            <Text size="xs" c="dimmed">{Math.round(status.progress)}% ({status.total} registros)</Text>
                        ) : (
                            <Text size="xs" c="dimmed">{Math.round(status.progress)}%</Text>
                        );
                    }
                }

                return (
                    <Group key={stage.key} align="center" gap="xs" wrap="nowrap">
                        {icon}
                        <Text size="sm" c={color} style={{ minWidth: 220 }}>{text}</Text>
                        {showProgress && (
                            <Progress value={progressValue} size="sm" radius="xl" style={{ flex: 1, minWidth: 120, maxWidth: 200 }} />
                        )}
                        {extra}
                        {showError && error && (
                            <Alert color="red" icon={<IconAlertCircle size={16} />} style={{ marginLeft: 16, flex: 1 }}>
                                {error}
                            </Alert>
                        )}
                    </Group>
                );
            })}
        </Stack>
    );
};

export default TaskStatusMonitor;

// CSS para animar el loader
const style = document.createElement('style');
style.innerHTML = `@keyframes spin { 100% { transform: rotate(360deg); } }`;
document.head.appendChild(style); 