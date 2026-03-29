# Secure Exam

A comprehensive exam monitoring system with AI-powered cheating detection, real-time alerts, and secure teacher dashboard.

## 🏗️ Project Structure

```
Exam/
├── Client/          # React frontend with TypeScript
├── Server/          # Python Flask backend
└── README.md        # This file
```

## 🚀 Features

- **Authentication System**: Login/Signup for teachers and admins
- **Real-time Monitoring**: AI-powered student behavior detection
- **Alert System**: Email notifications for suspicious activities
- **Dashboard**: Teacher interface for managing exam sessions
- **Image Storage**: Cloud-based storage for incident screenshots

## 🛠️ Technology Stack

### Frontend (Client)
- **React Router v7** - Modern React framework with routing
- **TypeScript** - Type-safe JavaScript
- **Tailwind CSS** - Utility-first CSS framework
- **Vite** - Fast build tool

### Backend (Server)
- **Flask** - Python web framework
- **MongoDB** - NoSQL database with PyMongo
- **JWT** - Authentication tokens
- **OpenCV** - Computer vision for monitoring
- **MediaPipe** - AI pose detection
- **Cloudinary** - Image storage

## 📋 Prerequisites

- **Node.js** (v18 or higher)
- **Python** (v3.8 or higher)
- **pip** (Python package manager)
- **MongoDB** (v4.4 or higher)

## 🔧 Installation & Setup

### 1. Clone the Repository
```bash
git clone <repository-url>
cd Exam
```

### 2. Setup Backend (Server)

```bash
cd Server

# Install Python dependencies
pip install -r requirements.txt

# Copy environment file and configure
cp .env.example .env
# Edit .env file with your MongoDB configuration

# Make sure MongoDB is running
# On Windows: Start MongoDB service
# On macOS: brew services start mongodb-community
# On Linux: sudo systemctl start mongod

# Test the setup
python test_server.py

# Start the server
python app.py
# or (from Server/ with Node installed)
npm run dev
```

### 3. Setup Frontend (Client)

```bash
cd Client

# Install dependencies
npm install

# Start development server
npm run dev
```

## 🏃‍♂️ Running the Application

### Start Backend Server
```bash
cd Server
python app.py
# or (with Node installed)
npm run dev
```
The server will run on `http://localhost:5000`

### Start Frontend Client
```bash
cd Client
npm run dev
```
The client will run on `http://localhost:5173`

## 📱 Usage

1. **Access the Application**: Open `http://localhost:5173` in your browser
2. **Create Account**: Sign up as a teacher or admin
3. **Login**: Use your credentials to access the dashboard
4. **Dashboard**: View exam sessions, incidents, and system statistics

## 🔐 Authentication

The system supports two user roles:
- **Teacher**: Can create and monitor exam sessions (can signup through frontend)
- **Admin**: Full system access and user management (created through seeding script)

### User Role Management

**Teachers**:
- Can register through the frontend signup form
- Only "teacher" role is available for public registration
- Can login and access their dashboard

**Admins**:
- Cannot signup through the frontend
- Must be created using the admin seeding script
- Can create other admin users through API endpoints
- Have access to all system features

### API Endpoints

#### Authentication
- `POST /api/auth/signup` - Teacher registration (teachers only)
- `POST /api/auth/login` - User login (teachers and admins)
- `POST /api/auth/refresh` - Refresh access token
- `GET /api/auth/me` - Get current user info
- `POST /api/auth/logout` - User logout

#### Main
- `GET /api/health` - Health check
- `GET /api/dashboard` - Dashboard data

#### Admin (Admin only)
- `POST /api/admin/create-admin` - Create new admin user
- `GET /api/admin/users` - List all users

## 🗄️ Database Schema (MongoDB)

### Users Collection
- `_id` - MongoDB ObjectId (primary key)
- `name` - Full name
- `email` - Email address (unique index)
- `password_hash` - Hashed password
- `role` - User role (teacher/admin)
- `is_active` - Account status
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

### Exam Sessions Collection
- `_id` - MongoDB ObjectId (primary key)
- `name` - Session name
- `description` - Session description
- `teacher_id` - Reference to user ID
- `start_time` - Session start time
- `end_time` - Session end time
- `is_active` - Session status
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

### Incidents Collection
- `_id` - MongoDB ObjectId (primary key)
- `exam_session_id` - Reference to exam session ID
- `incident_type` - Type of incident
- `description` - Incident description
- `image_url` - Screenshot URL
- `confidence_score` - AI confidence level
- `is_reviewed` - Review status
- `reviewer_notes` - Review notes
- `created_at` - Creation timestamp

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the Server directory:

```env
# Flask Configuration
SECRET_KEY=your-secret-key-here
JWT_SECRET_KEY=your-jwt-secret-key-here

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/exam_monitoring
MONGODB_DB_NAME=exam_monitoring

# Email (Optional)
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=your-app-password

# Cloudinary (Optional)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Camera Feed (Optional)
# Local webcam index (default):
# MONITOR_CAMERA_SOURCE=0
#
# Hikvision RTSP example:
# rtsp://<username>:<password>@<camera-ip>:554/Streaming/Channels/101
# 101 = main stream, 102 = sub stream
# URL-encode special characters in password (e.g. @ -> %40)
MONITOR_CAMERA_SOURCE=0
MONITOR_RTSP_TRANSPORT=tcp
```

### Hikvision Feed Setup

1. Ensure your camera and server machine are on the same network.
2. Enable RTSP in Hikvision camera settings and confirm the port (usually `554`).
3. In `Server/.env`, set `MONITOR_CAMERA_SOURCE` to your camera RTSP URL.
4. Restart the backend server, then start monitoring from the teacher dashboard.

Example:

```env
MONITOR_CAMERA_SOURCE=rtsp://admin:MyPass123@192.168.1.64:554/Streaming/Channels/101
MONITOR_RTSP_TRANSPORT=tcp
```

## 🧪 Testing

### Test MongoDB Integration
```bash
cd Server
python test_server.py
```

This will test:
- Module imports
- MongoDB connection
- App creation with MongoDB models

### Create Admin User
```bash
cd Server

# Create default admin (admin@exammonitoring.com / admin123)
python seed_admin.py --default

# Or create custom admin (interactive)
python seed_admin.py
```

### Test Client Build
```bash
cd Client
npm run build
```

## 🚀 Deployment

### Production Build

#### Frontend
```bash
cd Client
npm run build
```

#### Backend
```bash
cd Server
# Set environment variables for production
export FLASK_ENV=production
python app.py
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Contact the development team

## 🔮 Future Enhancements

- Real-time video streaming
- Advanced AI detection models
- Mobile app support
- Integration with LMS systems
- Advanced analytics and reporting
