import axios from 'axios';
import { API_CONFIG } from '../config/apiConfig';

const API_BASE = `${API_CONFIG.BASE_URL}/monitoring`;

const monitoringService = {
  /**
   * Start monitoring camera
   */
  async startMonitoring() {
    try {
      const response = await axios.post(`${API_BASE}/start`, {});
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Stop monitoring
   */
  async stopMonitoring() {
    try {
      const response = await axios.post(`${API_BASE}/stop`, {});
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Get monitoring status
   */
  async getMonitoringStatus() {
    try {
      const response = await axios.get(`${API_BASE}/status`);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};

export default monitoringService;
