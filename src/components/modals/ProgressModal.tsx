import React from 'react';
import { Modal, Progress, Button, Typography } from 'antd';

const { Text } = Typography;

interface ProgressModalProps {
  open: boolean;
  progress: number;
  onCancel: () => void;
  message?: string;
}

const ProgressModal: React.FC<ProgressModalProps> = ({
  open,
  progress,
  onCancel,
  message
}) => {
  return (
    <Modal
      open={open}
      title="Progreso"
      footer={[
        <Button key="cancel" onClick={onCancel}>
          Detener
        </Button>
      ]}
      closable={false}
      maskClosable={false}
    >
      <div style={{ textAlign: 'center' }}>
        <Progress
          type="circle"
          percent={progress}
          format={(percent) => `${percent}%`}
          style={{ marginBottom: 16 }}
        />
        {message && (
          <Text style={{ display: 'block', marginTop: 16 }}>
            {message}
          </Text>
        )}
      </div>
    </Modal>
  );
};

export default ProgressModal; 