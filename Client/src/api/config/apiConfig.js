// API Configuration
export const API_CONFIG = {
  BASE_URL: process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:5000/api',
  SOCKET_URL: process.env.REACT_APP_SOCKET_URL || 'http://127.0.0.1:5000',
  TIMEOUT: 10000,
  RETRY_ATTEMPTS: 3,
};

// API Endpoints
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login',
    SIGNUP: '/auth/signup',
    REFRESH: '/auth/refresh',
    LOGOUT: '/auth/logout',
    ME: '/auth/me',
  },
  USERS: {
    LIST: '/users',
    CREATE: '/users',
    GET: (id) => `/users/${id}`,
    UPDATE: (id) => `/users/${id}`,
    DELETE: (id) => `/users/${id}`,
  },
  EXAMS: {
    LIST: '/exams',
    CREATE: '/exams',
    GET: (id) => `/exams/${id}`,
    UPDATE: (id) => `/exams/${id}`,
    DELETE: (id) => `/exams/${id}`,
    START: (id) => `/exams/${id}/start`,
    END: (id) => `/exams/${id}/end`,
    STUDENTS: (id) => `/exams/${id}/students`,
  },
  INCIDENTS: {
    LIST: '/incidents',
    CREATE: '/incidents',
    GET: (id) => `/incidents/${id}`,
    UPDATE: (id) => `/incidents/${id}`,
    DELETE: (id) => `/incidents/${id}`,
    BY_EXAM: (examId) => `/exams/${examId}/incidents`,
  },
  EXAM_SESSIONS: {
    LIST: '/exam-sessions',
  },
  DASHBOARD: {
    STATS: '/dashboard/stats',
    RECENT_ACTIVITY: '/dashboard/recent-activity',
    ACTIVE_EXAMS: '/dashboard/active-exams',
  },
};

// HTTP Methods
export const HTTP_METHODS = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  PATCH: 'PATCH',
  DELETE: 'DELETE',
};

// Request Headers
export const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
};

export default {
  API_CONFIG,
  API_ENDPOINTS,
  HTTP_METHODS,
  DEFAULT_HEADERS,
};
