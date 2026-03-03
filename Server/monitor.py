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

FRAME_WIDTH = 1280
FRAME_HEIGHT = 720
STREAM_WIDTH = int(os.environ.get("STREAM_WIDTH", "640"))
STREAM_HEIGHT = int(os.environ.get("STREAM_HEIGHT", "360"))
STREAM_JPEG_QUALITY = max(10, min(90, int(os.environ.get("STREAM_JPEG_QUALITY", "55"))))
STREAM_TARGET_FPS = max(1, int(os.environ.get("STREAM_TARGET_FPS", "10")))
YOLO_PROCESS_EVERY_N_FRAMES = max(1, int(os.environ.get("YOLO_PROCESS_EVERY", "2")))
MEDIAPIPE_PROCESS_EVERY_N_FRAMES = max(1, int(os.environ.get("MEDIAPIPE_PROCESS_EVERY", "4")))
YOLO_IMAGE_SIZE = int(os.environ.get("YOLO_IMAGE_SIZE", "640"))
CAMERA_FPS = int(os.environ.get("MONITOR_CAMERA_FPS", "18"))
DIRECTML_ERROR_BEFORE_CPU_FALLBACK = max(1, int(os.environ.get("DIRECTML_ERROR_BEFORE_CPU_FALLBACK", "5")))

SAVE_ALERTS = True
ALERT_COOLDOWN = 3.0
output_folder = "suspicious_alerts"
os.makedirs(output_folder, exist_ok=True)

PHONE_SEARCH_CONF = 0.05
PHONE_MIN_CONF = 0.08
PHONE_PERSISTENCE = 2
PHONE_MIN_AREA = 120
PHONE_MAX_AREA = 100000
PHONE_MIN_ASPECT = 0.1
PHONE_MAX_ASPECT = 5.0

GENERAL_DISPLAY_CONF = 0.50
WATCH_DISPLAY_CONF = 0.20

LOOK_X_THRESHOLD = 0.025
LOOK_Y_UP_THRESHOLD = 0.03

HAND_MOUTH_THRESHOLD = 0.15
HAND_MOTION_THRESHOLD = 0.005

mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5,
    refine_landmarks=True,
    max_num_faces=1
)

mp_hands = mp.solutions.hands
hands = mp_hands.Hands(
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5,
    max_num_hands=2
)

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

def save_alert(img, reason, last_time, bbox_center=None):
    """Save an alert image and emit an ALERT line.

    Args:
        img: The frame image.
        reason: Alert reason string (e.g. PHONE_DETECTED).
        last_time: Timestamp of the last saved alert (for cooldown).
        bbox_center: Optional tuple (cx, cy) of the detection center in *pixel*
                     coordinates of the original frame.  When provided the ALERT
                     line includes the coordinates so the backend can map the
                     detection to the nearest student in the seating plan.
    """
    current_time = time.time()
    if SAVE_ALERTS and (current_time - last_time > ALERT_COOLDOWN):
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
        return current_time
    return last_time

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
    
    # Warm up camera
    emit("Warming up camera...")
    for i in range(5):
        cap.read()
        time.sleep(0.1)
    
    time.sleep(1)  # Give camera time to initialize
    emit(f"Camera initialized successfully. Resolution: {int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))}x{int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))}")
    emit("System Active")

    phone_persistence_map = {}
    prev_hand_positions = {}
    last_save_time = 0
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
        f"yolo_imgsz={YOLO_IMAGE_SIZE}, camera_fps={CAMERA_FPS}, stream_fps={STREAM_TARGET_FPS}"
    )

    while True:
        frame_index += 1
        should_process_yolo = frame_index % YOLO_PROCESS_EVERY_N_FRAMES == 0
        should_process_mediapipe = frame_index % MEDIAPIPE_PROCESS_EVERY_N_FRAMES == 0
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
                    last_save_time = save_alert(img, f"HEAD_{direction}", last_save_time, bbox_center=(nose_px, nose_py))

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
                    last_save_time = save_alert(img, "HAND_MOUTH", last_save_time, bbox_center=(hx, hy))
        prev_hand_positions = current_hand_positions

        if should_process_yolo or cached_results is None:
            try:
                if use_tracking:
                    results = model.track(img, persist=True, conf=PHONE_SEARCH_CONF, iou=0.5, imgsz=YOLO_IMAGE_SIZE, verbose=False, half=infer_half)
                else:
                    results = model.predict(img, conf=PHONE_SEARCH_CONF, iou=0.5, imgsz=YOLO_IMAGE_SIZE, verbose=False, half=infer_half)
                directml_runtime_errors = 0
            except RuntimeError as exc:
                error_text = str(exc)
                if "Cannot set version_counter for inference tensor" in error_text:
                    emit("Detected inference tensor compatibility error. Switching to prediction-only mode...")
                    use_tracking = False
                    results = model.predict(img, conf=PHONE_SEARCH_CONF, iou=0.5, imgsz=YOLO_IMAGE_SIZE, verbose=False, half=infer_half)
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
                        results = model.predict(img, conf=PHONE_SEARCH_CONF, iou=0.5, imgsz=YOLO_IMAGE_SIZE, verbose=False, half=False)
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
                            results = model.predict(img, conf=PHONE_SEARCH_CONF, iou=0.5, imgsz=YOLO_IMAGE_SIZE, verbose=False, half=False)
                        else:
                            continue
                else:
                    raise
            cached_results = results
        else:
            results = cached_results
        all_boxes, phone_candidates = [], []
        if results[0].boxes:
            for box in results[0].boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                cls_id = int(box.cls[0])
                track_id = int(box.id[0]) if box.id is not None else -1
                raw_name = model.names[cls_id]
                conf = float(box.conf[0])
                all_boxes.append((x1, y1, x2, y2, raw_name, conf))
                if 'phone' in raw_name.lower() or 'mobile' in raw_name.lower():
                    phone_candidates.append((x1, y1, x2, y2, conf, track_id))

        # Draw all detected objects with bounding boxes
        for (x1, y1, x2, y2, label, conf) in all_boxes:
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
                    last_save_time = save_alert(img, "PAPER_PASSING", last_save_time, bbox_center=(paper_cx, paper_cy))
        # Watch detection logic
        for (x1, y1, x2, y2, label, conf) in all_boxes:
            if 'watch' in label.lower() and conf > WATCH_DISPLAY_CONF:
                watch_cx, watch_cy = (x1 + x2) // 2, (y1 + y2) // 2
                emit(f"⌚ ALERT: WATCH DETECTED (confidence: {int(conf*100)}%)")
                last_save_time = save_alert(img, "WATCH_DETECTED", last_save_time, bbox_center=(watch_cx, watch_cy))

        current_frame_phone_ids = []
        for (x1, y1, x2, y2, conf, track_id) in phone_candidates:
            w, h = x2 - x1, y2 - y1
            area = w * h
            aspect = w / h if h != 0 else 0
            if area < PHONE_MIN_AREA or area > PHONE_MAX_AREA:
                continue
            if aspect < PHONE_MIN_ASPECT or aspect > PHONE_MAX_ASPECT:
                continue
            if conf >= PHONE_MIN_CONF:
                current_frame_phone_ids.append(track_id)
                if track_id != -1:
                    phone_persistence_map[track_id] = phone_persistence_map.get(track_id, 0) + 1
                if phone_persistence_map.get(track_id, 1) >= PHONE_PERSISTENCE:
                    phone_cx, phone_cy = (x1 + x2) // 2, (y1 + y2) // 2
                    last_save_time = save_alert(img, "PHONE_DETECTED", last_save_time, bbox_center=(phone_cx, phone_cy))
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
