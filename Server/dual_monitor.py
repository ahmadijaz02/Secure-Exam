#!/usr/bin/env python3

import os
import sys
import cv2
import threading
import time
import json
import logging
import base64
import numpy as np
from typing import Optional, Dict, Any
from collections import defaultdict
from datetime import datetime
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.monitoring.stream_handler import StreamConfig, DualStreamHandler
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    stream=sys.stderr
)
logger = logging.getLogger(__name__)

def _env_int(name: str, default: str) -> int:
    return int(os.environ.get(name, default))

def _env_float(name: str, default: str) -> float:
    return float(os.environ.get(name, default))

def _parse_camera_source(source_str: str) -> Any:
    """Parse camera source: return device index or URL string."""
    source_str = source_str.strip()
    if source_str.startswith(('http://', 'https://', 'rtsp://', 'rtsps://')):
        return source_str
    try:
        return int(source_str)
    except ValueError:
        return source_str

# Configuration constants
MONITOR_FRAME_WIDTH = _env_int('MONITOR_FRAME_WIDTH', '1280')
MONITOR_FRAME_HEIGHT = _env_int('MONITOR_FRAME_HEIGHT', '720')
STREAM_WIDTH = _env_int('STREAM_WIDTH', '640')
STREAM_HEIGHT = _env_int('STREAM_HEIGHT', '360')
STREAM_JPEG_QUALITY = max(10, min(90, _env_int('STREAM_JPEG_QUALITY', '68')))
STREAM_TARGET_FPS = max(1.0, _env_float('STREAM_TARGET_FPS', '15.0'))

CAMERA_BACKEND = os.environ.get('CAMERA_BACKEND', 'auto').strip().lower() or 'auto'
RTSP_TRANSPORT = os.environ.get('RTSP_TRANSPORT', 'tcp').strip().lower() or 'tcp'
RTSP_TIMEOUT_MS = 10000

FRONT_CAMERA_SOURCE = _parse_camera_source(os.environ.get('FRONT_CAMERA_SOURCE', '0'))
BACK_CAMERA_SOURCE = os.environ.get('BACK_CAMERA_SOURCE', '').strip()
BACK_CAMERA_SOURCE = _parse_camera_source(BACK_CAMERA_SOURCE) if BACK_CAMERA_SOURCE else None

YOLO_IMAGE_SIZE = max(320, _env_int('YOLO_IMAGE_SIZE', '960'))
YOLO_PROCESS_EVERY = max(1, _env_int('YOLO_PROCESS_EVERY', '2'))

# Inference placeholder 
def predict_cheating_behavior(frame: np.ndarray, stream_id: str) -> Dict[str, Any]:
    """
    Placeholder inference function.
    In production, replace with actual YOLO/MediaPipe inference.
    
    Args:
        frame: Input frame (numpy array, BGR)
        stream_id: 'front' or 'back'
    
    Returns:
        Dict with detections, alerts, etc.
    """
    # TODO: Integrate inference model
    return {
        "stream_id": stream_id,
        "detections": [],
        "alerts": [],
        "timestamp": datetime.now().isoformat(),
    }


def encode_frame_for_stream(frame: np.ndarray) -> Optional[str]:
    """Encode frame to base64 JPEG for transmission."""
    if frame is None:
        return None
    
    try:
        if frame.shape[0] != STREAM_HEIGHT or frame.shape[1] != STREAM_WIDTH:
            frame = cv2.resize(frame, (STREAM_WIDTH, STREAM_HEIGHT), interpolation=cv2.INTER_AREA)
        
        encode_params = [int(cv2.IMWRITE_JPEG_QUALITY), STREAM_JPEG_QUALITY]
        ok, buffer = cv2.imencode('.jpg', frame, encode_params)
        
        if ok:
            return base64.b64encode(buffer.tobytes()).decode('ascii')
    except Exception as e:
        logger.error(f"Frame encoding error: {e}")
    
    return None


class DualCameraMonitor:
    """Monitors both front and back camera feeds concurrently."""

    def __init__(self):
        self.running = False
        self.stream_handler = None
        self.throttle_state = {"last_emit": {}}

    def initialize(self) -> bool:
        """Initialize camera streams."""
        logger.info(f"Initializing dual camera monitor")
        logger.info(f"  Front camera: {FRONT_CAMERA_SOURCE}")
        logger.info(f"  Back camera: {BACK_CAMERA_SOURCE if BACK_CAMERA_SOURCE else 'None'}")
        
        front_config = StreamConfig(
            stream_id="front",
            source=FRONT_CAMERA_SOURCE,
            camera_backend=CAMERA_BACKEND,
            fps_target=STREAM_TARGET_FPS,
            frame_width=MONITOR_FRAME_WIDTH,
            frame_height=MONITOR_FRAME_HEIGHT,
            rtsp_transport=RTSP_TRANSPORT,
            rtsp_timeout_ms=RTSP_TIMEOUT_MS,
        )
        
        back_config = None
        if BACK_CAMERA_SOURCE:
            back_config = StreamConfig(
                stream_id="back",
                source=BACK_CAMERA_SOURCE,
                camera_backend=CAMERA_BACKEND,
                fps_target=STREAM_TARGET_FPS,
                frame_width=MONITOR_FRAME_WIDTH,
                frame_height=MONITOR_FRAME_HEIGHT,
                rtsp_transport=RTSP_TRANSPORT,
                rtsp_timeout_ms=RTSP_TIMEOUT_MS,
            )
        
        # Create dual stream handler
        self.stream_handler = DualStreamHandler(front_config, back_config)
        
        # Start streams
        try:
            self.stream_handler.start()
            logger.info("Streams started successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to start streams: {e}")
            return False

    def run(self):
        """Main monitoring loop."""
        if not self.initialize():
            logger.error("Initialization failed")
            return
        
        self.running = True
        logger.info("Dual camera monitor running (press Ctrl+C to stop)")
        
        inference_frame_count = defaultdict(int)
        last_stats_time = time.time()
        
        try:
            while self.running:
                # Get latest frames from both streams
                frames = self.stream_handler.get_frames()
                front_frame = frames.get("front")
                back_frame = frames.get("back")
                
                # Process front camera
                if front_frame is not None:
                    inference_frame_count["front"] += 1
                    
                    # Run inference every N frames
                    if inference_frame_count["front"] % YOLO_PROCESS_EVERY == 0:
                        inference_result = predict_cheating_behavior(front_frame, "front")
                        
                        # Emit inference alerts if any
                        if inference_result.get("alerts"):
                            for alert in inference_result["alerts"]:
                                alert["stream_id"] = "front"
                                print(f"ALERT:{json.dumps(alert)}", flush=True)
                    
                    # Emit frame
                    encoded = encode_frame_for_stream(front_frame)
                    if encoded:
                        self._emit_frame("front", encoded)
                
                # Process back camera
                if back_frame is not None:
                    inference_frame_count["back"] += 1
                    
                    # Run inference every N frames
                    if inference_frame_count["back"] % YOLO_PROCESS_EVERY == 0:
                        inference_result = predict_cheating_behavior(back_frame, "back")
                        
                        # Emit inference alerts if any
                        if inference_result.get("alerts"):
                            for alert in inference_result["alerts"]:
                                alert["stream_id"] = "back"
                                print(f"ALERT:{json.dumps(alert)}", flush=True)
                    
                    # Emit frame
                    encoded = encode_frame_for_stream(back_frame)
                    if encoded:
                        self._emit_frame("back", encoded)
                
                # Print stats periodically
                now = time.time()
                if now - last_stats_time >= 5.0:
                    status = self.stream_handler.get_status()
                    logger.info(f"Stream status: {json.dumps(status, indent=2)}")
                    last_stats_time = now
                
                time.sleep(0.01)  # Small sleep to prevent busy waiting
                
        except KeyboardInterrupt:
            logger.info("Monitor interrupted by user")
        except Exception as e:
            logger.error(f"Unexpected error: {e}", exc_info=True)
        finally:
            self.shutdown()

    def _emit_frame(self, stream_id: str, encoded_frame: str):
        """Emit frame with throttling."""
        now = time.time()
        min_interval = 1.0 / STREAM_TARGET_FPS
        
        if stream_id not in self.throttle_state["last_emit"]:
            self.throttle_state["last_emit"][stream_id] = 0
        
        last_emit = self.throttle_state["last_emit"][stream_id]
        
        if now - last_emit >= min_interval:
            # Output format: FRAME:<stream_id>:<base64_data>
            print(f"FRAME:{stream_id}:{encoded_frame}", flush=True)
            self.throttle_state["last_emit"][stream_id] = now

    def shutdown(self):
        """Cleanup."""
        logger.info("Shutting down monitor")
        self.running = False
        if self.stream_handler:
            self.stream_handler.stop()
        logger.info("Monitor stopped")


def main():
    """Entry point."""
    logger.info("=" * 80)
    logger.info("Dual Camera Monitor Starting")
    logger.info("=" * 80)
    
    monitor = DualCameraMonitor()
    monitor.run()


if __name__ == '__main__':
    main()
