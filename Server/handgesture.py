import cv2
import time
from datetime import datetime

try:
    import mediapipe as mp
except ImportError:
    mp = None


def _bbox_overlap(a, b, margin=60):
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    return not (ax2 + margin < bx1 or bx2 + margin < ax1 or
                ay2 + margin < by1 or by2 + margin < ay1)


def _bbox_center(bbox):
    return ((bbox[0] + bbox[2]) / 2.0, (bbox[1] + bbox[3]) / 2.0)


class HandGestureDetector:
    def __init__(self, process_every=6):
        self.process_every = process_every
        self.GESTURE_COOLDOWN = 3.0  # seconds between initial alerts for same student
        self.PAPER_PASSING_COOLDOWN = 15.0
        
        self._last_paper_alert_time = 0
        self._last_gesture_alert = {}

        if mp is not None:
            self.mp_hands = mp.solutions.hands
            self.mp_pose = mp.solutions.pose
            self.mp_drawing = mp.solutions.drawing_utils

            self.hands = self.mp_hands.Hands(
                static_image_mode=False, max_num_hands=10, model_complexity=1,
                min_detection_confidence=0.35, min_tracking_confidence=0.45
            )
            self.pose = self.mp_pose.Pose(
                static_image_mode=False, model_complexity=1,
                min_detection_confidence=0.5, min_tracking_confidence=0.5
            )
        else:
            self.hands = None
            self.pose = None

        self._last_violations = []
        self._last_overlay_data = []

    def _find_owner(self, hand_cx, hand_cy, yolo_detections):
        for det in yolo_detections:
            if det.get("category") != "person":
                continue
            px1, py1, px2, py2 = det["bbox"]
            if (px1 - 50 <= hand_cx <= px2 + 50 and py1 - 50 <= hand_cy <= py2 + 150):
                pcx = int(((px1 + px2) * 0.5) / 120)
                pcy = int(((py1 + py2) * 0.5) / 120)
                return f"student_{pcx}_{pcy}", (int(px1), int(py1), int(px2), int(py2))

        hcx = int(hand_cx / 120)
        hcy = int(hand_cy / 120)
        return f"student_{hcx}_{hcy}", None

    def _detect_paper_passing(self, hand_entries, yolo_detections, frame_w, frame_h):
        violations = []
        now = time.time()

        paper_dets = [d for d in yolo_detections if d.get("category") == "paper"]
        if not paper_dets or not hand_entries:
            return violations

        for paper in paper_dets:
            p_bbox = tuple(int(v) for v in paper["bbox"])

            touching_students = {}
            for entry in hand_entries:
                if _bbox_overlap(entry["bbox"], p_bbox, margin=80):
                    sid = entry["student_id"]
                    if sid not in touching_students:
                        touching_students[sid] = entry

            if len(touching_students) >= 2 and (now - self._last_paper_alert_time >= self.PAPER_PASSING_COOLDOWN):
                student_ids = list(touching_students.keys())
                all_bboxes = [p_bbox] + [e["bbox"] for e in touching_students.values()]
                combined_x1 = min(b[0] for b in all_bboxes)
                combined_y1 = min(b[1] for b in all_bboxes)
                combined_x2 = max(b[2] for b in all_bboxes)
                combined_y2 = max(b[3] for b in all_bboxes)

                violations.append({
                    "type": "paper_passing",
                    "description": f"Paper passing between {student_ids[0]} and {student_ids[1]}",
                    "confidence": float(paper.get("conf", 0.8)),
                    "student_ids": student_ids,
                    "student_id": student_ids[0],
                    "face_bbox": (combined_x1, combined_y1, combined_x2, combined_y2),
                })
                self._last_paper_alert_time = now

        return violations

    def detect(self, frame_bgr, frame_idx, yolo_detections=None):
        if yolo_detections is None:
            yolo_detections = []
        if self.hands is None or self.pose is None:
            return [], []

        if frame_idx % self.process_every != 0:
            return self._last_violations, self._last_overlay_data

        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        rgb_small = cv2.resize(rgb, (480, 360), interpolation=cv2.INTER_NEAREST)
        rgb_small.flags.writeable = False

        results = self.hands.process(rgb_small)
        pose_results = self.pose.process(rgb_small)

        violations = []
        overlay_data = []

        shoulder_y = None
        if pose_results.pose_landmarks:
            pose_landmarks = pose_results.pose_landmarks.landmark
            shoulder_y = (pose_landmarks[11].y + pose_landmarks[12].y) / 2

        hand_entries = []
        now = time.time()

        if results.multi_hand_landmarks and results.multi_handedness:
            h, w = frame_bgr.shape[:2]

            for i, hand_landmarks in enumerate(results.multi_hand_landmarks):
                landmarks = hand_landmarks.landmark
                hand_y = min(lm.y for lm in landmarks)
                label = results.multi_handedness[i].classification[0].label

                fingers = 0
                if landmarks[4].x < landmarks[3].x:
                    fingers += 1
                for tip, pip_idx in zip([8, 12, 16, 20], [6, 10, 14, 18]):
                    if landmarks[tip].y < landmarks[pip_idx].y:
                        fingers += 1

                xs = [lm.x for lm in landmarks]
                ys = [lm.y for lm in landmarks]
                x_min = max(int(min(xs) * w) - 20, 0)
                x_max = min(int(max(xs) * w) + 20, w)
                y_min = max(int(min(ys) * h) - 20, 0)
                y_max = min(int(max(ys) * h) + 20, h)
                bbox = (x_min, y_min, x_max, y_max)

                hand_cx = (x_min + x_max) / 2.0
                hand_cy = (y_min + y_max) / 2.0
                student_id, person_bbox = self._find_owner(hand_cx, hand_cy, yolo_detections)

                hand_entries.append({
                    "bbox": bbox,
                    "student_id": student_id,
                    "person_bbox": person_bbox,
                })

                in_zone = (shoulder_y is not None and hand_y < shoulder_y)

                overlay_data.append({
                    "type": "hand",
                    "landmarks": hand_landmarks,
                    "label": label,
                    "fingers": fingers,
                    "student_id": student_id,
                    "in_zone": in_zone,
                    "bbox": bbox,
                    "person_bbox": person_bbox,
                })

                if in_zone and fingers > 0:
                    last_alert = self._last_gesture_alert.get(student_id, 0)
                    if now - last_alert >= self.GESTURE_COOLDOWN:
                        violations.append({
                            "type": "hand_gesture",
                            "description": f"Hand Gesture Detected (Showing {fingers} fingers)",
                            "confidence": 1.0,
                            "student_id": student_id,
                            "face_bbox": person_bbox or bbox,
                        })
                        self._last_gesture_alert[student_id] = now

        paper_violations = self._detect_paper_passing(hand_entries, yolo_detections,
                                                      frame_bgr.shape[1], frame_bgr.shape[0])
        violations.extend(paper_violations)

        self._last_violations = violations
        self._last_overlay_data = overlay_data

        overlay_data.append({
            "type": "hand_info",
            "shoulder_y": shoulder_y,
            "hands_in_zone": sum(1 for d in overlay_data if d.get("type") == "hand" and d.get("in_zone")),
        })

        return violations, overlay_data

    def draw_overlay(self, frame, overlay_data):
        if self.hands is None or self.mp_drawing is None:
            return

        info_data = next((d for d in overlay_data if d["type"] == "hand_info"), None)
        hand_items = [d for d in overlay_data if d["type"] == "hand"]

        y_offset = 60
        if info_data:
            hands_count = info_data.get("hands_in_zone", 0)
            cv2.putText(frame, f"Hands in Zone: {hands_count}", (10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.85,
                        (0, 255, 0) if hands_count > 0 else (0, 0, 255), 2)

            shoulder_y = info_data.get("shoulder_y")
            if shoulder_y is not None:
                cv2.putText(frame, f"Shoulder Y: {shoulder_y:.3f}", (10, y_offset),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 2)
                y_offset += 20

        for idx, item in enumerate(hand_items):
            self.mp_drawing.draw_landmarks(frame, item["landmarks"],
                                           self.mp_hands.HAND_CONNECTIONS)
            label = item["label"]
            fingers = item.get("fingers", 0)
            zone_status = "IN ZONE" if item.get("in_zone") else "OK"
            color = (0, 0, 255) if item.get("in_zone") and fingers > 0 else (0, 255, 255)
            cv2.putText(frame,
                        f"{label} (Fingers: {fingers}): {zone_status}",
                        (10, y_offset + (idx * 30)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)
