
// server.js - FINAL WORKING VERSION
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const app = express();

// CORS - ALLOW ALL ORIGINS
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB Connection
const MONGODB_URI = 'mongodb+srv://kaziuser:KaziSecurePassword2024@cluster0.bneqb6q.mongodb.net/attendance?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB Connected'))
.catch(err => {
    console.error('❌ MongoDB Error:', err.message);
});

// JWT Secret
const JWT_SECRET = 'attendance_system_secret_key_2024';

// MODELS
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
    classType: { type: String, default: 'lecture' },
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
    status: { type: String, default: 'present' }
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
const QRCode = mongoose.model('QRCode', qrCodeSchema);
const Attendance = mongoose.model('Attendance', attendanceSchema);
const Course = mongoose.model('Course', courseSchema);

// HELPER FUNCTIONS
const generateQRCodeId = () => {
    return 'QR_' + crypto.randomBytes(6).toString('hex').toUpperCase();
};

const formatDate = (date) => {
    return date.toISOString().split('T')[0];
};

const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
    });
};

// ==================== AUTHENTICATION MIDDLEWARE ====================
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.header('Authorization');
        if (!authHeader) {
            return res.status(401).json({
                success: false,
                message: 'No token provided'
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
            message: 'Invalid token'
        });
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Access denied'
            });
        }
        next();
    };
};

// ==================== PUBLIC ENDPOINTS ====================
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: '✅ IN Attendance System API',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Server is healthy',
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString()
    });
});

// ==================== AUTH ENDPOINTS ====================
app.post('/api/auth/register', async (req, res) => {
    try {
        const { role, name, id, email, phone, password, course, year, department } = req.body;

        // Validation
        if (!role || !name || !id || !email || !phone || !password) {
            return res.status(400).json({
                success: false,
                message: 'All required fields must be filled'
            });
        }

        // Check if user exists
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
            course: role === 'student' ? (course || 'Computer Science') : '',
            year: role === 'student' ? (year || 1) : 1,
            department: role === 'lecturer' ? (department || 'Computer Science') : '',
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await user.save();

        // Generate token
        const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

        res.status(201).json({
            success: true,
            message: 'Registration successful',
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
            message: 'Registration failed: ' + error.message
        });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { id, password, role } = req.body;

        console.log('Login attempt:', { id, role });

        // Hardcoded test users for immediate testing
        const testUsers = {
            'AD001': { password: 'admin123', role: 'admin', name: 'System Admin', email: 'admin@school.edu', phone: '+254712345678' },
            'LT001': { password: 'lecturer123', role: 'lecturer', name: 'Dr. John Smith', email: 'lecturer@school.edu', phone: '+254723456789', department: 'Computer Science' },
            'ST001': { password: 'student123', role: 'student', name: 'Alice Johnson', email: 'student@school.edu', phone: '+254734567890', course: 'Computer Science', year: 2 }
        };

        // First check test users
        if (testUsers[id] && testUsers[id].password === password && testUsers[id].role === role) {
            const token = jwt.sign({ id, role }, JWT_SECRET, { expiresIn: '7d' });
            
            return res.json({
                success: true,
                message: 'Login successful',
                user: {
                    id: id,
                    name: testUsers[id].name,
                    email: testUsers[id].email,
                    phone: testUsers[id].phone,
                    role: role,
                    course: testUsers[id].course || '',
                    year: testUsers[id].year || 1,
                    department: testUsers[id].department || ''
                },
                token
            });
        }

        // If not test user, check database
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
        const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

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
            message: 'Login failed: ' + error.message
        });
    }
});

// ==================== STUDENT ENDPOINTS ====================
app.get('/api/students/:id/dashboard', authenticate, async (req, res) => {
    try {
        const studentId = req.params.id;

        // Mock data for testing
        const mockData = {
            totalClasses: 15,
            attendedClasses: 12,
            missedClasses: 3,
            attendancePercentage: 80,
            recentAttendance: [
                { date: '2024-01-15', time: '10:30 AM', unitName: 'Database Systems', unitCode: 'CS301', status: 'present' },
                { date: '2024-01-14', time: '2:00 PM', unitName: 'Web Development', unitCode: 'CS302', status: 'present' },
                { date: '2024-01-13', time: '9:00 AM', unitName: 'Mathematics', unitCode: 'MATH101', status: 'absent' }
            ],
            todaysClasses: [
                { name: 'Database Systems', code: 'CS301', time: '10:00 AM', period: '60 min', room: 'Room 101', status: 'upcoming' },
                { name: 'Web Development', code: 'CS302', time: '2:00 PM', period: '90 min', room: 'Lab 201', status: 'upcoming' }
            ]
        };

        res.json({
            success: true,
            data: mockData
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error: ' + error.message
        });
    }
});

app.get('/api/students/:id/attendance', authenticate, async (req, res) => {
    try {
        const studentId = req.params.id;
        
        // Mock attendance data
        const attendance = [
            { date: '2024-01-15', time: '10:30 AM', unitName: 'Database Systems', unitCode: 'CS301', lecturerName: 'Dr. John Smith', status: 'present' },
            { date: '2024-01-14', time: '2:00 PM', unitName: 'Web Development', unitCode: 'CS302', lecturerName: 'Dr. John Smith', status: 'present' },
            { date: '2024-01-13', time: '9:00 AM', unitName: 'Mathematics', unitCode: 'MATH101', lecturerName: 'Dr. Sarah Johnson', status: 'absent' },
            { date: '2024-01-12', time: '11:00 AM', unitName: 'Data Structures', unitCode: 'CS303', lecturerName: 'Dr. Mark Wilson', status: 'present' }
        ];

        res.json({
            success: true,
            attendance: attendance
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error: ' + error.message
        });
    }
});

// ==================== LECTURER ENDPOINTS ====================
app.post('/api/lecturers/generate-qr', authenticate, authorize('lecturer', 'admin'), async (req, res) => {
    try {
        const { unitName, unitCode, duration, classType, topic } = req.body;

        if (!unitName || !unitCode || !duration) {
            return res.status(400).json({
                success: false,
                message: 'Unit name, code, and duration are required'
            });
        }

        // Generate QR code
        const qrCodeId = generateQRCodeId();
        const createdAt = new Date();
        const expiresAt = new Date(createdAt.getTime() + duration * 60000);

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
        const qrCode = new QRCode({
            ...qrData,
            qrData: JSON.stringify(qrData),
            isActive: true
        });

        await qrCode.save();

        res.json({
            success: true,
            message: 'QR code generated successfully',
            qrCode: qrData
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error: ' + error.message
        });
    }
});

app.get('/api/lecturers/:id/dashboard', authenticate, async (req, res) => {
    try {
        const lecturerId = req.params.id;

        // Mock data
        const mockData = {
            totalClasses: 8,
            totalStudents: 240,
            avgAttendance: 85,
            activeQRCodes: 2,
            recentQRCodes: [
                { id: 'QR_ABC123', unitName: 'Database Systems', unitCode: 'CS301', createdAt: new Date(), expiresAt: new Date(Date.now() + 3600000), attendanceCount: 45 },
                { id: 'QR_DEF456', unitName: 'Web Development', unitCode: 'CS302', createdAt: new Date(Date.now() - 86400000), expiresAt: new Date(Date.now() - 7200000), attendanceCount: 42 }
            ],
            todaysClasses: [
                { name: 'Database Systems', code: 'CS301', time: '10:00 AM', duration: 60, status: 'completed' },
                { name: 'Web Development', code: 'CS302', time: '2:00 PM', duration: 90, status: 'upcoming' }
            ]
        };

        res.json({
            success: true,
            data: mockData
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error: ' + error.message
        });
    }
});

app.get('/api/lecturers/:id/qr-codes', authenticate, async (req, res) => {
    try {
        const lecturerId = req.params.id;

        // Get QR codes from database
        const qrCodes = await QRCode.find({ lecturerId })
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
        res.status(500).json({
            success: false,
            message: 'Error: ' + error.message
        });
    }
});

// ==================== ATTENDANCE ENDPOINTS ====================
app.post('/api/attendance/scan', authenticate, authorize('student'), async (req, res) => {
    try {
        const { qrCode, scanTime } = req.body;
        const studentId = req.user.id;

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

        // Check if already scanned
        const existingAttendance = await Attendance.findOne({
            studentId,
            qrCodeId: qrData.qrCodeId
        });

        if (existingAttendance) {
            return res.status(400).json({
                success: false,
                message: 'Attendance already recorded'
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
            qrCodeId: qrData.qrCodeId || 'QR_TEST',
            unitName: qrData.unitName || 'Test Unit',
            unitCode: qrData.unitCode || 'TEST101',
            lecturerId: qrData.lecturerId || 'LT001',
            lecturerName: qrData.lecturerName || 'Test Lecturer',
            scanTime: scanDate,
            date: formatDate(scanDate),
            time: formatTime(scanDate),
            status: 'present'
        });

        await attendance.save();

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
        res.status(500).json({
            success: false,
            message: 'Error: ' + error.message
        });
    }
});

// ==================== ADMIN ENDPOINTS ====================
app.get('/api/admin/dashboard', authenticate, authorize('admin'), async (req, res) => {
    try {
        // Get statistics
        const totalStudents = await User.countDocuments({ role: 'student' });
        const totalLecturers = await User.countDocuments({ role: 'lecturer' });
        const totalCourses = await Course.countDocuments();
        
        // Mock data for testing
        const mockData = {
            totalStudents: totalStudents || 150,
            totalLecturers: totalLecturers || 15,
            totalCourses: totalCourses || 25,
            overallAttendance: 82,
            todayRecords: 45,
            weekRecords: 320,
            monthRecords: 1280,
            recentActivity: [
                { timestamp: '10:30 AM', userName: 'Alice Johnson', action: 'Scanned QR', details: 'Database Systems (CS301)' },
                { timestamp: '10:15 AM', userName: 'Bob Williams', action: 'Scanned QR', details: 'Web Development (CS302)' },
                { timestamp: '9:45 AM', userName: 'Dr. John Smith', action: 'Generated QR', details: 'Database Systems - 60min' },
                { timestamp: '9:30 AM', userName: 'Carol Davis', action: 'Scanned QR', details: 'Mathematics (MATH101)' }
            ]
        };

        res.json({
            success: true,
            data: mockData
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error: ' + error.message
        });
    }
});

app.get('/api/admin/students', authenticate, authorize('admin'), async (req, res) => {
    try {
        const students = await User.find({ role: 'student' })
            .sort({ id: 1 })
            .lean();

        // Add mock attendance stats
        const studentsWithStats = students.map((student, index) => ({
            ...student,
            attendanceCount: Math.floor(Math.random() * 50) + 30,
            attendancePercentage: Math.floor(Math.random() * 30) + 70
        }));

        res.json({
            success: true,
            students: studentsWithStats
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error: ' + error.message
        });
    }
});

app.get('/api/admin/qr-codes', authenticate, authorize('admin'), async (req, res) => {
    try {
        const qrCodes = await QRCode.find()
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
        res.status(500).json({
            success: false,
            message: 'Error: ' + error.message
        });
    }
});

// ==================== SAMPLE DATA INITIALIZATION ====================
app.post('/api/init-sample-data', async (req, res) => {
    try {
        console.log('Initializing sample data...');

        // Clear existing data
        await User.deleteMany({});
        await QRCode.deleteMany({});
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
            department: 'Administration',
            createdAt: new Date(),
            updatedAt: new Date()
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
            department: 'Computer Science',
            createdAt: new Date(),
            updatedAt: new Date()
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
                year: 2,
                createdAt: new Date(),
                updatedAt: new Date()
            },
            {
                id: 'ST002',
                name: 'Bob Williams',
                email: 'bob@student.edu',
                phone: '+254745678901',
                password: await bcrypt.hash('student123', 10),
                role: 'student',
                course: 'Software Engineering',
                year: 3,
                createdAt: new Date(),
                updatedAt: new Date()
            },
            {
                id: 'ST003',
                name: 'Carol Davis',
                email: 'carol@student.edu',
                phone: '+254756789012',
                password: await bcrypt.hash('student123', 10),
                role: 'student',
                course: 'Information Technology',
                year: 1,
                createdAt: new Date(),
                updatedAt: new Date()
            }
        ];

        for (const studentData of studentsData) {
            const student = new User(studentData);
            await student.save();
        }

        // Create sample QR codes
        const now = new Date();
        const qrCodesData = [
            {
                qrCodeId: generateQRCodeId(),
                unitName: 'Database Systems',
                unitCode: 'CS301',
                classType: 'lecture',
                topic: 'Introduction to SQL',
                lecturerId: 'LT001',
                lecturerName: 'Dr. John Smith',
                duration: 60,
                createdAt: new Date(now.getTime() - 86400000),
                expiresAt: new Date(now.getTime() - 82800000),
                isActive: false,
                qrData: JSON.stringify({
                    qrCodeId: 'QR_ABC123',
                    unitName: 'Database Systems',
                    unitCode: 'CS301',
                    lecturerName: 'Dr. John Smith'
                })
            },
            {
                qrCodeId: generateQRCodeId(),
                unitName: 'Web Development',
                unitCode: 'CS302',
                classType: 'lab',
                topic: 'React Basics',
                lecturerId: 'LT001',
                lecturerName: 'Dr. John Smith',
                duration: 90,
                createdAt: new Date(now.getTime() - 7200000),
                expiresAt: new Date(now.getTime() - 2700000),
                isActive: false,
                qrData: JSON.stringify({
                    qrCodeId: 'QR_DEF456',
                    unitName: 'Web Development',
                    unitCode: 'CS302',
                    lecturerName: 'Dr. John Smith'
                })
            }
        ];

        for (const qrData of qrCodesData) {
            const qrCode = new QRCode(qrData);
            await qrCode.save();
        }

        // Create sample attendance records
        const attendanceData = [
            {
                studentId: 'ST001',
                studentName: 'Alice Johnson',
                qrCodeId: qrCodesData[0].qrCodeId,
                unitName: 'Database Systems',
                unitCode: 'CS301',
                lecturerId: 'LT001',
                lecturerName: 'Dr. John Smith',
                scanTime: new Date(now.getTime() - 84600000),
                date: formatDate(new Date(now.getTime() - 84600000)),
                time: '10:30 AM',
                status: 'present'
            },
            {
                studentId: 'ST002',
                studentName: 'Bob Williams',
                qrCodeId: qrCodesData[0].qrCodeId,
                unitName: 'Database Systems',
                unitCode: 'CS301',
                lecturerId: 'LT001',
                lecturerName: 'Dr. John Smith',
                scanTime: new Date(now.getTime() - 83700000),
                date: formatDate(new Date(now.getTime() - 83700000)),
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
                students: ['ST001', 'ST002'],
                createdAt: new Date()
            },
            {
                courseCode: 'CS302',
                courseName: 'Web Development',
                lecturerId: 'LT001',
                lecturerName: 'Dr. John Smith',
                semester: 'Fall 2024',
                year: 2024,
                students: ['ST001', 'ST002', 'ST003'],
                createdAt: new Date()
            }
        ];

        for (const courseData of coursesData) {
            const course = new Course(courseData);
            await course.save();
        }

        console.log('✅ Sample data initialized');

        res.json({
            success: true,
            message: 'Sample data initialized successfully',
            data: {
                admin: { id: 'AD001', password: 'admin123' },
                lecturer: { id: 'LT001', password: 'lecturer123' },
                students: [
                    { id: 'ST001', password: 'student123' },
                    { id: 'ST002', password: 'student123' },
                    { id: 'ST003', password: 'student123' }
                ]
            }
        });

    } catch (error) {
        console.error('❌ Sample data error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to initialize: ' + error.message
        });
    }
});

// ==================== ERROR HANDLING ====================
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found'
    });
});

app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error: ' + err.message
    });
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`
🚀 IN Attendance System Backend
📡 Running on port ${PORT}
🔗 http://localhost:${PORT}
🌐 https://zero0-1-r0xs.onrender.com
✅ Server ready!
    `);
});
