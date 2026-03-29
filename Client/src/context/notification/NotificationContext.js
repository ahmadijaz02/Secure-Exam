import React, { createContext, useCallback, useContext, useMemo, useReducer } from 'react';

const initialState = {
  notifications: [],
};

const NOTIFICATION_ACTIONS = {
  ADD_NOTIFICATION: 'ADD_NOTIFICATION',
  REMOVE_NOTIFICATION: 'REMOVE_NOTIFICATION',
  CLEAR_NOTIFICATIONS: 'CLEAR_NOTIFICATIONS',
};

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
          (notification) => notification.id !== action.payload.id
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

const NotificationContext = createContext();
const NotificationStateContext = createContext();
const NotificationActionsContext = createContext();

export function NotificationProvider({ children }) {
  const [state, dispatch] = useReducer(notificationReducer, initialState);

  const removeNotification = useCallback((id) => {
    dispatch({
      type: NOTIFICATION_ACTIONS.REMOVE_NOTIFICATION,
      payload: { id },
    });
  }, []);

  // Supports both signatures:
  // addNotification({ type, message, ... })
  // addNotification('success', 'Message', { duration: 3000 })
  const addNotification = useCallback(
    (notificationOrType, message, options = {}) => {
      let normalizedNotification;

      if (typeof notificationOrType === 'string') {
        normalizedNotification = {
          type: notificationOrType,
          message: typeof message === 'string' ? message : '',
          ...(options || {}),
        };
      } else {
        normalizedNotification = notificationOrType || {};
      }

      const id = Date.now() + Math.random();
      const newNotification = {
        id,
        type: 'info',
        duration: 5000,
        ...normalizedNotification,
      };

      dispatch({
        type: NOTIFICATION_ACTIONS.ADD_NOTIFICATION,
        payload: newNotification,
      });

      if (newNotification.duration > 0) {
        setTimeout(() => {
          removeNotification(id);
        }, newNotification.duration);
      }

      return id;
    },
    [removeNotification]
  );

  const clearNotifications = useCallback(() => {
    dispatch({ type: NOTIFICATION_ACTIONS.CLEAR_NOTIFICATIONS });
  }, []);

  const showSuccess = useCallback(
    (message, options = {}) => {
      return addNotification({
        type: 'success',
        message,
        ...options,
      });
    },
    [addNotification]
  );

  const showError = useCallback(
    (message, options = {}) => {
      return addNotification({
        type: 'error',
        message,
        duration: 7000,
        ...options,
      });
    },
    [addNotification]
  );

  const showWarning = useCallback(
    (message, options = {}) => {
      return addNotification({
        type: 'warning',
        message,
        ...options,
      });
    },
    [addNotification]
  );

  const showInfo = useCallback(
    (message, options = {}) => {
      return addNotification({
        type: 'info',
        message,
        ...options,
      });
    },
    [addNotification]
  );

  const stateValue = useMemo(() => ({ ...state }), [state]);

  const actionsValue = useMemo(
    () => ({
      addNotification,
      removeNotification,
      clearNotifications,
      showSuccess,
      showError,
      showWarning,
      showInfo,
    }),
    [
      addNotification,
      removeNotification,
      clearNotifications,
      showSuccess,
      showError,
      showWarning,
      showInfo,
    ]
  );

  const value = useMemo(
    () => ({
      ...stateValue,
      ...actionsValue,
    }),
    [stateValue, actionsValue]
  );

  return (
    <NotificationStateContext.Provider value={stateValue}>
      <NotificationActionsContext.Provider value={actionsValue}>
        <NotificationContext.Provider value={value}>
          {children}
        </NotificationContext.Provider>
      </NotificationActionsContext.Provider>
    </NotificationStateContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}

// Use this in components that only need to trigger notifications
// so they do not re-render when notifications are added/removed.
export function useNotificationActions() {
  const context = useContext(NotificationActionsContext);
  if (!context) {
    throw new Error('useNotificationActions must be used within a NotificationProvider');
  }
  return context;
}

export default NotificationContext;
