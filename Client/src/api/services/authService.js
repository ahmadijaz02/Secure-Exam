import apiService from './apiService';
import { API_ENDPOINTS } from '../config/apiConfig';

class AuthService {
  async login(credentials) {
    try {
      const response = await apiService.post(API_ENDPOINTS.AUTH.LOGIN, credentials);
      
      if (response.access_token) {
        localStorage.setItem('access_token', response.access_token);
        localStorage.setItem('refresh_token', response.refresh_token);
        localStorage.setItem('user_data', JSON.stringify(response.user));
      }
      
      return response;
    } catch (error) {
      throw error;
    }
  }

  async signup(userData) {
    try {
      const response = await apiService.post(API_ENDPOINTS.AUTH.SIGNUP, userData);
      
      if (response.access_token) {
        localStorage.setItem('access_token', response.access_token);
        localStorage.setItem('refresh_token', response.refresh_token);
        localStorage.setItem('user_data', JSON.stringify(response.user));
      }
      
      return response;
    } catch (error) {
      throw error;
    }
  }

  async logout() {
    try {
      await apiService.post(API_ENDPOINTS.AUTH.LOGOUT);
    } catch (error) {
      // Continue with logout even if API call fails
      console.error('Logout API call failed:', error);
    } finally {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user_data');
    }
  }

  async refreshToken() {
    try {
      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await apiService.post(API_ENDPOINTS.AUTH.REFRESH, {
        refresh_token: refreshToken,
      });

      if (response.access_token) {
        localStorage.setItem('access_token', response.access_token);
        if (response.refresh_token) {
          localStorage.setItem('refresh_token', response.refresh_token);
        }
      }

      return response;
    } catch (error) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user_data');
      throw error;
    }
  }

  async getCurrentUser() {
    try {
      const response = await apiService.get(API_ENDPOINTS.AUTH.ME);
      localStorage.setItem('user_data', JSON.stringify(response.user));
      return response;
    } catch (error) {
      throw error;
    }
  }

  async updateProfile(profileData) {
    try {
      const response = await apiService.put(API_ENDPOINTS.AUTH.ME, profileData);
      if (response.user) {
        localStorage.setItem('user_data', JSON.stringify(response.user));
      }
      return response;
    } catch (error) {
      throw error;
    }
  }

  async changePassword(passwordData) {
    try {
      return await apiService.post(API_ENDPOINTS.AUTH.CHANGE_PASSWORD, passwordData);
    } catch (error) {
      throw error;
    }
  }

  isAuthenticated() {
    const token = localStorage.getItem('access_token');
    return !!token;
  }

  getCurrentUserData() {
    try {
      const userData = localStorage.getItem('user_data');
      return userData ? JSON.parse(userData) : null;
    } catch (error) {
      console.error('Error parsing user data:', error);
      return null;
    }
  }

  getToken() {
    return localStorage.getItem('access_token');
  }

  getRefreshToken() {
    return localStorage.getItem('refresh_token');
  }
}

// Create and export singleton instance
const authService = new AuthService();
export default authService;
