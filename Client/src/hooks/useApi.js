import { useState, useEffect, useCallback } from 'react';
import { useNotification } from '../context/notification/NotificationContext';

/**
 * Custom hook for API calls with loading, error, and data state management
 * @param {Function} apiFunction - The API function to call
 * @param {any} initialData - Initial data value
 * @param {boolean} immediate - Whether to call the API immediately
 * @returns {object} API state and control functions
 */
function useApi(apiFunction, initialData = null, immediate = true) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { showError } = useNotification();

  const execute = useCallback(async (...args) => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await apiFunction(...args);
      setData(result);
      return result;
    } catch (err) {
      const errorMessage = err.message || 'An unexpected error occurred';
      setError(errorMessage);
      showError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [apiFunction, showError]);

  const reset = useCallback(() => {
    setData(initialData);
    setError(null);
    setLoading(false);
  }, [initialData]);

  useEffect(() => {
    if (immediate) {
      execute();
    }
  }, [execute, immediate]);

  return {
    data,
    loading,
    error,
    execute,
    reset,
  };
}

export default useApi;
