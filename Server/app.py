import os
from app import create_app

app = create_app(os.getenv('FLASK_CONFIG') or 'default')

@app.shell_context_processor
def make_shell_context():
    return {
        'db': app.db,
        'user_model': app.user_model,
        'exam_session_model': app.exam_session_model,
        'incident_model': app.incident_model
    }

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
