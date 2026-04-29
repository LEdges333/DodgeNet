import axios from 'axios';

// Список твоих адресов (локальный Flask и, например, будущий сервер в облаке)
const ENDPOINTS = [
  'http://localhost:5000/send',
  'http://192.168.1.50:5000/send', // Пример другого IP в сети
];

export const sendMessage = async (message) => {
  for (let url of ENDPOINTS) {
    try {
      console.log(`Attempting to send via: ${url}`);
      const response = await axios.post(url, { message }, { timeout: 3000 });
      return { success: true, data: response.data, node: url };
    } catch (error) {
      console.warn(`Node ${url} Unavailable, trying next...`);
    }
  }
  throw new Error("All communications channels are blocked");
};