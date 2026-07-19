import apiService from './apiService';

const monitoringService = {
  /**
   * Start monitoring camera(s) - supports single or dual camera setup
   * @param {string} sessionId - Exam session ID
   * @param {string|null} cameraSource - Front camera source (device index or RTSP URL)
   * @param {string|null} backCameraSource - Back camera source (device index or RTSP URL, optional)
   * @param {string} cameraMode - 'laptop' or 'external'
   */
  async startMonitoring(sessionId, cameraSource = null, cameraMode = 'laptop', backCameraSource = null) {
    try {
      const payload = {
        session_id: sessionId,
      };

      if (cameraSource && String(cameraSource).trim()) {
        payload.camera_source = String(cameraSource).trim();
        payload.front_camera_source = String(cameraSource).trim();
      }

      if (backCameraSource && String(backCameraSource).trim()) {
        payload.back_camera_source = String(backCameraSource).trim();
      }

      if (cameraMode && String(cameraMode).trim()) {
        payload.camera_mode = String(cameraMode).trim().toLowerCase();
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
