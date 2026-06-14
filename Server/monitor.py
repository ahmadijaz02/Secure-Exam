from __future__ import annotations

import base64
import os
import signal
import sys
import threading
import time
import logging
import argparse
import math
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

from handgesture import HandGestureDetector

try:
    import onnxruntime as ort  
except Exception:
    ort = None

try:
    import winsound  
except Exception:
    winsound = None

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


def _bbox_center(bbox: Sequence[float]) -> Tuple[float, float]:
    x1, y1, x2, y2 = bbox
    return ((x1 + x2) / 2.0, (y1 + y2) / 2.0)


def _bbox_overlap(a: Sequence[float], b: Sequence[float], margin: float = 0.0) -> bool:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    return not (ax2 + margin < bx1 or bx2 + margin < ax1 or ay2 + margin < by1 or by2 + margin < ay1)


def _expand_bbox(bbox: Sequence[float], frac: float) -> Tuple[float, float, float, float]:
    x1, y1, x2, y2 = bbox
    w = x2 - x1
    h = y2 - y1
    return (x1 - w * frac, y1 - h * frac, x2 + w * frac, y2 + h * frac)


def _distance(a: Sequence[float], b: Sequence[float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _is_paper_moved_away(dx: float, dy: float) -> bool:
    # Treat left/right movement as away from the front-facing work area,
    # and backward movement as motion toward the top of the frame.
    if abs(dx) >= abs(dy):
        return True
    return dy < 0 and abs(dy) > abs(dx)


def _person_key(bbox: Sequence[float]) -> str:
    cx, cy = _bbox_center(bbox)
    return f"{int(cx // 50)}_{int(cy // 50)}"


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
            pass  

_install_signal_handlers()

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

RTSP_TRANSPORT = os.environ.get("MONITOR_RTSP_TRANSPORT", "tcp").strip().lower()
RTSP_OPEN_TIMEOUT_MS = _env_int("RTSP_OPEN_TIMEOUT_MS", 10_000)   
RTSP_READ_TIMEOUT_MS = _env_int("RTSP_READ_TIMEOUT_MS", 8_000)    
RTSP_RECONNECT_DELAY_SEC = _env_float("RTSP_RECONNECT_DELAY_SEC", 3.0)
RTSP_MAX_RECONNECTS = _env_int("RTSP_MAX_RECONNECTS", 0)

PROCESS_WIDTH = max(64, _env_int_profiled("MONITOR_FRAME_WIDTH", 1280))
PROCESS_HEIGHT = max(64, _env_int_profiled("MONITOR_FRAME_HEIGHT", 720))
FORCE_PROCESS_RESIZE = _env_bool_profiled("FORCE_PROCESS_RESIZE", False)
ENABLE_CLAHE = _env_bool_profiled("ENABLE_CLAHE", False)

STREAM_WIDTH = _env_int("STREAM_WIDTH", 960)
STREAM_HEIGHT = _env_int("STREAM_HEIGHT", 540)
STREAM_JPEG_QUALITY = min(100, max(20, _env_int("STREAM_JPEG_QUALITY", 75)))
STREAM_JPEG_OPTIMIZE = _env_bool("STREAM_JPEG_OPTIMIZE", True)
STREAM_JPEG_PROGRESSIVE = _env_bool("STREAM_JPEG_PROGRESSIVE", True)
STREAM_TARGET_FPS = max(1.0, _env_float("STREAM_TARGET_FPS", 15.0))

YOLO_IMAGE_SIZE = max(320, _env_int("YOLO_IMAGE_SIZE", 960))
YOLO_PROCESS_EVERY = max(1, _env_int("YOLO_PROCESS_EVERY", 2))
YOLO_MAX_DETECTIONS = max(10, _env_int("YOLO_MAX_DETECTIONS", 80))
USE_ONNX_RUNTIME_DML = os.environ.get("USE_ONNX_RUNTIME_DML", "0").strip().lower() in {"1", "true", "yes", "on"}
YOLO_DEVICE_PREF = os.environ.get("YOLO_DEVICE", "cpu")
YOLO_MODEL_PATH = os.environ.get("YOLO_MODEL", "best_m_v2.pt")
if not os.path.isabs(YOLO_MODEL_PATH):
    YOLO_MODEL_PATH = str(BASE_DIR / YOLO_MODEL_PATH)

YOLO_CLASSES = [cls.strip() for cls in os.environ.get(
    "YOLO_CLASSES",
    "head, face, person, mobile phone, laptop, tablet, paper, wrist watch, exam paper, answer sheet, question paper",
).split(",") if cls.strip()]

EXTENDED_YOLO_CLASSES = [
    # People / body parts for top-view tracking and crop extraction
    "head", "face", "person",
    # Benign digital devices to reduce phone false positives
    "laptop", "notebook computer", "tablet", "ipad",
    # Mobile phones - clear identifiers
    "mobile phone", "cell phone", "cellphone", "smartphone", "phone", "mobile", "mobile device",
    # Phone locations indicating active cheating/hiding
    "phone in hand", "cell phone in hand", "phone between legs", "phone in lap", "phone on lap",
    # Watches
    "wristwatch", "smartwatch", "analog watch",
    # Papers and notebooks for cheating
    "paper", "sheet of paper", "notebook", "cheat sheet", "document", "textbook", "printed paper", "book",
]

GENERAL_DISPLAY_CONF = _env_float("GENERAL_DISPLAY_CONF", 0.25)  
PHONE_MIN_CONF = _env_float("PHONE_MIN_CONF", 0.30)  
PHONE_CLASS_MIN_CONF = _env_float("PHONE_CLASS_MIN_CONF", max(0.40, PHONE_MIN_CONF))
WATCH_CLASS_MIN_CONF = _env_float("WATCH_CLASS_MIN_CONF", 0.20)
PAPER_CLASS_MIN_CONF = _env_float("PAPER_CLASS_MIN_CONF", max(0.30, GENERAL_DISPLAY_CONF))
MODEL_INFER_CONF = _env_float("MODEL_INFER_CONF", max(0.25, GENERAL_DISPLAY_CONF))  
OBJECT_DRAW_MIN_CONF = _env_float("OBJECT_DRAW_MIN_CONF", max(0.25, MODEL_INFER_CONF))  

MEDIAPIPE_PROCESS_EVERY = _env_int_profiled("MEDIAPIPE_PROCESS_EVERY", 4)
MEDIAPIPE_CROP_SIZE = max(128, _env_int_profiled("MEDIAPIPE_CROP_SIZE", 256))
MEDIAPIPE_MAX_CROPS_PER_FRAME = max(1, _env_int_profiled("MEDIAPIPE_MAX_CROPS_PER_FRAME", 8))
MEDIAPIPE_CROP_PADDING = max(0.0, _env_float_profiled("MEDIAPIPE_CROP_PADDING", 0.18))
MEDIAPIPE_HEAD_MIN_CONF = _env_float_profiled("MEDIAPIPE_HEAD_MIN_CONF", 0.28)
MEDIAPIPE_MAX_HEAD_CROPS = max(1, _env_int_profiled("MEDIAPIPE_MAX_HEAD_CROPS", 6))
MEDIAPIPE_PERSON_MIN_CONF = _env_float_profiled("MEDIAPIPE_PERSON_MIN_CONF", 0.20)
MEDIAPIPE_FACE_DET_MIN_CONF = _env_float_profiled("MEDIAPIPE_FACE_DET_MIN_CONF", 0.20)
MEDIAPIPE_FACE_TRACK_MIN_CONF = _env_float_profiled("MEDIAPIPE_FACE_TRACK_MIN_CONF", 0.20)

ALERT_CONFIRM_FRAMES = max(1, _env_int("ALERT_CONFIRM_FRAMES", 3))
OVERLAY_PERSISTENCE_SEC = max(0.0, _env_float("OVERLAY_PERSISTENCE_SEC", 1.5))
ALERT_COOLDOWN_SEC        = _env_float("ALERT_COOLDOWN_SEC", 5.0)    
PAPER_ALERT_COOLDOWN_SEC  = _env_float("PAPER_ALERT_COOLDOWN_SEC", 5.0)   
WATCH_ALERT_COOLDOWN_SEC  = _env_float("WATCH_ALERT_COOLDOWN_SEC", 5.0)   
HEAD_ALERT_COOLDOWN_SEC   = _env_float("HEAD_ALERT_COOLDOWN_SEC", 5.0)    
PAPER_WORK_AREA_MARGIN_FRAC = _env_float("PAPER_WORK_AREA_MARGIN_FRAC", 0.25)
PAPER_MOVEMENT_THRESHOLD_FRAC = _env_float("PAPER_MOVEMENT_THRESHOLD_FRAC", 0.30)
PAPER_DISPLACEMENT_COOLDOWN_SEC = _env_float("PAPER_DISPLACEMENT_COOLDOWN_SEC", PAPER_ALERT_COOLDOWN_SEC)

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
        cooldown=ALERT_COOLDOWN_SEC,          # 30 s
    ),
    "watch": DetectionRule(
        reason="WATCH_DETECTED",
        min_conf=max(GENERAL_DISPLAY_CONF, WATCH_CLASS_MIN_CONF),
        min_area_fraction=0.00004,
        max_area_fraction=0.30,
        cooldown=WATCH_ALERT_COOLDOWN_SEC,    # 30 s
    ),
    "paper": DetectionRule(
        reason="PAPER_PASSING",
        min_conf=max(GENERAL_DISPLAY_CONF, PAPER_CLASS_MIN_CONF),
        min_area_fraction=0.00004,
        max_area_fraction=0.30,
        cooldown=PAPER_ALERT_COOLDOWN_SEC,    
    ),
}

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

FRIENDLY_LABELS = {
    "PHONE_DETECTED": "Phone Detected",
    "WATCH_DETECTED": "Watch Detected",
    "PAPER_PASSING": "Paper Passing",
    "PAPER_DISPLACEMENT": "Paper Displaced",
    "HEAD_LEFT": "Head Looking Left",
    "HEAD_RIGHT": "Head Looking Right",
    "HEAD_DOWN": "Head Down",
    "HAND_GESTURE": "Hand Gesture",
    "mobile phone": "Phone Detected",
    "cell phone": "Phone Detected",
    "cellphone": "Phone Detected",
    "phone": "Phone Detected",
    "smartphone": "Phone Detected",
    "smart phone": "Phone Detected",
    "mobile": "Phone Detected",
    "mobile device": "Phone Detected",
    "cell phone in hand": "Phone Detected",
    "phone in hand": "Phone Detected",
    "phone between legs": "Phone Detected",
    "phone in lap": "Phone Detected",
    "phone on lap": "Phone Detected",
    "wristwatch": "Watch Detected",
    "smartwatch": "Watch Detected",
    "analog watch": "Watch Detected",
    "wrist watch": "Watch Detected",
    "paper": "Paper Passing",
    "sheet of paper": "Paper Passing",
    "notebook": "Paper Passing",
    "cheat sheet": "Paper Passing",
    "document": "Paper Passing",
    "textbook": "Paper Passing",
    "printed paper": "Paper Passing",
    "book": "Paper Passing",
    "exam paper": "Paper Passing",
    "answer sheet": "Paper Passing",
    "question paper": "Paper Passing",
}

def _get_friendly_label(reason: str, raw_label: Optional[str] = None) -> str:
    """Return a clean display label matching the frontend UI."""
    friendly = FRIENDLY_LABELS.get(reason)
    if friendly:
        return friendly
    if raw_label:
        friendly = FRIENDLY_LABELS.get(raw_label.lower().strip())
        if friendly:
            return friendly
    return reason.replace("_", " ").title()

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

        display_label = _get_friendly_label(reason, label)

        if bbox is not None and len(bbox) >= 4:
            x1 = int(max(0, min(frame_w - 1, bbox[0])))
            y1 = int(max(0, min(frame_h - 1, bbox[1])))
            x2 = int(max(0, min(frame_w - 1, bbox[2])))
            y2 = int(max(0, min(frame_h - 1, bbox[3])))
            if x2 > x1 and y2 > y1:
                color = (0, 0, 255)  # Red for alerts
                cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
                box_caption = display_label.upper()
                (text_w, text_h), _ = cv2.getTextSize(box_caption, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
                text_y = max(text_h + 6, y1 - 8)
                cv2.rectangle(annotated, (x1, text_y - text_h - 6), (x1 + text_w + 8, text_y + 2), color, -1)
                cv2.putText(annotated, box_caption, (x1 + 4, text_y - 3), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 0), 2, cv2.LINE_AA)

        alert_banner = f"ALERT: {display_label}"
        ts_caption = timestamp.strftime("%Y-%m-%d %H:%M:%S")
        cv2.rectangle(annotated, (8, 8), (min(frame_w - 8, 430), 62), (0, 0, 0), -1)
        cv2.putText(annotated, alert_banner, (14, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2, cv2.LINE_AA)
        cv2.putText(annotated, ts_caption, (14, 52), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (230, 230, 230), 1, cv2.LINE_AA)

        cv2.imwrite(str(output_path), annotated)
        return str(output_path)
    except Exception as exc:
        log(f"Failed to write evidence frame: {exc}")
        return None


class ViolationTracker:
    def __init__(self, cooldown: float = 30.0,
                 per_type_cooldowns: dict = None):
        self.cooldown = cooldown
        self._per_type = per_type_cooldowns or {}
        self.counts = {
            "paper_swap": 0,
            "paper_displacement": 0,
            "mobile": 0,
            "watch": 0,
            "head_turn": 0,
            "head_down": 0,
            "hand_gesture": 0,
        }
        self._last_alert = {}

    def record(self, violation: str) -> bool:
        now = time.time()
        effective_cooldown = self._per_type.get(violation, self.cooldown)
        if now - self._last_alert.get(violation, 0) >= effective_cooldown:
            if violation not in self.counts:
                self.counts[violation] = 0
            self.counts[violation] += 1
            self._last_alert[violation] = now
            log(f"VIOLATION: {violation} (total: {self.counts[violation]})")
            return True
        return False

@dataclass
class NormalizedPoint:
    x: float
    y: float
    z: float = 0.0


class FaceMovementDetector:
    def __init__(self):

        self.YAW_THRESHOLD = 22   # degrees — was 70 (unreachable), now 22 for natural side-glances
        self.PITCH_DOWN_THRESH = -8   # degrees — slightly more sensitive than before

        self.YAW_THRESHOLD = 70  
        self.PITCH_DOWN_THRESH = -10  

        self.ALERT_THRESHOLD = 30  
        self.ALERT_COOLDOWN = 2.0  
        
        self.RISK_WEIGHTS = {
            "head_turn": 50,
            "head_down": 50,
        }
        
        # Initialize MediaPipe
        self.face_mesh = None
        if mp is not None:
            self.face_mesh = mp.solutions.face_mesh.FaceMesh(
                max_num_faces=1,
                refine_landmarks=True,
                min_detection_confidence=MEDIAPIPE_FACE_DET_MIN_CONF,
                min_tracking_confidence=MEDIAPIPE_FACE_TRACK_MIN_CONF,
            )
        
        # Student tracking
        self.students = {}
        self.last_alert = {}
        self._last_violations: List[Dict[str, object]] = []
        self._last_overlay_data: List[Dict[str, object]] = []
        
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
    
    def _sanitize_bbox(self, bbox: Sequence[float], frame_w: int, frame_h: int) -> Optional[Tuple[int, int, int, int]]:
        if bbox is None or len(bbox) < 4:
            return None
        x1, y1, x2, y2 = bbox[:4]
        x1 = int(max(0, min(frame_w - 1, x1)))
        y1 = int(max(0, min(frame_h - 1, y1)))
        x2 = int(max(0, min(frame_w - 1, x2)))
        y2 = int(max(0, min(frame_h - 1, y2)))
        if x2 <= x1 or y2 <= y1:
            return None
        return (x1, y1, x2, y2)

    def _pad_bbox(self, bbox: Tuple[int, int, int, int], frame_w: int, frame_h: int) -> Tuple[int, int, int, int]:
        x1, y1, x2, y2 = bbox
        bw = x2 - x1
        bh = y2 - y1
        pad_x = int(bw * MEDIAPIPE_CROP_PADDING)
        pad_y = int(bh * MEDIAPIPE_CROP_PADDING)
        nx1 = max(0, x1 - pad_x)
        ny1 = max(0, y1 - pad_y)
        nx2 = min(frame_w - 1, x2 + pad_x)
        ny2 = min(frame_h - 1, y2 + pad_y)
        if nx2 <= nx1 or ny2 <= ny1:
            return bbox
        return (nx1, ny1, nx2, ny2)

    def _crop_for_mediapipe(self, frame_bgr: np.ndarray, bbox: Tuple[int, int, int, int]) -> Optional[np.ndarray]:
        x1, y1, x2, y2 = bbox
        crop = frame_bgr[y1:y2, x1:x2]
        if crop is None or crop.size == 0:
            return None
        try:
            return cv2.resize(crop, (MEDIAPIPE_CROP_SIZE, MEDIAPIPE_CROP_SIZE), interpolation=cv2.INTER_CUBIC)
        except Exception:
            return None

    def _map_landmarks_to_global(
        self,
        landmarks,
        bbox: Tuple[int, int, int, int],
        frame_w: int,
        frame_h: int,
    ) -> List[NormalizedPoint]:
        x1, y1, x2, y2 = bbox
        bw = max(1, x2 - x1)
        bh = max(1, y2 - y1)
        mapped: List[NormalizedPoint] = []
        for lm in landmarks:
            gx = (x1 + (lm.x * bw)) / max(1, frame_w)
            gy = (y1 + (lm.y * bh)) / max(1, frame_h)
            mapped.append(NormalizedPoint(x=float(gx), y=float(gy), z=float(getattr(lm, "z", 0.0))))
        return mapped

    def _select_targets(self, detections: Sequence[Dict[str, object]], frame_w: int, frame_h: int) -> List[Dict[str, object]]:
        head_targets: List[Dict[str, object]] = []
        person_targets: List[Dict[str, object]] = []
        for det in detections:
            category = str(det.get("category", "")).lower()
            conf = float(det.get("conf", 0.0) or 0.0)
            bbox_raw = det.get("bbox")
            if category not in {"head", "person"}:
                continue
            if category == "head" and conf < MEDIAPIPE_HEAD_MIN_CONF:
                continue
            if category == "person" and conf < MEDIAPIPE_PERSON_MIN_CONF:
                continue
            if not isinstance(bbox_raw, Sequence):
                continue
            bbox = self._sanitize_bbox(bbox_raw, frame_w, frame_h)
            if bbox is None:
                continue
            target = {
                "category": category,
                "conf": conf,
                "bbox": self._pad_bbox(bbox, frame_w, frame_h),
            }
            if category == "head":
                head_targets.append(target)
            else:
                person_targets.append(target)

        head_targets.sort(key=lambda item: float(item["conf"]), reverse=True)
        person_targets.sort(key=lambda item: float(item["conf"]), reverse=True)

        # If head detections are weak/missing, synthesize head crops from top area of person boxes.
        if len(head_targets) < MEDIAPIPE_MAX_HEAD_CROPS:
            seen: set = set()
            for head in head_targets:
                seen.add(tuple(head["bbox"]))
            for person in person_targets:
                x1, y1, x2, y2 = person["bbox"]
                pw = max(1, x2 - x1)
                ph = max(1, y2 - y1)
                candidates = [
                    (
                        x1 + int(0.12 * pw),
                        y1,
                        x2 - int(0.12 * pw),
                        y1 + int(0.38 * ph),
                    ),
                    (
                        x1 + int(0.05 * pw),
                        y1,
                        x2 - int(0.05 * pw),
                        y1 + int(0.50 * ph),
                    ),
                ]

                for candidate_bbox in candidates:
                    proxy_bbox = self._pad_bbox(candidate_bbox, frame_w, frame_h)
                    key = tuple(proxy_bbox)
                    if key in seen:
                        continue
                    head_targets.append({
                        "category": "head",
                        "conf": max(float(person["conf"]) * 0.9, MEDIAPIPE_HEAD_MIN_CONF),
                        "bbox": proxy_bbox,
                    })
                    seen.add(key)
                    if len(head_targets) >= MEDIAPIPE_MAX_HEAD_CROPS:
                        break

                if len(head_targets) >= MEDIAPIPE_MAX_HEAD_CROPS:
                    break

        selected_heads = head_targets[:MEDIAPIPE_MAX_HEAD_CROPS]
        return selected_heads
    
    def detect(self, frame_bgr, yolo_detections: Sequence[Dict[str, object]], frame_idx: int):
        if self.face_mesh is None:
            return [], []

        if frame_idx % MEDIAPIPE_PROCESS_EVERY != 0:
            return self._last_violations, self._last_overlay_data
        
        h, w = frame_bgr.shape[:2]
        violations = []
        overlay_data = []

        targets = self._select_targets(yolo_detections, w, h)
        if not targets:
            self._last_violations = []
            self._last_overlay_data = []
            return [], []

        face_entries: List[Tuple[str, List[NormalizedPoint], Tuple[int, int, int, int], float, float, Dict[str, bool]]] = []

        for idx, target in enumerate(targets):
            bbox = target["bbox"]
            category = str(target["category"])
            crop = self._crop_for_mediapipe(frame_bgr, bbox)
            if crop is None:
                continue

            rgb_crop = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
            rgb_crop.flags.writeable = False

            if category == "head":
                face_results = self.face_mesh.process(rgb_crop)
                if not face_results.multi_face_landmarks:
                    continue
                face_lms = self._map_landmarks_to_global(face_results.multi_face_landmarks[0].landmark, bbox, w, h)
                cx = int(((bbox[0] + bbox[2]) * 0.5) / 120)
                cy = int(((bbox[1] + bbox[3]) * 0.5) / 120)
                student_id = f"student_{cx}_{cy}"

                if student_id not in self.students:
                    self.students[student_id] = {
                        "risk_score": 0.0,
                        "flags": {k: False for k in self.RISK_WEIGHTS},
                        "head_yaw": 0.0,
                        "head_pitch": 0.0,
                        "last_alert": 0.0,
                    }

                student = self.students[student_id]
                flags = {k: False for k in self.RISK_WEIGHTS}
                yaw, pitch = self.estimate_head_pose(face_lms, w, h, student)
                student["head_yaw"] = yaw
                student["head_pitch"] = pitch
                flags["head_turn"] = abs(yaw) > self.YAW_THRESHOLD
                flags["head_down"] = pitch < self.PITCH_DOWN_THRESH

                face_entries.append((student_id, face_lms, bbox, yaw, pitch, flags))

        for student_id, face_lms, face_bbox, yaw, pitch, flags in face_entries:
            student = self.students[student_id]
            student["flags"] = flags

            raw = sum(self.RISK_WEIGHTS[k] for k, v in flags.items() if v)
            raw = min(raw, 100)
            student["risk_score"] = raw

            now = time.time()
            if student["risk_score"] >= self.ALERT_THRESHOLD and now - student.get("last_alert", 0) > self.ALERT_COOLDOWN:
                active_flags = [k for k, v in flags.items() if v]

                for flag in active_flags:
                    if flag == "head_turn":
                        # yaw > 0 means left_eye farther from nose than right_eye
                        # → face rotated RIGHT from camera's perspective
                        # yaw < 0 → face rotated LEFT from camera's perspective
                        direction = "RIGHT" if yaw > 0 else "LEFT"
                        violations.append({
                            "type": "head_turn",
                            "direction": direction,           # explicit field — don't rely on string parse
                            "description": f"Head turned {direction} (yaw={yaw:.1f}°)",
                            "student_id": student_id,
                            "confidence": student["risk_score"] / 100.0,
                            "face_bbox": face_bbox,
                        })
                    elif flag == "head_down":
                        violations.append({
                            "type": "head_down", 

                            "direction": "DOWN",
                            "description": f"Looking down (pitch={pitch:.1f}°)",

                            "description": f"Looking down (pitch {pitch:.1f}°)",
                            "student_id": student_id,
                            "confidence": student["risk_score"] / 100.0,
                            "face_bbox": face_bbox,
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

        self._last_violations = violations
        self._last_overlay_data = overlay_data
        return violations, overlay_data

    def draw_overlay(self, frame, overlay_data):
        """Draw face overlays on frame."""
        h, w = frame.shape[:2]
        
        for data in overlay_data:
            if data["type"] == "face":
                self._draw_face_overlay(frame, data, w, h)
    
    def _draw_face_overlay(self, frame, data, w, h):
        """Draw face detection overlay."""
        face_lms = data["landmarks"]
        student_id = data["student_id"]
        yaw = data["yaw"]
        pitch = data["pitch"]
        flags = data["flags"]
        
        color = (0, 0, 255) if (abs(yaw) > self.YAW_THRESHOLD or pitch < self.PITCH_DOWN_THRESH) else (0, 255, 255)
        
        key_pts = [1, 33, 263, 152, 10, 61, 291, 4]
        for i in key_pts:
            p = face_lms[i]
            px, py = int(p.x * w), int(p.y * h)
            cv2.circle(frame, (px, py), 3, color, -1)
        
        nose = face_lms[1]
        nx, ny = int(nose.x * w), int(nose.y * h)
        dx = int(np.sin(np.radians(yaw)) * 60)
        dy = int(-np.sin(np.radians(pitch)) * 60)
        cv2.arrowedLine(frame, (nx, ny), (nx + dx, ny + dy), color, 2, tipLength=0.3)
        
        xs = [lm.x for lm in face_lms]
        ys = [lm.y for lm in face_lms]
        x1 = max(0, int(min(xs)*w) - 14)
        y1 = max(0, int(min(ys)*h) - 14)
        x2 = min(w, int(max(xs)*w) + 14)
        y2 = min(h, int(max(ys)*h) + 14)
        
        self._draw_dashed_rect(frame, x1, y1, x2, y2, color, 1)
        
        status_text = f"{student_id.upper()}"
        if flags.get("head_turn"):
            status_text += " TURN"
        if flags.get("head_down"):
            status_text += " DOWN"
        
        cv2.putText(frame, status_text, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA)
    
    def _draw_dashed_rect(self, img, x1, y1, x2, y2, color, thickness, gap=10):
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

# YOLO Detector

class YOLODetector:
    HEAD_CLASSES = {"head", "face", "human head", "human face"}
    PERSON_CLASSES = {"person", "human", "student"}
    LAPTOP_CLASSES = {"laptop", "notebook computer", "notebook", "tablet", "ipad"}
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
        
        log(f"Loading YOLO model: {self.model_path} (device={self.device})")
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

            is_mobile_like = label_lower in self.MOBILE_CLASSES or any(
                tok in label_lower for tok in ["phone", "smartphone", "cell phone", "cellphone", "mobile"]
            )
            if label_lower in self.HEAD_CLASSES:
                category = "head"
            elif is_mobile_like:
                category = "mobile"
            elif label_lower in self.PERSON_CLASSES or "person" in label_lower:
                category = "person"
            elif label_lower in self.LAPTOP_CLASSES:
                category = "laptop"
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
            
        filtered_detections = []
        detections.sort(key=lambda x: x['conf'] + (0.05 if x['category'] == 'mobile' else 0), reverse=True)

        for det in detections:
            keep = True
            for kept_det in filtered_detections:
                if det['category'] != kept_det['category']:
                    continue

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
                if iou > 0.45:
                    keep = False
                    break

            if keep:
                filtered_detections.append(det)

        return filtered_detections

# Camera management

def _build_rtsp_cap(source) -> Optional[cv2.VideoCapture]:
    is_rtsp = isinstance(source, str) and source.lower().startswith("rtsp")

    if is_rtsp:
        ffmpeg_opts = "|".join([
            f"rtsp_transport;{RTSP_TRANSPORT}",
            "fflags;nobuffer",
            "analyzeduration;1000000",   # 1s (ensures high-res SPS/PPS are found)
            "probesize;5000000",         # 5 MB
            f"stimeout;{RTSP_READ_TIMEOUT_MS * 1000}",  # microseconds
        ])
        os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = ffmpeg_opts
        cap = cv2.VideoCapture(source, cv2.CAP_FFMPEG)
        os.environ.pop("OPENCV_FFMPEG_CAPTURE_OPTIONS", None)
    else:
        backend_map = {
            "ffmpeg": cv2.CAP_FFMPEG,
            "gstreamer": cv2.CAP_GSTREAMER,
            "dshow": getattr(cv2, "CAP_DSHOW", cv2.CAP_ANY),
            "msmf": getattr(cv2, "CAP_MSMF", cv2.CAP_ANY),
            "auto": cv2.CAP_ANY,
        }
        backend_name = CAMERA_BACKEND.lower()
        backend_idx  = backend_map.get(backend_name, cv2.CAP_ANY)
        cap = cv2.VideoCapture(source, backend_idx)

    if not cap.isOpened():
        return None

    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    cap.set(cv2.CAP_PROP_FPS, MONITOR_CAMERA_FPS)
    return cap


class RTSPCapture:


    def __init__(self, source):
        self.source = source
        self._buf: deque = deque(maxlen=1)   # always holds the freshest frame
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._connected = threading.Event()
        self._reconnect_count = 0
        self._thread = threading.Thread(target=self._reader, daemon=True, name="RTSPReader")
        self._thread.start()
        timeout = RTSP_OPEN_TIMEOUT_MS / 1000.0
        if not self._connected.wait(timeout=timeout):
            log("WARNING: RTSP stream did not produce a frame within the open timeout — "
                "proceeding anyway; frames will arrive when the stream becomes ready.")

    # ------------------------------------------------------------------
    # Internal reader thread
    # ------------------------------------------------------------------

    def _reader(self):
        cap: Optional[cv2.VideoCapture] = None

        while not self._stop.is_set():
            if cap is None or not cap.isOpened():
                if cap is not None:
                    cap.release()
                    cap = None
                log(f"RTSPCapture: connecting to {self.source} "
                    f"(attempt {self._reconnect_count + 1})")
                cap = _build_rtsp_cap(self.source)
                if cap is None or not cap.isOpened():
                    self._reconnect_count += 1
                    log(f"RTSPCapture: connection failed, retrying in "
                        f"{RTSP_RECONNECT_DELAY_SEC}s...")
                    self._stop.wait(timeout=RTSP_RECONNECT_DELAY_SEC)
                    continue
                log("RTSPCapture: stream connected successfully.")
                self._reconnect_count = 0

            ret, frame = cap.read()
            if not ret or frame is None:
                log("RTSPCapture: read() failed — stream may have dropped. Reconnecting...")
                cap.release()
                cap = None
                self._stop.wait(timeout=RTSP_RECONNECT_DELAY_SEC)
                continue

            self._buf.append(frame)
            self._connected.set()

        if cap is not None:
            cap.release()
        log("RTSPCapture reader thread exited.")

    def read(self) -> Tuple[bool, Optional[np.ndarray]]:
        try:
            return True, self._buf.pop()
        except IndexError:
            return False, None

    def is_connected(self) -> bool:
        return self._connected.is_set()

    def release(self):
        self._stop.set()
        self._thread.join(timeout=5.0)


def open_capture() -> Optional[RTSPCapture]:
    log(f"Opening camera source: {CAMERA_SOURCE}")
    capture = RTSPCapture(CAMERA_SOURCE)
    return capture


def main():
    log("Starting integrated exam monitoring system...")
    
    tracker = ViolationTracker(
        cooldown=ALERT_COOLDOWN_SEC,
        per_type_cooldowns={
            "mobile":     ALERT_COOLDOWN_SEC,       # 30 s
            "watch":      WATCH_ALERT_COOLDOWN_SEC,  # 30 s
            "paper":      PAPER_ALERT_COOLDOWN_SEC,  # 45 s
            "paper_swap": PAPER_ALERT_COOLDOWN_SEC,  # 45 s
            "head_turn":  HEAD_ALERT_COOLDOWN_SEC,   # 20 s
            "head_down":  HEAD_ALERT_COOLDOWN_SEC,   # 20 s
            "hand_gesture": HEAD_ALERT_COOLDOWN_SEC, # 20 s
            "paper_passing": PAPER_ALERT_COOLDOWN_SEC, # 15 s
            "paper_displacement": PAPER_DISPLACEMENT_COOLDOWN_SEC
        }
    )
    
    yolo = YOLODetector(YOLO_MODEL_PATH, YOLO_CLASSES + EXTENDED_YOLO_CLASSES)
    
    face_detector = FaceMovementDetector()
    
    hand_detector = HandGestureDetector(process_every=6)
    
    cap = open_capture()
    if cap is None:
        log("Failed to open camera")
        return

    log("Waiting for first camera frame...")
    time.sleep(POST_CAMERA_INIT_DELAY_SEC)

    frame_idx = 0
    last_detections: List[Dict] = []
    last_face_violations: List[Dict] = []
    last_face_overlay_data: List[Dict] = []
    paper_anchor_by_person: Dict[str, Sequence[float]] = {}

    last_good_frame: Optional[np.ndarray] = None

    yolo_lock = threading.Lock()
    yolo_payload: Optional[np.ndarray] = None
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
    frame_throttle_state: Dict[str, float] = {}
    fps = 0.0
    prev_time = time.time()
    _empty_streak = 0
    _MAX_EMPTY_STREAK_SLEEP = 0.03  
    _EMPTY_STREAK_THRESH = 5

    try:
        while not stop_event.is_set():
            ret, frame = cap.read()

            if not ret or frame is None:
                _empty_streak += 1
                if _empty_streak >= _EMPTY_STREAK_THRESH:
                    time.sleep(_MAX_EMPTY_STREAK_SLEEP)
                if last_good_frame is not None:
                    emit_frame(last_good_frame, frame_throttle_state)
                continue

            _empty_streak = 0
            last_good_frame = frame
            
            if FORCE_PROCESS_RESIZE:
                frame = cv2.resize(frame, (PROCESS_WIDTH, PROCESS_HEIGHT))
            
            if ENABLE_CLAHE:
                frame = apply_clahe(frame)
            
            # Calculate FPS
            now = time.time()
            dt = now - prev_time
            if dt > 0:
                fps = 1.0 / dt
            prev_time = now
            
            frame_idx += 1
            
            if frame_idx % YOLO_PROCESS_EVERY == 0:
                with yolo_lock:
                    if yolo_payload is None:
                        yolo_payload = frame.copy()
            
            face_violations, face_overlay_data = face_detector.detect(
                frame,
                last_detections,
                frame_idx,
            )
            last_face_violations = face_violations
            last_face_overlay_data = face_overlay_data
            
            # Hand Gesture Detection
            hand_violations, hand_overlay_data = hand_detector.detect(frame, frame_idx, last_detections)
            
            # Process YOLO detections for alerts
            for detection in last_detections:
                category = detection["category"]
                if category == "laptop" or category == "paper":
                    continue  # Paper passing is handled by handgesture.py
                if category in DETECTION_RULES:
                    rule = DETECTION_RULES[category]
                    conf = detection["conf"]
                    bbox = detection["bbox"]
                    
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
            for violation in last_face_violations:
                violation_type = violation["type"]
                if violation_type == "head_turn":
                    # Use the explicit 'direction' field; fall back to description parse as safety net
                    direction = violation.get("direction") or (
                        "LEFT" if "LEFT" in violation.get("description", "") else "RIGHT"
                    )
                    alert_reason = "HEAD_LEFT" if direction == "LEFT" else "HEAD_RIGHT"
                elif violation_type == "head_down":
                    alert_reason = "HEAD_DOWN"
                else:
                    continue
                
                if tracker.record(violation_type):
                    timestamp = datetime.now()
                    h, w = frame.shape[:2]
                    bbox = violation.get("face_bbox", (w//4, h//4, 3*w//4, 3*h//4))
                    snapshot_path = save_evidence(frame, alert_reason, timestamp, bbox)
                    emit_alert(alert_reason, bbox, violation["confidence"], 
                             (w, h), snapshot_path, timestamp)
                    _beep("generic")
            
            # Process Hand Gesture & Paper Passing Violations
            for violation in hand_violations:
                v_type = violation["type"]
                if v_type == "hand_gesture":
                    alert_reason = "HAND_GESTURE"
                elif v_type == "paper_passing":
                    alert_reason = "PAPER_PASSING"
                else:
                    continue

                if tracker.record(v_type):
                    timestamp = datetime.now()
                    bbox = violation.get("face_bbox", (0, 0, frame.shape[1], frame.shape[0]))
                    snapshot_path = save_evidence(frame, alert_reason, timestamp, bbox)
                    emit_alert(alert_reason, bbox, violation["confidence"], 
                             (frame.shape[1], frame.shape[0]), snapshot_path, timestamp)
                    _beep("paper" if v_type == "paper_passing" else "generic")

            # Process paper movement away from the student's working area
            person_boxes = [det["bbox"] for det in last_detections if det["category"] == "person"]
            paper_detections = [det for det in last_detections if det["category"] == "paper"]

            for paper_det in paper_detections:
                paper_bbox = paper_det["bbox"]
                paper_center = _bbox_center(paper_bbox)

                nearest_person = None
                nearest_dist = float("inf")
                for person_bbox in person_boxes:
                    dist = _distance(_bbox_center(person_bbox), paper_center)
                    if dist < nearest_dist:
                        nearest_dist = dist
                        nearest_person = person_bbox

                if nearest_person is None:
                    continue

                person_key = _person_key(nearest_person)
                work_area = _expand_bbox(nearest_person, PAPER_WORK_AREA_MARGIN_FRAC)
                baseline_bbox = paper_anchor_by_person.get(person_key)

                if baseline_bbox is None and _bbox_overlap(paper_bbox, work_area):
                    paper_anchor_by_person[person_key] = paper_bbox
                    continue

                if baseline_bbox is not None:
                    baseline_center = _bbox_center(baseline_bbox)
                    moved_dist = _distance(baseline_center, paper_center)
                    threshold = max(nearest_person[2] - nearest_person[0], nearest_person[3] - nearest_person[1]) * PAPER_MOVEMENT_THRESHOLD_FRAC
                    dx = paper_center[0] - baseline_center[0]
                    dy = paper_center[1] - baseline_center[1]
                    moved_away = _is_paper_moved_away(dx, dy)

                    # Check if paper has moved beyond threshold in a directional way
                    paper_moved_significantly = moved_dist > threshold and moved_away
                    paper_left_work_area = not _bbox_overlap(paper_bbox, work_area)

                    # --- Case 1: Paper passes (leaves work area completely) ---
                    # This triggers when paper is no longer visible in the student's work zone
                    if paper_left_work_area:
                        if tracker.record("paper_swap"):
                            timestamp = datetime.now()
                            snapshot_path = save_evidence(
                                frame,
                                "PAPER_PASSING",
                                timestamp,
                                paper_bbox,
                                paper_det.get("label", "paper"),
                                paper_det.get("conf", 0.0),
                            )
                            emit_alert(
                                "PAPER_PASSING",
                                nearest_person,
                                paper_det.get("conf", 0.0),
                                (frame.shape[1], frame.shape[0]),
                                snapshot_path,
                                timestamp,
                            )
                            _beep("paper")

                    # --- Case 2: Paper displaced (moved far away but still in work area) ---
                    # This triggers when paper moves left/right/backward but student remains seated
                    elif paper_moved_significantly and _bbox_overlap(paper_bbox, work_area):
                        if tracker.record("paper_displacement"):
                            timestamp = datetime.now()
                            snapshot_path = save_evidence(
                                frame,
                                "PAPER_DISPLACEMENT",
                                timestamp,
                                paper_bbox,
                                paper_det.get("label", "paper"),
                                paper_det.get("conf", 0.0),
                            )
                            emit_alert(
                                "PAPER_DISPLACEMENT",
                                nearest_person,
                                paper_det.get("conf", 0.0),
                                (frame.shape[1], frame.shape[0]),
                                snapshot_path,
                                timestamp,
                            )
                            _beep("paper")

                    # Update anchor when paper settles back into the work area after displacement
                    if _bbox_overlap(paper_bbox, work_area) and moved_dist <= threshold:
                        paper_anchor_by_person[person_key] = paper_bbox

            # Draw YOLO detections for objects only (phones, watches, papers)
            for detection in last_detections:
                x1, y1, x2, y2 = map(int, detection["bbox"])
                conf = detection["conf"]
                category = detection["category"]

                # Ignore laptop completely.
                if category == "laptop":
                    continue
                
                # Color based on category
                if category == "head":
                    color = (255, 255, 0)  # Cyan
                    label_text = "HEAD"
                elif category == "person":
                    color = (200, 200, 200)  # Light gray
                    label_text = "PERSON"
                elif category == "mobile":
                    color = (0, 0, 255)  # Red
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
            
            face_detector.draw_overlay(frame, face_overlay_data)
            hand_detector.draw_overlay(frame, hand_overlay_data)
            
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