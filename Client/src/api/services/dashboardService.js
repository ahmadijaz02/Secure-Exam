import apiService from './apiService';
import { API_ENDPOINTS } from '../config/apiConfig';

class DashboardService {
  async getStats() {
    try {
      return await apiService.get(API_ENDPOINTS.DASHBOARD.STATS);
    } catch (error) {
      throw error;
    }
  }

  async getRecentActivity(limit = 10) {
    try {
      const url = `${API_ENDPOINTS.DASHBOARD.RECENT_ACTIVITY}?limit=${limit}`;
      return await apiService.get(url);
    } catch (error) {
      throw error;
    }
  }

  async getActiveExams() {
    try {
      return await apiService.get(API_ENDPOINTS.DASHBOARD.ACTIVE_EXAMS);
    } catch (error) {
      throw error;
    }
  }

  async getOverviewData() {
    try {
      const [stats, recentActivity, activeExams] = await Promise.all([
        this.getStats(),
        this.getRecentActivity(),
        this.getActiveExams(),
      ]);

      return {
        stats,
        recentActivity,
        activeExams,
      };
    } catch (error) {
      throw error;
    }
  }

  async getExamStatistics(timeRange = '7d') {
    try {
      return await apiService.get(`${API_ENDPOINTS.DASHBOARD.STATS}/exams?range=${timeRange}`);
    } catch (error) {
      throw error;
    }
  }

  async getIncidentStatistics(timeRange = '7d') {
    try {
      return await apiService.get(`${API_ENDPOINTS.DASHBOARD.STATS}/incidents?range=${timeRange}`);
    } catch (error) {
      throw error;
    }
  }

  async getUserStatistics(timeRange = '7d') {
    try {
      return await apiService.get(`${API_ENDPOINTS.DASHBOARD.STATS}/users?range=${timeRange}`);
    } catch (error) {
      throw error;
    }
  }

  async getSystemHealth() {
    try {
      return await apiService.get(`${API_ENDPOINTS.DASHBOARD.STATS}/health`);
    } catch (error) {
      throw error;
    }
  }

  async getPerformanceMetrics(timeRange = '24h') {
    try {
      return await apiService.get(`${API_ENDPOINTS.DASHBOARD.STATS}/performance?range=${timeRange}`);
    } catch (error) {
      throw error;
    }
  }
}

// Create and export singleton instance
const dashboardService = new DashboardService();
export default dashboardService;
