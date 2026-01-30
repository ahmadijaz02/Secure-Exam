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

FRAME_WIDTH = 1280
FRAME_HEIGHT = 720

SAVE_ALERTS = True
ALERT_COOLDOWN = 3.0
output_folder = "suspicious_alerts"
os.makedirs(output_folder, exist_ok=True)

PHONE_SEARCH_CONF = 0.05
PHONE_MIN_CONF = 0.10
PHONE_PERSISTENCE = 2
PHONE_MIN_AREA = 300
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
    max_num_faces=5
)

mp_hands = mp.solutions.hands
hands = mp_hands.Hands(
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5,
    max_num_hands=10
)

def emit(msg):
    print(msg)
    sys.stdout.flush()

def emit_frame(img):
    """Emit frame as base64 for web streaming"""
    try:
        # Resize frame for faster transmission
        small_img = cv2.resize(img, (320, 180))
        _, buffer = cv2.imencode('.jpg', small_img, [cv2.IMWRITE_JPEG_QUALITY, 50])
        jpg_as_text = base64.b64encode(buffer).decode()
        print(f"FRAME:{jpg_as_text}")
        sys.stdout.flush()
    except Exception as e:
        print(f"FRAME_ERROR:{str(e)}")
        sys.stdout.flush()

def save_alert(img, reason, last_time):
    current_time = time.time()
    if SAVE_ALERTS and (current_time - last_time > ALERT_COOLDOWN):
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{output_folder}/ALERT_{reason}_{timestamp}.jpg"
        cv2.imwrite(filename, img)
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

def run_system():
    device = "cuda" if torch.cuda.is_available() else "cpu"
    emit(f"Loading YOLO on {device}")
    # Resolve absolute path to weights regardless of where script is launched
    weights_path = os.path.join(os.path.dirname(__file__), "best (3).pt")
    model = YOLO(weights_path)
    model.to(device)
    
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
    cap.set(cv2.CAP_PROP_FPS, 30)
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

    while True:
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
            
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        all_mouth_centers = []
        current_frame_fingertips = []

        face_results = face_mesh.process(img_rgb)
        if face_results.multi_face_landmarks:
            for face_landmarks in face_results.multi_face_landmarks:
                direction, nose_coords = get_head_direction_simple(face_landmarks.landmark)
                mouth_x = face_landmarks.landmark[13].x
                mouth_y = face_landmarks.landmark[13].y
                all_mouth_centers.append((mouth_x, mouth_y))
                if direction:
                    last_save_time = save_alert(img, f"HEAD_{direction}", last_save_time)

        hand_results = hands.process(img_rgb)
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
                    last_save_time = save_alert(img, "HAND_MOUTH", last_save_time)
        prev_hand_positions = current_hand_positions

        results = model.track(img, persist=True, conf=PHONE_SEARCH_CONF, iou=0.5, verbose=False)
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
        for (x1, y1, x2, y2, label, conf) in all_boxes:
            if 'paper' in label.lower():
                hands_touching_count = 0
                for (fx, fy) in current_frame_fingertips:
                    if x1 < fx < x2 and y1 < fy < y2:
                        hands_touching_count += 1
                if hands_touching_count >= 2:
                    last_save_time = save_alert(img, "PAPER_PASSING", last_save_time)
        # Watch detection logic
        for (x1, y1, x2, y2, label, conf) in all_boxes:
            if 'watch' in label.lower() and conf > WATCH_DISPLAY_CONF:
                cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
                cv2.putText(img, f"Watch {int(conf*100)}%", (x1, y1-10), 
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
                emit(f"⌚ ALERT: WATCH DETECTED (confidence: {int(conf*100)}%)")
                last_save_time = save_alert(img, "WATCH_DETECTED", last_save_time)

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
                    last_save_time = save_alert(img, "PHONE_DETECTED", last_save_time)
        for pid in list(phone_persistence_map.keys()):
            if pid not in current_frame_phone_ids:
                phone_persistence_map[pid] = max(0, phone_persistence_map[pid] - 1)
                if phone_persistence_map[pid] == 0:
                    del phone_persistence_map[pid]
                    cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
            cv2.putText(img, f"{label} {conf:.2f}", (x1, y1-10), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 2)  # Red color
        
        # Draw face landmarks and head direction
        if face_results.multi_face_landmarks:
            for face_landmarks in face_results.multi_face_landmarks:
                direction, nose_coords = get_head_direction_simple(face_landmarks.landmark)
                if direction:
                    nose_x, nose_y = int(nose_coords[0] * FRAME_WIDTH), int(nose_coords[1] * FRAME_HEIGHT)
                    cv2.putText(img, f"HEAD_{direction}", (nose_x-30, nose_y-20), 
                               cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)  # Red color
        
        # Emit frame for web streaming and remove separate window
        emit_frame(img)
        time.sleep(0.1)  # Reduce frame rate to ~10 FPS for web streaming
        
        # Optional: Keep window for debugging (remove if not needed)
        # cv2.imshow("Exam Monitor Camera", img)
        # if cv2.waitKey(1) & 0xFF == ord('q'):
        #     break
    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    run_system()
