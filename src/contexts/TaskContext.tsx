import React, { createContext, useContext, useState, useCallback } from 'react';
import TaskStatusMonitor from '../components/common/TaskStatusMonitor';

interface Task {
    id: string;
    onComplete?: (result: any) => void;
    onError?: (error: string) => void;
}

interface TaskContextType {
    addTask: (task: Task) => void;
    removeTask: (taskId: string) => void;
}

const TaskContext = createContext<TaskContextType | undefined>(undefined);

export const TaskProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [tasks, setTasks] = useState<Task[]>([]);

    const addTask = useCallback((task: Task) => {
        setTasks(prev => [...prev, task]);
    }, []);

    const removeTask = useCallback((taskId: string) => {
        setTasks(prev => prev.filter(task => task.id !== taskId));
    }, []);

    return (
        <TaskContext.Provider value={{ addTask, removeTask }}>
            {children}
            {tasks.map(task => (
                <TaskStatusMonitor
                    key={task.id}
                    taskId={task.id}
                    onComplete={task.onComplete}
                    onError={task.onError}
                    onClose={() => removeTask(task.id)}
                />
            ))}
        </TaskContext.Provider>
    );
};

export const useTask = () => {
    const context = useContext(TaskContext);
    if (context === undefined) {
        throw new Error('useTask must be used within a TaskProvider');
    }
    return context;
}; 