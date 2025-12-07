// server.js - SIMPLIFIED WORKING VERSION
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

// SIMPLIFIED CORS - Allow everything
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// MongoDB Connection - SIMPLIFIED
const MONGODB_URI = 'mongodb+srv://attendance_admin:muhidinaliko2006@cluster0.bneqb6q.mongodb.net/attendance?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB Connected'))
.catch(err => console.log('❌ MongoDB Error:', err.message));

// SIMPLIFIED MODELS
const userSchema = new mongoose.Schema({
    id: String,
    name: String,
    email: String,
    phone: String,
    password: String,
    role: String,
    course: String,
    year: Number,
    department: String
});

const qrCodeSchema = new mongoose.Schema({
    qrCodeId: String,
    unitName: String,
    unitCode: String,
    lecturerId: String,
    lecturerName: String,
    duration: Number,
    createdAt: Date,
    expiresAt: Date,
    isActive: Boolean
});

const attendanceSchema = new mongoose.Schema({
    studentId: String,
    studentName: String,
    qrCodeId: String,
    unitName: String,
    unitCode: String,
    lecturerName: String,
    date: String,
    time: String,
    status: String
});

const User = mongoose.model('User', userSchema);
const QRCode = mongoose.model('QRCode', qrCodeSchema);
const Attendance = mongoose.model('Attendance', attendanceSchema);

const JWT_SECRET = 'attendance_system_secret_key_2024';

// ==================== TEST ENDPOINTS ====================

// Test if server is running
app.get('/', (req, res) => {
    res.json({ 
        message: '✅ Server is working!',
        status: 'running',
        timestamp: new Date().toISOString()
    });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true,
        message: 'Server is healthy',
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// SIMPLIFIED LOGIN
app.post('/api/auth/login', async (req, res) => {
    try {
        const { id, password, role } = req.body;
        
        console.log('Login attempt:', { id, role });
        
        // Hardcoded test users (for testing)
        const testUsers = {
            'AD001': { password: 'admin123', role: 'admin', name: 'Admin User', email: 'admin@test.com', phone: '1234567890' },
            'LT001': { password: 'lecturer123', role: 'lecturer', name: 'Lecturer User', email: 'lecturer@test.com', phone: '1234567891' },
            'ST001': { password: 'student123', role: 'student', name: 'Student User', email: 'student@test.com', phone: '1234567892', course: 'Computer Science', year: 2 }
        };
        
        if (testUsers[id] && testUsers[id].password === password && testUsers[id].role === role) {
            const token = jwt.sign({ id, role }, JWT_SECRET, { expiresIn: '7d' });
            
            res.json({
                success: true,
                message: 'Login successful',
                user: {
                    id: id,
                    name: testUsers[id].name,
                    email: testUsers[id].email,
                    phone: testUsers[id].phone,
                    role: role,
                    course: testUsers[id].course,
                    year: testUsers[id].year
                },
                token: token
            });
        } else {
            res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Server error: ' + error.message
        });
    }
});

// SIMPLIFIED REGISTER
app.post('/api/auth/register', async (req, res) => {
    try {
        const { id, name, email, phone, password, role, course, year } = req.body;
        
        console.log('Register attempt:', { id, name, role });
        
        // Check if user exists
        const existingUser = await User.findOne({ id: id });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User already exists'
            });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create new user
        const newUser = new User({
            id,
            name,
            email,
            phone,
            password: hashedPassword,
            role,
            course: course || '',
            year: year || 1,
            department: ''
        });
        
        await newUser.save();
        
        // Generate token
        const token = jwt.sign({ id, role }, JWT_SECRET, { expiresIn: '7d' });
        
        res.json({
            success: true,
            message: 'Registration successful',
            user: {
                id,
                name,
                email,
                phone,
                role,
                course,
                year
            },
            token: token
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Registration failed: ' + error.message
        });
    }
});

// SIMPLIFIED DASHBOARD
app.get('/api/students/:id/dashboard', async (req, res) => {
    try {
        const studentId = req.params.id;
        
        // Mock data for testing
        res.json({
            success: true,
            data: {
                totalClasses: 12,
                attendedClasses: 10,
                missedClasses: 2,
                attendancePercentage: 83,
                recentAttendance: [
                    { date: '2024-01-15', time: '10:30 AM', unitName: 'Database Systems', unitCode: 'CS301', status: 'present' },
                    { date: '2024-01-14', time: '2:00 PM', unitName: 'Web Development', unitCode: 'CS302', status: 'present' },
                    { date: '2024-01-13', time: '9:00 AM', unitName: 'Mathematics', unitCode: 'MATH101', status: 'absent' }
                ],
                todaysClasses: [
                    { name: 'Database Systems', code: 'CS301', time: '10:00 AM', period: '60 min', room: 'Room 101', status: 'upcoming' },
                    { name: 'Web Development', code: 'CS302', time: '2:00 PM', period: '90 min', room: 'Lab 201', status: 'upcoming' }
                ]
            }
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error: ' + error.message
        });
    }
});

// SIMPLIFIED QR CODE GENERATION
app.post('/api/lecturers/generate-qr', async (req, res) => {
    try {
        const { unitName, unitCode, duration } = req.body;
        
        const qrCodeId = 'QR_' + Date.now();
        const createdAt = new Date();
        const expiresAt = new Date(createdAt.getTime() + duration * 60000);
        
        const qrData = {
            qrCodeId,
            unitName,
            unitCode,
            lecturerId: 'LT001',
            lecturerName: 'Test Lecturer',
            createdAt: createdAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
            duration
        };
        
        // Save to database
        const qrCode = new QRCode({
            ...qrData,
            isActive: true
        });
        
        await qrCode.save();
        
        res.json({
            success: true,
            message: 'QR code generated',
            qrCode: qrData
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error: ' + error.message
        });
    }
});

// SIMPLIFIED ATTENDANCE SCAN
app.post('/api/attendance/scan', async (req, res) => {
    try {
        const { qrCode } = req.body;
        
        console.log('QR Scan received:', qrCode);
        
        // Parse QR code
        let qrData;
        try {
            qrData = JSON.parse(qrCode);
        } catch {
            qrData = qrCode;
        }
        
        // Create attendance record
        const attendance = new Attendance({
            studentId: 'ST001',
            studentName: 'Test Student',
            qrCodeId: qrData.qrCodeId || 'TEST_QR',
            unitName: qrData.unitName || 'Test Unit',
            unitCode: qrData.unitCode || 'TEST101',
            lecturerName: qrData.lecturerName || 'Test Lecturer',
            date: new Date().toISOString().split('T')[0],
            time: new Date().toLocaleTimeString(),
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
                unitCode: attendance.unitCode
            }
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Scan failed: ' + error.message
        });
    }
});

// SIMPLIFIED INIT SAMPLE DATA
app.post('/api/init-sample-data', async (req, res) => {
    try {
        // Clear existing data
        await User.deleteMany({});
        await QRCode.deleteMany({});
        await Attendance.deleteMany({});
        
        // Create admin
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
        
        // Create lecturer
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
        
        // Create student
        const studentPassword = await bcrypt.hash('student123', 10);
        const student = new User({
            id: 'ST001',
            name: 'Alice Johnson',
            email: 'alice@student.edu',
            phone: '+254734567890',
            password: studentPassword,
            role: 'student',
            course: 'Computer Science',
            year: 2
        });
        await student.save();
        
        res.json({
            success: true,
            message: 'Sample data initialized',
            users: [
                { id: 'AD001', password: 'admin123', role: 'admin' },
                { id: 'LT001', password: 'lecturer123', role: 'lecturer' },
                { id: 'ST001', password: 'student123', role: 'student' }
            ]
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Init failed: ' + error.message
        });
    }
});

// ==================== SERVER START ====================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`
🚀 SIMPLIFIED Attendance System Backend
📡 Running on port ${PORT}
🔗 http://localhost:${PORT}
🌐 Public URL will be provided by Render
✅ Server is ready!
    `);
});
