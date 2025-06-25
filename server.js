
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false
});

// const pool = new Pool({
//   user: process.env.DB_USER,
//   password: process.env.DB_PASSWORD,
//   host: process.env.DB_HOST,
//   port: Number(process.env.DB_PORT),
//   database: process.env.DB_NAME,
// });


// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'my-super-secret-jwt-key-2024';

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    console.log('🔍 Token verification:');
    console.log('- Auth header exists:', !!authHeader);
    console.log('- Token exists:', !!token);

    if (!token) {
        console.log('❌ No token provided');
        return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบ', requireLogin: true });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.log('❌ Token verification failed:', err.message);
            
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ 
                    error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', 
                    requireLogin: true,
                    expired: true
                });
            }
            
            return res.status(403).json({ 
                error: 'Token ไม่ถูกต้อง',
                requireLogin: true
            });
        }
        
        console.log('✅ Token verified for user:', user.username, 'role:', user.role);
        req.user = user;
        next();
    });
};

// เพิ่ม API สำหรับตรวจสอบ users (debug)
app.get('/api/debug/all-users', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username, role, full_name, created_at FROM users ORDER BY role, username');
        res.json({
            success: true,
            users: result.rows,
            count: result.rows.length
        });
    } catch (err) {
        console.error('Debug users error:', err);
        res.status(500).json({ error: err.message });
    }
});

// เพิ่ม API สำหรับสร้าง default users ใหม่
app.post('/api/debug/recreate-users', async (req, res) => {
    try {
        // ลบผู้ใช้งานเก่า (ยกเว้น admin)
        await pool.query('DELETE FROM users WHERE username IN ($1, $2)', ['sales01', 'hr01']);
        
        // สร้างผู้ใช้งานใหม่
        const salesPassword = await bcrypt.hash('sales123', 10);
        const hrPassword = await bcrypt.hash('hr123', 10);

        await pool.query(`
            INSERT INTO users (username, email, password, role, full_name, department) VALUES 
            ('sales01', 'sales@company.com', $1, 'sales', 'พนักงานขาย', 'Sales'),
            ('hr01', 'hr@company.com', $2, 'hr', 'พนักงานบุคคล', 'HR')
        `, [salesPassword, hrPassword]);

        console.log('✅ Recreated sales and hr users');
        
        res.json({ 
            success: true, 
            message: 'สร้างผู้ใช้งาน sales01 และ hr01 ใหม่เรียบร้อย' 
        });
    } catch (err) {
        console.error('Recreate users error:', err);
        res.status(500).json({ error: err.message });
    }
});


const authorize = (roles) => {
    return (req, res, next) => {
        console.log('🔍 Authorization check:');
        console.log('- User role:', req.user.role);
        console.log('- Required roles:', roles);
        console.log('- User object:', req.user);
        
        if (!req.user.role) {
            console.log('❌ No role found in user object');
            return res.status(403).json({ error: 'No role found' });
        }
        
        if (!roles.includes(req.user.role)) {
            console.log('❌ Access denied for role:', req.user.role);
            return res.status(403).json({ 
                error: 'Insufficient permissions',
                userRole: req.user.role,
                requiredRoles: roles
            });
        }
        
        console.log('✅ Authorization passed');
        next();
    };
};
// 3. เพิ่ม Debug Endpoint (ลบออกหลังแก้ปัญหาแล้ว)
app.get('/api/debug/auth', authenticateToken, (req, res) => {
    res.json({
        user: req.user,
        timestamp: new Date().toISOString()
    });
});

// หน้าหลัก
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        console.log('🔍 Login attempt:', username);
        
        const result = await pool.query(
            'SELECT * FROM users WHERE username = $1',
            [username]
        );

        if (result.rows.length === 0) {
            console.log('❌ User not found:', username);
            return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
        }

        const user = result.rows[0];
        console.log('✅ User found:', { id: user.id, username: user.username, role: user.role });
        
        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            console.log('❌ Invalid password for:', username);
            return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
        }

        const tokenPayload = { 
            id: user.id, 
            username: user.username, 
            role: user.role,
            full_name: user.full_name
        };
        
        console.log('🔍 Creating token with payload:', tokenPayload);
        
        // เพิ่มเวลา token ให้ยาวขึ้น
        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '24h' });

        console.log('✅ Login successful for:', username, 'role:', user.role);

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                full_name: user.full_name
            }
        });
    } catch (err) {
        console.error('❌ Login error:', err);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดของเซิร์ฟเวอร์' });
    }
});

// Get current user info
app.get('/api/me', authenticateToken, (req, res) => {
    res.json(req.user);
});

// === ADMIN ROUTES (Users Management) ===
// Get all users
app.get('/api/users', authenticateToken, authorize(['admin']), async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, username, email, role, full_name, phone, department, created_at FROM users ORDER BY created_at DESC'
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Create user
app.post('/api/users', authenticateToken, authorize(['admin']), async (req, res) => {
    try {
        const { username, email, password, role, full_name, phone, department } = req.body;
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        const result = await pool.query(
            'INSERT INTO users (username, email, password, role, full_name, phone, department) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, username, email, role, full_name, phone, department, created_at',
            [username, email, hashedPassword, role, full_name, phone, department]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        if (err.code === '23505') {
            res.status(400).json({ error: 'Username or email already exists' });
        } else {
            res.status(500).json({ error: 'Server error' });
        }
    }
});

// Update user
app.put('/api/users/:id', authenticateToken, authorize(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { username, email, role, full_name, phone, department } = req.body;
        
        const result = await pool.query(
            'UPDATE users SET username = $1, email = $2, role = $3, full_name = $4, phone = $5, department = $6 WHERE id = $7 RETURNING id, username, email, role, full_name, phone, department',
            [username, email, role, full_name, phone, department, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete user
app.delete('/api/users/:id', authenticateToken, authorize(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query('DELETE FROM users WHERE id = $1', [id]);
        
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
// แก้ไข customers API
app.get('/api/customers', authenticateToken, authorize(['sales', 'admin']), async (req, res) => {
    try {
        console.log('🔍 Customers API called by:', req.user.username, 'role:', req.user.role);
        
        const result = await pool.query(`
            SELECT c.*, u.full_name as created_by_name 
            FROM customers c 
            LEFT JOIN users u ON c.created_by = u.id 
            ORDER BY c.created_at DESC
        `);
        
        console.log('✅ Customers data retrieved:', result.rows.length, 'records');
        
        // ถ้าไม่มีข้อมูล ให้ส่ง array ว่าง
        res.json(result.rows || []);
    } catch (err) {
        console.error('❌ Customers API error:', err);
        res.status(500).json({ error: 'ไม่สามารถโหลดข้อมูลลูกค้าได้', details: err.message });
    }
});

app.post('/api/customers', authenticateToken, authorize(['sales', 'admin']), async (req, res) => {
    try {
        console.log('🔍 Creating customer:', req.body);
        
        const { customer_name, company_name, email, phone, address, contact_person, status } = req.body;
        
        if (!customer_name) {
            return res.status(400).json({ error: 'ชื่อลูกค้าจำเป็นต้องระบุ' });
        }
        
        const result = await pool.query(`
            INSERT INTO customers (customer_name, company_name, email, phone, address, contact_person, status, created_by) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
            RETURNING *
        `, [customer_name, company_name, email, phone, address, contact_person, status || 'active', req.user.id]);
        
        console.log('✅ Customer created:', result.rows[0]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('❌ Create customer error:', err);
        res.status(500).json({ error: 'ไม่สามารถเพิ่มลูกค้าได้', details: err.message });
    }
});

// Update customer
app.put('/api/customers/:id', authenticateToken, authorize(['sales', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { customer_name, company_name, email, phone, address, contact_person, status } = req.body;
        
        const result = await pool.query(
            'UPDATE customers SET customer_name = $1, company_name = $2, email = $3, phone = $4, address = $5, contact_person = $6, status = $7 WHERE id = $8 RETURNING *',
            [customer_name, company_name, email, phone, address, contact_person, status, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete customer
app.delete('/api/customers/:id', authenticateToken, authorize(['sales', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query('DELETE FROM customers WHERE id = $1', [id]);
        
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        
        res.json({ message: 'Customer deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
// แก้ไข employees API
app.get('/api/employees', authenticateToken, authorize(['hr', 'admin']), async (req, res) => {
    try {
        console.log('🔍 Employees API called by:', req.user.username, 'role:', req.user.role);
        
        const result = await pool.query(`
            SELECT e.*, u.full_name as created_by_name 
            FROM employees e 
            LEFT JOIN users u ON e.created_by = u.id 
            ORDER BY e.created_at DESC
        `);
        
        console.log('✅ Employees data retrieved:', result.rows.length, 'records');
        
        // ถ้าไม่มีข้อมูล ให้ส่ง array ว่าง
        res.json(result.rows || []);
    } catch (err) {
        console.error('❌ Employees API error:', err);
        res.status(500).json({ error: 'ไม่สามารถโหลดข้อมูลพนักงานได้', details: err.message });
    }
});

app.post('/api/employees', authenticateToken, authorize(['hr', 'admin']), async (req, res) => {
    try {
        console.log('🔍 Creating employee:', req.body);
        
        const { employee_id, first_name, last_name, email, phone, position, department, salary, hire_date, status } = req.body;
        
        if (!employee_id || !first_name || !last_name) {
            return res.status(400).json({ error: 'รหัสพนักงาน ชื่อ และนามสกุล จำเป็นต้องระบุ' });
        }
        
        const result = await pool.query(`
            INSERT INTO employees (employee_id, first_name, last_name, email, phone, position, department, salary, hire_date, status, created_by) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
            RETURNING *
        `, [employee_id, first_name, last_name, email, phone, position, department, salary, hire_date, status || 'active', req.user.id]);
        
        console.log('✅ Employee created:', result.rows[0]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('❌ Create employee error:', err);
        
        if (err.code === '23505') {
            res.status(400).json({ error: 'รหัสพนักงานหรืออีเมลนี้มีอยู่แล้ว' });
        } else {
            res.status(500).json({ error: 'ไม่สามารถเพิ่มพนักงานได้', details: err.message });
        }
    }
});

app.put('/api/employees/:id', authenticateToken, authorize(['hr', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { employee_id, first_name, last_name, email, phone, position, department, salary, hire_date, status } = req.body;
        
        console.log('🔍 Updating employee ID:', id, 'Data:', req.body);
        
        const result = await pool.query(`
            UPDATE employees 
            SET employee_id = $1, first_name = $2, last_name = $3, email = $4, phone = $5, 
                position = $6, department = $7, salary = $8, hire_date = $9, status = $10, 
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $11 
            RETURNING *
        `, [employee_id, first_name, last_name, email, phone, position, department, salary, hire_date, status, id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'ไม่พบพนักงานที่ต้องการแก้ไข' });
        }
        
        console.log('✅ Employee updated:', result.rows[0]);
        res.json(result.rows[0]);
    } catch (err) {
        console.error('❌ Update employee error:', err);
        
        if (err.code === '23505') {
            res.status(400).json({ error: 'รหัสพนักงานหรืออีเมลนี้มีอยู่แล้ว' });
        } else {
            res.status(500).json({ error: 'ไม่สามารถแก้ไขพนักงานได้', details: err.message });
        }
    }
});

app.delete('/api/employees/:id', authenticateToken, authorize(['hr', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log('🔍 Deleting employee ID:', id);
        
        const result = await pool.query('DELETE FROM employees WHERE id = $1 RETURNING id', [id]);
        
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'ไม่พบพนักงานที่ต้องการลบ' });
        }
        
        console.log('✅ Employee deleted:', id);
        res.json({ message: 'ลบพนักงานเรียบร้อยแล้ว', id: id });
    } catch (err) {
        console.error('❌ Delete employee error:', err);
        res.status(500).json({ error: 'ไม่สามารถลบพนักงานได้', details: err.message });
    }
});
// เพิ่ม API สำหรับใส่ข้อมูลตัวอย่าง
app.post('/api/debug/seed-data', authenticateToken, authorize(['admin']), async (req, res) => {
    try {
        // เพิ่มข้อมูลลูกค้าตัวอย่าง
        await pool.query(`
            INSERT INTO customers (customer_name, company_name, email, phone, status, created_by) VALUES 
            ('นายสมชาย ใจดี', 'บริษัท ABC จำกัด', 'somchai@abc.com', '02-123-4567', 'active', 1),
            ('นางสาวสุดา เก่ง', 'บริษัท XYZ จำกัด', 'suda@xyz.com', '02-234-5678', 'active', 1),
            ('นายปรีชา รู้ดี', 'บริษัท DEF จำกัด', 'preecha@def.com', '02-345-6789', 'active', 1)
            ON CONFLICT DO NOTHING
        `);
        
        // เพิ่มข้อมูลพนักงานตัวอย่าง
        await pool.query(`
            INSERT INTO employees (employee_id, first_name, last_name, email, phone, position, department, salary, hire_date, status, created_by) VALUES 
            ('EMP001', 'สมศักดิ์', 'ใจดี', 'somsak@company.com', '081-123-4567', 'เจ้าหน้าที่ขาย', 'Sales', 25000, '2023-01-15', 'active', 1),
            ('EMP002', 'วิมล', 'ใจใส', 'wimon@company.com', '081-234-5678', 'เจ้าหน้าที่บุคคล', 'HR', 28000, '2023-02-01', 'active', 1),
            ('EMP003', 'ราชัน', 'ขยัน', 'rachan@company.com', '081-345-6789', 'นักบัญชี', 'Accounting', 30000, '2023-03-01', 'active', 1)
            ON CONFLICT DO NOTHING
        `);
        
        res.json({ message: 'เพิ่มข้อมูลตัวอย่างเรียบร้อยแล้ว' });
    } catch (err) {
        console.error('Seed data error:', err);
        res.status(500).json({ error: err.message });
    }
});
// app.listen(PORT, () => {
//     console.log(`Server running on port ${PORT}`);
// });

// ให้เหลือแค่ startServer function นี้เท่านั้น
const { initializeDatabase } = require('./init-db');

async function startServer() {
    try {
        await initializeDatabase();
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();