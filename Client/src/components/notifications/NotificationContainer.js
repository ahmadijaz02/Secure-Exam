import React from 'react';
import { useNotification } from '../../context/notification/NotificationContext';
import NotificationItem from './NotificationItem';

function NotificationContainer() {
  const { notifications } = useNotification();

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm w-full">
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
        />
      ))}
    </div>
  );
}

export default NotificationContainer;
