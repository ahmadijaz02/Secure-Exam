import apiService from './apiService';
import { API_ENDPOINTS } from '../config/apiConfig';

class IncidentService {
  async getIncidents(params = {}) {
    try {
      const queryString = new URLSearchParams(params).toString();
      const url = queryString ? `${API_ENDPOINTS.INCIDENTS.LIST}?${queryString}` : API_ENDPOINTS.INCIDENTS.LIST;
      return await apiService.get(url);
    } catch (error) {
      throw error;
    }
  }

  async getIncident(id) {
    try {
      return await apiService.get(API_ENDPOINTS.INCIDENTS.GET(id));
    } catch (error) {
      throw error;
    }
  }

  async createIncident(incidentData) {
    try {
      return await apiService.post(API_ENDPOINTS.INCIDENTS.CREATE, incidentData);
    } catch (error) {
      throw error;
    }
  }

  async updateIncident(id, incidentData) {
    try {
      return await apiService.put(API_ENDPOINTS.INCIDENTS.UPDATE(id), incidentData);
    } catch (error) {
      throw error;
    }
  }

  async deleteIncident(id) {
    try {
      return await apiService.delete(API_ENDPOINTS.INCIDENTS.DELETE(id));
    } catch (error) {
      throw error;
    }
  }

  async getIncidentsByExam(examId, params = {}) {
    try {
      const queryString = new URLSearchParams(params).toString();
      const url = queryString ? `${API_ENDPOINTS.INCIDENTS.BY_EXAM(examId)}?${queryString}` : API_ENDPOINTS.INCIDENTS.BY_EXAM(examId);
      return await apiService.get(url);
    } catch (error) {
      throw error;
    }
  }

  async getRecentIncidents(limit = 10) {
    try {
      return await apiService.get(`${API_ENDPOINTS.INCIDENTS.LIST}?limit=${limit}&sort=-created_at`);
    } catch (error) {
      throw error;
    }
  }

  async getIncidentsByType(type, params = {}) {
    try {
      const queryString = new URLSearchParams({ ...params, type }).toString();
      return await apiService.get(`${API_ENDPOINTS.INCIDENTS.LIST}?${queryString}`);
    } catch (error) {
      throw error;
    }
  }

  async getIncidentsBySeverity(severity, params = {}) {
    try {
      const queryString = new URLSearchParams({ ...params, severity }).toString();
      return await apiService.get(`${API_ENDPOINTS.INCIDENTS.LIST}?${queryString}`);
    } catch (error) {
      throw error;
    }
  }

  async markIncidentAsResolved(id) {
    try {
      return await apiService.patch(API_ENDPOINTS.INCIDENTS.UPDATE(id), {
        status: 'resolved',
        resolved_at: new Date().toISOString(),
      });
    } catch (error) {
      throw error;
    }
  }

  async markIncidentAsInvestigating(id) {
    try {
      return await apiService.patch(API_ENDPOINTS.INCIDENTS.UPDATE(id), {
        status: 'investigating',
      });
    } catch (error) {
      throw error;
    }
  }

  async addIncidentNote(id, note) {
    try {
      return await apiService.post(`${API_ENDPOINTS.INCIDENTS.GET(id)}/notes`, {
        note,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      throw error;
    }
  }
}

// Create and export singleton instance
const incidentService = new IncidentService();
export default incidentService;
