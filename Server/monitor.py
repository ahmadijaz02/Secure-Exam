"""Integrated Exam Monitoring System with Flask streaming support.

Combines the advanced MediaPipe hand/face detection from exam_monitor.py
with the Flask streaming format (FRAME: and ALERT: outputs) required by the
Flask parent process to forward to Socket.IO clients.
"""

from __future__ import annotations

import base64
import os
import signal
import sys
import threading
import time
import logging
import argparse
from collections import deque
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np
from ultralytics import YOLO

try:
    import mediapipe as mp
except ImportError:
    mediapipe = None
    mp = None

try:
    import onnxruntime as ort  # type: ignore[reportMissingImports]
except Exception:
    ort = None

try:
    import winsound  # Windows-only
except Exception:
    winsound = None

# ---------------------------------------------------------------------------
# Environment helpers (from original monitor.py)
# ---------------------------------------------------------------------------

def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return int(default)

def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except (TypeError, ValueError):
        return float(default)

def _env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}

def _profiled_env(name: str, default: Optional[str] = None) -> Optional[str]:
    """Return an environment value, honoring the current camera mode prefix."""
    mode = os.environ.get("MONITOR_CAMERA_MODE", "").strip().upper()
    if mode:
        override_key = f"{mode}_{name}"
        if override_key in os.environ:
            return os.environ[override_key]
    if name in os.environ:
        return os.environ[name]
    return default

def _env_int_profiled(name: str, default: int) -> int:
    value = _profiled_env(name)
    if value is None:
        return int(default)
    try:
        return int(value)
    except (TypeError, ValueError):
        return int(default)

def _env_float_profiled(name: str, default: float) -> float:
    value = _profiled_env(name)
    if value is None:
        return float(default)
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(default)

def _env_bool_profiled(name: str, default: bool) -> bool:
    value = _profiled_env(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}

def _parse_camera_source(raw_value: str) -> int | str:
    raw_value = (raw_value or "0").strip()
    try:
        return int(raw_value)
    except ValueError:
        return raw_value

# ---------------------------------------------------------------------------
# Paths and global state
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
SUSPICIOUS_DIR = BASE_DIR / "suspicious_alerts"
SUSPICIOUS_DIR.mkdir(parents=True, exist_ok=True)

SESSION_FOLDER = os.environ.get("EXAM_SESSION_FOLDER")
if not SESSION_FOLDER:
    SESSION_FOLDER = f"session-{datetime.now().strftime('%Y-%m-%d')}"
SESSION_DIR = SUSPICIOUS_DIR / SESSION_FOLDER
SESSION_DIR.mkdir(parents=True, exist_ok=True)

stop_event = threading.Event()

def _install_signal_handlers() -> None:
    def _handler(signum, _frame):
        log(f"Received signal {signum}; shutting down...")
        stop_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            signal.signal(sig, _handler)
        except Exception:
            pass  # Windows only delivers SIGINT; ignore unsupported ones.

_install_signal_handlers()

# ---------------------------------------------------------------------------
# Configuration (combining both systems)
# ---------------------------------------------------------------------------

# Camera configuration
CAMERA_MODE = os.environ.get("MONITOR_CAMERA_MODE", "external").strip().lower() or "external"
CAMERA_SOURCE = _parse_camera_source(_profiled_env("MONITOR_CAMERA_SOURCE", "0"))
CAMERA_BACKEND = (_profiled_env("MONITOR_CAMERA_BACKEND", "auto") or "auto").strip().lower()
CAMERA_WARMUP_FRAMES = _env_int_profiled("CAMERA_WARMUP_FRAMES", 2)
CAMERA_WARMUP_DELAY_SEC = _env_float_profiled("CAMERA_WARMUP_DELAY_SEC", 0.02)
POST_CAMERA_INIT_DELAY_SEC = _env_float_profiled("POST_CAMERA_INIT_DELAY_SEC", 0.2)
CAMERA_FAILURE_BACKOFF_SEC = _env_float_profiled("CAMERA_FAILURE_BACKOFF_SEC", 1.0)
CAMERA_READ_LATEST = _env_bool_profiled("CAMERA_READ_LATEST", True)
CAMERA_BUFFER_FLUSH = _env_int_profiled("CAMERA_BUFFER_FLUSH", 0)
MONITOR_CAMERA_FPS = _env_float_profiled("MONITOR_CAMERA_FPS", 20.0)

# Processing configuration
PROCESS_WIDTH = max(64, _env_int_profiled("MONITOR_FRAME_WIDTH", 1280))
PROCESS_HEIGHT = max(64, _env_int_profiled("MONITOR_FRAME_HEIGHT", 720))
FORCE_PROCESS_RESIZE = _env_bool_profiled("FORCE_PROCESS_RESIZE", False)
ENABLE_CLAHE = _env_bool_profiled("ENABLE_CLAHE", False)

# Streaming configuration (from original monitor.py)
STREAM_WIDTH = _env_int("STREAM_WIDTH", 960)
STREAM_HEIGHT = _env_int("STREAM_HEIGHT", 540)
STREAM_JPEG_QUALITY = min(100, max(20, _env_int("STREAM_JPEG_QUALITY", 75)))
STREAM_JPEG_OPTIMIZE = _env_bool("STREAM_JPEG_OPTIMIZE", True)
STREAM_JPEG_PROGRESSIVE = _env_bool("STREAM_JPEG_PROGRESSIVE", True)
STREAM_TARGET_FPS = max(1.0, _env_float("STREAM_TARGET_FPS", 15.0))

# YOLO configuration
YOLO_IMAGE_SIZE = max(320, _env_int("YOLO_IMAGE_SIZE", 960))
YOLO_PROCESS_EVERY = max(1, _env_int("YOLO_PROCESS_EVERY", 2))
YOLO_MAX_DETECTIONS = max(10, _env_int("YOLO_MAX_DETECTIONS", 80))
USE_ONNX_RUNTIME_DML = os.environ.get("USE_ONNX_RUNTIME_DML", "0").strip().lower() in {"1", "true", "yes", "on"}
YOLO_DEVICE_PREF = os.environ.get("YOLO_DEVICE", "cpu")
YOLO_MODEL_PATH = os.environ.get("YOLO_WORLD_MODEL", "yolov8m-worldv2.pt")
if not os.path.isabs(YOLO_MODEL_PATH):
    YOLO_MODEL_PATH = str(BASE_DIR / YOLO_MODEL_PATH)

YOLO_CLASSES = [cls.strip() for cls in os.environ.get(
    "YOLO_WORLD_CLASSES",
    "cell phone, wrist watch, exam paper, answer sheet, question paper",
).split(",") if cls.strip()]

# Extended YOLO classes from exam_monitor.py
EXTENDED_YOLO_CLASSES = [
    # Mobile phones - clear identifiers
    "mobile phone", "cell phone", "cellphone", "smartphone", "phone", "mobile", "mobile device",
    # Phone locations indicating active cheating/hiding
    "phone in hand", "cell phone in hand", "phone between legs", "phone in lap", "phone on lap",
    # Watches
    "wristwatch", "smartwatch", "analog watch",
    # Papers and notebooks for cheating
    "paper", "sheet of paper", "notebook", "cheat sheet", "document", "textbook", "printed paper", "book",
]

# Detection thresholds (aligned with exam_monitor.py)
GENERAL_DISPLAY_CONF = _env_float("GENERAL_DISPLAY_CONF", 0.25)  # Changed from 0.12 to 0.25
PHONE_MIN_CONF = _env_float("PHONE_MIN_CONF", 0.45)  # Lowered from 0.60 to 0.45
PHONE_CLASS_MIN_CONF = _env_float("PHONE_CLASS_MIN_CONF", max(0.35, PHONE_MIN_CONF))
WATCH_CLASS_MIN_CONF = _env_float("WATCH_CLASS_MIN_CONF", 0.20)
PAPER_CLASS_MIN_CONF = _env_float("PAPER_CLASS_MIN_CONF", max(0.20, GENERAL_DISPLAY_CONF))
MODEL_INFER_CONF = _env_float("MODEL_INFER_CONF", max(0.25, GENERAL_DISPLAY_CONF))  # Changed from 0.08 to 0.25
OBJECT_DRAW_MIN_CONF = _env_float("OBJECT_DRAW_MIN_CONF", max(0.25, MODEL_INFER_CONF))  # Changed from 0.10 to 0.25

# MediaPipe configuration (aligned with exam_monitor.py)
MEDIAPIPE_PROCESS_EVERY = _env_int_profiled("MEDIAPIPE_PROCESS_EVERY", 4)
HAND_GESTURE_ENABLED = _env_bool_profiled("HAND_GESTURE_ENABLED", True)
HAND_GESTURE_MIN_CONFIDENCE = _env_float_profiled("HAND_GESTURE_MIN_CONFIDENCE", 0.5)
HAND_GESTURE_REQUIRE_FRAMES = _env_int_profiled("HAND_GESTURE_REQUIRE_FRAMES", 4)

# Alert configuration (aligned with exam_monitor.py)
ALERT_CONFIRM_FRAMES = max(1, _env_int("ALERT_CONFIRM_FRAMES", 3))  # Changed from 1 to 3
OVERLAY_PERSISTENCE_SEC = max(0.0, _env_float("OVERLAY_PERSISTENCE_SEC", 1.5))  # Changed from 0.6 to 1.5
ALERT_COOLDOWN_SEC = _env_float("ALERT_COOLDOWN_SEC", 3.0)

# ---------------------------------------------------------------------------
# Detection classes
# ---------------------------------------------------------------------------

@dataclass
class DetectionRule:
    reason: str
    min_conf: float
    min_area_fraction: float
    max_area_fraction: float
    cooldown: float

DETECTION_RULES: Dict[str, DetectionRule] = {
    "mobile": DetectionRule(
        reason="PHONE_DETECTED",
        min_conf=max(GENERAL_DISPLAY_CONF, PHONE_CLASS_MIN_CONF),
        min_area_fraction=0.00004,
        max_area_fraction=0.30,
        cooldown=ALERT_COOLDOWN_SEC,
    ),
    "watch": DetectionRule(
        reason="WATCH_DETECTED",
        min_conf=max(GENERAL_DISPLAY_CONF, WATCH_CLASS_MIN_CONF),
        min_area_fraction=0.00004,
        max_area_fraction=0.30,
        cooldown=ALERT_COOLDOWN_SEC,
    ),
    "paper": DetectionRule(
        reason="PAPER_PASSING",
        min_conf=max(GENERAL_DISPLAY_CONF, PAPER_CLASS_MIN_CONF),
        min_area_fraction=0.00004,
        max_area_fraction=0.30,
        cooldown=ALERT_COOLDOWN_SEC,
    ),
}

# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------

def log(message: str) -> None:
    print(f"[Monitor] {message}", flush=True)

def _beep(kind: str):
    if not _env_bool("SOUND_ENABLED", True):
        return
    if winsound is None:
        return
    tones = {
        "mobile": (1200, 150),
        "watch": (1000, 150),
        "paper": (900, 150),
        "generic": (800, 120),
    }
    freq, dur = tones.get(kind, tones["generic"])
    try:
        winsound.Beep(int(freq), int(dur))
    except Exception:
        pass

def apply_clahe(image: np.ndarray) -> np.ndarray:
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)
    l_channel = clahe.apply(l_channel)
    lab = cv2.merge((l_channel, a_channel, b_channel))
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)

def encode_frame_for_stream(frame: np.ndarray) -> Optional[str]:
    if frame is None:
        return None
    target_w = STREAM_WIDTH or frame.shape[1]
    target_h = STREAM_HEIGHT or frame.shape[0]
    if target_w > 0 and target_h > 0 and (frame.shape[1] != target_w or frame.shape[0] != target_h):
        frame = cv2.resize(frame, (target_w, target_h), interpolation=cv2.INTER_AREA)
    encode_params = [int(cv2.IMWRITE_JPEG_QUALITY), STREAM_JPEG_QUALITY]
    if STREAM_JPEG_OPTIMIZE:
        encode_params.extend([int(cv2.IMWRITE_JPEG_OPTIMIZE), 1])
    if STREAM_JPEG_PROGRESSIVE:
        encode_params.extend([int(cv2.IMWRITE_JPEG_PROGRESSIVE), 1])
    ok, buffer = cv2.imencode(".jpg", frame, encode_params)
    if not ok:
        return None
    return base64.b64encode(buffer.tobytes()).decode("ascii")

def emit_frame(frame: np.ndarray, throttle_state: Dict[str, float]) -> None:
    now = time.time()
    min_interval = 1.0 / STREAM_TARGET_FPS
    last_emit = throttle_state.get("last_emit", 0.0)
    if now - last_emit < min_interval:
        return
    frame_payload = encode_frame_for_stream(frame)
    if not frame_payload:
        return
    print(f"FRAME:{frame_payload}", flush=True)
    throttle_state["last_emit"] = now

def emit_alert(reason: str, bbox: Tuple[float, float, float, float],
              confidence: float, frame_dims: Tuple[int, int],
              snapshot_path: Optional[str], timestamp: datetime) -> None:
    cx = int((bbox[0] + bbox[2]) / 2.0)
    cy = int((bbox[1] + bbox[3]) / 2.0)
    frame_w, frame_h = frame_dims
    filename = ""
    if snapshot_path:
        try:
            resolved = Path(snapshot_path)
            if resolved.is_absolute():
                filename = str(resolved.relative_to(SUSPICIOUS_DIR))
            else:
                filename = str(resolved)
        except Exception:
            filename = str(snapshot_path)
        filename = filename.replace("\\", "/")
    payload = f"ALERT:{reason}|{timestamp.isoformat()}|{filename}|{cx},{cy},{frame_w},{frame_h}"
    print(payload, flush=True)

def save_evidence(
    frame: np.ndarray,
    reason: str,
    timestamp: datetime,
    bbox: Optional[Sequence[float]] = None,
    label: Optional[str] = None,
    confidence: Optional[float] = None,
) -> Optional[str]:
    safe_reason = reason.lower().replace(" ", "_")
    timestamp = timestamp or datetime.utcnow()
    ts_label = timestamp.strftime("%Y%m%d-%H%M%S")
    filename = f"{ts_label}-{safe_reason}.jpg"
    output_path = SESSION_DIR / filename
    try:
        annotated = frame.copy()
        frame_h, frame_w = annotated.shape[:2]
        if bbox is not None and len(bbox) >= 4:
            x1 = int(max(0, min(frame_w - 1, bbox[0])))
            y1 = int(max(0, min(frame_h - 1, bbox[1])))
            x2 = int(max(0, min(frame_w - 1, bbox[2])))
            y2 = int(max(0, min(frame_h - 1, bbox[3])))
            if x2 > x1 and y2 > y1:
                box_label = (label or reason).upper()
                color = (0, 0, 255)  # Red for alerts
                cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
                if confidence is not None:
                    box_caption = f"{box_label} {confidence * 100:.0f}%"
                else:
                    box_caption = box_label
                (text_w, text_h), _ = cv2.getTextSize(box_caption, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
                text_y = max(text_h + 6, y1 - 8)
                cv2.rectangle(annotated, (x1, text_y - text_h - 6), (x1 + text_w + 8, text_y + 2), color, -1)
                cv2.putText(annotated, box_caption, (x1 + 4, text_y - 3), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 2, cv2.LINE_AA)

        alert_banner = f"ALERT: {reason}"
        ts_caption = timestamp.strftime("%Y-%m-%d %H:%M:%S UTC")
        cv2.rectangle(annotated, (8, 8), (min(frame_w - 8, 430), 62), (0, 0, 0), -1)
        cv2.putText(annotated, alert_banner, (14, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2, cv2.LINE_AA)
        cv2.putText(annotated, ts_caption, (14, 52), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (230, 230, 230), 1, cv2.LINE_AA)

        cv2.imwrite(str(output_path), annotated)
        return str(output_path)
    except Exception as exc:
        log(f"Failed to write evidence frame: {exc}")
        return None

# ---------------------------------------------------------------------------
# Violation Tracker (from exam_monitor.py)
# ---------------------------------------------------------------------------

class ViolationTracker:
    def __init__(self, cooldown: float = 3.0):
        self.cooldown = cooldown
        self.counts = {
            "paper_swap": 0,
            "mobile": 0,
            "watch": 0,
            "head_turn": 0,
            "head_down": 0,
            "hand_signal": 0,
        }
        self._last_alert = {}

    def record(self, violation: str) -> bool:
        now = time.time()
        if now - self._last_alert.get(violation, 0) >= self.cooldown:
            # Initialize count if this is a new violation type
            if violation not in self.counts:
                self.counts[violation] = 0
            self.counts[violation] += 1
            self._last_alert[violation] = now
            log(f"VIOLATION: {violation} (total: {self.counts[violation]})")
            return True
        return False

# ---------------------------------------------------------------------------
# MediaPipe Hand and Face Movement Detector (from exam_monitor.py)
# ---------------------------------------------------------------------------

class HandFaceMovementDetector:
    def __init__(self):
        # Detection thresholds
        self.YAW_THRESHOLD = 70  # degrees - head turn left/right
        self.PITCH_DOWN_THRESH = -10  # degrees - head looking down
        self.ALERT_THRESHOLD = 30  # Risk score threshold
        self.ALERT_COOLDOWN = 2.0  # seconds between alerts
        
        # Risk weights
        self.RISK_WEIGHTS = {
            "head_turn": 50,
            "head_down": 50,
            "hand_signal": 100,
        }
        
        # Suspicious gestures
        self.SUSPICIOUS_GESTURES = {"1", "2", "3", "4", "5", "high_five"}
        
        # Finger landmarks
        self.FINGER_TIPS = [4, 8, 12, 16, 20]
        self.FINGER_PIPS = [3, 6, 10, 14, 18]
        self.FINGER_MCPS = [2, 5, 9, 13, 17]
        
        # Initialize MediaPipe
        self.face_mesh = None
        self.hands_sol = None
        if mp is not None:
            self.face_mesh = mp.solutions.face_mesh.FaceMesh(
                max_num_faces=4,
                refine_landmarks=True,
                min_detection_confidence=0.4,
                min_tracking_confidence=0.4
            )
            self.hands_sol = mp.solutions.hands.Hands(
                max_num_hands=8,
                model_complexity=1,
                min_detection_confidence=0.4,
                min_tracking_confidence=0.4
            )
        
        # Student tracking
        self.students = {}
        self.gesture_tracker = {}
        self.last_alert = {}
        
    def estimate_head_pose(self, landmarks, w, h, student_data):
        """Estimate yaw (left/right) and pitch (up/down) from face mesh."""
        nose_tip = landmarks[1]
        left_eye = landmarks[33]
        right_eye = landmarks[263]
        chin = landmarks[152]
        forehead = landmarks[10]

        # Yaw: asymmetry of eye distances from nose
        l_dist = abs(nose_tip.x - left_eye.x)
        r_dist = abs(nose_tip.x - right_eye.x)
        total = l_dist + r_dist
        yaw = ((l_dist - r_dist) / total * 90) if total > 0.01 else 0.0

        # Pitch: nose position relative to eye-chin axis
        eye_mid_y = (left_eye.y + right_eye.y) / 2
        face_h = abs(chin.y - forehead.y)
        pitch = ((nose_tip.y - eye_mid_y) / face_h - 0.3) * -120 if face_h > 0.05 else 0.0

        # Smooth using student-specific buffers
        if "yaw_smooth" not in student_data:
            student_data["yaw_smooth"] = deque(maxlen=6)
            student_data["pitch_smooth"] = deque(maxlen=6)
        
        student_data["yaw_smooth"].append(yaw)
        student_data["pitch_smooth"].append(pitch)
        yaw_s = np.mean(student_data["yaw_smooth"])
        pitch_s = np.mean(student_data["pitch_smooth"])

        return float(yaw_s), float(pitch_s)
    
    def classify_gesture(self, lm):
        """Classify hand gesture with strict structural validation to avoid false positives."""
            
        extended = []
        for i, (tip, pip, mcp) in enumerate(zip(self.FINGER_TIPS, self.FINGER_PIPS, self.FINGER_MCPS)):
            # Distance from tip to base knuckle (mcp)
            tip_mcp_dist = np.hypot(lm[tip].x - lm[mcp].x, lm[tip].y - lm[mcp].y)
            # Distance from first joint (pip) to base knuckle (mcp)
            pip_mcp_dist = np.hypot(lm[pip].x - lm[mcp].x, lm[pip].y - lm[mcp].y)
            
            if i == 0:  # Thumb
                extended.append(tip_mcp_dist > 0.05)
            else:
                # Finger must be fully uncurled (tip far away from mcp) AND pointing upwards
                is_straight = tip_mcp_dist > (pip_mcp_dist * 1.5)
                is_up = lm[tip].y < lm[pip].y
                extended.append(is_straight and is_up)

        # Count extended main fingers (Index, Middle, Ring, Pinky)
        finger_count = sum(extended[1:])
        
        # If all 4 main fingers are curled/closed, ignore (prevents counting fists/thumbs as signals)
        if finger_count == 0:
            return "none"
        elif finger_count == 1:
            return "1"
        elif finger_count == 2:
            return "2"
        elif finger_count == 3:
            return "3"
        elif finger_count == 4 and not extended[0]:
            return "4"
        elif finger_count == 4 and extended[0]:
            return "5"
        
        return "none"
    
    def is_confident_counting_gesture(self, gesture_type, student_id):
        """Determine if counting gesture is deliberate and confident."""
        if gesture_type not in {"1", "2", "3", "4", "5"}:
            if student_id in self.gesture_tracker:
                self.gesture_tracker[student_id]["gesture"] = "none"
                self.gesture_tracker[student_id]["frames"] = 0
            return False
        
        if student_id not in self.gesture_tracker:
            self.gesture_tracker[student_id] = {"gesture": "none", "frames": 0}
        
        tracker = self.gesture_tracker[student_id]
        
        if tracker.get("gesture") != gesture_type:
            tracker["gesture"] = gesture_type
            tracker["frames"] = 1
            return False
        
        tracker["frames"] = tracker.get("frames", 0) + 1
        return tracker["frames"] >= HAND_GESTURE_REQUIRE_FRAMES
    
    def match_hands_to_student(self, hand_multi, face_lms, w, h):
        """Match hands to a specific student based on proximity to their face."""
        if not face_lms or not hand_multi:
            return []
        
        face_x = np.mean([lm.x for lm in face_lms])
        face_y = np.mean([lm.y for lm in face_lms])
        
        matched_hands = []
        for hand in hand_multi:
            wrist = hand[0]
            # Match hands that are relatively close to the face horizontally
            if abs(wrist.x - face_x) < 0.4:
                matched_hands.append(hand)
        
        return matched_hands
    
    def detect(self, frame_bgr):
        """Main detection method - returns violations and overlay data."""
        if self.face_mesh is None or self.hands_sol is None:
            return [], []
        
        h, w = frame_bgr.shape[:2]
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        rgb.flags.writeable = False

        face_results = self.face_mesh.process(rgb)
        hand_results = self.hands_sol.process(rgb)

        rgb.flags.writeable = True

        # Get detected faces and hands
        face_lms_list = [lm.landmark for lm in face_results.multi_face_landmarks] \
                        if face_results.multi_face_landmarks else []
        hand_multi = [h_lm.landmark for h_lm in hand_results.multi_hand_landmarks] \
                     if hand_results.multi_hand_landmarks else []

        violations = []
        overlay_data = []
        
        # Process each detected face
        for face_idx, face_lms in enumerate(face_lms_list):
            student_id = f"student_{face_idx}"
            
            if student_id not in self.students:
                self.students[student_id] = {
                    "risk_score": 0.0,
                    "flags": {k: False for k in self.RISK_WEIGHTS},
                    "head_yaw": 0.0,
                    "head_pitch": 0.0,
                    "gesture": "none",
                    "last_alert": 0.0,
                }
            
            student = self.students[student_id]
            flags = {k: False for k in self.RISK_WEIGHTS}
            
            # Head pose detection
            yaw, pitch = self.estimate_head_pose(face_lms, w, h, student)
            student["head_yaw"] = yaw
            student["head_pitch"] = pitch
            
            flags["head_turn"] = abs(yaw) > self.YAW_THRESHOLD
            flags["head_down"] = pitch < self.PITCH_DOWN_THRESH
            
            # Hand detection - show all detected hands
            if hand_multi:
                # First try to match hands to students for gesture analysis
                hands_for_student = self.match_hands_to_student(hand_multi, face_lms, w, h)
                
                if hands_for_student:
                    gestures = [self.classify_gesture(lm) for lm in hands_for_student]
                    gesture = gestures[0] if gestures else "none"
                    student["gesture"] = gesture
                    
                    # Check for suspicious gestures
                    for hand_idx, (gesture_type, hand_lms) in enumerate(zip(gestures, hands_for_student)):
                        if self.is_confident_counting_gesture(gesture_type, student_id):
                            flags["hand_signal"] = True
                            break
                
                # Show ALL detected hands (not just matched ones) for better visualization
                for hand_idx, hand_lms in enumerate(hand_multi):
                    gesture = "none"
                    if hands_for_student and hand_lms in hands_for_student:
                        matched_idx = hands_for_student.index(hand_lms)
                        if matched_idx < len([g for g in [self.classify_gesture(lm) for lm in hands_for_student] if g != "none"]):
                            gesture = [g for g in [self.classify_gesture(lm) for lm in hands_for_student] if g != "none"][matched_idx]
                    
                    overlay_data.append({
                        "type": "hands",
                        "landmarks": [hand_lms],
                        "gesture": gesture
                    })
            
            # Update student state
            student["flags"] = flags
            
            # Calculate risk score
            raw = sum(self.RISK_WEIGHTS[k] for k, v in flags.items() if v)
            raw = min(raw, 100)
            student["risk_score"] = raw
            
            # Check for violations
            now = time.time()
            if student["risk_score"] >= self.ALERT_THRESHOLD and now - student.get("last_alert", 0) > self.ALERT_COOLDOWN:
                active_flags = [k for k, v in flags.items() if v]
                
                for flag in active_flags:
                    if flag == "head_turn":
                        direction = "RIGHT" if yaw > 0 else "LEFT"
                        violations.append({
                            "type": "head_turn",
                            "description": f"Head turned {direction} ({yaw:.1f}°)",
                            "student_id": student_id,
                            "confidence": student["risk_score"] / 100.0
                        })
                    elif flag == "head_down":
                        violations.append({
                            "type": "head_down", 
                            "description": f"Looking down (pitch {pitch:.1f}°)",
                            "student_id": student_id,
                            "confidence": student["risk_score"] / 100.0
                        })
                    elif flag == "hand_signal":
                        violations.append({
                            "type": "hand_signal",
                            "description": f"Suspicious hand gesture: {gesture}",
                            "student_id": student_id,
                            "confidence": student["risk_score"] / 100.0
                        })
                
                student["last_alert"] = now
            
            overlay_data.append({
                "type": "face",
                "landmarks": face_lms,
                "student_id": student_id,
                "yaw": yaw,
                "pitch": pitch,
                "flags": flags
            })
        
        return violations, overlay_data

    def draw_overlay(self, frame, overlay_data):
        """Draw face and hand overlays on frame."""
        h, w = frame.shape[:2]
        
        for data in overlay_data:
            if data["type"] == "face":
                self._draw_face_overlay(frame, data, w, h)
            elif data["type"] == "hands":
                self._draw_hand_overlay(frame, data, w, h)
    
    def _draw_face_overlay(self, frame, data, w, h):
        """Draw face detection overlay."""
        face_lms = data["landmarks"]
        student_id = data["student_id"]
        yaw = data["yaw"]
        pitch = data["pitch"]
        flags = data["flags"]
        
        # Color based on detection status
        color = (0, 0, 255) if (abs(yaw) > self.YAW_THRESHOLD or pitch < self.PITCH_DOWN_THRESH) else (0, 255, 255)
        
        # Key landmark dots
        key_pts = [1, 33, 263, 152, 10, 61, 291, 4]
        for i in key_pts:
            p = face_lms[i]
            px, py = int(p.x * w), int(p.y * h)
            cv2.circle(frame, (px, py), 3, color, -1)
        
        # Gaze direction arrow from nose
        nose = face_lms[1]
        nx, ny = int(nose.x * w), int(nose.y * h)
        dx = int(np.sin(np.radians(yaw)) * 60)
        dy = int(-np.sin(np.radians(pitch)) * 60)
        cv2.arrowedLine(frame, (nx, ny), (nx + dx, ny + dy), color, 2, tipLength=0.3)
        
        # Face bounding box
        xs = [lm.x for lm in face_lms]
        ys = [lm.y for lm in face_lms]
        x1 = max(0, int(min(xs)*w) - 14)
        y1 = max(0, int(min(ys)*h) - 14)
        x2 = min(w, int(max(xs)*w) + 14)
        y2 = min(h, int(max(ys)*h) + 14)
        
        # Draw dashed rectangle
        self._draw_dashed_rect(frame, x1, y1, x2, y2, color, 1)
        
        # Draw student ID and status
        status_text = f"{student_id.upper()}"
        if flags.get("head_turn"):
            status_text += " TURN"
        if flags.get("head_down"):
            status_text += " DOWN"
        
        cv2.putText(frame, status_text, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA)
    
    def _draw_hand_overlay(self, frame, data, w, h):
        """Draw hand detection overlay."""
        hand_multi = data["landmarks"]
        gesture = data["gesture"]
        
        CONNECTIONS = [
            (0,1),(1,2),(2,3),(3,4),
            (0,5),(5,6),(6,7),(7,8),
            (0,9),(9,10),(10,11),(11,12),
            (0,13),(13,14),(14,15),(15,16),
            (0,17),(17,18),(18,19),(19,20),
            (5,9),(9,13),(13,17)
        ]
        
        for lm in hand_multi:
            pts = [(int(p.x*w), int(p.y*h)) for p in lm]
            for a, b in CONNECTIONS:
                cv2.line(frame, pts[a], pts[b], (0, 165, 255), 1)
            for i, pt in enumerate(pts):
                r = 5 if i == 0 else 3
                cv2.circle(frame, pt, r, (255, 255, 255) if i == 0 else (0, 165, 255), -1)
        
        # Draw gesture text
        if gesture != "none" and gesture != "closed":
            cv2.putText(frame, f"Gesture: {gesture}", (10, h - 100), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2, cv2.LINE_AA)
    
    def _draw_dashed_rect(self, img, x1, y1, x2, y2, color, thickness, gap=10):
        """Draw dashed rectangle."""
        for side in [(x1,y1,x2,y1),(x2,y1,x2,y2),(x2,y2,x1,y2),(x1,y2,x1,y1)]:
            ax,ay,bx,by = side
            length = int(np.hypot(bx-ax, by-ay))
            for s in range(0, length, gap*2):
                e = min(s+gap, length)
                t = s/length; t2 = e/length
                cv2.line(img,
                         (int(ax+t*(bx-ax)),  int(ay+t*(by-ay))),
                         (int(ax+t2*(bx-ax)), int(ay+t2*(by-ay))),
                         color, thickness)

# ---------------------------------------------------------------------------
# YOLO-World Detector (enhanced from both systems)
# ---------------------------------------------------------------------------

class YOLOWorldDetector:
    MOBILE_CLASSES = {
        "mobile phone", "cell phone", "cellphone", "phone", "smartphone", "smart phone",
        "mobile", "mobile device", "cell phone in hand",
        "phone between legs", "phone in lap", "phone on lap", "phone on desk",
        "phone on table", "phone lying down", "phone laying down", "phone face up",
        "phone face down", "lying smartphone", "flat smartphone",
    }
    WATCH_CLASSES = {"wristwatch", "smartwatch", "analog watch", "wrist watch"}
    PAPER_CLASSES = {
        "paper", "sheet of paper", "notebook", "cheat sheet", "document",
        "book", "textbook", "printed paper", "card", "id card", "exam paper",
        "answer sheet", "question paper",
    }

    def __init__(self, model_path: str, prompts: Sequence[str]):
        resolved_path = Path(model_path)
        if not resolved_path.is_absolute():
            resolved_path = BASE_DIR / resolved_path
        fallback_path = BASE_DIR / "yolov8s-worldv2.pt"
        if not resolved_path.exists():
            if fallback_path.exists() and resolved_path != fallback_path:
                log(f"Requested YOLO model '{resolved_path.name}' not found. Falling back to '{fallback_path.name}'.")
                resolved_path = fallback_path
            else:
                raise FileNotFoundError(f"YOLO model not found: {resolved_path}")
        self.model_path = str(resolved_path)
        self.prompts = [p.strip() for p in prompts if p.strip()]
        self.device = YOLO_DEVICE_PREF or "cpu"
        
        log(f"Loading YOLO-World model: {self.model_path} (device={self.device})")
        self.model = YOLO(self.model_path)
        if hasattr(self.model, "set_classes"):
            self.model.set_classes(self.prompts)
        else:
            self.model.model.names = {idx: name for idx, name in enumerate(self.prompts)}

    def detect(self, frame: np.ndarray) -> List[Dict[str, object]]:
        try:
            results = self.model.predict(
                source=frame,
                imgsz=YOLO_IMAGE_SIZE,
                conf=MODEL_INFER_CONF,
                max_det=YOLO_MAX_DETECTIONS,
                verbose=False,
                device=self.device,
            )
        except Exception as exc:
            log(f"YOLO inference error: {exc}")
            return []
        if not results:
            return []
        detections: List[Dict[str, object]] = []
        boxes = results[0].boxes
        if boxes is None:
            return detections
        for box in boxes:
            cls_idx = int(box.cls[0]) if box.cls is not None else -1
            label = self.prompts[cls_idx] if 0 <= cls_idx < len(self.prompts) else str(cls_idx)
            coords = box.xyxy[0].detach().cpu().numpy().tolist()
            
            # Normalize label to category
            label_lower = label.lower()
            
            # Skip only plain hand/face detections - but allow phone in hand, cell phone in hand
            if label_lower in ["hand", "hands", "finger", "fingers", "face", "head", "person"]:
                continue
                
            if label_lower in self.MOBILE_CLASSES or any(tok in label_lower for tok in ["phone", "smartphone", "cell phone", "cellphone", "mobile"]):
                category = "mobile"
            elif label_lower in self.WATCH_CLASSES:
                category = "watch"
            elif label_lower in self.PAPER_CLASSES:
                category = "paper"
            else:
                category = "other"
            
            detections.append({
                "category": category,
                "label": label_lower,
                "conf": float(box.conf[0]) if box.conf is not None else 0.0,
                "bbox": coords,
            })
            
        # Cross-class NMS: Prevent double alerts for the same physical object
        filtered_detections = []
        # Bias the NMS slightly so 'mobile' takes precedence if confidences are extremely close
        # but primarily rely on the raw confidence score.
        detections.sort(key=lambda x: x['conf'] + (0.05 if x['category'] == 'mobile' else 0), reverse=True)
        
        for det in detections:
            keep = True
            for kept_det in filtered_detections:
                boxA = det['bbox']
                boxB = kept_det['bbox']
                xA = max(boxA[0], boxB[0])
                yA = max(boxA[1], boxB[1])
                xB = min(boxA[2], boxB[2])
                yB = min(boxA[3], boxB[3])
                interArea = max(0, xB - xA) * max(0, yB - yA)
                
                boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1])
                boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1])
                unionArea = float(boxAArea + boxBArea - interArea)
                
                iou = interArea / unionArea if unionArea > 0 else 0
                
                if iou > 0.35: # Threshold for classifying as the exact same object
                    keep = False
                    break
                    
            if keep:
                filtered_detections.append(det)
                
        return filtered_detections

# ---------------------------------------------------------------------------
# Camera management (from original monitor.py)
# ---------------------------------------------------------------------------

def open_capture() -> Optional[cv2.VideoCapture]:
    backend_map = {
        "ffmpeg": cv2.CAP_FFMPEG,
        "gstreamer": cv2.CAP_GSTREAMER,
        "dshow": getattr(cv2, "CAP_DSHOW", cv2.CAP_ANY),
        "msmf": getattr(cv2, "CAP_MSMF", cv2.CAP_ANY),
        "auto": cv2.CAP_ANY,
    }

    # Laptop mode should strongly prefer local webcam backends before falling back.
    if CAMERA_MODE == "laptop" and CAMERA_BACKEND == "auto":
        backend_candidates: List[Tuple[str, int]] = [
            ("msmf", backend_map["msmf"]),
            ("dshow", backend_map["dshow"]),
            ("auto", backend_map["auto"]),
        ]
    else:
        backend_name = CAMERA_BACKEND.lower()
        backend_idx = backend_map.get(backend_name, cv2.CAP_ANY)
        backend_candidates = [(backend_name, backend_idx)]

    for backend_name, backend_idx in backend_candidates:
        try:
            cap = cv2.VideoCapture(CAMERA_SOURCE, backend_idx)
            if not cap.isOpened():
                continue
            
            # Apply camera settings
            cap.set(cv2.CAP_PROP_FPS, MONITOR_CAMERA_FPS)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, CAMERA_BUFFER_FLUSH)
            
            # Warm up camera
            for _ in range(CAMERA_WARMUP_FRAMES):
                ret, _ = cap.read()
                if not ret:
                    break
                time.sleep(CAMERA_WARMUP_DELAY_SEC)
            
            if ret:
                log(f"Camera opened successfully with backend '{backend_name}'")
                return cap
            else:
                cap.release()
        except Exception as exc:
            log(f"Failed to open camera with backend '{backend_name}': {exc}")
            continue
    
    log("Failed to open camera with any backend")
    return None

# ---------------------------------------------------------------------------
# Main monitoring loop
# ---------------------------------------------------------------------------

def main():
    log("Starting integrated exam monitoring system...")
    
    # Initialize violation tracker
    tracker = ViolationTracker(cooldown=ALERT_COOLDOWN_SEC)
    
    # Initialize YOLO detector
    yolo = YOLOWorldDetector(YOLO_MODEL_PATH, YOLO_CLASSES + EXTENDED_YOLO_CLASSES)
    
    # Initialize MediaPipe hand/face detector
    handface_detector = HandFaceMovementDetector()
    
    # Open camera
    cap = open_capture()
    if cap is None:
        log("Failed to open camera")
        return
    
    # Post camera initialization delay
    time.sleep(POST_CAMERA_INIT_DELAY_SEC)
    
    # Main loop variables
    frame_idx = 0
    last_detections = []
    last_handface_violations = []
    last_handface_overlay_data = []
    
    # YOLO async threading variables
    yolo_lock = threading.Lock()
    yolo_payload = None
    yolo_running = True
    
    def yolo_worker():
        nonlocal last_detections, yolo_payload, yolo_running
        while yolo_running:
            with yolo_lock:
                frame_local = yolo_payload
                yolo_payload = None
            if frame_local is None:
                time.sleep(0.005)
                continue
            try:
                dets = yolo.detect(frame_local)
                if dets is not None:
                    last_detections = dets
            except Exception as exc:
                log(f"YOLO predict err: {exc}")
                time.sleep(0.05)

    yolo_thread = threading.Thread(target=yolo_worker, daemon=True)
    yolo_thread.start()
    frame_throttle_state = {}
    fps = 0.0
    prev_time = time.time()
    
    try:
        while not stop_event.is_set():
            ret, frame = cap.read()
            if not ret:
                log("Failed to read frame from camera")
                break
            
            # Resize for processing if needed
            if FORCE_PROCESS_RESIZE:
                frame = cv2.resize(frame, (PROCESS_WIDTH, PROCESS_HEIGHT))
            
            # Apply CLAHE if enabled
            if ENABLE_CLAHE:
                frame = apply_clahe(frame)
            
            # Calculate FPS
            now = time.time()
            dt = now - prev_time
            if dt > 0:
                fps = 1.0 / dt
            prev_time = now
            
            frame_idx += 1
            
            # YOLO detection (asynchronous trigger)
            if frame_idx % YOLO_PROCESS_EVERY == 0:
                with yolo_lock:
                    if yolo_payload is None:
                        yolo_payload = frame.copy()
            
            # MediaPipe hand/face detection
            handface_violations = []
            handface_overlay_data = []
            if frame_idx % MEDIAPIPE_PROCESS_EVERY == 0:
                handface_violations, handface_overlay_data = handface_detector.detect(frame)
                last_handface_violations = handface_violations
                last_handface_overlay_data = handface_overlay_data
            
            # Process YOLO detections for alerts
            for detection in last_detections:
                category = detection["category"]
                if category in DETECTION_RULES:
                    rule = DETECTION_RULES[category]
                    conf = detection["conf"]
                    bbox = detection["bbox"]
                    
                    # Logic for Paper Passing: only alert if the paper is physically passed away from personal space
                    if category == "paper" and last_handface_overlay_data:
                        paper_cx = (bbox[0] + bbox[2]) / 2.0
                        frame_w = frame.shape[1]
                        
                        is_passing = True
                        faces_lms = [d["landmarks"] for d in last_handface_overlay_data if d["type"] == "face"]
                        
                        for face_lm in faces_lms:
                            xs = [lm.x * frame_w for lm in face_lm]
                            face_x = np.mean(xs)
                            face_w_px = max(xs) - min(xs)
                            
                            # Personal space radius: enough to cover writing bounds in front of the individual
                            personal_space_radius = max(face_w_px * 2.5, frame_w * 0.15)
                            
                            # If paper is inside someone's personal horizontal bounds, it's their own paper.
                            if abs(paper_cx - face_x) < personal_space_radius:
                                is_passing = False
                                break
                                
                        if not is_passing:
                            continue # Ignore, they are just using their own paper
                    
                    if conf >= rule.min_conf:
                        if tracker.record(category):
                            # Save evidence and emit alert
                            timestamp = datetime.now()
                            snapshot_path = save_evidence(
                                frame, rule.reason, timestamp, bbox, 
                                detection["label"], conf
                            )
                            emit_alert(rule.reason, bbox, conf, 
                                     (frame.shape[1], frame.shape[0]), 
                                     snapshot_path, timestamp)
                            _beep(category)
            
            # Process MediaPipe violations for alerts
            for violation in last_handface_violations:
                violation_type = violation["type"]
                if violation_type == "head_turn":
                    alert_reason = "HEAD_LEFT" if "LEFT" in violation["description"] else "HEAD_RIGHT"
                elif violation_type == "head_down":
                    alert_reason = "HEAD_DOWN"
                elif violation_type == "hand_signal":
                    alert_reason = "HAND_SIGNAL"
                else:
                    continue
                
                if tracker.record(violation_type):
                    timestamp = datetime.now()
                    # Use frame center as bbox for MediaPipe alerts
                    h, w = frame.shape[:2]
                    bbox = (w//4, h//4, 3*w//4, 3*h//4)
                    snapshot_path = save_evidence(frame, alert_reason, timestamp, bbox)
                    emit_alert(alert_reason, bbox, violation["confidence"], 
                             (w, h), snapshot_path, timestamp)
                    _beep("generic")
            
            # Draw YOLO detections for objects only (phones, watches, papers)
            for detection in last_detections:
                x1, y1, x2, y2 = map(int, detection["bbox"])
                conf = detection["conf"]
                category = detection["category"]
                
                # Color based on category
                if category == "mobile":
                    color = (0, 165, 255)  # Orange
                    label_text = "PHONE"
                elif category == "watch":
                    color = (0, 255, 0)  # Green
                    label_text = "WATCH"
                elif category == "paper":
                    color = (255, 0, 0)  # Blue
                    label_text = "PAPER"
                else:
                    color = (0, 255, 255)  # Yellow
                    label_text = "OBJECT"
                
                cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                (text_w, text_h), _ = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.6, 2)
                cv2.rectangle(frame, (x1, y1 - text_h - 8), (x1 + text_w + 8, y1), color, -1)
                cv2.putText(frame, label_text, (x1 + 4, y1 - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2, cv2.LINE_AA)
            
            # MediaPipe overlays enabled - showing hand and face detection without bounding boxes
            handface_detector.draw_overlay(frame, handface_overlay_data if frame_idx % MEDIAPIPE_PROCESS_EVERY == 0 else [])
            
            # Draw FPS
            cv2.putText(frame, f"FPS: {fps:.1f}", (10, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2, cv2.LINE_AA)
            
            # Emit frame
            emit_frame(frame, frame_throttle_state)
            
    except KeyboardInterrupt:
        log("Monitoring interrupted by user")
    except Exception as e:
        log(f"Error in main loop: {e}")
    finally:
        yolo_running = False
        if cap:
            cap.release()
        log("Monitoring stopped")

if __name__ == "__main__":
    main()
