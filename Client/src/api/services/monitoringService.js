import apiService from './apiService';

const monitoringService = {
  /**
   * Start monitoring camera
   */
  async startMonitoring(sessionId, qualityPreset = 'amd_optimized') {
    try {
      return await apiService.post('/monitoring/start', {
        session_id: sessionId,
        quality_preset: qualityPreset,
      });
    } catch (error) {
      throw error;
    }
  },

  /**
   * Stop monitoring
   */
  async stopMonitoring(sessionId = null) {
    try {
      const payload = sessionId ? { session_id: sessionId } : {};
      return await apiService.post('/monitoring/stop', payload);
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
