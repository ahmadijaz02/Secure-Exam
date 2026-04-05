// Import all services
import apiService from './services/apiService';
import authService from './services/authService';
import examService from './services/examService';
import incidentService from './services/incidentService';
import userService from './services/userService';
import dashboardService from './services/dashboardService';

// Import configuration
import { API_CONFIG, API_ENDPOINTS } from './config/apiConfig';

// Legacy API exports for backward compatibility
export { default as api } from './services/apiService';
export { default as authService } from './services/authService';
export { default as examService } from './services/examService';
export { default as incidentService } from './services/incidentService';
export { default as userService } from './services/userService';
export { default as dashboardService } from './services/dashboardService';

export * from './services/authService';
export * from './services/examService';
export * from './services/incidentService';
export * from './services/userService';
export * from './services/dashboardService';
export * from './config/apiConfig';

// Default export for backward compatibility
export default {
  auth: authService,
  exam: examService,
  incident: incidentService,
  user: userService,
  dashboard: dashboardService,
  config: API_CONFIG,
  endpoints: API_ENDPOINTS,
};
