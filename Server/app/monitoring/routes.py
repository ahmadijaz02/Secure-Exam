from flask import request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.monitoring import bp
from app import socketio
import subprocess
import threading
import os
import re
from datetime import datetime
import sys
import math
import time

EMIT_LEGACY_MONITORING_FRAME = os.environ.get('EMIT_LEGACY_MONITORING_FRAME', '0').lower() in ('1', 'true', 'yes', 'on')
SOCKET_STREAM_TARGET_FPS = max(1, int(os.environ.get('SOCKET_STREAM_TARGET_FPS', '20')))
SOCKET_EMIT_EVERY_N = max(1, int(os.environ.get('SOCKET_EMIT_EVERY_N', '1')))



# Global state
current_process = None
monitoring_active = False
email_alerts_enabled = True  

HEAD_TURN_WINDOW_SECONDS = 60
HEAD_TURN_ESCALATION_THRESHOLD = 3
student_head_turn_tracker = {}  


HAND_GESTURE_WINDOW_SECONDS = 60
HAND_GESTURE_ESCALATION_THRESHOLD = 3
student_hand_gesture_tracker = {}  

EMAIL_ALERT_COOLDOWN_SECONDS = 20
last_email_sent_at = {}


_seat_cache = {}       
_SEAT_CACHE_TTL = 60.0  

_last_confirmed_student = {}   
_LAST_CONFIRMED_TTL = 30.0     


def _send_alert_email_async(app_obj, exam_session_id, reason, timestamp, filename, student_name, roll_number, seat_number, head_turn_escalated, head_turn_count, window_seconds):
    
    try:
        with app_obj.app_context():
            now_ts = time.time()
            email_key = f"{exam_session_id}:{reason}:{student_name or ''}:{roll_number or ''}:{seat_number or ''}"
            last_sent = last_email_sent_at.get(email_key, 0)
            if now_ts - last_sent < EMAIL_ALERT_COOLDOWN_SECONDS:
                cooldown_left = int(EMAIL_ALERT_COOLDOWN_SECONDS - (now_ts - last_sent))
                msg = f"[EMAIL] Skipped sending {reason} alert for {student_name} (cooldown: wait {cooldown_left}s)"
                print(msg)
                socketio.emit('log', msg, namespace='/')
                return

            session_model = app_obj.exam_session_model
            user_model = app_obj.user_model

            session = session_model.find_by_id(exam_session_id) if exam_session_id else None
            teacher_email = None
            if session and 'teacher_id' in session:
                teacher = user_model.find_by_id(session['teacher_id'])
                if teacher and 'email' in teacher:
                    teacher_email = teacher['email']

            if not teacher_email:
                print("[EMAIL] No teacher email found — skipping email send.")
                return

            evidence_abs_path = None
            if filename:
                server_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
                suspicious_dir = os.path.join(server_dir, 'suspicious_alerts')

                if os.path.isabs(filename) and os.path.isfile(filename):
                    evidence_abs_path = filename
                else:
                    clean = filename.replace('\\', '/').lstrip('/')
                    if clean.startswith('suspicious_alerts/'):
                        clean = clean.split('suspicious_alerts/', 1)[1]
                    candidate = os.path.join(suspicious_dir, clean)
                    if os.path.isfile(candidate):
                        evidence_abs_path = candidate
                    else:
                        print(f"[EMAIL] Evidence file not found: {candidate}")

            from app.utils.helpers import send_email_alert
            plain_body = f"Level 2 Warning: {reason} detected at {timestamp}."
            if head_turn_escalated and student_name:
                plain_body = (
                    f"Level 2 Warning: {student_name} (Roll: {roll_number}, Seat: {seat_number}) "
                    f"has turned their head {head_turn_count} times in the last {window_seconds} seconds."
                )
            if student_name and not head_turn_escalated:
                plain_body += f"\nStudent: {student_name} (Roll: {roll_number}, Seat: {seat_number})"
            if evidence_abs_path:
                plain_body += f"\nEvidence image attached."

            frontend_url = os.environ.get('FRONTEND_URL', 'http://localhost:3000')
            dashboard_url = f"{frontend_url}/teacher/sessions"

            subject_parts = [f"🚨 Exam Alert: {reason}"]
            if student_name:
                subject_parts.append(f"— {student_name}")
            if head_turn_escalated:
                subject_parts.append(f"[ESCALATED]")
            subject = ' '.join(subject_parts)

            send_email_alert(
                subject=subject,
                body=plain_body,
                to_emails=[teacher_email],
                attachment_path=evidence_abs_path,
                reason=reason,
                timestamp=timestamp,
                student_name=student_name,
                roll_number=roll_number,
                seat_number=seat_number,
                head_turn_escalated=head_turn_escalated,
                head_turn_count=head_turn_count,
                window_seconds=window_seconds,
                dashboard_url=dashboard_url,
            )
            last_email_sent_at[email_key] = now_ts
            print(f"[EMAIL] Level 2 alert email dispatched for {reason} to {teacher_email}")
    except Exception as e:
        print(f"[EMAIL] Async email send failed: {e}")


@socketio.on('connect', namespace='/')
def handle_default_connect():
    try:
        print("Client connected to default namespace (monitoring)")
        socketio.emit('log', 'Connected to monitoring server', namespace='/')
        socketio.emit('email_alerts_status', {'enabled': email_alerts_enabled}, namespace='/')
    except Exception as e:
        print(f"Default namespace connect error: {e}")


@socketio.on('connect', namespace='/monitoring')
def handle_monitoring_connect():
    try:
        print(f"Monitoring socket connected: {request.sid}")
        socketio.emit('monitoring_status', {
            'message': 'Monitoring socket connected'
        }, namespace='/monitoring')
    except Exception as e:
        print(f"Monitoring socket connect error: {e}")


@socketio.on('disconnect', namespace='/monitoring')
def handle_monitoring_disconnect():
    try:
        print(f"Monitoring socket disconnected: {request.sid}")
    except Exception as e:
        print(f"Monitoring socket disconnect error: {e}")


@socketio.on('toggle_email_alerts', namespace='/')
def handle_toggle_email_alerts(data):
    global email_alerts_enabled
    try:
        if isinstance(data, dict):
            enabled = bool(data.get('enabled', True))
        elif isinstance(data, str):
            import json
            try:
                parsed = json.loads(data)
                enabled = bool(parsed.get('enabled', True))
            except:
                if data.lower() in ('false', '0', 'off'):
                    enabled = False
                else:
                    enabled = True
        else:
            enabled = bool(data)
        
        email_alerts_enabled = enabled
        print(f"[EMAIL] Email alerts {'ENABLED' if enabled else 'DISABLED'} by frontend")
        socketio.emit('email_alerts_status', {'enabled': email_alerts_enabled}, namespace='/')
    except Exception as e:
        print(f"Error toggling email alerts: {e}")


def get_severity(reason):
    object_alerts = {'PHONE_DETECTED', 'WATCH_DETECTED', 'PAPER_PASSING'}
    behaviour_alerts = {'HAND_GESTURE'}
    return 'high' if reason in object_alerts else 'medium' if reason in behaviour_alerts else 'low'


def get_alert_category(reason):
    object_alerts = {'PHONE_DETECTED', 'WATCH_DETECTED', 'PAPER_PASSING'}
    hand_alerts = {'HAND_GESTURE'}
    return 'object' if reason in object_alerts else 'hand_gesture' if reason in hand_alerts else 'behavior'


def _get_cached_seats(app, exam_session_id):

    now_ts = time.time()
    cached = _seat_cache.get(exam_session_id)
    if cached and (now_ts - cached['fetched_at']) < _SEAT_CACHE_TTL:
        return cached['seats']

    try:
        session = app.exam_session_model.find_by_id(exam_session_id)
        if not session:
            return []
        seats_flat = []
        for classroom in session.get('classrooms', []):
            plan_id = classroom.get('seating_plan_id')
            if not plan_id:
                continue
            plan = app.seating_plan_model.find_by_id(plan_id)
            if not plan:
                continue
            cname = plan.get('classroom_name', '')
            pid   = plan.get('id', plan_id)
            for seat in plan.get('seats', []):
                nx = seat.get('norm_x')
                ny = seat.get('norm_y')
                sname = (seat.get('student_name') or '').strip()
                if nx is None or ny is None or not sname:
                    continue
                seats_flat.append({
                    'seat_number':    seat.get('seat_number', ''),
                    'student_name':   sname,
                    'roll_number':    (seat.get('roll_number') or '').strip(),
                    'norm_x':         nx,
                    'norm_y':         ny,
                    'plan_id':        pid,
                    'classroom_name': cname,
                })
        _seat_cache[exam_session_id] = {'seats': seats_flat, 'fetched_at': now_ts}
        print(f"[SeatingCache] Refreshed: {len(seats_flat)} assigned seat(s) for session {exam_session_id}")
        return seats_flat
    except Exception as e:
        print(f"[SeatingCache] Error building cache: {e}")
        return []


def resolve_student_from_detection(app, exam_session_id, norm_x, norm_y,
                                    is_behaviour_alert=False):
    
    if not exam_session_id:
        return None

    try:
        seats = _get_cached_seats(app, exam_session_id)
        if not seats:
            print("[resolve_student] No assigned seats found in session.")
            return None

        if norm_x is not None and norm_y is not None:
            best_match = None
            best_score = float('inf')

            for seat in seats:
                seat_nx = seat['norm_x']
                seat_ny = seat['norm_y']

                seat_nw = seat.get('norm_w', 0.15)
                seat_nh = seat.get('norm_h', 0.20)

                dx = abs(seat_nx - norm_x)
                dy = abs(seat_ny - norm_y)

                is_inside = (dx <= seat_nw / 2.0) and (dy <= seat_nh / 2.0)
                dist_to_center = math.hypot(dx, dy)

                if is_inside:
                    score = -100.0 + dist_to_center
                elif dx <= (seat_nw * 1.5) and dy <= (seat_nh * 1.5):
                    score = dist_to_center
                else:
                    continue

                if score < best_score:
                    best_score = score
                    best_match = seat

            if best_match:
                _last_confirmed_student[exam_session_id] = {
                    'student': best_match,
                    'ts': time.time(),
                }
                alert_type = "behaviour" if is_behaviour_alert else "object"
                score_str = "INSIDE ZONE" if best_score < 0 else f"MARGIN (dist={best_score:.3f})"
                print(
                    f"[resolve_student] Matched ({alert_type}): {best_match['student_name']} "
                    f"(seat {best_match['seat_number']}, {score_str})"
                )
                return best_match

            print(
                f"[resolve_student] No coordinate match — norm=({norm_x:.3f},{norm_y:.3f}). "
                f"Fell outside all seat bounding boxes and margins."
            )

        if is_behaviour_alert or norm_x is None or norm_y is None:
            cached = _last_confirmed_student.get(exam_session_id)
            if cached and (time.time() - cached['ts']) < _LAST_CONFIRMED_TTL:
                s = cached['student']
                print(f"[resolve_student] Behaviour alert fallback → last confirmed: {s['student_name']}")
                return s
            if len(seats) == 1:
                print(f"[resolve_student] Single student fallback: {seats[0]['student_name']}")
                return seats[0]
            print("[resolve_student] Behaviour alert with no confirmed student cached.")
            return None

        return None

    except Exception as e:
        print(f"[resolve_student] Error: {e}")
        return None


def process_monitor_output(process, socketio_instance, app):
    global monitoring_active
    frame_count = 0
    last_frame_emit_ts = 0.0
    try:
        with app.app_context():
            while monitoring_active and process.poll() is None:
                line = process.stdout.readline()
                if not line:
                    break

                line = line.strip()
                if not line:
                    continue

                if line.startswith('FRAME:'):
                    frame_data = line[6:]
                    if not frame_data or len(frame_data) < 100:
                        continue
                    frame_count += 1
                    if SOCKET_EMIT_EVERY_N > 1 and (frame_count % SOCKET_EMIT_EVERY_N != 0):
                        continue

                    now_ts = time.time()
                    if now_ts - last_frame_emit_ts < (1.0 / SOCKET_STREAM_TARGET_FPS):
                        continue
                    last_frame_emit_ts = now_ts

                    if frame_count % 30 == 0:
                        print(f"[Monitor] Emitted frame #{frame_count}")

                    try:
                        socketio_instance.emit('frame', {
                            'frame': frame_data,
                            'ts': int(now_ts * 1000)
                        }, namespace='/')
                        if EMIT_LEGACY_MONITORING_FRAME:
                            socketio_instance.emit('video_frame', {'frame': f'data:image/jpeg;base64,{frame_data}'}, namespace='/monitoring')
                    except Exception as e:
                        print(f"Error emitting frame: {e}")

                elif line.startswith('ALERT:'):
                    raw_payload = line[6:]
                    reason = ""
                    timestamp = ""
                    filename = None
                    bbox_info = None

                    if '|' in raw_payload:
                        parts = raw_payload.split('|', 3)
                        reason = parts[0] if len(parts) > 0 else ""
                        timestamp = parts[1] if len(parts) > 1 else ""
                        filename = parts[2] if len(parts) > 2 else None
                        bbox_info = parts[3] if len(parts) > 3 else None
                    else:
                        first_colon = raw_payload.find(':')
                        if first_colon >= 0:
                            reason = raw_payload[:first_colon]
                            rest = raw_payload[first_colon + 1:]

                            bbox_match = re.search(r':(\d+,\d+,\d+,\d+)$', rest)
                            if bbox_match:
                                bbox_info = bbox_match.group(1)
                                rest = rest[:bbox_match.start()]

                            ts_match = re.match(
                                r'^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?):(.*)$',
                                rest
                            )
                            if ts_match:
                                timestamp = ts_match.group(1)
                                filename = ts_match.group(2)
                            else:
                                second_colon = rest.find(':')
                                if second_colon >= 0:
                                    timestamp = rest[:second_colon]
                                    filename = rest[second_colon + 1:]
                                else:
                                    timestamp = rest
                                    filename = None

                    norm_x = None
                    norm_y = None
                    if bbox_info:
                        try:
                            bbox_parts = bbox_info.split(',')
                            if len(bbox_parts) >= 4:
                                cx = int(bbox_parts[0])
                                cy = int(bbox_parts[1])
                                fw = int(bbox_parts[2])
                                fh = int(bbox_parts[3])
                                if fw > 0 and fh > 0:
                                    norm_x = cx / fw
                                    norm_y = cy / fh
                        except (ValueError, ZeroDivisionError):
                            pass

                    image_path = None
                    if filename:
                        filename = str(filename).strip()
                        base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'suspicious_alerts'))
                        resolved = filename
                        if os.path.isabs(filename):
                            try:
                                relative_path = os.path.relpath(filename, base_dir)
                                if relative_path.startswith('..'):
                                    relative_path = os.path.basename(filename)
                            except Exception:
                                relative_path = os.path.basename(filename)
                        else:
                            normalized = str(filename).replace('\\', '/').lstrip('/')
                            if normalized.startswith('suspicious_alerts/'):
                                normalized = normalized.split('suspicious_alerts/', 1)[1]
                            relative_path = normalized

                        relative_parts = [part for part in relative_path.split('/') if part not in ('', '.', '..')]
                        safe_relative = '/'.join(relative_parts)
                        if safe_relative:
                            image_path = f"/api/alerts/{safe_relative}"
                        else:
                            image_path = f"/api/alerts/{os.path.basename(resolved)}"

                    print(f"[Monitor] Alert: {reason}")

                    exam_session_id = getattr(app, 'current_exam_session_id', None)
                    _BEHAVIOUR_ALERT_REASONS = {
                        'HEAD_LEFT', 'HEAD_RIGHT', 'HEAD_DOWN',
                        'HAND_GESTURE',
                    }
                    _is_behaviour = reason in _BEHAVIOUR_ALERT_REASONS
                    student_info = resolve_student_from_detection(
                        app, exam_session_id, norm_x, norm_y,
                        is_behaviour_alert=_is_behaviour
                    )
                    student_name = student_info['student_name'] if student_info else None
                    roll_number = student_info['roll_number'] if student_info else None
                    seat_number = student_info['seat_number'] if student_info else None

                    if student_info:
                        print(f"[Monitor] Detected student: {student_name} (Roll: {roll_number}, Seat: {seat_number})")

                    object_types = ['PHONE_DETECTED', 'WATCH_DETECTED', 'PAPER_PASSING']
                    head_turn_types = ['HEAD_LEFT', 'HEAD_RIGHT']
                    hand_gesture_types = ['HAND_GESTURE']
                    behaviour_escalated = False
                    escalation_count = 0
                    escalation_window = 0
                    escalation_label = ''

                    if reason in object_types:
                        warning_level = 2
                        send_email = True
                    else:
                        warning_level = 1
                        send_email = False

                    if reason in head_turn_types and student_info:
                        student_key = roll_number or seat_number or student_name
                        now_ts = time.time()

                        if student_key not in student_head_turn_tracker:
                            student_head_turn_tracker[student_key] = []
                        student_head_turn_tracker[student_key].append(now_ts)

                        cutoff = now_ts - HEAD_TURN_WINDOW_SECONDS
                        student_head_turn_tracker[student_key] = [
                            t for t in student_head_turn_tracker[student_key] if t >= cutoff
                        ]

                        head_turn_count = len(student_head_turn_tracker[student_key])

                        if head_turn_count >= HEAD_TURN_ESCALATION_THRESHOLD:
                            warning_level = 2
                            send_email = True
                            behaviour_escalated = True
                            escalation_count = head_turn_count
                            escalation_window = HEAD_TURN_WINDOW_SECONDS
                            escalation_label = 'head turns'
                            print(
                                f"[Monitor] Head-turn ESCALATED to Level 2 for "
                                f"{student_name} ({roll_number}) — "
                                f"{head_turn_count} turns in last {HEAD_TURN_WINDOW_SECONDS}s"
                            )

                    if reason in hand_gesture_types and student_info:
                        student_key = roll_number or seat_number or student_name
                        now_ts = time.time()

                        if student_key not in student_hand_gesture_tracker:
                            student_hand_gesture_tracker[student_key] = []
                        student_hand_gesture_tracker[student_key].append(now_ts)

                        cutoff = now_ts - HAND_GESTURE_WINDOW_SECONDS
                        student_hand_gesture_tracker[student_key] = [
                            t for t in student_hand_gesture_tracker[student_key] if t >= cutoff
                        ]

                        gesture_count = len(student_hand_gesture_tracker[student_key])

                        if gesture_count >= HAND_GESTURE_ESCALATION_THRESHOLD:
                            warning_level = 2
                            send_email = True
                            behaviour_escalated = True
                            escalation_count = gesture_count
                            escalation_window = HAND_GESTURE_WINDOW_SECONDS
                            escalation_label = 'hand gestures'
                            print(
                                f"[Monitor] Hand-gesture ESCALATED to Level 2 for "
                                f"{student_name} ({roll_number}) — "
                                f"{gesture_count} gestures in last {HAND_GESTURE_WINDOW_SECONDS}s"
                            )

                    description = f"Auto-detected: {reason}"
                    if student_info:
                        description = f"{reason} — {student_name} (Roll: {roll_number}, Seat: {seat_number})"
                    if behaviour_escalated:
                        description += f" [ESCALATED: {escalation_count} {escalation_label} in {escalation_window}s]"

                    # Save to DB
                    try:
                        incident_model = app.incident_model
                        incident_model.create_incident(
                            exam_session_id=exam_session_id,
                            incident_type=reason,
                            description=description,
                            image_url=image_path,
                            confidence_score=None,
                            student_name=student_name,
                            roll_number=roll_number,
                            seat_number=seat_number,
                        )
                        payload = {
                            'reason': reason,
                            'timestamp': timestamp,
                            'alert_time': datetime.now().isoformat(),
                            'filename': filename,
                            'category': get_alert_category(reason),
                            'severity': 'high' if behaviour_escalated else get_severity(reason),
                            'warning_level': warning_level,
                            'exam_session_id': exam_session_id,
                            'student_name': student_name,
                            'roll_number': roll_number,
                            'seat_number': seat_number,
                            'head_turn_escalated': behaviour_escalated,
                            'head_turn_count': escalation_count if behaviour_escalated else None,
                        }
                        socketio_instance.emit('log', line, namespace='/')
                        socketio_instance.emit('monitoring_alert', payload, namespace='/monitoring')
                        socketio_instance.emit('monitoring_alert', payload, namespace='/')
                        if send_email and email_alerts_enabled:
                            try:
                                threading.Thread(
                                    target=_send_alert_email_async,
                                    args=(
                                        app,
                                        exam_session_id,
                                        reason,
                                        timestamp,
                                        filename,
                                        student_name,
                                        roll_number,
                                        seat_number,
                                        behaviour_escalated,
                                        escalation_count,
                                        escalation_window or HEAD_TURN_WINDOW_SECONDS,
                                    ),
                                    daemon=True,
                                ).start()
                            except Exception as e:
                                print(f"[DEBUG] Error sending email for Level 2 warning: {e}")
                    except Exception as e:
                        print(f"Error emitting alert: {e}")

                else:
                    print(f"[Monitor] {line[:200]}")
                    try:
                        socketio_instance.emit('log', line, namespace='/')
                        socketio_instance.emit('monitoring_status', {'message': line}, namespace='/monitoring')
                    except Exception as e:
                        print(f"Error emitting status: {e}")

    except Exception as e:
        print(f"Error in monitor output: {e}")
        with app.app_context():
            try:
                socketio_instance.emit('monitoring_error', {'error': str(e)}, namespace='/monitoring')
            except Exception:
                pass
    finally:
        print("Monitor output reader ended")


@bp.route('/start', methods=['POST'])
@jwt_required()
def start_monitoring():
    global current_process, monitoring_active, SOCKET_STREAM_TARGET_FPS, SOCKET_EMIT_EVERY_N

    try:
        current_user_id = get_jwt_identity()
        from app import get_models
        models = get_models()
        user_model = models['user']
        session_model = models['exam_session']

        user = user_model.find_by_id(current_user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        if user.get('role') != 'teacher':
            return jsonify({'error': 'Access denied. Teacher privileges required.'}), 403

        data = request.get_json(silent=True) or {}
        session_id = data.get('session_id')
        camera_source = data.get('camera_source')
        if camera_source is not None:
            camera_source = str(camera_source).strip()
            if not camera_source:
                camera_source = None

        raw_camera_mode = data.get('camera_mode')
        if raw_camera_mode is None:
            raw_camera_mode = os.environ.get('MONITOR_CAMERA_MODE', 'external')
        camera_mode = str(raw_camera_mode or 'external').strip().lower() or 'external'
        camera_mode = ''.join(ch for ch in camera_mode if ch.isalnum() or ch in ('-', '_')) or 'external'
        if camera_mode not in {'external', 'laptop'}:
            return jsonify({'error': 'Invalid camera_mode. Use external or laptop.'}), 400

        default_external_source = os.environ.get(
            'EXTERNAL_MONITOR_CAMERA_SOURCE',
            os.environ.get('MONITOR_CAMERA_SOURCE', '0')
        )
        default_laptop_source = os.environ.get('LAPTOP_MONITOR_CAMERA_SOURCE', '0')

        if camera_mode == 'laptop':
            effective_camera_source = camera_source or default_laptop_source
            effective_camera_backend = os.environ.get('LAPTOP_MONITOR_CAMERA_BACKEND', 'auto')
        else:
            effective_camera_source = camera_source or default_external_source
            effective_camera_backend = os.environ.get(
                'EXTERNAL_MONITOR_CAMERA_BACKEND',
                os.environ.get('MONITOR_CAMERA_BACKEND', 'auto')
            )

        effective_camera_source = str(effective_camera_source).strip() or '0'
        effective_camera_backend = str(effective_camera_backend).strip().lower() or 'auto'

        if not session_id:
            return jsonify({'error': 'session_id is required'}), 400

        session = session_model.find_by_id(session_id)
        if not session:
            return jsonify({'error': 'Exam session not found'}), 404
        if session.get('teacher_id') != current_user_id:
            return jsonify({'error': 'Access denied. Session not assigned to you.'}), 403

        app = current_app._get_current_object()
        previous_session_id = getattr(app, 'current_exam_session_id', None)
        if previous_session_id and previous_session_id != session_id:
            session_model.update_session(previous_session_id, {'is_active': False})

        if monitoring_active and current_process and current_process.poll() is None:
            current_process.terminate()
            try:
                current_process.wait(timeout=2)
            except Exception:
                current_process.kill()
            current_process = None

        monitoring_active = True
        app.current_exam_session_id = session_id
        _seat_cache.pop(session_id, None)
        session_model.update_session(session_id, {'is_active': True})

        server_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        monitor_script = os.path.join(server_dir, 'monitor.py')
        if not os.path.exists(monitor_script):
            return jsonify({'error': f'monitor.py not found at {monitor_script}'}), 404

        session_name = session.get('name') or 'session'
        safe_session_name = ''.join(
            ch if ch.isalnum() or ch in ('-', '_') else '-'
            for ch in session_name
        ).strip('-') or 'session'
        session_folder = f"{safe_session_name}-{datetime.now().strftime('%Y-%m-%d')}"

        current_process = subprocess.Popen(
            [sys.executable, '-u', monitor_script],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True,
            bufsize=1,
            cwd=os.path.dirname(monitor_script),
            env={
                **os.environ,
                'PYTHONUNBUFFERED': '1',
                'EXAM_SESSION_FOLDER': session_folder,
                'MONITOR_CAMERA_SOURCE': effective_camera_source,
                'MONITOR_CAMERA_BACKEND': effective_camera_backend,
                'MONITOR_CAMERA_MODE': camera_mode,
            }
        )

        print(f"Monitor started PID={current_process.pid}")

        socketio_instance = current_app.extensions.get('socketio') or socketio

        reader = threading.Thread(
            target=process_monitor_output,
            args=(current_process, socketio_instance, app),
            daemon=True
        )
        reader.start()

        return jsonify({
            'success': True,
            'message': 'Monitoring started',
            'pid': current_process.pid,
            'session_id': session_id,
            'camera_source': effective_camera_source,
            'camera_mode': camera_mode,
        }), 200

    except Exception as e:
        monitoring_active = False
        print(f"Error starting monitoring: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/stop', methods=['POST'])
@jwt_required()
def stop_monitoring():
    global current_process, monitoring_active

    try:
        current_user_id = get_jwt_identity()
        app = current_app._get_current_object()
        from app import get_models
        models = get_models()
        user_model = models['user']
        session_model = models['exam_session']
        current_session_id = getattr(app, 'current_exam_session_id', None)
        data = request.get_json(silent=True) or {}
        requested_session_id = data.get('session_id')

        user = user_model.find_by_id(current_user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
        if user.get('role') != 'teacher':
            return jsonify({'error': 'Access denied. Teacher privileges required.'}), 403

        target_session_id = requested_session_id or current_session_id
        target_session = None
        if target_session_id:
            target_session = session_model.find_by_id(target_session_id)
            if not target_session:
                return jsonify({'error': 'Exam session not found'}), 404
            if target_session.get('teacher_id') != current_user_id:
                return jsonify({'error': 'Access denied. Session not assigned to you.'}), 403

        monitoring_active = False
        student_head_turn_tracker.clear()
        student_hand_gesture_tracker.clear()
        if current_process:
            current_process.terminate()
            try:
                current_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                current_process.kill()
            current_process = None

        if target_session_id:
            session_model.update_session(target_session_id, {'is_active': False})

        if current_session_id and (not target_session_id or target_session_id == current_session_id):
            app.current_exam_session_id = None

        return jsonify({'success': True, 'message': 'Monitoring stopped'}), 200
    except Exception as e:
        print(f"Error stopping monitoring: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/status', methods=['GET'])
def get_status():
    global monitoring_active, current_process
    is_running = monitoring_active and current_process and current_process.poll() is None
    return jsonify({
        'is_monitoring': is_running,
        'pid': current_process.pid if current_process else None
    }), 200


@bp.route('/test', methods=['GET'])
def test_endpoint():
    """Test endpoint"""
    return jsonify({'status': 'OK', 'message': 'Monitoring service is running'}), 200
