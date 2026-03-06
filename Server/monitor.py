"""
Modified monitoring script to integrate with backend. It prints alert messages to stdout so that server can relay via socket.io to dashboard.
"""
import cv2
import numpy as np
import mediapipe as mp
from ultralytics import YOLO
import math
import os
import time
from datetime import datetime
import torch
import sys
import base64
import io
import pickle

try:
    import torch_directml
except Exception:
    torch_directml = None


def patch_ultralytics_inference_mode():
    """Patch Ultralytics smart_inference_mode-wrapped method to use no_grad for better runtime compatibility."""
    try:
        from ultralytics.engine.predictor import BasePredictor
        stream_inference = getattr(BasePredictor, "stream_inference", None)
        unwrapped = getattr(stream_inference, "__wrapped__", None)
        if not callable(unwrapped):
            emit("Ultralytics inference patch not applied (no wrapped function found)")
            return
        BasePredictor.stream_inference = torch.no_grad()(unwrapped)
        emit("Applied Ultralytics no_grad inference patch")
    except Exception as exc:
        emit(f"Warning: could not patch Ultralytics inference mode: {exc}")


def patch_ultralytics_nms_for_directml():
    """Run Ultralytics NMS on CPU when predictions come from DirectML tensors."""
    try:
        import sys
        import ultralytics.utils.nms as nms_module
        original_nms = getattr(nms_module, "non_max_suppression", None)
        if not callable(original_nms):
            emit("Ultralytics NMS patch not applied (function not found)")
            return
        if getattr(original_nms, "_secure_exam_patched", False):
            return

        def directml_safe_nms(prediction, *args, **kwargs):
            try:
                if hasattr(prediction, "device") and str(prediction.device).startswith("privateuseone"):
                    prediction = prediction.cpu()
            except Exception:
                pass
            return original_nms(prediction, *args, **kwargs)

        directml_safe_nms._secure_exam_patched = True
        nms_module.non_max_suppression = directml_safe_nms
        patched_refs = 1

        for module_name, module in list(sys.modules.items()):
            if not module_name or not module_name.startswith("ultralytics"):
                continue
            try:
                current = getattr(module, "non_max_suppression", None)
                if current is original_nms:
                    setattr(module, "non_max_suppression", directml_safe_nms)
                    patched_refs += 1
            except Exception:
                continue

        try:
            import ultralytics.nn.autobackend as autobackend_module
            if getattr(autobackend_module, "non_max_suppression", None) is not directml_safe_nms:
                autobackend_module.non_max_suppression = directml_safe_nms
                patched_refs += 1
        except Exception:
            pass

        emit(f"Applied Ultralytics DirectML-safe NMS patch (CPU NMS) to {patched_refs} reference(s)")
    except Exception as exc:
        emit(f"Warning: could not patch Ultralytics NMS for DirectML: {exc}")

FRAME_WIDTH = int(os.environ.get("MONITOR_FRAME_WIDTH", "1280"))
FRAME_HEIGHT = int(os.environ.get("MONITOR_FRAME_HEIGHT", "720"))
STREAM_WIDTH = int(os.environ.get("STREAM_WIDTH", "512"))
STREAM_HEIGHT = int(os.environ.get("STREAM_HEIGHT", "288"))
STREAM_JPEG_QUALITY = max(10, min(90, int(os.environ.get("STREAM_JPEG_QUALITY", "48"))))
STREAM_TARGET_FPS = max(1, int(os.environ.get("STREAM_TARGET_FPS", "12")))
YOLO_PROCESS_EVERY_N_FRAMES = max(1, int(os.environ.get("YOLO_PROCESS_EVERY", "2")))
MEDIAPIPE_PROCESS_EVERY_N_FRAMES = max(1, int(os.environ.get("MEDIAPIPE_PROCESS_EVERY", "4")))
YOLO_IMAGE_SIZE = int(os.environ.get("YOLO_IMAGE_SIZE", "960"))
CAMERA_FPS = int(os.environ.get("MONITOR_CAMERA_FPS", "18"))
DIRECTML_ERROR_BEFORE_CPU_FALLBACK = max(1, int(os.environ.get("DIRECTML_ERROR_BEFORE_CPU_FALLBACK", "5")))
CAMERA_READ_LATEST = os.environ.get("CAMERA_READ_LATEST", "1").lower() in ("1", "true", "yes", "on")
CAMERA_BUFFER_FLUSH = max(0, int(os.environ.get("CAMERA_BUFFER_FLUSH", "2")))

# Tiled inference for small/distant object detection
ENABLE_TILED_INFERENCE = os.environ.get("ENABLE_TILED_INFERENCE", "1").lower() in ("1", "true", "yes", "on")
TILE_OVERLAP = 0.15  # 15% overlap between tiles
TILE_CONF_BOOST = 1.0  # no extra penalty — base thresholds are already strict enough
TILED_INFERENCE_EVERY_N = max(1, int(os.environ.get("TILED_INFERENCE_EVERY", "3")))  # run tiled every N YOLO frames

# CLAHE preprocessing for better contrast on distant objects
ENABLE_CLAHE = os.environ.get("ENABLE_CLAHE", "1").lower() in ("1", "true", "yes", "on")
CLAHE_CLIP_LIMIT = float(os.environ.get('CLAHE_CLIP_LIMIT', "2.5"))
CLAHE_TILE_SIZE = int(os.environ.get("CLAHE_TILE_SIZE", "8"))

SAVE_ALERTS = True
ALERT_COOLDOWN = 3.0
output_folder = "suspicious_alerts"
os.makedirs(output_folder, exist_ok=True)

PHONE_SEARCH_CONF = 0.20
PHONE_MIN_CONF = 0.35
PHONE_PERSISTENCE = 3
PHONE_NO_TRACK_PERSISTENCE = 2
PHONE_NO_TRACK_MIN_CONF = 0.32
PHONE_MIN_AREA = 400
PHONE_MAX_AREA = 80000
PHONE_MIN_ASPECT = 0.2
PHONE_MAX_ASPECT = 5.0

GENERAL_DISPLAY_CONF = 0.40
WATCH_DISPLAY_CONF = 0.25

# ---- Custom model class names: Hand Gesture, Head, Phone, paper, person, watch ----
# Since the model has NO furniture classes, misclassifications happen when the
# model is forced to pick the nearest class for a chair/desk shape (often
# "Phone" at low confidence).  We therefore apply strict per-class validation.

# Classes that are ALWAYS interesting for alerts — others are contextual.
ALERT_CLASSES = {'phone', 'watch', 'paper'}

# Maximum box area (fraction of frame) — detections covering >25% of the frame
# are almost certainly furniture, walls, or false positives.
MAX_BOX_FRAME_FRACTION = 0.25

# Minimum box area (fraction of frame) — extremely tiny detections are noise.
MIN_BOX_FRAME_FRACTION = 0.0003  # ~276 px at 1280x720

MEDIAPIPE_REFINE_LANDMARKS = os.environ.get("MEDIAPIPE_REFINE_LANDMARKS", "1").lower() in ("1", "true", "yes", "on")

# Per-class confidence floors — detections below these are always discarded,
# *regardless* of the PHONE_SEARCH_CONF passed to YOLO.
CLASS_MIN_CONF = {
    'phone': 0.30,
    'watch': 0.25,
    'paper': 0.30,
    'person': 0.25,
    'head': 0.25,
    'hand gesture': 0.20,
}

LOOK_X_THRESHOLD = 0.025
LOOK_Y_UP_THRESHOLD = 0.03

HAND_MOUTH_THRESHOLD = 0.15
HAND_MOTION_THRESHOLD = 0.005

mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5,
    refine_landmarks=MEDIAPIPE_REFINE_LANDMARKS,
    max_num_faces=1
)

mp_hands = mp.solutions.hands
hands = mp_hands.Hands(
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5,
    max_num_hands=2
)

def enhance_frame_clahe(img):
    """Apply CLAHE contrast enhancement to improve detection of distant/small objects."""
    if not ENABLE_CLAHE:
        return img
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=CLAHE_CLIP_LIMIT, tileGridSize=(CLAHE_TILE_SIZE, CLAHE_TILE_SIZE))
    l_channel = clahe.apply(l_channel)
    enhanced = cv2.merge([l_channel, a_channel, b_channel])
    return cv2.cvtColor(enhanced, cv2.COLOR_LAB2BGR)


def run_tiled_inference(model, img, conf, iou, imgsz, half, use_tracking):
    """Run inference on overlapping tiles of the image to detect small/distant objects.
    
    Splits the frame into overlapping tiles, runs YOLO on each tile at the
    full inference resolution, then maps detections back to the original
    frame coordinates.  Duplicate detections (from overlap regions) are
    suppressed via NMS.
    """
    h, w = img.shape[:2]
    tile_h, tile_w = h // 2, w // 2
    overlap_h = int(tile_h * TILE_OVERLAP)
    overlap_w = int(tile_w * TILE_OVERLAP)

    # Define tile regions (y1, y2, x1, x2)
    tiles = [
        (0, tile_h + overlap_h, 0, tile_w + overlap_w),                          # top-left
        (0, tile_h + overlap_h, tile_w - overlap_w, w),                           # top-right
        (tile_h - overlap_h, h, 0, tile_w + overlap_w),                           # bottom-left
        (tile_h - overlap_h, h, tile_w - overlap_w, w),                           # bottom-right
    ]

    all_detections = []  # list of (x1,y1,x2,y2, class_name, conf)

    for (ty1, ty2, tx1, tx2) in tiles:
        crop = img[ty1:ty2, tx1:tx2]
        try:
            tile_results = model.predict(crop, conf=conf, iou=iou, imgsz=imgsz, verbose=False, half=half)
        except Exception:
            continue
        if tile_results[0].boxes:
            for box in tile_results[0].boxes:
                bx1, by1, bx2, by2 = map(int, box.xyxy[0])
                cls_id = int(box.cls[0])
                raw_conf = float(box.conf[0]) * TILE_CONF_BOOST
                name = model.names[cls_id]
                # Per-class confidence floor for tile detections
                tile_class_min = CLASS_MIN_CONF.get(name.lower(), GENERAL_DISPLAY_CONF)
                if raw_conf < tile_class_min:
                    continue
                # Map back to original frame coordinates
                all_detections.append((bx1 + tx1, by1 + ty1, bx2 + tx1, by2 + ty1, name, raw_conf))

    # Simple NMS across tiles: remove duplicates with high IoU
    if not all_detections:
        return []
    
    keep = []
    used = [False] * len(all_detections)
    for i in range(len(all_detections)):
        if used[i]:
            continue
        best = all_detections[i]
        for j in range(i + 1, len(all_detections)):
            if used[j]:
                continue
            # Check if same class and overlapping
            if all_detections[i][4] != all_detections[j][4]:
                continue
            ix1 = max(all_detections[i][0], all_detections[j][0])
            iy1 = max(all_detections[i][1], all_detections[j][1])
            ix2 = min(all_detections[i][2], all_detections[j][2])
            iy2 = min(all_detections[i][3], all_detections[j][3])
            inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
            area_a = (all_detections[i][2] - all_detections[i][0]) * (all_detections[i][3] - all_detections[i][1])
            area_b = (all_detections[j][2] - all_detections[j][0]) * (all_detections[j][3] - all_detections[j][1])
            union = area_a + area_b - inter
            if union > 0 and inter / union > 0.4:
                used[j] = True
                if all_detections[j][5] > best[5]:
                    best = all_detections[j]
        keep.append(best)
        used[i] = True
    return keep


def emit(msg):
    print(msg)
    sys.stdout.flush()

def emit_frame(img):
    """Emit frame as base64 for web streaming"""
    try:
        small_img = cv2.resize(img, (STREAM_WIDTH, STREAM_HEIGHT))
        _, buffer = cv2.imencode('.jpg', small_img, [cv2.IMWRITE_JPEG_QUALITY, STREAM_JPEG_QUALITY])
        jpg_as_text = base64.b64encode(buffer).decode()
        print(f"FRAME:{jpg_as_text}")
        sys.stdout.flush()
    except Exception as e:
        print(f"FRAME_ERROR:{str(e)}")
        sys.stdout.flush()

def save_alert(img, reason, cooldown_state, bbox_center=None):
    """Save an alert image and emit an ALERT line.

    Args:
        img: The frame image.
        reason: Alert reason string (e.g. PHONE_DETECTED).
        cooldown_state: Dict used to maintain per-alert cooldown timestamps.
        bbox_center: Optional tuple (cx, cy) of the detection center in *pixel*
                     coordinates of the original frame.  When provided the ALERT
                     line includes the coordinates so the backend can map the
                     detection to the nearest student in the seating plan.
    """
    current_time = time.time()
    if not SAVE_ALERTS:
        return False

    cooldown_key = reason
    if bbox_center:
        cx, cy = bbox_center
        # Spatial bucket allows concurrent alerts for different students/areas
        # while still suppressing repetitive spam from same region.
        bucket_x = cx // 160
        bucket_y = cy // 160
        cooldown_key = f"{reason}:{bucket_x}:{bucket_y}"

    last_time = cooldown_state.get(cooldown_key, 0)
    if current_time - last_time > ALERT_COOLDOWN:
        now = datetime.now()
        session_folder = os.environ.get("EXAM_SESSION_FOLDER")
        date_folder = now.strftime("%Y-%m-%d")
        target_dir = os.path.join(output_folder, session_folder or date_folder)
        os.makedirs(target_dir, exist_ok=True)
        timestamp = now.strftime("%Y%m%d_%H%M%S")
        filename = os.path.join(target_dir, f"ALERT_{reason}_{timestamp}.jpg")
        cv2.imwrite(filename, img)
        # Extended ALERT format includes bounding-box centre + frame size so the
        # backend can resolve which student/seat the detection belongs to.
        if bbox_center:
            cx, cy = bbox_center
            h, w = img.shape[:2]
            emit(f"ALERT:{reason}:{timestamp}:{filename}:{cx},{cy},{w},{h}")
        else:
            emit(f"ALERT:{reason}:{timestamp}:{filename}")
        cooldown_state[cooldown_key] = current_time
        return True
    return False

def get_head_direction_simple(landmarks):
    left_eye_x = landmarks[33].x
    right_eye_x = landmarks[263].x
    nose_x = landmarks[1].x
    nose_y = landmarks[1].y
    eye_center_x = (left_eye_x + right_eye_x) / 2
    offset_x = nose_x - eye_center_x
    direction = ""
    if offset_x > LOOK_X_THRESHOLD:
        direction = "RIGHT"
    elif offset_x < -LOOK_X_THRESHOLD:
        direction = "LEFT"
    return direction, (nose_x, nose_y)

def emit_runtime_versions():
    torch_version = getattr(torch, "__version__", "unknown")
    ultralytics_version = "unknown"
    try:
        import ultralytics
        ultralytics_version = getattr(ultralytics, "__version__", "unknown")
    except Exception:
        pass
    emit(f"Runtime versions -> torch: {torch_version}, ultralytics: {ultralytics_version}")
    if str(torch_version).startswith("2.6") and str(ultralytics_version).startswith("8.0."):
        emit("Warning: torch 2.6 + ultralytics 8.0.x may require trusted fallback loading for older .pt checkpoints")

def configure_torch_safe_globals():
    try:
        add_safe_globals = getattr(torch.serialization, "add_safe_globals", None)
        if not callable(add_safe_globals):
            return
        from ultralytics.nn.tasks import DetectionModel
        add_safe_globals([DetectionModel])
        emit("Configured torch safe globals for Ultralytics DetectionModel")
    except Exception as exc:
        emit(f"Warning: could not configure torch safe globals: {exc}")

def load_yolo_model_with_compat(weights_path):
    try:
        return YOLO(weights_path)
    except pickle.UnpicklingError as exc:
        message = str(exc)
        if "Weights only load failed" not in message:
            raise
        emit("Detected PyTorch weights_only restriction. Retrying with trusted legacy load mode...")
        original_torch_load = torch.load
        try:
            def trusted_torch_load(*args, **kwargs):
                if "weights_only" not in kwargs:
                    kwargs["weights_only"] = False
                return original_torch_load(*args, **kwargs)
            torch.load = trusted_torch_load
            return YOLO(weights_path)
        finally:
            torch.load = original_torch_load

def select_inference_device():
    if torch.cuda.is_available():
        return "cuda", "CUDA"
    directml_mode = os.environ.get("USE_DIRECTML", "auto").lower()
    directml_enabled = directml_mode in ("auto", "1", "true", "yes", "on")
    if directml_enabled and torch_directml is not None:
        try:
            return torch_directml.device(), "DirectML"
        except Exception as exc:
            emit(f"Warning: DirectML available but failed to initialize: {exc}")
            emit("Falling back to CPU")
    elif directml_mode in ("0", "false", "no", "off") and torch_directml is not None:
        emit("DirectML detected but disabled via USE_DIRECTML=0")
    elif directml_enabled and torch_directml is None:
        emit("DirectML requested but torch-directml is not installed")
    return "cpu", "CPU"

def run_system():
    device, backend = select_inference_device()
    emit(f"Loading YOLO on {device} ({backend})")
    emit_runtime_versions()
    patch_ultralytics_inference_mode()
    patch_ultralytics_nms_for_directml()
    configure_torch_safe_globals()
    # Resolve absolute path to weights regardless of where script is launched
    weights_path = os.path.join(os.path.dirname(__file__), "best (3).pt")
    model = load_yolo_model_with_compat(weights_path)
    model.to(device)
    infer_half = backend == "CUDA"
    using_cpu_fallback = backend == "CPU"
    use_tracking = True
    
    # Check available cameras
    emit("Checking available cameras...")
    for i in range(3):  # Check first 3 camera indices
        test_cap = cv2.VideoCapture(i)
        if test_cap.isOpened():
            emit(f"Camera {i} is available")
            test_cap.release()
        else:
            emit(f"Camera {i} not available")
    
    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)  # Use DirectShow on Windows
    if not cap.isOpened():
        emit("Error: Could not open camera with DSHOW. Trying backend API...")
        cap = cv2.VideoCapture(0, cv2.CAP_MSMF)  # Try Media Foundation
        if not cap.isOpened():
            emit("Error: Could not open camera. Trying default...")
            cap = cv2.VideoCapture(0)
            if not cap.isOpened():
                emit("Error: Could not open any camera. Please check camera permissions.")
                return
    
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, FRAME_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT)
    cap.set(cv2.CAP_PROP_FPS, CAMERA_FPS)
    cap.set(cv2.CAP_PROP_AUTOFOCUS, 1)
    try:
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    except Exception:
        pass
    
    # Warm up camera
    emit("Warming up camera...")
    for i in range(5):
        cap.read()
        time.sleep(0.1)
    
    time.sleep(1)  # Give camera time to initialize
    emit(f"Camera initialized successfully. Resolution: {int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))}x{int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))}")
    emit("System Active")

    phone_persistence_map = {}
    phone_no_track_persistence = 0
    last_no_track_phone_center = None
    prev_hand_positions = {}
    alert_cooldowns = {}
    frame_index = 0
    cached_face_results = None
    cached_hand_results = None
    cached_results = None
    last_stream_emit_ts = 0.0

    directml_runtime_errors = 0
    emit(
        "Performance mode -> "
        f"yolo_every={YOLO_PROCESS_EVERY_N_FRAMES}, "
        f"mediapipe_every={MEDIAPIPE_PROCESS_EVERY_N_FRAMES}, "
        f"yolo_imgsz={YOLO_IMAGE_SIZE}, camera_fps={CAMERA_FPS}, stream_fps={STREAM_TARGET_FPS}, "
        f"tiled={ENABLE_TILED_INFERENCE}, tiled_every={TILED_INFERENCE_EVERY_N}, clahe={ENABLE_CLAHE}, "
        f"read_latest={CAMERA_READ_LATEST}, buffer_flush={CAMERA_BUFFER_FLUSH}"
    )

    while True:
        frame_index += 1
        should_process_yolo = frame_index % YOLO_PROCESS_EVERY_N_FRAMES == 0
        should_process_mediapipe = frame_index % MEDIAPIPE_PROCESS_EVERY_N_FRAMES == 0

        if CAMERA_READ_LATEST and CAMERA_BUFFER_FLUSH > 0:
            for _ in range(CAMERA_BUFFER_FLUSH):
                if not cap.grab():
                    break

        success, img = cap.read()
        if not success:
            emit("Camera read failed - retrying...")
            time.sleep(0.1)
            continue
        
        # Check if frame is valid (not empty/blank)
        if img is None or img.size == 0:
            emit("Empty frame received - retrying...")
            time.sleep(0.1)
            continue
            
        img_rgb = None
        all_mouth_centers = []
        current_frame_fingertips = []

        if should_process_mediapipe or cached_face_results is None:
            if img_rgb is None:
                img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            cached_face_results = face_mesh.process(img_rgb)
        face_results = cached_face_results
        if face_results.multi_face_landmarks:
            for face_landmarks in face_results.multi_face_landmarks:
                direction, nose_coords = get_head_direction_simple(face_landmarks.landmark)
                mouth_x = face_landmarks.landmark[13].x
                mouth_y = face_landmarks.landmark[13].y
                all_mouth_centers.append((mouth_x, mouth_y))
                if direction:
                    nose_px = int(nose_coords[0] * FRAME_WIDTH)
                    nose_py = int(nose_coords[1] * FRAME_HEIGHT)
                    save_alert(img, f"HEAD_{direction}", alert_cooldowns, bbox_center=(nose_px, nose_py))

        if should_process_mediapipe or cached_hand_results is None:
            if img_rgb is None:
                img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            cached_hand_results = hands.process(img_rgb)
        hand_results = cached_hand_results
        current_hand_positions = {}
        if hand_results.multi_hand_landmarks:
            for i, hand_landmarks in enumerate(hand_results.multi_hand_landmarks):
                wrist = hand_landmarks.landmark[0]
                index_tip = hand_landmarks.landmark[8]
                tip_x, tip_y = int(index_tip.x * FRAME_WIDTH), int(index_tip.y * FRAME_HEIGHT)
                current_frame_fingertips.append((tip_x, tip_y))
                current_hand_positions[i] = (wrist.x, wrist.y)
                motion_score = 0
                if i in prev_hand_positions:
                    prev_x, prev_y = prev_hand_positions[i]
                    motion_score = math.sqrt((wrist.x - prev_x) ** 2 + (wrist.y - prev_y) ** 2)
                is_near_mouth = False
                if all_mouth_centers:
                    for (mouth_x, mouth_y) in all_mouth_centers:
                        for point in [hand_landmarks.landmark[8], hand_landmarks.landmark[12], hand_landmarks.landmark[4], hand_landmarks.landmark[0]]:
                            dist = math.sqrt((point.x - mouth_x) ** 2 + (point.y - mouth_y) ** 2)
                            if dist < HAND_MOUTH_THRESHOLD:
                                is_near_mouth = True
                                break
                        if is_near_mouth:
                            break
                if is_near_mouth and motion_score > HAND_MOTION_THRESHOLD:
                    mp.solutions.drawing_utils.draw_landmarks(img, hand_landmarks, mp_hands.HAND_CONNECTIONS)
                    hx, hy = int(wrist.x * FRAME_WIDTH), int(wrist.y * FRAME_HEIGHT)
                    cv2.putText(img, "SUSPICIOUS: HAND NEAR MOUTH", (hx, hy - 40), 
                                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
                    emit(f"🚨 ALERT: HAND NEAR MOUTH")
                    save_alert(img, "HAND_MOUTH", alert_cooldowns, bbox_center=(hx, hy))
        prev_hand_positions = current_hand_positions

        # Apply CLAHE enhancement for better distant object visibility
        enhanced_img = enhance_frame_clahe(img)

        if should_process_yolo or cached_results is None:
            try:
                if use_tracking:
                    results = model.track(enhanced_img, persist=True, conf=PHONE_SEARCH_CONF, iou=0.45, imgsz=YOLO_IMAGE_SIZE, verbose=False, half=infer_half)
                else:
                    results = model.predict(enhanced_img, conf=PHONE_SEARCH_CONF, iou=0.45, imgsz=YOLO_IMAGE_SIZE, verbose=False, half=infer_half)
                directml_runtime_errors = 0
            except RuntimeError as exc:
                error_text = str(exc)
                if "Cannot set version_counter for inference tensor" in error_text:
                    emit("Detected inference tensor compatibility error. Switching to prediction-only mode...")
                    use_tracking = False
                    results = model.predict(enhanced_img, conf=PHONE_SEARCH_CONF, iou=0.45, imgsz=YOLO_IMAGE_SIZE, verbose=False, half=infer_half)
                    directml_runtime_errors = 0
                elif "The parameter is incorrect" in error_text and backend == "DirectML" and not using_cpu_fallback:
                    directml_runtime_errors += 1
                    emit(
                        "Detected DirectML runtime compatibility error. "
                        f"Retrying on DirectML ({directml_runtime_errors}/{DIRECTML_ERROR_BEFORE_CPU_FALLBACK})..."
                    )
                    use_tracking = False
                    model.predictor = None
                    try:
                        results = model.predict(enhanced_img, conf=PHONE_SEARCH_CONF, iou=0.45, imgsz=YOLO_IMAGE_SIZE, verbose=False, half=False)
                        directml_runtime_errors = 0
                    except RuntimeError:
                        if directml_runtime_errors >= DIRECTML_ERROR_BEFORE_CPU_FALLBACK:
                            emit("DirectML failed repeatedly. Switching YOLO inference to CPU fallback...")
                            device = "cpu"
                            backend = "CPU"
                            using_cpu_fallback = True
                            model.to(device)
                            model.predictor = None
                            infer_half = False
                            results = model.predict(enhanced_img, conf=PHONE_SEARCH_CONF, iou=0.45, imgsz=YOLO_IMAGE_SIZE, verbose=False, half=False)
                        else:
                            continue
                else:
                    raise
            cached_results = results
        else:
            results = cached_results
        all_boxes, phone_candidates, person_boxes = [], [], []
        frame_area = img.shape[0] * img.shape[1]
        if results[0].boxes:
            for box in results[0].boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                cls_id = int(box.cls[0])
                track_id = int(box.id[0]) if box.id is not None else -1
                raw_name = model.names[cls_id]
                conf = float(box.conf[0])
                name_lower = raw_name.lower()

                # --- Per-class confidence floor ---
                min_conf = CLASS_MIN_CONF.get(name_lower, GENERAL_DISPLAY_CONF)
                if conf < min_conf:
                    continue

                # --- Filter out unreasonably large boxes (likely furniture) ---
                box_area = (x2 - x1) * (y2 - y1)
                if frame_area > 0 and (box_area / frame_area) > MAX_BOX_FRAME_FRACTION:
                    continue

                # --- Filter out extremely tiny noise boxes ---
                if frame_area > 0 and (box_area / frame_area) < MIN_BOX_FRAME_FRACTION:
                    continue

                all_boxes.append((x1, y1, x2, y2, raw_name, conf))
                if 'person' in name_lower:
                    person_boxes.append((x1, y1, x2, y2))
                if 'phone' in name_lower or 'mobile' in name_lower:
                    phone_candidates.append((x1, y1, x2, y2, conf, track_id))

        # --- Tiled inference for small/distant objects ---
        if ENABLE_TILED_INFERENCE and should_process_yolo and (frame_index % (YOLO_PROCESS_EVERY_N_FRAMES * TILED_INFERENCE_EVERY_N) == 0):
            tile_detections = run_tiled_inference(
                model, enhanced_img, conf=PHONE_SEARCH_CONF, iou=0.45,
                imgsz=YOLO_IMAGE_SIZE, half=infer_half, use_tracking=False
            )
            # Merge tile detections that aren't already covered by the full-frame pass
            for (tx1, ty1, tx2, ty2, tname, tconf) in tile_detections:
                tname_lower = tname.lower()
                # Apply same per-class confidence floor
                tile_min_conf = CLASS_MIN_CONF.get(tname_lower, GENERAL_DISPLAY_CONF)
                if tconf < tile_min_conf:
                    continue
                tile_box_area = (tx2 - tx1) * (ty2 - ty1)
                if frame_area > 0 and (tile_box_area / frame_area) > MAX_BOX_FRAME_FRACTION:
                    continue
                if frame_area > 0 and (tile_box_area / frame_area) < MIN_BOX_FRAME_FRACTION:
                    continue

                already_found = False
                for (ex1, ey1, ex2, ey2, ename, econf) in all_boxes:
                    if tname != ename:
                        continue
                    ix1 = max(tx1, ex1)
                    iy1 = max(ty1, ey1)
                    ix2 = min(tx2, ex2)
                    iy2 = min(ty2, ey2)
                    inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
                    area_a = (tx2 - tx1) * (ty2 - ty1)
                    area_b = (ex2 - ex1) * (ey2 - ey1)
                    union = area_a + area_b - inter
                    if union > 0 and inter / union > 0.3:
                        already_found = True
                        break
                if not already_found:
                    all_boxes.append((tx1, ty1, tx2, ty2, tname, tconf))
                    if 'phone' in tname.lower() or 'mobile' in tname.lower():
                        phone_candidates.append((tx1, ty1, tx2, ty2, tconf, -1))

        # Draw all detected objects with bounding boxes (only above display threshold)
        for (x1, y1, x2, y2, label, conf) in all_boxes:
            # Skip drawing low-confidence detections to reduce visual clutter
            if conf < GENERAL_DISPLAY_CONF:
                continue
            # Color coding: person=cyan, phone=red, watch=green, paper=orange, other=blue
            if 'person' in label.lower():
                color = (255, 255, 0)  # Cyan
                thickness = 2
            elif 'phone' in label.lower() or 'mobile' in label.lower() or 'cell' in label.lower():
                color = (0, 0, 255)  # Red
                thickness = 3
            elif 'watch' in label.lower():
                color = (0, 255, 0)  # Green
                thickness = 3
            elif 'paper' in label.lower() or 'book' in label.lower():
                color = (0, 165, 255)  # Orange
                thickness = 2
            else:
                color = (255, 0, 0)  # Blue
                thickness = 2
            
            cv2.rectangle(img, (x1, y1), (x2, y2), color, thickness)
            label_text = f"{label} {int(conf*100)}%"
            text_size = cv2.getTextSize(label_text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 2)[0]
            cv2.rectangle(img, (x1, y1 - text_size[1] - 8), (x1 + text_size[0] + 4, y1), color, -1)
            cv2.putText(img, label_text, (x1 + 2, y1 - 5), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 2)

        for (x1, y1, x2, y2, label, conf) in all_boxes:
            if 'paper' in label.lower():
                hands_touching_count = 0
                for (fx, fy) in current_frame_fingertips:
                    if x1 < fx < x2 and y1 < fy < y2:
                        hands_touching_count += 1
                if hands_touching_count >= 2:
                    paper_cx, paper_cy = (x1 + x2) // 2, (y1 + y2) // 2
                    save_alert(img, "PAPER_PASSING", alert_cooldowns, bbox_center=(paper_cx, paper_cy))
        # Watch detection logic
        for (x1, y1, x2, y2, label, conf) in all_boxes:
            if 'watch' in label.lower() and conf > WATCH_DISPLAY_CONF:
                watch_cx, watch_cy = (x1 + x2) // 2, (y1 + y2) // 2
                emit(f"⌚ ALERT: WATCH DETECTED (confidence: {int(conf*100)}%)")
                save_alert(img, "WATCH_DETECTED", alert_cooldowns, bbox_center=(watch_cx, watch_cy))

        current_frame_phone_ids = []
        no_track_phone_seen = False
        for (x1, y1, x2, y2, conf, track_id) in phone_candidates:
            w, h = x2 - x1, y2 - y1
            area = w * h
            aspect = w / h if h != 0 else 0
            if area < PHONE_MIN_AREA or area > PHONE_MAX_AREA:
                continue
            if aspect < PHONE_MIN_ASPECT or aspect > PHONE_MAX_ASPECT:
                continue

            phone_cx, phone_cy = (x1 + x2) // 2, (y1 + y2) // 2

            if conf >= PHONE_MIN_CONF:
                if track_id != -1:
                    current_frame_phone_ids.append(track_id)
                    phone_persistence_map[track_id] = phone_persistence_map.get(track_id, 0) + 1
                    if phone_persistence_map.get(track_id, 0) >= PHONE_PERSISTENCE:
                        save_alert(img, "PHONE_DETECTED", alert_cooldowns, bbox_center=(phone_cx, phone_cy))
                else:
                    # Tracking can be unavailable in prediction/fallback mode.
                    # Use stricter confidence and a short consecutive-frame streak.
                    if conf >= PHONE_NO_TRACK_MIN_CONF:
                        no_track_phone_seen = True
                        last_no_track_phone_center = (phone_cx, phone_cy)

        if no_track_phone_seen:
            phone_no_track_persistence += 1
            if phone_no_track_persistence >= PHONE_NO_TRACK_PERSISTENCE and last_no_track_phone_center:
                save_alert(
                    img,
                    "PHONE_DETECTED",
                    alert_cooldowns,
                    bbox_center=last_no_track_phone_center
                )
        else:
            phone_no_track_persistence = max(0, phone_no_track_persistence - 1)
            if phone_no_track_persistence == 0:
                last_no_track_phone_center = None

        for pid in list(phone_persistence_map.keys()):
            if pid not in current_frame_phone_ids:
                phone_persistence_map[pid] = max(0, phone_persistence_map[pid] - 1)
                if phone_persistence_map[pid] == 0:
                    del phone_persistence_map[pid]
        
        # Draw face landmarks and head direction
        if face_results.multi_face_landmarks:
                direction, nose_coords = get_head_direction_simple(face_landmarks.landmark)
                if direction:
                    nose_x, nose_y = int(nose_coords[0] * FRAME_WIDTH), int(nose_coords[1] * FRAME_HEIGHT)
                    cv2.putText(img, f"HEAD_{direction}", (nose_x-30, nose_y-20), 
                               cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)  # Red color
        
        # Emit frame for web streaming at controlled FPS to avoid frontend/socket backlog
        now_ts = time.time()
        if now_ts - last_stream_emit_ts >= (1.0 / STREAM_TARGET_FPS):
            emit_frame(img)
            last_stream_emit_ts = now_ts
        time.sleep(0.005)
        
        # Optional: Keep window for debugging (remove if not needed)
        # cv2.imshow("Exam Monitor Camera", img)
        # if cv2.waitKey(1) & 0xFF == ord('q'):
        #     break
    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    run_system()
