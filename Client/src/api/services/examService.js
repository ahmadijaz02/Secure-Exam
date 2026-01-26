import apiService from './apiService';
import { API_ENDPOINTS } from '../config/apiConfig';

class ExamService {
  async getExams(params = {}) {
    try {
      const queryString = new URLSearchParams(params).toString();
      const url = queryString ? `${API_ENDPOINTS.EXAMS.LIST}?${queryString}` : API_ENDPOINTS.EXAMS.LIST;
      return await apiService.get(url);
    } catch (error) {
      throw error;
    }
  }

  async getExam(id) {
    try {
      return await apiService.get(API_ENDPOINTS.EXAMS.GET(id));
    } catch (error) {
      throw error;
    }
  }

  async createExam(examData) {
    try {
      return await apiService.post(API_ENDPOINTS.EXAMS.CREATE, examData);
    } catch (error) {
      throw error;
    }
  }

  async updateExam(id, examData) {
    try {
      return await apiService.put(API_ENDPOINTS.EXAMS.UPDATE(id), examData);
    } catch (error) {
      throw error;
    }
  }

  async deleteExam(id) {
    try {
      return await apiService.delete(API_ENDPOINTS.EXAMS.DELETE(id));
    } catch (error) {
      throw error;
    }
  }

  async startExam(id) {
    try {
      return await apiService.post(API_ENDPOINTS.EXAMS.START(id));
    } catch (error) {
      throw error;
    }
  }

  async endExam(id) {
    try {
      return await apiService.post(API_ENDPOINTS.EXAMS.END(id));
    } catch (error) {
      throw error;
    }
  }

  async getExamStudents(id) {
    try {
      return await apiService.get(API_ENDPOINTS.EXAMS.STUDENTS(id));
    } catch (error) {
      throw error;
    }
  }

  async addStudentToExam(examId, studentData) {
    try {
      return await apiService.post(API_ENDPOINTS.EXAMS.STUDENTS(examId), studentData);
    } catch (error) {
      throw error;
    }
  }

  async removeStudentFromExam(examId, studentId) {
    try {
      return await apiService.delete(`${API_ENDPOINTS.EXAMS.STUDENTS(examId)}/${studentId}`);
    } catch (error) {
      throw error;
    }
  }

  async getActiveExams() {
    try {
      return await apiService.get(`${API_ENDPOINTS.EXAMS.LIST}?status=active`);
    } catch (error) {
      throw error;
    }
  }

  async getUpcomingExams() {
    try {
      return await apiService.get(`${API_ENDPOINTS.EXAMS.LIST}?status=scheduled`);
    } catch (error) {
      throw error;
    }
  }

  async getCompletedExams() {
    try {
      return await apiService.get(`${API_ENDPOINTS.EXAMS.LIST}?status=completed`);
    } catch (error) {
      throw error;
    }
  }
}

// Create and export singleton instance
const examService = new ExamService();
export default examService;
