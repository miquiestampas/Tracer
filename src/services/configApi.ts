import api from './api';

export interface FooterConfig {
  text: string;
}

export const getFooterConfig = async (): Promise<FooterConfig> => {
  const response = await api.get('/api/config/footer');
  return response.data;
};

export const updateFooterConfig = async (text: string): Promise<void> => {
  await api.post('/api/config/footer', { text });
}; 