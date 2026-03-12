import apiService from './apiService';
import { API_ENDPOINTS } from '../config/apiConfig';

class UserService {
  async getUsers(params = {}) {
    try {
      const queryString = new URLSearchParams(params).toString();
      const url = queryString ? `${API_ENDPOINTS.USERS.LIST}?${queryString}` : API_ENDPOINTS.USERS.LIST;
      return await apiService.get(url);
    } catch (error) {
      throw error;
    }
  }

  async getUser(id) {
    try {
      return await apiService.get(API_ENDPOINTS.USERS.GET(id));
    } catch (error) {
      throw error;
    }
  }

  async createUser(userData) {
    try {
      return await apiService.post(API_ENDPOINTS.USERS.CREATE, userData);
    } catch (error) {
      throw error;
    }
  }

  async updateUser(id, userData) {
    try {
      return await apiService.put(API_ENDPOINTS.USERS.UPDATE(id), userData);
    } catch (error) {
      throw error;
    }
  }

  async deleteUser(id) {
    try {
      return await apiService.delete(API_ENDPOINTS.USERS.DELETE(id));
    } catch (error) {
      throw error;
    }
  }

  async updateProfile(userData) {
    try {
      const currentUser = JSON.parse(localStorage.getItem('user_data') || '{}');
      return await apiService.put(API_ENDPOINTS.USERS.UPDATE(currentUser.id), userData);
    } catch (error) {
      throw error;
    }
  }

  async changePassword(passwordData) {
    try {
      const currentUser = JSON.parse(localStorage.getItem('user_data') || '{}');
      return await apiService.post(`${API_ENDPOINTS.USERS.GET(currentUser.id)}/change-password`, passwordData);
    } catch (error) {
      throw error;
    }
  }

  async getUsersByRole(role, params = {}) {
    try {
      const queryString = new URLSearchParams({ ...params, role }).toString();
      return await apiService.get(`${API_ENDPOINTS.USERS.LIST}?${queryString}`);
    } catch (error) {
      throw error;
    }
  }

  async getInstructors(params = {}) {
    try {
      return await this.getUsersByRole('instructor', params);
    } catch (error) {
      throw error;
    }
  }

  async getStudents(params = {}) {
    try {
      return await this.getUsersByRole('student', params);
    } catch (error) {
      throw error;
    }
  }

  async getAdmins(params = {}) {
    try {
      return await this.getUsersByRole('admin', params);
    } catch (error) {
      throw error;
    }
  }

  async searchUsers(query, params = {}) {
    try {
      const queryString = new URLSearchParams({ ...params, search: query }).toString();
      return await apiService.get(`${API_ENDPOINTS.USERS.LIST}?${queryString}`);
    } catch (error) {
      throw error;
    }
  }

  async activateUser(id) {
    try {
      return await apiService.patch(API_ENDPOINTS.USERS.UPDATE(id), {
        status: 'active',
      });
    } catch (error) {
      throw error;
    }
  }

  async deactivateUser(id) {
    try {
      return await apiService.patch(API_ENDPOINTS.USERS.UPDATE(id), {
        status: 'inactive',
      });
    } catch (error) {
      throw error;
    }
  }

  async uploadAvatar(id, file) {
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      
      return await apiService.post(`${API_ENDPOINTS.USERS.GET(id)}/avatar`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
    } catch (error) {
      throw error;
    }
  }
}

// Create and export singleton instance
const userService = new UserService();
export default userService;
