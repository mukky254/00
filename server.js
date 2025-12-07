// server.js - Fixed Backend API
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const QRCodeGenerator = require('qrcode'); // Renamed from QRCode

const app = express();

// Middleware
app.use(cors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:5500', 'https://in-attendance-system.onrender.com', '*'],
    credentials: true
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
    status: { type: String, enum: ['present', 'absent'], default: 'present' }
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
const QRCodeModel = mongoose.model('QRCode', qrCodeSchema); // Changed to QRCodeModel
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
        endpoints: {
            auth: '/api/auth',
            student: '/api/students',
            lecturer: '/api/lecturers',
            admin: '/api/admin',
            attendance: '/api/attendance'
        }
    });
});

// Health Check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
        message: 'Attendance System API is running'
    });
});

// Register User
app.post('/api/auth/register', async (req, res) => {
    try {
        const { role, name, id, email, phone, password } = req.body;

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
            ...(role === 'student' && { course: req.body.course || '', year: req.body.year || 1 }),
            ...(role === 'lecturer' && { department: req.body.department || '' })
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
                message: 'Invalid credentials - user not found'
            });
        }

        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials - wrong password'
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

// ==================== STUDENT ROUTES ====================

// Get Student Dashboard
app.get('/api/students/:id/dashboard', authenticate, authorize('student', 'admin'), async (req, res) => {
    try {
        const studentId = req.params.id;

        // Get attendance records
        const attendance = await Attendance.find({ studentId });
        
        // Get all QR codes (as total possible classes)
        const totalQR = await QRCodeModel.countDocuments();
        
        const attendedClasses = attendance.length;
        const attendancePercentage = totalQR > 0 ? Math.round((attendedClasses / totalQR) * 100) : 0;
        const missedClasses = Math.max(0, totalQR - attendedClasses);

        // Get recent attendance
        const recentAttendance = attendance
            .sort((a, b) => b.scanTime - a.scanTime)
            .slice(0, 10)
            .map(record => ({
                date: record.date,
                time: record.time,
                unitName: record.unitName,
                unitCode: record.unitCode,
                status: record.status
            }));

        res.json({
            success: true,
            data: {
                totalClasses: totalQR,
                attendedClasses,
                missedClasses,
                attendancePercentage,
                recentAttendance
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

// Get Student Attendance
app.get('/api/students/:id/attendance', authenticate, authorize('student', 'admin'), async (req, res) => {
    try {
        const studentId = req.params.id;
        
        const attendance = await Attendance.find({ studentId })
            .sort({ scanTime: -1 })
            .lean();

        const formattedAttendance = attendance.map(record => ({
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

// Update Student Profile
app.put('/api/students/:id', authenticate, authorize('student', 'admin'), async (req, res) => {
    try {
        const studentId = req.params.id;
        const { name, email, phone, course, year, currentPassword, newPassword } = req.body;

        // Find student
        const student = await User.findOne({ id: studentId });
        if (!student) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }

        // Update basic info
        if (name) student.name = name;
        if (email) student.email = email;
        if (phone) student.phone = phone;
        if (course) student.course = course;
        if (year) student.year = year;
        student.updatedAt = new Date();

        // Update password if provided
        if (newPassword) {
            if (!currentPassword) {
                return res.status(400).json({
                    success: false,
                    message: 'Current password is required'
                });
            }

            const isPasswordValid = await bcrypt.compare(currentPassword, student.password);
            if (!isPasswordValid) {
                return res.status(401).json({
                    success: false,
                    message: 'Current password is incorrect'
                });
            }

            student.password = await bcrypt.hash(newPassword, 10);
        }

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
        console.error('Update profile error:', error);
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
        if (!qrData.qrCodeId) {
            return res.status(400).json({
                success: false,
                message: 'Invalid QR code data - no QR code ID'
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

        // Create attendance record
        const scanDate = new Date(scanTime || Date.now());
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
            status: 'present'
        });

        await attendance.save();

        console.log('Attendance recorded successfully:', attendance);

        res.json({
            success: true,
            message: 'Attendance recorded successfully',
            attendance: {
                date: attendance.date,
                time: attendance.time,
                unitName: attendance.unitName,
                unitCode: attendance.unitCode,
                lecturerName: attendance.lecturerName
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
app.get('/api/lecturers/:id/dashboard', authenticate, authorize('lecturer', 'admin'), async (req, res) => {
    try {
        const lecturerId = req.params.id;

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

        const avgAttendance = totalClasses > 0 
            ? Math.round((totalAttendance / (totalClasses * 30)) * 100) // Assuming 30 students per class
            : 0;

        // Sort by most recent
        qrCodesWithAttendance.sort((a, b) => b.createdAt - a.createdAt);

        res.json({
            success: true,
            data: {
                totalClasses,
                totalStudents: 30 * totalClasses, // Estimated
                avgAttendance,
                activeQRCodes,
                recentQRCodes: qrCodesWithAttendance.slice(0, 5)
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
app.get('/api/lecturers/:id/qr-codes', authenticate, authorize('lecturer', 'admin'), async (req, res) => {
    try {
        const lecturerId = req.params.id;

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
                topic: qrCode.topic
            },
            attendance
        });

    } catch (error) {
        console.error('Get attendance error:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading attendance: ' + error.message
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
        
        // Calculate attendance
        const totalAttendance = await Attendance.countDocuments();
        const totalPossible = totalStudents * 50; // Estimated 50 classes per student
        const overallAttendance = totalPossible > 0 
            ? Math.round((totalAttendance / totalPossible) * 100) 
            : 0;

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
        ].slice(0, 10);

        res.json({
            success: true,
            data: {
                totalStudents,
                totalLecturers,
                totalCourses,
                overallAttendance,
                todayRecords: recentAttendance.length,
                weekRecords: totalAttendance,
                monthRecords: Math.floor(totalAttendance * 1.5), // Estimate
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
            attendance
        });

    } catch (error) {
        console.error('Student analytics error:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading student analytics: ' + error.message
        });
    }
});

// Create User (Admin only)
app.post('/api/admin/users', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { role, name, id, email, phone, password, course, year } = req.body;

        // Validation
        if (!role || !name || !id || !email || !phone || !password) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required'
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
            course: course || '',
            year: year || 1
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
                year: user.year
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

        // Delete user's attendance records
        await Attendance.deleteMany({ studentId: userId });

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

// ==================== PUBLIC TEST ROUTES ====================

// Test route to check if server is working
app.get('/test', (req, res) => {
    res.json({
        message: 'Server is working!',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Initialize database with sample data
app.post('/api/init-sample-data', async (req, res) => {
    try {
        // Check if we already have data
        const userCount = await User.countDocuments();
        
        if (userCount > 0) {
            return res.json({
                success: false,
                message: 'Database already has data'
            });
        }

        // Create sample admin
        const adminPassword = await bcrypt.hash('admin123', 10);
        const admin = new User({
            id: 'AD001',
            name: 'System Admin',
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
        const students = [
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
            }
        ];

        for (const studentData of students) {
            const student = new User(studentData);
            await student.save();
        }

        res.json({
            success: true,
            message: 'Sample data initialized successfully',
            data: {
                admin: { id: admin.id, password: 'admin123' },
                lecturer: { id: lecturer.id, password: 'lecturer123' },
                students: students.map(s => ({ id: s.id, password: 'student123' }))
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

// Error Handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error: ' + err.message
    });
});

// ==================== SERVER START ====================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`
🚀 IN Attendance System Backend
📡 Server running on port ${PORT}
🔗 Local: http://localhost:${PORT}
🌐 Public: https://in-attendance-backend.onrender.com
📊 Health check: http://localhost:${PORT}/api/health
🎯 Frontend URL: https://in-attendance-system.onrender.com
    `);
});
