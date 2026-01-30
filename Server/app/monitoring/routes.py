from flask import request, jsonify, current_app
from app.monitoring import bp
from app import socketio
import subprocess
import threading
import os
from datetime import datetime
import sys

# Global state
current_process = None
monitoring_active = False


@socketio.on('connect', namespace='/')
def handle_default_connect():
    """When frontend connects to default namespace, send a log so they see connection works."""
    try:
        print("Client connected to default namespace (monitoring)")
        socketio.emit('log', 'Connected to monitoring server', namespace='/')
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


def get_severity(reason):
    """Get alert severity level"""
    high_severity = ['PHONE_DETECTED', 'PAPER_PASSING']
    medium_severity = ['WATCH_DETECTED', 'HAND_MOUTH']

    if reason in high_severity:
        return 'high'
    elif reason in medium_severity:
        return 'medium'
    else:
        return 'low'


def process_monitor_output(process, socketio_instance, app):
    """
    Read monitor.py stdout line-by-line and emit via Socket.IO.
    Runs inside Flask app context so emits reach all clients in /monitoring namespace.
    """
    global monitoring_active
    frame_count = 0
    try:
        while monitoring_active and process.poll() is None:
            line = process.stdout.readline()
            if not line:
                break

            line = line.strip()
            if not line:
                continue

            # Emit same as FYP: default namespace, "frame" (raw base64) and "log" (string)
            if line.startswith('FRAME:'):
                frame_data = line[6:]
                if not frame_data or len(frame_data) < 100:
                    continue
                frame_count += 1
                if frame_count % 10 == 0:
                    print(f"[Monitor] Emitted frame #{frame_count}")

                with app.app_context():
                    try:
                        # FYP style: emit raw base64 to default namespace as "frame"
                        socketio_instance.emit('frame', frame_data, namespace='/')
                        # Also emit to /monitoring for backward compatibility
                        socketio_instance.emit('video_frame', {'frame': f'data:image/jpeg;base64,{frame_data}'}, namespace='/monitoring')
                    except Exception as e:
                        print(f"Error emitting frame: {e}")

            elif line.startswith('ALERT:'):
                parts = line.split(':', 3)
                if len(parts) >= 2:
                    reason = parts[1]
                    timestamp = parts[2] if len(parts) > 2 else ""
                    filename = parts[3] if len(parts) > 3 else None
                    print(f"[Monitor] Alert: {reason}")
                    with app.app_context():
                        try:
                            socketio_instance.emit('log', line, namespace='/')
                            socketio_instance.emit('monitoring_alert', {
                                'reason': reason,
                                'timestamp': timestamp,
                                'alert_time': datetime.now().isoformat(),
                                'filename': filename,
                                'severity': get_severity(reason)
                            }, namespace='/monitoring')
                        except Exception as e:
                            print(f"Error emitting alert: {e}")

            else:
                # Status/log line - emit as "log" to default namespace (FYP style)
                print(f"[Monitor] {line[:200]}")
                with app.app_context():
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
def start_monitoring():
    """Start monitoring camera - launch monitor.py and stream frames via Socket.IO"""
    global current_process, monitoring_active

    try:
        if monitoring_active and current_process and current_process.poll() is None:
            current_process.terminate()
            try:
                current_process.wait(timeout=2)
            except Exception:
                current_process.kill()
            current_process = None

        monitoring_active = True

        server_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        monitor_script = os.path.join(server_dir, 'monitor.py')
        if not os.path.exists(monitor_script):
            return jsonify({'error': f'monitor.py not found at {monitor_script}'}), 404

        current_process = subprocess.Popen(
            [sys.executable, '-u', monitor_script],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True,
            bufsize=1,
            cwd=os.path.dirname(monitor_script),
            env={**os.environ, 'PYTHONUNBUFFERED': '1'}
        )

        print(f"Monitor started PID={current_process.pid}")

        app = current_app._get_current_object()
        socketio_instance = current_app.extensions.get('socketio') or socketio

        # Use a real thread for subprocess readline (avoids eventlet blocking on pipe I/O)
        reader = threading.Thread(
            target=process_monitor_output,
            args=(current_process, socketio_instance, app),
            daemon=True
        )
        reader.start()

        return jsonify({
            'success': True,
            'message': 'Monitoring started',
            'pid': current_process.pid
        }), 200

    except Exception as e:
        monitoring_active = False
        print(f"Error starting monitoring: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/stop', methods=['POST'])
def stop_monitoring():
    """Stop monitoring camera"""
    global current_process, monitoring_active

    try:
        monitoring_active = False
        if current_process:
            current_process.terminate()
            try:
                current_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                current_process.kill()
            current_process = None
        return jsonify({'success': True, 'message': 'Monitoring stopped'}), 200
    except Exception as e:
        print(f"Error stopping monitoring: {e}")
        return jsonify({'error': str(e)}), 500


@bp.route('/status', methods=['GET'])
def get_status():
    """Get monitoring status"""
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
