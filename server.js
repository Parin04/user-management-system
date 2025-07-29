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

// เพิ่ม logging สำหรับ debug
console.log('🔍 Environment check:');
console.log('- NODE_ENV:', process.env.NODE_ENV);
console.log('- DATABASE_URL exists:', !!process.env.DATABASE_URL);
console.log('- DB_HOST:', process.env.DB_HOST);
console.log('- DB_NAME:', process.env.DB_NAME);
console.log('- DB_USER:', process.env.DB_USER);

// Database connection - แก้ไขการเชื่อมต่อ
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false
});

// ทดสอบการเชื่อมต่อฐานข้อมูล
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Database connection error:', err.message);
  } else {
    console.log('✅ Database connected successfully');
    release();
  }
});

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'my-super-secret-jwt-key-2024';

// เพิ่ม function สำหรับสร้างตารางและข้อมูลเริ่มต้น
async function initializeDatabase() {
  try {
    console.log('🔍 Initializing database...');
    
    // สร้างตาราง users
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'user',
        full_name VARCHAR(100),
        phone VARCHAR(20),
        department VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // สร้างตาราง customers
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        customer_name VARCHAR(100) NOT NULL,
        company_name VARCHAR(100),
        email VARCHAR(100),
        phone VARCHAR(20),
        address TEXT,
        contact_person VARCHAR(100),
        status VARCHAR(20) DEFAULT 'active',
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // สร้างตาราง employees
    await pool.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        employee_id VARCHAR(20) UNIQUE NOT NULL,
        first_name VARCHAR(50) NOT NULL,
        last_name VARCHAR(50) NOT NULL,
        email VARCHAR(100) UNIQUE,
        phone VARCHAR(20),
        position VARCHAR(100),
        department VARCHAR(50),
        salary DECIMAL(10,2),
        hire_date DATE,
        status VARCHAR(20) DEFAULT 'active',
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // ตรวจสอบว่ามี admin user หรือไม่
    const adminCheck = await pool.query('SELECT * FROM users WHERE username = $1', ['admin']);
    
    if (adminCheck.rows.length === 0) {
      console.log('🔍 Creating default admin user...');
      
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await pool.query(`
        INSERT INTO users (username, email, password, role, full_name, department) 
        VALUES ('admin', 'admin@company.com', $1, 'admin', 'System Administrator', 'IT')
      `, [hashedPassword]);
      
      console.log('✅ Default admin user created (username: admin, password: admin123)');
    }
    
    // สร้างผู้ใช้งานตัวอย่าง
    const salesCheck = await pool.query('SELECT * FROM users WHERE username = $1', ['sales01']);
    const hrCheck = await pool.query('SELECT * FROM users WHERE username = $1', ['hr01']);
    
    if (salesCheck.rows.length === 0) {
      const salesPassword = await bcrypt.hash('sales123', 10);
      await pool.query(`
        INSERT INTO users (username, email, password, role, full_name, department) 
        VALUES ('sales01', 'sales@company.com', $1, 'sales', 'พนักงานขาย', 'Sales')
      `, [salesPassword]);
      console.log('✅ Sales user created (username: sales01, password: sales123)');
    }
    
    if (hrCheck.rows.length === 0) {
      const hrPassword = await bcrypt.hash('hr123', 10);
      await pool.query(`
        INSERT INTO users (username, email, password, role, full_name, department) 
        VALUES ('hr01', 'hr@company.com', $1, 'hr', 'พนักงานบุคคล', 'HR')
      `, [hrPassword]);
      console.log('✅ HR user created (username: hr01, password: hr123)');
    }
    
    console.log('✅ Database initialization completed');
    
  } catch (err) {
    console.error('❌ Database initialization error:', err);
    throw err;
  }
}

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

const authorize = (roles) => {
    return (req, res, next) => {
        console.log('🔍 Authorization check:');
        console.log('- User role:', req.user.role);
        console.log('- Required roles:', roles);
        
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

// เพิ่ม API สำหรับตรวจสอบสถานะระบบ
app.get('/api/health', async (req, res) => {
    try {
        const dbTest = await pool.query('SELECT NOW()');
        res.json({
            status: 'OK',
            timestamp: new Date().toISOString(),
            database: 'Connected',
            dbTime: dbTest.rows[0].now
        });
    } catch (err) {
        console.error('Health check error:', err);
        res.status(500).json({
            status: 'ERROR',
            timestamp: new Date().toISOString(),
            database: 'Disconnected',
            error: err.message
        });
    }
});

// Login - เพิ่ม error handling ที่ดีขึ้น
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        console.log('🔍 Login attempt:', username);
        
        // ตรวจสอบ input
        if (!username || !password) {
            return res.status(400).json({ error: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน' });
        }
        
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
        res.status(500).json({ 
            error: 'เกิดข้อผิดพลาดของเซิร์ฟเวอร์',
            details: process.env.NODE_ENV === 'development' ? err.message : undefined
        });
    }
});

// Get current user info
app.get('/api/me', authenticateToken, (req, res) => {
    res.json(req.user);
});

// Get all users
app.get('/api/users', authenticateToken, authorize(['admin']), async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, username, email, role, full_name, phone, department, created_at FROM users ORDER BY created_at DESC'
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Get users error:', err);
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
        console.error('Create user error:', err);
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
        console.error('Update user error:', err);
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
        console.error('Delete user error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Customers API
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
        res.json(result.rows || []);
    } catch (err) {
        console.error('❌ Customers API error:', err);
        res.status(500).json({ error: 'ไม่สามารถโหลดข้อมูลลูกค้าได้', details: err.message });
    }
});

app.post('/api/customers', authenticateToken, authorize(['sales', 'admin']), async (req, res) => {
    try {
        const { customer_name, company_name, email, phone, address, contact_person, status } = req.body;
        
        if (!customer_name) {
            return res.status(400).json({ error: 'ชื่อลูกค้าจำเป็นต้องระบุ' });
        }
        
        const result = await pool.query(`
            INSERT INTO customers (customer_name, company_name, email, phone, address, contact_person, status, created_by) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
            RETURNING *
        `, [customer_name, company_name, email, phone, address, contact_person, status || 'active', req.user.id]);
        
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('❌ Create customer error:', err);
        res.status(500).json({ error: 'ไม่สามารถเพิ่มลูกค้าได้', details: err.message });
    }
});

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
        console.error('Update customer error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.delete('/api/customers/:id', authenticateToken, authorize(['sales', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query('DELETE FROM customers WHERE id = $1', [id]);
        
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Customer not found' });
        }
        
        res.json({ message: 'Customer deleted successfully' });
    } catch (err) {
        console.error('Delete customer error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Employees API
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
        res.json(result.rows || []);
    } catch (err) {
        console.error('❌ Employees API error:', err);
        res.status(500).json({ error: 'ไม่สามารถโหลดข้อมูลพนักงานได้', details: err.message });
    }
});

app.post('/api/employees', authenticateToken, authorize(['hr', 'admin']), async (req, res) => {
    try {
        const { employee_id, first_name, last_name, email, phone, position, department, salary, hire_date, status } = req.body;
        
        if (!employee_id || !first_name || !last_name) {
            return res.status(400).json({ error: 'รหัสพนักงาน ชื่อ และนามสกุล จำเป็นต้องระบุ' });
        }
        
        const result = await pool.query(`
            INSERT INTO employees (employee_id, first_name, last_name, email, phone, position, department, salary, hire_date, status, created_by) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
            RETURNING *
        `, [employee_id, first_name, last_name, email, phone, position, department, salary, hire_date, status || 'active', req.user.id]);
        
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
        
        const result = await pool.query('DELETE FROM employees WHERE id = $1 RETURNING id', [id]);
        
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'ไม่พบพนักงานที่ต้องการลบ' });
        }
        
        res.json({ message: 'ลบพนักงานเรียบร้อยแล้ว', id: id });
    } catch (err) {
        console.error('❌ Delete employee error:', err);
        res.status(500).json({ error: 'ไม่สามารถลบพนักงานได้', details: err.message });
    }
});

// เริ่มต้นเซิร์ฟเวอร์
async function startServer() {
    try {
        await initializeDatabase();
        app.listen(PORT, () => {
            console.log(`✅ Server running on port ${PORT}`);
            console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();