import { apiClient } from './apiService';

const adminService = {
  // ========== DASHBOARD ==========
  
  /**
   * Get dashboard statistics
   */
  getDashboardStats: async () => {
    const response = await apiClient.get('/admin/dashboard/stats');
    return response.data;
  },

  // ========== USER MANAGEMENT ==========
  
  /**
   * Get all users with optional role filter
   */
  getAllUsers: async (role = null, isActive = null) => {
    const params = {};
    if (role) params.role = role;
    if (isActive !== null) params.is_active = isActive;
    
    const response = await apiClient.get('/admin/users', { params });
    return response.data;
  },

  /**
   * Get a specific user by ID
   */
  getUserById: async (userId) => {
    const response = await apiClient.get(`/admin/users/${userId}`);
    return response.data;
  },

  /**
   * Create a new user
   */
  createUser: async (userData) => {
    const response = await apiClient.post('/admin/users', userData);
    return response.data;
  },

  /**
   * Update an existing user
   */
  updateUser: async (userId, userData) => {
    const response = await apiClient.put(`/admin/users/${userId}`, userData);
    return response.data;
  },

  /**
   * Delete a user
   */
  deleteUser: async (userId) => {
    const response = await apiClient.delete(`/admin/users/${userId}`);
    return response.data;
  },

  /**
   * Get all invigilators
   */
  getAllInvigilators: async () => {
    const response = await apiClient.get('/admin/invigilators');
    return response.data;
  },

  /**
   * Create a new admin user
   */
  createAdmin: async (adminData) => {
    const response = await apiClient.post('/admin/create-admin', adminData);
    return response.data;
  },

  // ========== EXAM SESSION MANAGEMENT ==========

  /**
   * Get all exam sessions
   */
  getAllExamSessions: async () => {
    const response = await apiClient.get('/admin/exam-sessions');
    return response.data;
  },

  /**
   * Get a specific exam session by ID
   */
  getExamSessionById: async (sessionId) => {
    const response = await apiClient.get(`/admin/exam-sessions/${sessionId}`);
    return response.data;
  },

  /**
   * Create a new exam session
   */
  createExamSession: async (sessionData) => {
    const response = await apiClient.post('/admin/exam-sessions', sessionData);
    return response.data;
  },

  /**
   * Update an existing exam session
   */
  updateExamSession: async (sessionId, sessionData) => {
    const response = await apiClient.put(`/admin/exam-sessions/${sessionId}`, sessionData);
    return response.data;
  },

  /**
   * Delete an exam session
   */
  deleteExamSession: async (sessionId) => {
    const response = await apiClient.delete(`/admin/exam-sessions/${sessionId}`);
    return response.data;
  },

  // ========== SEATING PLAN MANAGEMENT ==========

  /**
   * Get all seating plans
   */
  getAllSeatingPlans: async () => {
    const response = await apiClient.get('/admin/seating-plans');
    return response.data;
  },

  /**
   * Get a specific seating plan by ID
   */
  getSeatingPlanById: async (planId) => {
    const response = await apiClient.get(`/admin/seating-plans/${planId}`);
    return response.data;
  },

  /**
   * Get seating plan by classroom name
   */
  getSeatingPlanByClassroom: async (classroomName) => {
    const response = await apiClient.get(`/admin/seating-plans/classroom/${classroomName}`);
    return response.data;
  },

  /**
   * Create a new seating plan
   */
  createSeatingPlan: async (planData) => {
    const response = await apiClient.post('/admin/seating-plans', planData);
    return response.data;
  },

  /**
   * Update an existing seating plan
   */
  updateSeatingPlan: async (planId, planData) => {
    const response = await apiClient.put(`/admin/seating-plans/${planId}`, planData);
    return response.data;
  },

  /**
   * Delete a seating plan
   */
  deleteSeatingPlan: async (planId) => {
    const response = await apiClient.delete(`/admin/seating-plans/${planId}`);
    return response.data;
  },

  // ========== EXAM SESSION SEATING PLANS WORKFLOW ==========

  /**
   * Get all seating plans for an exam session (linked + available)
   */
  getSessionSeatingPlans: async (sessionId) => {
    const response = await apiClient.get(`/admin/exam-sessions/${sessionId}/seating-plans`);
    return response.data;
  },

  /**
   * Create a seating plan for an exam session
   */
  createSessionSeatingPlan: async (sessionId, planData) => {
    const response = await apiClient.post(`/admin/exam-sessions/${sessionId}/seating-plans`, planData);
    return response.data;
  },

  /**
   * Update a seating plan for an exam session
   */
  updateSessionSeatingPlan: async (sessionId, planId, planData) => {
    const response = await apiClient.put(`/admin/exam-sessions/${sessionId}/seating-plans/${planId}`, planData);
    return response.data;
  },

  /**
   * Delete a seating plan from an exam session
   */
  deleteSessionSeatingPlan: async (sessionId, planId) => {
    const response = await apiClient.delete(`/admin/exam-sessions/${sessionId}/seating-plans/${planId}`);
    return response.data;
  },

  /**
   * Link an existing seating plan to an exam session
   */
  linkSeatingPlanToSession: async (sessionId, planId) => {
    const response = await apiClient.post(`/admin/exam-sessions/${sessionId}/seating-plans/${planId}/link`);
    return response.data;
  },

  /**
   * Unlink a seating plan from an exam session
   */
  unlinkSeatingPlanFromSession: async (sessionId, planId) => {
    const response = await apiClient.post(`/admin/exam-sessions/${sessionId}/seating-plans/${planId}/unlink`);
  },
};

export default adminService;
