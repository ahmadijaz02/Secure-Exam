import io from 'socket.io-client';
import { API_CONFIG } from '../api/config/apiConfig';

class SocketService {
  constructor() {
    this.socket = null;
    this.monitoringSocket = null;
  }

  /**
   * Connect to main Socket.IO namespace
   */
  connect() {
    if (!this.socket) {
      this.socket = io(API_CONFIG.SOCKET_URL, {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
        transports: ['websocket']
      });

      this.socket.on('connect', () => {
        console.log('Connected to main socket namespace');
      });

      this.socket.on('disconnect', () => {
        console.log('Disconnected from main socket namespace');
      });
    }
    return this.socket;
  }

  /**
   * Connect to monitoring - uses default namespace (same as FYP) for "frame" and "log" events
   */
  joinMonitoring() {
    if (!this.monitoringSocket) {
      const url = API_CONFIG.SOCKET_URL || 'http://localhost:5000';
      this.monitoringSocket = io(url, {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
        transports: ['websocket'],
        upgrade: false
      });

      this.monitoringSocket.on('connect', () => {
        console.log('Connected to server (monitoring):', url);
      });

      this.monitoringSocket.on('disconnect', (reason) => {
        console.log('Disconnected from server:', reason);
      });

      this.monitoringSocket.on('connect_error', (err) => {
        console.error('Socket connect error:', err.message, '- URL:', url);
      });

      this.monitoringSocket.on('error', (error) => {
        console.error('Socket.IO error:', error);
      });
    }
    return this.monitoringSocket;
  }

  /**
   * Disconnect from monitoring namespace
   */
  leaveMonitoring() {
    if (this.monitoringSocket) {
      this.monitoringSocket.disconnect();
      this.monitoringSocket = null;
    }
  }

  /**
   * Emit event to monitoring namespace
   */
  emitMonitoring(event, data) {
    if (this.monitoringSocket) {
      this.monitoringSocket.emit(event, data);
    }
  }
}

export default new SocketService();
