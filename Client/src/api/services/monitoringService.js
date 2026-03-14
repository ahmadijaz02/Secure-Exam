import apiService from './apiService';

const monitoringService = {
  /**
   * Start monitoring camera
   */
  async startMonitoring(sessionId, qualityPreset = 'ultra_low_latency', cameraSource = null) {
    try {
      const payload = {
        session_id: sessionId,
        quality_preset: qualityPreset,
      };

      if (cameraSource && String(cameraSource).trim()) {
        payload.camera_source = String(cameraSource).trim();
      }

      return await apiService.post('/monitoring/start', payload, { timeout: 60000 });
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
