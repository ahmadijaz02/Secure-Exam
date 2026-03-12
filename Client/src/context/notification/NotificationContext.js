<<<<<<< HEAD
import React, { createContext, useContext, useReducer, useCallback, useMemo } from 'react';
=======
import React, { createContext, useContext, useReducer } from 'react';
>>>>>>> 09b1cf1ba6896a676df61304aacba2bd9bb3bab8

// Initial state
const initialState = {
  notifications: [],
};

// Action types
const NOTIFICATION_ACTIONS = {
  ADD_NOTIFICATION: 'ADD_NOTIFICATION',
  REMOVE_NOTIFICATION: 'REMOVE_NOTIFICATION',
  CLEAR_NOTIFICATIONS: 'CLEAR_NOTIFICATIONS',
};

// Reducer
function notificationReducer(state, action) {
  switch (action.type) {
    case NOTIFICATION_ACTIONS.ADD_NOTIFICATION:
      return {
        ...state,
        notifications: [...state.notifications, action.payload],
      };
    case NOTIFICATION_ACTIONS.REMOVE_NOTIFICATION:
      return {
        ...state,
        notifications: state.notifications.filter(
          notification => notification.id !== action.payload.id
        ),
      };
    case NOTIFICATION_ACTIONS.CLEAR_NOTIFICATIONS:
      return {
        ...state,
        notifications: [],
      };
    default:
      return state;
  }
}

<<<<<<< HEAD
// Create contexts
const NotificationContext = createContext();
const NotificationStateContext = createContext();
const NotificationActionsContext = createContext();
=======
// Create context
const NotificationContext = createContext();
>>>>>>> 09b1cf1ba6896a676df61304aacba2bd9bb3bab8

// Provider component
export function NotificationProvider({ children }) {
  const [state, dispatch] = useReducer(notificationReducer, initialState);

<<<<<<< HEAD
  const removeNotification = useCallback((id) => {
    dispatch({
      type: NOTIFICATION_ACTIONS.REMOVE_NOTIFICATION,
      payload: { id },
    });
  }, []);

  const addNotification = useCallback((notification) => {
=======
  const addNotification = (notification) => {
>>>>>>> 09b1cf1ba6896a676df61304aacba2bd9bb3bab8
    const id = Date.now() + Math.random();
    const newNotification = {
      id,
      type: 'info', // default type
      duration: 5000, // default duration
      ...notification,
    };

    dispatch({
      type: NOTIFICATION_ACTIONS.ADD_NOTIFICATION,
      payload: newNotification,
    });

    // Auto remove notification after duration
    if (newNotification.duration > 0) {
      setTimeout(() => {
        removeNotification(id);
      }, newNotification.duration);
    }

    return id;
<<<<<<< HEAD
  }, [removeNotification]);

  const clearNotifications = useCallback(() => {
    dispatch({ type: NOTIFICATION_ACTIONS.CLEAR_NOTIFICATIONS });
  }, []);

  // Convenience methods for different notification types
  const showSuccess = useCallback((message, options = {}) => {
=======
  };

  const removeNotification = (id) => {
    dispatch({
      type: NOTIFICATION_ACTIONS.REMOVE_NOTIFICATION,
      payload: { id },
    });
  };

  const clearNotifications = () => {
    dispatch({ type: NOTIFICATION_ACTIONS.CLEAR_NOTIFICATIONS });
  };

  // Convenience methods for different notification types
  const showSuccess = (message, options = {}) => {
>>>>>>> 09b1cf1ba6896a676df61304aacba2bd9bb3bab8
    return addNotification({
      type: 'success',
      message,
      ...options,
    });
<<<<<<< HEAD
  }, [addNotification]);

  const showError = useCallback((message, options = {}) => {
=======
  };

  const showError = (message, options = {}) => {
>>>>>>> 09b1cf1ba6896a676df61304aacba2bd9bb3bab8
    return addNotification({
      type: 'error',
      message,
      duration: 7000, // Longer duration for errors
      ...options,
    });
<<<<<<< HEAD
  }, [addNotification]);

  const showWarning = useCallback((message, options = {}) => {
=======
  };

  const showWarning = (message, options = {}) => {
>>>>>>> 09b1cf1ba6896a676df61304aacba2bd9bb3bab8
    return addNotification({
      type: 'warning',
      message,
      ...options,
    });
<<<<<<< HEAD
  }, [addNotification]);

  const showInfo = useCallback((message, options = {}) => {
=======
  };

  const showInfo = (message, options = {}) => {
>>>>>>> 09b1cf1ba6896a676df61304aacba2bd9bb3bab8
    return addNotification({
      type: 'info',
      message,
      ...options,
    });
<<<<<<< HEAD
  }, [addNotification]);

  const stateValue = useMemo(() => ({
    ...state,
  }), [state]);

  const actionsValue = useMemo(() => ({
=======
  };

  const value = {
    ...state,
>>>>>>> 09b1cf1ba6896a676df61304aacba2bd9bb3bab8
    addNotification,
    removeNotification,
    clearNotifications,
    showSuccess,
    showError,
    showWarning,
    showInfo,
<<<<<<< HEAD
  }), [
    addNotification,
    removeNotification,
    clearNotifications,
    showSuccess,
    showError,
    showWarning,
    showInfo,
  ]);

  const value = useMemo(() => ({
    ...stateValue,
    ...actionsValue,
  }), [stateValue, actionsValue]);

  return (
    <NotificationStateContext.Provider value={stateValue}>
      <NotificationActionsContext.Provider value={actionsValue}>
        <NotificationContext.Provider value={value}>
          {children}
        </NotificationContext.Provider>
      </NotificationActionsContext.Provider>
    </NotificationStateContext.Provider>
=======
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
>>>>>>> 09b1cf1ba6896a676df61304aacba2bd9bb3bab8
  );
}

// Custom hook to use notification context
export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}

<<<<<<< HEAD
// Use this in components that only need to trigger notifications
// so they don't re-render when notifications are added/removed.
export function useNotificationActions() {
  const context = useContext(NotificationActionsContext);
  if (!context) {
    throw new Error('useNotificationActions must be used within a NotificationProvider');
  }
  return context;
}

=======
>>>>>>> 09b1cf1ba6896a676df61304aacba2bd9bb3bab8
export default NotificationContext;
