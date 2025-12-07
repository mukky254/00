# IN Attendance System - Backend

A complete attendance management system with QR code scanning functionality.

## Features

- ✅ User authentication (Student, Lecturer, Admin)
- ✅ Real QR code generation with expiration
- ✅ Real QR code scanning using camera
- ✅ Attendance tracking and reporting
- ✅ Role-based dashboard
- ✅ MongoDB database integration
- ✅ RESTful API

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user

### Student
- `GET /api/students/:id/dashboard` - Student dashboard
- `GET /api/students/:id/attendance` - Student attendance
- `PUT /api/students/:id` - Update profile

### Lecturer
- `POST /api/lecturers/generate-qr` - Generate QR code
- `GET /api/lecturers/:id/dashboard` - Lecturer dashboard
- `GET /api/lecturers/:id/qr-codes` - Get QR codes
- `GET /api/lecturers/qr-codes/:id/attendance` - Get attendance

### Admin
- `GET /api/admin/dashboard` - Admin dashboard
- `GET /api/admin/students` - Get all students
- `GET /api/admin/students/:id/analytics` - Student analytics
- `POST /api/admin/users` - Create user
- `DELETE /api/admin/users/:id` - Delete user

### Attendance
- `POST /api/attendance/scan` - Scan QR code

### Courses
- `POST /api/courses` - Create course
- `GET /api/courses` - Get courses

### Health
- `GET /api/health` - Health check

## Database Schema

- **users** - All system users
- **qrcodes** - Generated QR codes
- **attendances** - Attendance records
- **courses** - Course information

## Deployment on Render

### Automatic Deployment (Using Blueprint)
1. Push this code to GitHub
2. Go to Render Dashboard → New Blueprint Instance
3. Connect your GitHub repository
4. Render will automatically detect `render.yaml` and deploy

### Manual Deployment
1. Create new Web Service on Render
2. Connect GitHub repository
3. Configure:
   - **Name**: in-attendance-backend
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Port**: 3000

### Environment Variables
Set these in Render dashboard:
- `MONGODB_URI`: Your MongoDB connection string
- `JWT_SECRET`: Your JWT secret key
- `PORT`: 3000

## Local Development

1. Clone repository:
```bash
git clone <repository-url>
cd attendance-system-backend
