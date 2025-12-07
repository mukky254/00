// server.js - Complete Backend API for IN Attendance System
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();

// Middleware
app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:5500', 'https://in-attendance-system.onrender.com', '*'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://attendance_admin:muhidinaliko2006@cluster0.bneqb6q.mongodb.net/attendance?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB Connected Successfully'))
.catch(err => {
    console.error('❌ MongoDB Connection Error:', err);
    process.exit(1);
});

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'attendance_system_secret_key_2024_@muhidinaliko';

// Models
const userSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['student', 'lecturer', 'admin'], required: true },
    course: { type: String, default: '' },
    year: { type: Number, default: 1 },
    department: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const qrCodeSchema = new mongoose.Schema({
    qrCodeId: { type: String, required: true, unique: true },
    unitName: { type: String, required: true },
    unitCode: { type: String, required: true },
    classType: { type: String, enum: ['lecture', 'tutorial', 'lab', 'seminar'], default: 'lecture' },
    topic: { type: String, default: '' },
    lecturerId: { type: String, required: true },
    lecturerName: { type: String, required: true },
    duration: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    qrData: { type: String, required: true }
});

const attendanceSchema = new mongoose.Schema({
    studentId: { type: String, required: true },
    studentName: { type: String, required: true },
    qrCodeId: { type: String, required: true },
    unitName: { type: String, required: true },
    unitCode: { type: String, required: true },
    lecturerId: { type: String, required: true },
    lecturerName: { type: String, required: true },
    scanTime: { type: Date, default: Date.now },
    date: { type: String, required: true },
    time: { type: String, required: true },
    status: { type: String, enum: ['present', 'absent', 'late'], default: 'present' }
});

const courseSchema = new mongoose.Schema({
    courseCode: { type: String, required: true, unique: true },
    courseName: { type: String, required: true },
    lecturerId: { type: String, required: true },
    lecturerName: { type: String, required: true },
    semester: { type: String, required: true },
    year: { type: Number, required: true },
    students: [{ type: String }],
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const QRCodeModel = mongoose.model('QRCode', qrCodeSchema);
const Attendance = mongoose.model('Attendance', attendanceSchema);
const Course = mongoose.model('Course', courseSchema);

// Authentication Middleware
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.header('Authorization');
        if (!authHeader) {
            return res.status(401).json({ 
                success: false, 
                message: 'No authorization token provided' 
            });
        }

        const token = authHeader.replace('Bearer ', '');
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findOne({ id: decoded.id });

        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        req.user = user;
        req.token = token;
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(401).json({ 
            success: false, 
            message: 'Please authenticate. Invalid token.' 
        });
    }
};

// Role-based Authorization Middleware
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ 
                success: false, 
                message: 'You do not have permission to perform this action' 
            });
        }
        next();
    };
};

// Utility Functions
const generateQRCodeId = () => {
    return 'QR_' + crypto.randomBytes(8).toString('hex').toUpperCase();
};

const formatDate = (date) => {
    const d = new Date(date);
    return d.toISOString().split('T')[0];
};

const formatTime = (date) => {
    const d = new Date(date);
    return d.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
    });
};

// ==================== AUTHENTICATION ROUTES ====================

// Root endpoint
app.get('/', (req, res) => {
    res.json({ 
        message: 'IN Attendance System Backend API',
        status: 'running',
        version: '1.0.0',
        endpoints: {
            auth: '/api/auth',
            student: '/api/students',
            lecturer: '/api/lecturers',
            admin: '/api/admin',
            attendance: '/api/attendance',
            courses: '/api/courses'
        },
        timestamp: new Date().toISOString()
    });
});

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true,
        status: 'OK', 
        timestamp: new Date().toISOString(),
        database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
        message: 'Attendance System API is running'
    });
});

// Test route
app.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'Server is working!',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Register User
app.post('/api/auth/register', async (req, res) => {
    try {
        const { role, name, id, email, phone, password, course, year, department } = req.body;

        console.log('Registration attempt:', { role, name, id, email });

        // Validation
        if (!role || !name || !id || !email || !phone || !password) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        // Check if user exists
        const existingUser = await User.findOne({ 
            $or: [{ id }, { email }] 
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User with this ID or email already exists'
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const user = new User({
            id,
            name,
            email,
            phone,
            password: hashedPassword,
            role,
            course: role === 'student' ? (course || '') : '',
            year: role === 'student' ? (year || 1) : 1,
            department: role === 'lecturer' ? (department || '') : ''
        });

        await user.save();

        // Generate token
        const token = jwt.sign({ 
            id: user.id, 
            role: user.role 
        }, JWT_SECRET, { expiresIn: '7d' });

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                course: user.course,
                year: user.year,
                department: user.department
            },
            token
        });

    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during registration: ' + error.message
        });
    }
});

// Login User
app.post('/api/auth/login', async (req, res) => {
    try {
        const { id, password, role } = req.body;

        console.log('Login attempt:', { id, role });

        // Validation
        if (!id || !password || !role) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        // Find user
        const user = await User.findOne({ id, role });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Generate token
        const token = jwt.sign({ 
            id: user.id, 
            role: user.role 
        }, JWT_SECRET, { expiresIn: '7d' });

        res.json({
            success: true,
            message: 'Login successful',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                course: user.course,
                year: user.year,
                department: user.department
            },
            token
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during login: ' + error.message
        });
    }
});

// Update Profile
app.put('/api/auth/update-profile', authenticate, async (req, res) => {
    try {
        const { name, email, phone, course, department } = req.body;
        
        // Update user
        const user = await User.findOne({ id: req.user.id });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Update fields
        if (name) user.name = name;
        if (email) {
            // Check if email already exists for another user
            const existingEmail = await User.findOne({ 
                email, 
                _id: { $ne: user._id } 
            });
            if (existingEmail) {
                return res.status(400).json({
                    success: false,
                    message: 'Email already in use'
                });
            }
            user.email = email;
        }
        if (phone) user.phone = phone;
        
        if (user.role === 'student' && course !== undefined) {
            user.course = course;
        }
        
        if (user.role === 'lecturer' && department !== undefined) {
            user.department = department;
        }

        user.updatedAt = new Date();
        await user.save();

        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                course: user.course,
                department: user.department
            }
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating profile: ' + error.message
        });
    }
});

// Change Password
app.post('/api/auth/change-password', authenticate, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Current and new password are required'
            });
        }

        // Find user
        const user = await User.findOne({ id: req.user.id });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Verify current password
        const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Hash new password
        user.password = await bcrypt.hash(newPassword, 10);
        user.updatedAt = new Date();
        await user.save();

        res.json({
            success: true,
            message: 'Password changed successfully'
        });

    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            success: false,
            message: 'Error changing password: ' + error.message
        });
    }
});

// ==================== STUDENT ROUTES ====================

// Get Student Dashboard
app.get('/api/students/:id/dashboard', authenticate, async (req, res) => {
    try {
        const studentId = req.params.id;

        // Verify student can only access their own dashboard
        if (req.user.role === 'student' && req.user.id !== studentId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        // Get attendance records for this student
        const attendance = await Attendance.find({ studentId });
        
        // Get all QR codes that have expired (as total possible classes)
        const today = new Date();
        const totalQR = await QRCodeModel.countDocuments({ 
            expiresAt: { $lt: today } // Only count expired QR codes (past classes)
        });
        
        const attendedClasses = attendance.length;
        const attendancePercentage = totalQR > 0 ? Math.round((attendedClasses / totalQR) * 100) : 0;
        const missedClasses = Math.max(0, totalQR - attendedClasses);

        // Get recent attendance (last 10)
        const recentAttendance = attendance
            .sort((a, b) => new Date(b.scanTime) - new Date(a.scanTime))
            .slice(0, 10)
            .map(record => ({
                id: record._id,
                date: record.date,
                time: record.time,
                unitName: record.unitName,
                unitCode: record.unitCode,
                status: record.status
            }));

        // Get today's classes from QR codes
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const todaysQR = await QRCodeModel.find({
            createdAt: { $gte: todayStart, $lte: todayEnd },
            isActive: true
        });

        const todaysClasses = todaysQR.map(qr => ({
            name: qr.unitName,
            code: qr.unitCode,
            time: formatTime(qr.createdAt),
            period: `${qr.duration} min`,
            room: 'Main Hall',
            status: new Date() > qr.expiresAt ? 'completed' : 'upcoming'
        }));

        res.json({
            success: true,
            data: {
                totalClasses: totalQR,
                attendedClasses,
                missedClasses,
                attendancePercentage,
                recentAttendance,
                todaysClasses
            }
        });

    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading dashboard: ' + error.message
        });
    }
});

// Get Student Attendance History
app.get('/api/students/:id/attendance', authenticate, async (req, res) => {
    try {
        const studentId = req.params.id;
        
        // Verify access
        if (req.user.role === 'student' && req.user.id !== studentId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        const attendance = await Attendance.find({ studentId })
            .sort({ scanTime: -1 })
            .lean();

        const formattedAttendance = attendance.map(record => ({
            id: record._id,
            date: record.date,
            time: record.time,
            unitName: record.unitName,
            unitCode: record.unitCode,
            lecturerName: record.lecturerName,
            status: record.status
        }));

        res.json({
            success: true,
            attendance: formattedAttendance
        });

    } catch (error) {
        console.error('Attendance error:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading attendance: ' + error.message
        });
    }
});

// Update Student Profile (for student role)
app.put('/api/students/:id', authenticate, authorize('student'), async (req, res) => {
    try {
        const studentId = req.params.id;
        if (req.user.id !== studentId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        const { name, email, phone, course, year } = req.body;

        // Update student
        const student = await User.findOne({ id: studentId, role: 'student' });
        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }

        // Update fields
        if (name) student.name = name;
        if (email) {
            const existingEmail = await User.findOne({ 
                email, 
                _id: { $ne: student._id } 
            });
            if (existingEmail) {
                return res.status(400).json({
                    success: false,
                    message: 'Email already in use'
                });
            }
            student.email = email;
        }
        if (phone) student.phone = phone;
        if (course) student.course = course;
        if (year) student.year = year;
        student.updatedAt = new Date();

        await student.save();

        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: {
                id: student.id,
                name: student.name,
                email: student.email,
                phone: student.phone,
                course: student.course,
                year: student.year,
                role: student.role
            }
        });

    } catch (error) {
        console.error('Update student error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating profile: ' + error.message
        });
    }
});

// ==================== ATTENDANCE ROUTES ====================

// Scan QR Code and Record Attendance
app.post('/api/attendance/scan', authenticate, authorize('student'), async (req, res) => {
    try {
        const { qrCode, scanTime } = req.body;
        const studentId = req.user.id;

        console.log('Scan attempt by student:', studentId);

        // Parse QR code
        let qrData;
        try {
            qrData = typeof qrCode === 'string' ? JSON.parse(qrCode) : qrCode;
        } catch (error) {
            return res.status(400).json({
                success: false,
                message: 'Invalid QR code format'
            });
        }

        // Validate QR code
        if (!qrData.qrCodeId || !qrData.unitCode) {
            return res.status(400).json({
                success: false,
                message: 'Invalid QR code data'
            });
        }

        // Check QR code in database
        const qrCodeRecord = await QRCodeModel.findOne({ 
            qrCodeId: qrData.qrCodeId 
        });

        if (!qrCodeRecord) {
            return res.status(404).json({
                success: false,
                message: 'QR code not found in database'
            });
        }

        // Check if expired
        if (new Date() > new Date(qrCodeRecord.expiresAt)) {
            qrCodeRecord.isActive = false;
            await qrCodeRecord.save();
            return res.status(400).json({
                success: false,
                message: 'QR code has expired'
            });
        }

        // Check if already scanned
        const existingAttendance = await Attendance.findOne({
            studentId,
            qrCodeId: qrData.qrCodeId
        });

        if (existingAttendance) {
            return res.status(400).json({
                success: false,
                message: 'Attendance already recorded for this class'
            });
        }

        // Get student info
        const student = await User.findOne({ id: studentId });
        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }

        // Determine status (late if scanned after 15 minutes of creation)
        const scanDate = new Date(scanTime || Date.now());
        const qrCreationTime = new Date(qrCodeRecord.createdAt);
        const timeDiff = (scanDate - qrCreationTime) / (1000 * 60); // minutes
        const status = timeDiff > 15 ? 'late' : 'present';

        // Create attendance record
        const attendance = new Attendance({
            studentId,
            studentName: student.name,
            qrCodeId: qrData.qrCodeId,
            unitName: qrData.unitName || qrCodeRecord.unitName,
            unitCode: qrData.unitCode || qrCodeRecord.unitCode,
            lecturerId: qrData.lecturerId || qrCodeRecord.lecturerId,
            lecturerName: qrData.lecturerName || qrCodeRecord.lecturerName,
            scanTime: scanDate,
            date: formatDate(scanDate),
            time: formatTime(scanDate),
            status: status
        });

        await attendance.save();

        console.log('Attendance recorded successfully:', attendance);

        res.json({
            success: true,
            message: 'Attendance recorded successfully',
            attendance: {
                id: attendance._id,
                date: attendance.date,
                time: attendance.time,
                unitName: attendance.unitName,
                unitCode: attendance.unitCode,
                lecturerName: attendance.lecturerName,
                status: attendance.status
            }
        });

    } catch (error) {
        console.error('Scan error:', error);
        res.status(500).json({
            success: false,
            message: 'Error recording attendance: ' + error.message
        });
    }
});

// ==================== LECTURER ROUTES ====================

// Generate QR Code
app.post('/api/lecturers/generate-qr', authenticate, authorize('lecturer', 'admin'), async (req, res) => {
    try {
        const { unitName, unitCode, duration, classType, topic } = req.body;

        console.log('QR generation request by:', req.user.id);

        // Validation
        if (!unitName || !unitCode || !duration) {
            return res.status(400).json({
                success: false,
                message: 'Unit name, unit code, and duration are required'
            });
        }

        if (duration < 1 || duration > 120) {
            return res.status(400).json({
                success: false,
                message: 'Duration must be between 1 and 120 minutes'
            });
        }

        // Generate QR code ID
        const qrCodeId = generateQRCodeId();
        
        // Calculate expiry
        const createdAt = new Date();
        const expiresAt = new Date(createdAt.getTime() + duration * 60000);

        // Create QR data
        const qrData = {
            qrCodeId,
            unitName,
            unitCode,
            classType: classType || 'lecture',
            topic: topic || '',
            lecturerId: req.user.id,
            lecturerName: req.user.name,
            createdAt: createdAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
            duration
        };

        // Save to database
        const qrCodeRecord = new QRCodeModel({
            qrCodeId,
            unitName,
            unitCode,
            classType: classType || 'lecture',
            topic: topic || '',
            lecturerId: req.user.id,
            lecturerName: req.user.name,
            duration,
            createdAt,
            expiresAt,
            isActive: true,
            qrData: JSON.stringify(qrData)
        });

        await qrCodeRecord.save();

        console.log('QR code generated successfully:', qrCodeId);

        res.json({
            success: true,
            message: 'QR code generated successfully',
            qrCode: qrData
        });

    } catch (error) {
        console.error('Generate QR error:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating QR code: ' + error.message
        });
    }
});

// Get Lecturer Dashboard
app.get('/api/lecturers/:id/dashboard', authenticate, async (req, res) => {
    try {
        const lecturerId = req.params.id;

        // Verify lecturer can only access their own dashboard
        if (req.user.role === 'lecturer' && req.user.id !== lecturerId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        // Get lecturer's QR codes
        const qrCodes = await QRCodeModel.find({ lecturerId });
        const totalClasses = qrCodes.length;
        
        // Get active QR codes
        const activeQRCodes = qrCodes.filter(qr => 
            qr.isActive && new Date(qr.expiresAt) > new Date()
        ).length;

        // Calculate attendance statistics
        let totalAttendance = 0;
        const qrCodesWithAttendance = [];

        for (const qr of qrCodes) {
            const attendanceCount = await Attendance.countDocuments({ 
                qrCodeId: qr.qrCodeId 
            });
            totalAttendance += attendanceCount;
            
            qrCodesWithAttendance.push({
                id: qr.qrCodeId,
                unitName: qr.unitName,
                unitCode: qr.unitCode,
                createdAt: qr.createdAt,
                expiresAt: qr.expiresAt,
                attendanceCount
            });
        }

        // Estimate number of students (average 25 per class)
        const estimatedStudents = totalClasses * 25;
        const avgAttendance = estimatedStudents > 0 
            ? Math.round((totalAttendance / estimatedStudents) * 100) 
            : 0;

        // Get recent QR codes (last 5)
        const recentQRCodes = qrCodesWithAttendance
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 5);

        // Get today's classes
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const todaysClasses = await QRCodeModel.find({
            lecturerId: lecturerId,
            createdAt: { $gte: todayStart, $lte: todayEnd }
        }).sort({ createdAt: 1 });

        res.json({
            success: true,
            data: {
                totalClasses,
                totalStudents: estimatedStudents,
                avgAttendance,
                activeQRCodes,
                recentQRCodes,
                todaysClasses: todaysClasses.map(cls => ({
                    name: cls.unitName,
                    code: cls.unitCode,
                    time: formatTime(cls.createdAt),
                    duration: cls.duration,
                    status: new Date() > cls.expiresAt ? 'completed' : 'active'
                }))
            }
        });

    } catch (error) {
        console.error('Lecturer dashboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading dashboard: ' + error.message
        });
    }
});

// Get Lecturer's QR Codes
app.get('/api/lecturers/:id/qr-codes', authenticate, async (req, res) => {
    try {
        const lecturerId = req.params.id;

        // Verify access
        if (req.user.role === 'lecturer' && req.user.id !== lecturerId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        const qrCodes = await QRCodeModel.find({ lecturerId })
            .sort({ createdAt: -1 })
            .lean();

        // Add attendance count
        const qrCodesWithAttendance = await Promise.all(
            qrCodes.map(async (qr) => {
                const attendanceCount = await Attendance.countDocuments({ 
                    qrCodeId: qr.qrCodeId 
                });
                return {
                    ...qr,
                    attendanceCount
                };
            })
        );

        res.json({
            success: true,
            qrCodes: qrCodesWithAttendance
        });

    } catch (error) {
        console.error('Get QR codes error:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading QR codes: ' + error.message
        });
    }
});

// Get Attendance for Specific QR Code
app.get('/api/lecturers/qr-codes/:id/attendance', authenticate, authorize('lecturer', 'admin'), async (req, res) => {
    try {
        const qrCodeId = req.params.id;

        // Get QR code
        const qrCode = await QRCodeModel.findOne({ qrCodeId });
        if (!qrCode) {
            return res.status(404).json({
                success: false,
                message: 'QR code not found'
            });
        }

        // Verify lecturer owns this QR code (unless admin)
        if (req.user.role === 'lecturer' && qrCode.lecturerId !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        // Get attendance
        const attendance = await Attendance.find({ qrCodeId })
            .sort({ scanTime: 1 })
            .lean();

        res.json({
            success: true,
            qrCode: {
                unitName: qrCode.unitName,
                unitCode: qrCode.unitCode,
                createdAt: qrCode.createdAt,
                expiresAt: qrCode.expiresAt,
                classType: qrCode.classType,
                topic: qrCode.topic,
                duration: qrCode.duration,
                isActive: qrCode.isActive
            },
            attendance: attendance.map(record => ({
                studentId: record.studentId,
                studentName: record.studentName,
                scanTime: record.scanTime,
                date: record.date,
                time: record.time,
                status: record.status
            }))
        });

    } catch (error) {
        console.error('Get attendance error:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading attendance: ' + error.message
        });
    }
});

// Deactivate QR Code
app.post('/api/lecturers/qr-codes/:id/deactivate', authenticate, authorize('lecturer', 'admin'), async (req, res) => {
    try {
        const qrCodeId = req.params.id;

        // Find QR code
        const qrCode = await QRCodeModel.findOne({ qrCodeId });
        if (!qrCode) {
            return res.status(404).json({
                success: false,
                message: 'QR code not found'
            });
        }

        // Verify ownership (unless admin)
        if (req.user.role === 'lecturer' && qrCode.lecturerId !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }

        // Deactivate
        qrCode.isActive = false;
        await qrCode.save();

        res.json({
            success: true,
            message: 'QR code deactivated successfully'
        });

    } catch (error) {
        console.error('Deactivate QR error:', error);
        res.status(500).json({
            success: false,
            message: 'Error deactivating QR code: ' + error.message
        });
    }
});

// ==================== ADMIN ROUTES ====================

// Get Admin Dashboard
app.get('/api/admin/dashboard', authenticate, authorize('admin'), async (req, res) => {
    try {
        // Get statistics
        const totalStudents = await User.countDocuments({ role: 'student' });
        const totalLecturers = await User.countDocuments({ role: 'lecturer' });
        const totalCourses = await QRCodeModel.distinct('unitCode').countDocuments();
        
        // Calculate overall attendance percentage
        const totalAttendance = await Attendance.countDocuments();
        const totalQRCodes = await QRCodeModel.countDocuments();
        const totalPossibleAttendance = totalStudents * totalQRCodes;
        const overallAttendance = totalPossibleAttendance > 0 
            ? Math.round((totalAttendance / totalPossibleAttendance) * 100) 
            : 0;

        // Get today's records
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);
        const todayRecords = await Attendance.countDocuments({
            scanTime: { $gte: todayStart, $lte: todayEnd }
        });

        // Get week's records
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - 7);
        const weekRecords = await Attendance.countDocuments({
            scanTime: { $gte: weekStart, $lte: todayEnd }
        });

        // Get recent activity
        const recentAttendance = await Attendance.find()
            .sort({ scanTime: -1 })
            .limit(5)
            .lean();

        const recentQRCodes = await QRCodeModel.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .lean();

        const recentActivity = [
            ...recentAttendance.map(record => ({
                timestamp: formatTime(record.scanTime),
                userName: record.studentName,
                action: 'Scanned QR',
                details: `${record.unitName} (${record.unitCode})`
            })),
            ...recentQRCodes.map(qr => ({
                timestamp: formatTime(qr.createdAt),
                userName: qr.lecturerName,
                action: 'Generated QR',
                details: `${qr.unitName} - ${qr.duration}min`
            }))
        ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 10);

        res.json({
            success: true,
            data: {
                totalStudents,
                totalLecturers,
                totalCourses,
                overallAttendance,
                todayRecords,
                weekRecords,
                monthRecords: Math.round(weekRecords * 4.3), // Estimate monthly from weekly
                recentActivity
            }
        });

    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading admin dashboard: ' + error.message
        });
    }
});

// Get All Students
app.get('/api/admin/students', authenticate, authorize('admin'), async (req, res) => {
    try {
        const students = await User.find({ role: 'student' })
            .sort({ id: 1 })
            .lean();

        // Add attendance stats
        const studentsWithStats = await Promise.all(
            students.map(async (student) => {
                const attendanceCount = await Attendance.countDocuments({ 
                    studentId: student.id 
                });
                const totalQR = await QRCodeModel.countDocuments();
                const attendancePercentage = totalQR > 0 
                    ? Math.round((attendanceCount / totalQR) * 100) 
                    : 0;

                return {
                    ...student,
                    attendanceCount,
                    attendancePercentage
                };
            })
        );

        res.json({
            success: true,
            students: studentsWithStats
        });

    } catch (error) {
        console.error('Get students error:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading students: ' + error.message
        });
    }
});

// Get Student Analytics
app.get('/api/admin/students/:id/analytics', authenticate, authorize('admin'), async (req, res) => {
    try {
        const studentId = req.params.id;

        // Get student
        const student = await User.findOne({ id: studentId, role: 'student' });
        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }

        // Get attendance
        const attendance = await Attendance.find({ studentId })
            .sort({ scanTime: -1 })
            .lean();

        // Calculate stats
        const totalQR = await QRCodeModel.countDocuments();
        const attendedClasses = attendance.length;
        const attendancePercentage = totalQR > 0 
            ? Math.round((attendedClasses / totalQR) * 100) 
            : 0;

        res.json({
            success: true,
            student: {
                id: student.id,
                name: student.name,
                email: student.email,
                phone: student.phone,
                course: student.course,
                year: student.year
            },
            attendancePercentage,
            totalClasses: totalQR,
            attendedClasses,
            attendance: attendance.map(record => ({
                date: record.date,
                time: record.time,
                unitName: record.unitName,
                unitCode: record.unitCode,
                lecturerName: record.lecturerName,
                status: record.status
            }))
        });

    } catch (error) {
        console.error('Student analytics error:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading student analytics: ' + error.message
        });
    }
});

// Get All QR Codes (Admin)
app.get('/api/admin/qr-codes', authenticate, authorize('admin'), async (req, res) => {
    try {
        const qrCodes = await QRCodeModel.find()
            .sort({ createdAt: -1 })
            .lean();
            
        // Add attendance count
        const qrCodesWithAttendance = await Promise.all(
            qrCodes.map(async (qr) => {
                const attendanceCount = await Attendance.countDocuments({ 
                    qrCodeId: qr.qrCodeId 
                });
                return {
                    ...qr,
                    attendanceCount
                };
            })
        );

        res.json({
            success: true,
            qrCodes: qrCodesWithAttendance
        });
    } catch (error) {
        console.error('Get all QR codes error:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading QR codes: ' + error.message
        });
    }
});

// Generate Report
app.get('/api/admin/generate-report', authenticate, authorize('admin'), async (req, res) => {
    try {
        // Get all attendance
        const attendance = await Attendance.find()
            .sort({ date: -1, time: -1 })
            .lean();
            
        // Create CSV data
        const csvData = [
            ['Date', 'Student ID', 'Student Name', 'Unit', 'Unit Code', 'Lecturer', 'Time', 'Status'],
            ...attendance.map(record => [
                record.date,
                record.studentId,
                record.studentName,
                record.unitName,
                record.unitCode,
                record.lecturerName,
                record.time,
                record.status
            ])
        ].map(row => row.join(',')).join('\n');

        // Send as downloadable file
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=attendance_report.csv');
        res.send(csvData);
        
    } catch (error) {
        console.error('Report generation error:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating report: ' + error.message
        });
    }
});

// Create User (Admin only)
app.post('/api/admin/users', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { role, name, id, email, phone, password, course, year, department } = req.body;

        // Validation
        if (!role || !name || !id || !email || !phone || !password) {
            return res.status(400).json({
                success: false,
                message: 'All required fields must be provided'
            });
        }

        // Check if exists
        const existingUser = await User.findOne({ 
            $or: [{ id }, { email }] 
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User already exists'
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const user = new User({
            id,
            name,
            email,
            phone,
            password: hashedPassword,
            role,
            course: role === 'student' ? (course || '') : '',
            year: role === 'student' ? (year || 1) : 1,
            department: role === 'lecturer' ? (department || '') : ''
        });

        await user.save();

        res.status(201).json({
            success: true,
            message: 'User created successfully',
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                course: user.course,
                year: user.year,
                department: user.department
            }
        });

    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating user: ' + error.message
        });
    }
});

// Delete User (Admin only)
app.delete('/api/admin/users/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const userId = req.params.id;

        // Find and delete user
        const user = await User.findOneAndDelete({ id: userId });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Delete user's attendance records if student
        if (user.role === 'student') {
            await Attendance.deleteMany({ studentId: userId });
        }

        // Delete user's QR codes if lecturer
        if (user.role === 'lecturer') {
            await QRCodeModel.deleteMany({ lecturerId: userId });
        }

        res.json({
            success: true,
            message: 'User deleted successfully'
        });

    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting user: ' + error.message
        });
    }
});

// ==================== COURSE ROUTES ====================

// Create Course
app.post('/api/courses', authenticate, authorize('lecturer', 'admin'), async (req, res) => {
    try {
        const { courseCode, courseName, semester, year, students } = req.body;

        // Validation
        if (!courseCode || !courseName || !semester || !year) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
            });
        }

        // Check if exists
        const existingCourse = await Course.findOne({ courseCode });
        if (existingCourse) {
            return res.status(400).json({
                success: false,
                message: 'Course already exists'
            });
        }

        // Create course
        const course = new Course({
            courseCode,
            courseName,
            lecturerId: req.user.id,
            lecturerName: req.user.name,
            semester,
            year,
            students: students || []
        });

        await course.save();

        res.status(201).json({
            success: true,
            message: 'Course created successfully',
            course
        });

    } catch (error) {
        console.error('Create course error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating course: ' + error.message
        });
    }
});

// Get Courses
app.get('/api/courses', authenticate, async (req, res) => {
    try {
        let courses;
        
        if (req.user.role === 'student') {
            courses = await Course.find({ 
                students: req.user.id 
            });
        } else if (req.user.role === 'lecturer') {
            courses = await Course.find({ 
                lecturerId: req.user.id 
            });
        } else {
            courses = await Course.find();
        }

        res.json({
            success: true,
            courses
        });

    } catch (error) {
        console.error('Get courses error:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading courses: ' + error.message
        });
    }
});

// ==================== SAMPLE DATA INITIALIZATION ====================

// Initialize database with sample data
app.post('/api/init-sample-data', async (req, res) => {
    try {
        console.log('Initializing sample data...');

        // Clear existing data
        await User.deleteMany({});
        await QRCodeModel.deleteMany({});
        await Attendance.deleteMany({});
        await Course.deleteMany({});

        // Create sample admin
        const adminPassword = await bcrypt.hash('admin123', 10);
        const admin = new User({
            id: 'AD001',
            name: 'System Administrator',
            email: 'admin@school.edu',
            phone: '+254712345678',
            password: adminPassword,
            role: 'admin',
            department: 'Administration'
        });
        await admin.save();

        // Create sample lecturer
        const lecturerPassword = await bcrypt.hash('lecturer123', 10);
        const lecturer = new User({
            id: 'LT001',
            name: 'Dr. John Smith',
            email: 'john.smith@school.edu',
            phone: '+254723456789',
            password: lecturerPassword,
            role: 'lecturer',
            department: 'Computer Science'
        });
        await lecturer.save();

        // Create sample students
        const studentsData = [
            {
                id: 'ST001',
                name: 'Alice Johnson',
                email: 'alice@student.edu',
                phone: '+254734567890',
                password: await bcrypt.hash('student123', 10),
                role: 'student',
                course: 'Computer Science',
                year: 2
            },
            {
                id: 'ST002',
                name: 'Bob Williams',
                email: 'bob@student.edu',
                phone: '+254745678901',
                password: await bcrypt.hash('student123', 10),
                role: 'student',
                course: 'Software Engineering',
                year: 3
            },
            {
                id: 'ST003',
                name: 'Carol Davis',
                email: 'carol@student.edu',
                phone: '+254756789012',
                password: await bcrypt.hash('student123', 10),
                role: 'student',
                course: 'Information Technology',
                year: 1
            }
        ];

        for (const studentData of studentsData) {
            const student = new User(studentData);
            await student.save();
        }

        // Create sample QR codes
        const now = new Date();
        const qrCodes = [
            {
                qrCodeId: 'QR_' + crypto.randomBytes(4).toString('hex').toUpperCase(),
                unitName: 'Database Systems',
                unitCode: 'CS301',
                classType: 'lecture',
                topic: 'Introduction to SQL',
                lecturerId: 'LT001',
                lecturerName: 'Dr. John Smith',
                duration: 60,
                createdAt: new Date(now.getTime() - 24 * 60 * 60 * 1000), // 1 day ago
                expiresAt: new Date(now.getTime() - 23 * 60 * 60 * 1000), // 1 hour later
                isActive: false,
                qrData: JSON.stringify({
                    qrCodeId: 'QR_ABC123',
                    unitName: 'Database Systems',
                    unitCode: 'CS301',
                    lecturerName: 'Dr. John Smith'
                })
            },
            {
                qrCodeId: 'QR_' + crypto.randomBytes(4).toString('hex').toUpperCase(),
                unitName: 'Web Development',
                unitCode: 'CS302',
                classType: 'lab',
                topic: 'React Basics',
                lecturerId: 'LT001',
                lecturerName: 'Dr. John Smith',
                duration: 90,
                createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
                expiresAt: new Date(now.getTime() - 30 * 60 * 1000), // 30 minutes ago
                isActive: false,
                qrData: JSON.stringify({
                    qrCodeId: 'QR_DEF456',
                    unitName: 'Web Development',
                    unitCode: 'CS302',
                    lecturerName: 'Dr. John Smith'
                })
            }
        ];

        for (const qrData of qrCodes) {
            const qrCode = new QRCodeModel(qrData);
            await qrCode.save();
        }

        // Create sample attendance records
        const attendanceData = [
            {
                studentId: 'ST001',
                studentName: 'Alice Johnson',
                qrCodeId: qrCodes[0].qrCodeId,
                unitName: 'Database Systems',
                unitCode: 'CS301',
                lecturerId: 'LT001',
                lecturerName: 'Dr. John Smith',
                scanTime: new Date(now.getTime() - 24 * 60 * 60 * 1000 + 30 * 60 * 1000), // 30 minutes after QR creation
                date: formatDate(new Date(now.getTime() - 24 * 60 * 60 * 1000)),
                time: '10:30 AM',
                status: 'present'
            },
            {
                studentId: 'ST002',
                studentName: 'Bob Williams',
                qrCodeId: qrCodes[0].qrCodeId,
                unitName: 'Database Systems',
                unitCode: 'CS301',
                lecturerId: 'LT001',
                lecturerName: 'Dr. John Smith',
                scanTime: new Date(now.getTime() - 24 * 60 * 60 * 1000 + 45 * 60 * 1000), // 45 minutes after QR creation
                date: formatDate(new Date(now.getTime() - 24 * 60 * 60 * 1000)),
                time: '10:45 AM',
                status: 'late'
            }
        ];

        for (const attendance of attendanceData) {
            const record = new Attendance(attendance);
            await record.save();
        }

        // Create sample courses
        const coursesData = [
            {
                courseCode: 'CS301',
                courseName: 'Database Systems',
                lecturerId: 'LT001',
                lecturerName: 'Dr. John Smith',
                semester: 'Fall 2024',
                year: 2024,
                students: ['ST001', 'ST002']
            },
            {
                courseCode: 'CS302',
                courseName: 'Web Development',
                lecturerId: 'LT001',
                lecturerName: 'Dr. John Smith',
                semester: 'Fall 2024',
                year: 2024,
                students: ['ST001', 'ST002', 'ST003']
            }
        ];

        for (const courseData of coursesData) {
            const course = new Course(courseData);
            await course.save();
        }

        console.log('Sample data initialized successfully');

        res.json({
            success: true,
            message: 'Sample data initialized successfully',
            data: {
                admin: { id: admin.id, password: 'admin123' },
                lecturer: { id: lecturer.id, password: 'lecturer123' },
                students: studentsData.map(s => ({ id: s.id, password: 'student123' }))
            }
        });

    } catch (error) {
        console.error('Init sample data error:', error);
        res.status(500).json({
            success: false,
            message: 'Error initializing sample data: ' + error.message
        });
    }
});

// ==================== ERROR HANDLING ====================

// 404 Handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'API endpoint not found',
        path: req.path,
        method: req.method
    });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error: ' + err.message,
        error: process.env.NODE_ENV === 'development' ? err.stack : {}
    });
});

// ==================== SERVER START ====================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`
🚀 IN Attendance System Backend
📡 Server running on port ${PORT}
🔗 Local: http://localhost:${PORT}
🌐 Public: https://zero0-1-r0xs.onrender.com
📊 Health check: http://localhost:${PORT}/api/health
🎯 Ready for frontend connection!
    `);
});
