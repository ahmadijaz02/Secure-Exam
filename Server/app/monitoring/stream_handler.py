"""
Reusable Stream Handler for Single or Multiple Camera Feeds.
Handles both local webcams and RTSP/IP camera streams with thread-safe frame capture.
"""

import cv2
import threading
import queue
import time
import logging
from typing import Optional, Dict, Any, Callable
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class StreamConfig:
    """Configuration for a single camera stream."""
    stream_id: str  # Unique identifier (e.g., "front", "back")
    source: Any  # Device index (0, 1) or URL string (rtsp://...)
    camera_backend: str = "auto"  # opencv, msmf, v4l2, dshow, auto
    fps_target: float = 15.0  # Target FPS for processing
    frame_width: int = 1280
    frame_height: int = 720
    rtsp_transport: str = "tcp"  # tcp or udp
    rtsp_timeout_ms: int = 10000
    camera_warmup_frames: int = 2
    camera_buffer_flush: int = 2


class StreamHandler:
    """
    Manages a single video stream (local webcam or IP camera).
    Runs in a dedicated thread to prevent blocking.
    """

    def __init__(
        self,
        config: StreamConfig,
        frame_callback: Optional[Callable[[str, Any], None]] = None,
    ):
        """
        Args:
            config: StreamConfig instance
            frame_callback: Optional callback fn(stream_id, frame) called when frame is ready
        """
        self.config = config
        self.frame_callback = frame_callback
        
        self.cap: Optional[cv2.VideoCapture] = None
        self.thread: Optional[threading.Thread] = None
        self.running = False
        self.frame_queue = queue.Queue(maxsize=2)  # Keep only latest 2 frames
        self.latest_frame = None
        self.frame_count = 0
        self.connected = False
        self.last_error = None

    def connect(self) -> bool:
        """Initialize camera connection."""
        try:
            logger.info(f"[{self.config.stream_id}] Connecting to source: {self.config.source}")
            
            # Determine camera backend
            backend = self._get_backend_id()
            
            self.cap = cv2.VideoCapture(self.config.source, backend)
            
            if not self.cap.isOpened():
                self.last_error = f"Failed to open stream: {self.config.source}"
                logger.error(f"[{self.config.stream_id}] {self.last_error}")
                return False
            
            # Configure stream properties
            self._configure_stream()
            
            # Warmup: discard initial buffered frames
            logger.info(f"[{self.config.stream_id}] Warming up ({self.config.camera_warmup_frames} frames)...")
            for _ in range(self.config.camera_warmup_frames):
                self.cap.read()
            
            logger.info(f"[{self.config.stream_id}] Connected successfully")
            self.connected = True
            return True
            
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"[{self.config.stream_id}] Connection error: {e}")
            return False

    def _get_backend_id(self) -> int:
        """Get OpenCV backend ID from string."""
        backend_map = {
            "opencv": cv2.CAP_ANY,
            "msmf": cv2.CAP_MSMF,  # Windows Media Foundation
            "v4l2": cv2.CAP_V4L2,  # Linux
            "dshow": cv2.CAP_DSHOW,  # Windows DirectShow
            "auto": cv2.CAP_ANY,
        }
        return backend_map.get(self.config.camera_backend.lower(), cv2.CAP_ANY)

    def _configure_stream(self):
        """Set camera properties (resolution, buffering, etc.)."""
        if not self.cap:
            return
        
        try:
            # Resolution
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.config.frame_width)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.config.frame_height)
            
            # RTSP-specific settings for IP cameras
            if isinstance(self.config.source, str) and ("rtsp://" in self.config.source or "http://" in self.config.source):
                self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Minimize buffer
                
                # RTSP transport protocol
                if self.config.rtsp_transport.lower() == "tcp":
                    self.cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, self.config.rtsp_timeout_ms)
                    logger.info(f"[{self.config.stream_id}] RTSP TCP transport enabled")
            
            # Flush buffered frames for local cameras
            for _ in range(self.config.camera_buffer_flush):
                self.cap.read()
                
        except Exception as e:
            logger.warning(f"[{self.config.stream_id}] Error configuring stream: {e}")

    def start(self):
        """Start the frame capture thread."""
        if self.running:
            logger.warning(f"[{self.config.stream_id}] Already running")
            return
        
        if not self.connected:
            if not self.connect():
                return
        
        self.running = True
        self.thread = threading.Thread(target=self._capture_loop, daemon=False)
        self.thread.start()
        logger.info(f"[{self.config.stream_id}] Capture thread started")

    def stop(self):
        """Stop the frame capture thread and close camera."""
        if not self.running:
            return
        
        self.running = False
        if self.thread:
            self.thread.join(timeout=5)
        
        if self.cap:
            self.cap.release()
            self.cap = None
        
        self.connected = False
        logger.info(f"[{self.config.stream_id}] Stream stopped")

    def _capture_loop(self):
        """Main thread loop: continuously read frames from camera."""
        frame_interval = 1.0 / self.config.fps_target
        last_frame_time = 0
        
        while self.running and self.cap and self.cap.isOpened():
            try:
                ret, frame = self.cap.read()
                
                if not ret:
                    self.last_error = "Frame read failed"
                    logger.warning(f"[{self.config.stream_id}] Frame read failed, reconnecting...")
                    time.sleep(0.5)
                    continue
                
                # Resize frame if needed
                if frame.shape[0] != self.config.frame_height or frame.shape[1] != self.config.frame_width:
                    frame = cv2.resize(
                        frame,
                        (self.config.frame_width, self.config.frame_height),
                        interpolation=cv2.INTER_LINEAR
                    )
                
                # Throttle to target FPS
                now = time.time()
                elapsed = now - last_frame_time
                if elapsed < frame_interval:
                    time.sleep(frame_interval - elapsed)
                    now = time.time()
                
                last_frame_time = now
                
                # Store latest frame (non-blocking)
                self.latest_frame = frame
                self.frame_count += 1
                
                # Put frame in queue (drop oldest if queue full)
                try:
                    self.frame_queue.put_nowait(frame)
                except queue.Full:
                    try:
                        self.frame_queue.get_nowait()
                    except queue.Empty:
                        pass
                    self.frame_queue.put_nowait(frame)
                
                # Invoke callback if provided
                if self.frame_callback:
                    try:
                        self.frame_callback(self.config.stream_id, frame)
                    except Exception as e:
                        logger.error(f"[{self.config.stream_id}] Callback error: {e}")
                        
            except Exception as e:
                self.last_error = str(e)
                logger.error(f"[{self.config.stream_id}] Capture error: {e}")
                time.sleep(0.1)

    def get_frame(self, timeout: float = 1.0) -> Optional[Any]:
        """Get latest frame from queue."""
        try:
            return self.frame_queue.get(timeout=timeout)
        except queue.Empty:
            return self.latest_frame
    
    def get_latest_frame(self) -> Optional[Any]:
        """Get most recent frame without removing from queue."""
        return self.latest_frame
    
    def is_connected(self) -> bool:
        """Check if stream is connected."""
        return self.connected and self.running
    
    def get_stats(self) -> Dict[str, Any]:
        """Return stream statistics."""
        return {
            "stream_id": self.config.stream_id,
            "connected": self.connected,
            "running": self.running,
            "frame_count": self.frame_count,
            "last_error": self.last_error,
        }


class DualStreamHandler:
    """
    Manages two concurrent video streams (front and back camera).
    Both streams run in separate threads without blocking each other.
    """

    def __init__(
        self,
        front_config: StreamConfig,
        back_config: Optional[StreamConfig] = None,
    ):
        """
        Args:
            front_config: StreamConfig for front camera
            back_config: StreamConfig for back camera (optional)
        """
        self.front_stream = StreamHandler(front_config)
        self.back_stream = StreamHandler(back_config) if back_config else None

    def start(self):
        """Start both streams."""
        logger.info("Starting dual stream handler")
        self.front_stream.start()
        if self.back_stream:
            self.back_stream.start()

    def stop(self):
        """Stop both streams."""
        logger.info("Stopping dual stream handler")
        self.front_stream.stop()
        if self.back_stream:
            self.back_stream.stop()

    def get_frames(self) -> Dict[str, Optional[Any]]:
        """Get latest frames from both streams."""
        return {
            "front": self.front_stream.get_latest_frame(),
            "back": self.back_stream.get_latest_frame() if self.back_stream else None,
        }

    def get_frame(self, stream_id: str) -> Optional[Any]:
        """Get specific stream's latest frame."""
        if stream_id == "front":
            return self.front_stream.get_latest_frame()
        elif stream_id == "back" and self.back_stream:
            return self.back_stream.get_latest_frame()
        return None

    def get_status(self) -> Dict[str, Any]:
        """Get status of both streams."""
        status = {
            "front": self.front_stream.get_stats(),
        }
        if self.back_stream:
            status["back"] = self.back_stream.get_stats()
        return status
