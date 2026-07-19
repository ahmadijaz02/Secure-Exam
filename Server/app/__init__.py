from flask import Flask, g
from flask_jwt_extended import JWTManager
from flask_bcrypt import Bcrypt
from flask_cors import CORS
from flask_socketio import SocketIO
from pymongo import MongoClient
from config import config

jwt = JWTManager()
bcrypt = Bcrypt()
socketio = SocketIO(
    app=None,
    cors_allowed_origins="*",
    max_http_buffer_size=10_000_000,
    async_mode="threading",
    logger=False,
    engineio_logger=False,
)

def create_app(config_name='default'):
    app = Flask(__name__)
    app.config.from_object(config[config_name])

    jwt.init_app(app)
    bcrypt.init_app(app)
    socketio.init_app(app)
    
    # CORS Configuration - Allow frontend domains
    allowed_origins = [
        'https://secure-exam-ruddy.vercel.app',  # Vercel production
        app.config['FRONTEND_URL'],  # From env variable
        'http://127.0.0.1:5173',
        'http://localhost:5173',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:3001',
        'http://127.0.0.1:3001'
    ]
    
    CORS(app, 
         origins=allowed_origins,
         supports_credentials=True,
         allow_headers=['Content-Type', 'Authorization'],
         methods=['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
    )
    
    print(f"✅ CORS enabled for: {allowed_origins}")

    # Initialize MongoDB connection
    if not app.config['MONGODB_URI']:
        raise RuntimeError("MONGODB_URI is not set. Provide your MongoDB Atlas connection string in the environment or .env.")

    print(f"🔗 Connecting to MongoDB...")
    print(f"   Database: {app.config['MONGODB_DB_NAME']}")

    app.mongo_client = MongoClient(app.config['MONGODB_URI'])
    app.db = app.mongo_client[app.config['MONGODB_DB_NAME']]

    try:
        app.mongo_client.admin.command('ping')
        server_info = app.mongo_client.server_info()
        db_stats = app.db.command('dbstats')

        print("✅ MongoDB connection successful!")
        print(f"   Server Version: {server_info.get('version', 'Unknown')}")
        print(f"   Database Size: {db_stats.get('dataSize', 0)} bytes")
        print(f"   Collections: {len(app.db.list_collection_names())}")

        collections = app.db.list_collection_names()
        if collections:
            print(f"   Existing Collections: {', '.join(collections)}")
        else:
            print("   No existing collections (will be created on first use)")

    except Exception as e:
        print(f"❌ MongoDB connection failed: {e}")
        print("   Make sure MongoDB is running on localhost:27017")

    from app.auth import bp as auth_bp
    app.register_blueprint(auth_bp, url_prefix='/api/auth')

    from app.main import bp as main_bp
    app.register_blueprint(main_bp, url_prefix='/api')

    from app.admin import bp as admin_bp
    app.register_blueprint(admin_bp, url_prefix='/api/admin')
    
    from app.monitoring import bp as monitoring_bp
    app.register_blueprint(monitoring_bp, url_prefix='/api/monitoring')

    print("📊 Initializing MongoDB models...")
    from app.models import User, ExamSession, Incident, SeatingPlan

    app.user_model = User(app.db)
    print("   ✓ User model initialized")

    app.exam_session_model = ExamSession(app.db)
    print("   ✓ ExamSession model initialized")

    app.incident_model = Incident(app.db)
    print("   ✓ Incident model initialized")
    
    app.seating_plan_model = SeatingPlan(app.db)
    print("   ✓ SeatingPlan model initialized")

    print("🎯 All models ready for use!")

    return app

def get_db():
    """Get database instance from current app"""
    from flask import current_app
    return current_app.db

def get_models():
    """Get model instances from current app"""
    from flask import current_app
    return {
        'user': current_app.user_model,
        'exam_session': current_app.exam_session_model,
        'incident': current_app.incident_model,
        'seating_plan': current_app.seating_plan_model
    }
