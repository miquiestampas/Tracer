import React from 'react';
import { ActionIcon, Tooltip } from '@mantine/core';
import { IconHelpCircle } from '@tabler/icons-react';

interface HelpButtonProps {
    label: React.ReactNode;
    tooltip: string;
    'aria-label': string;
}

function HelpButton({ label, tooltip, 'aria-label': ariaLabel }: HelpButtonProps) {
    return (
        <Tooltip
            label={label}
            multiline
            withArrow
            position="bottom-start"
            offset={8}
            styles={{ tooltip: { maxWidth: '400px' } }}
            zIndex={1001}
        >
            <ActionIcon
                variant="subtle"
                color="blue"
                size="lg"
                aria-label={ariaLabel}
                style={{ position: 'absolute', top: '-35px', right: 0, zIndex: 10 }}
            >
                <IconHelpCircle size="1.8rem" stroke={1.5} />
            </ActionIcon>
        </Tooltip>
    );
}

export default HelpButton; 