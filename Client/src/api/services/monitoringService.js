import apiService from './apiService';

const monitoringService = {
  /**
   * Start monitoring camera
   */
  async startMonitoring(sessionId) {
    try {
      return await apiService.post('/monitoring/start', { session_id: sessionId });
    } catch (error) {
      throw error;
    }
  },

  /**
   * Stop monitoring
   */
  async stopMonitoring() {
    try {
      return await apiService.post('/monitoring/stop', {});
    } catch (error) {
      throw error;
    }
  },

  /**
   * Get monitoring status
   */
  async getMonitoringStatus() {
    try {
      return await apiService.get('/monitoring/status');
    } catch (error) {
      throw error;
    }
  }
};

export default monitoringService;
