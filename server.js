const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database connection - รองรับทั้ง Local และ Render
let pool;

if (process.env.DATABASE_URL) {
    // สำหรับ Render (Production)
    console.log('🌐 Using Render PostgreSQL (DATABASE_URL)');
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
} else {
    // สำหรับ Local Development (Docker หรือ Local PostgreSQL)
    console.log('🏠 Using Local PostgreSQL (Individual Env Vars)');
    pool = new Pool({
        user: process.env.DB_USER || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        database: process.env.DB_NAME || 'user_management',
        password: process.env.DB_PASSWORD || 'password',
        port: process.env.DB_PORT || 5432,
    });
}

// Test database connection
pool.on('connect', () => {
    console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('❌ Database connection error:', err);
});

// Initialize database on startup
async function initializeDatabase() {
    const client = await pool.connect();
    try {
        console.log('🔄 Initializing database...');
        
        // Create tables
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(20) CHECK (role IN ('admin', 'sales', 'hr')) NOT NULL,
                full_name VARCHAR(255) NOT NULL,
                phone VARCHAR(20),
                department VARCHAR(100),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS customers (
                id SERIAL PRIMARY KEY,
                customer_name VARCHAR(255) NOT NULL,
                company_name VARCHAR(255),
                email VARCHAR(255),
                phone VARCHAR(20),
                address TEXT,
                contact_person VARCHAR(255),
                status VARCHAR(20) DEFAULT 'active',
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS employees (
                id SERIAL PRIMARY KEY,
                employee_id VARCHAR(20) UNIQUE NOT NULL,
                first_name VARCHAR(255) NOT NULL,
                last_name VARCHAR(255) NOT NULL,
                email VARCHAR(255) UNIQUE,
                phone VARCHAR(20),
                position VARCHAR(100),
                department VARCHAR(100),
                salary DECIMAL(10,2),
                hire_date DATE,
                status VARCHAR(20) DEFAULT 'active',
                created_by INTEGER REFERENCES users(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Create trigger function
        await client.query(`
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ language 'plpgsql';
        `);

        // Create triggers
        const tables = ['users', 'customers', 'employees'];
        for (const table of tables) {
            await client.query(`
                DROP TRIGGER IF EXISTS update_${table}_updated_at ON ${table};
                CREATE TRIGGER update_${table}_updated_at 
                    BEFORE UPDATE ON ${table} 
                    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
            `);
        }

        console.log('✅ Database tables created/verified');

        // Check if admin user exists
        const adminCheck = await client.query('SELECT id FROM users WHERE username = $1', ['admin']);
        
        if (adminCheck.rows.length === 0) {
            console.log('🔄 Creating default users...');
            
            // Create default users
            const adminPassword = await bcrypt.hash('admin123', 10);
            const salesPassword = await bcrypt.hash('sales123', 10);
            const hrPassword = await bcrypt.hash('hr123', 10);

            await client.query(`
                INSERT INTO users (username, email, password, role, full_name, department) VALUES 
                ('admin', 'admin@company.com', $1, 'admin', 'ผู้ดูแลระบบ', 'IT'),
                ('sales01', 'sales@company.com', $2, 'sales', 'พนักงานขาย', 'Sales'),
                ('hr01', 'hr@company.com', $3, 'hr', 'พนักงานบุคคล', 'HR')
            `, [adminPassword, salesPassword, hrPassword]);

            console.log('✅ Default users created successfully');

            // Create sample data
            const adminUser = await client.query('SELECT id FROM users WHERE username = $1', ['admin']);
            const adminId = adminUser.rows[0].id;

            // Insert sample customers
            await client.query(`
                INSERT INTO customers (customer_name, company_name, email, phone, address, contact_person, created_by) VALUES 
                ('บริษัท ABC จำกัด', 'ABC Company Ltd.', 'contact@abc.com', '02-123-4567', '123 ถนนสุขุมวิท กรุงเทพฯ', 'คุณสมชาย', $1),
                ('ร้านค้าปลีก XYZ', 'XYZ Retail', 'info@xyz.com', '02-987-6543', '456 ถนนรัชดาภิเษก กรุงเทพฯ', 'คุณสมหญิง', $1)
            `, [adminId]);

            // Insert sample employees
            await client.query(`
                INSERT INTO employees (employee_id, first_name, last_name, email, phone, position, department, salary, hire_date, created_by) VALUES 
                ('EMP001', 'สมชาย', 'ใจดี', 'somchai@company.com', '081-234-5678', 'นักพัฒนา', 'IT', 45000.00, '2024-01-15', $1),
                ('EMP002', 'สมหญิง', 'ขยัน', 'somying@company.com', '081-987-6543', 'นักการตลาด', 'Marketing', 40000.00, '2024-02-01', $1)
            `, [adminId]);

            console.log('✅ Sample data created successfully');
            console.log('📋 Login credentials:');
            console.log('   🔐 Admin: admin / admin123');
            console.log('   💼 Sales: sales01 / sales123');
            console.log('   👥 HR: hr01 / hr123');
        } else {
            console.log('ℹ️ Default users already exist');
        }

        console.log('✅ Database initialization completed');
    } catch (error) {
        console.error('❌ Database initialization failed:', error);
        throw error;
    } finally {
        client.release();
    }
}

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Auth Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        req.user = user;
        next();
    });
};

// Role-based access control
const authorize = (roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
};

// Routes

// หน้าหลัก
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check
app.get('/api/health', async (req, res) => {
    try {
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();
        
        res.json({ 
            status: 'OK', 
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development',
            database: 'Connected'
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'ERROR', 
            timestamp: new Date().toISOString(),
            database: 'Disconnected',
            error: error.message
        });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }
        
        const result = await pool.query(
            'SELECT * FROM users WHERE username = $1',
            [username]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];
        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { 
                id: user.id, 
                username: user.username, 
                role: user.role,
                full_name: user.full_name
            },
            JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                full_name: user.full_name
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get current user info
app.get('/api/me', authenticateToken, (req, res) => {
    res.json(req.user);
});

// === ADMIN ROUTES (Users Management) ===
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

app.post('/api/users', authenticateToken, authorize(['admin']), async (req, res) => {
    try {
        const { username, email, password, role, full_name, phone, department } = req.body;
        
        if (!username || !email || !password || !role || !full_name) {
            return res.status(400).json({ error: 'Required fields missing' });
        }
        
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

app.put('/api/users/:id', authenticateToken, authorize(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { username, email, role, full_name, phone, department, password } = req.body;
        
        let query, values;
        
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            query = 'UPDATE users SET username = $1, email = $2, role = $3, full_name = $4, phone = $5, department = $6, password = $7 WHERE id = $8 RETURNING id, username, email, role, full_name, phone, department';
            values = [username, email, role, full_name, phone, department, hashedPassword, id];
        } else {
            query = 'UPDATE users SET username = $1, email = $2, role = $3, full_name = $4, phone = $5, department = $6 WHERE id = $7 RETURNING id, username, email, role, full_name, phone, department';
            values = [username, email, role, full_name, phone, department, id];
        }
        
        const result = await pool.query(query, values);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Update user error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

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

// === SALES ROUTES (Customers Management) ===
app.get('/api/customers', authenticateToken, authorize(['sales', 'admin']), async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT c.*, u.full_name as created_by_name FROM customers c LEFT JOIN users u ON c.created_by = u.id ORDER BY c.created_at DESC'
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Get customers error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/customers', authenticateToken, authorize(['sales', 'admin']), async (req, res) => {
    try {
        const { customer_name, company_name, email, phone, address, contact_person, status } = req.body;
        
        if (!customer_name) {
            return res.status(400).json({ error: 'Customer name is required' });
        }
        
        const result = await pool.query(
            'INSERT INTO customers (customer_name, company_name, email, phone, address, contact_person, status, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
            [customer_name, company_name, email, phone, address, contact_person, status || 'active', req.user.id]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Create customer error:', err);
        res.status(500).json({ error: 'Server error' });
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

// === HR ROUTES (Employees Management) ===
app.get('/api/employees', authenticateToken, authorize(['hr', 'admin']), async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT e.*, u.full_name as created_by_name FROM employees e LEFT JOIN users u ON e.created_by = u.id ORDER BY e.created_at DESC'
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Get employees error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.post('/api/employees', authenticateToken, authorize(['hr', 'admin']), async (req, res) => {
    try {
        const { employee_id, first_name, last_name, email, phone, position, department, salary, hire_date, status } = req.body;
        
        if (!employee_id || !first_name || !last_name) {
            return res.status(400).json({ error: 'Employee ID, first name, and last name are required' });
        }
        
        const result = await pool.query(
            'INSERT INTO employees (employee_id, first_name, last_name, email, phone, position, department, salary, hire_date, status, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *',
            [employee_id, first_name, last_name, email, phone, position, department, salary, hire_date, status || 'active', req.user.id]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Create employee error:', err);
        if (err.code === '23505') {
            res.status(400).json({ error: 'Employee ID or email already exists' });
        } else {
            res.status(500).json({ error: 'Server error' });
        }
    }
});

app.put('/api/employees/:id', authenticateToken, authorize(['hr', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { employee_id, first_name, last_name, email, phone, position, department, salary, hire_date, status } = req.body;
        
        const result = await pool.query(
            'UPDATE employees SET employee_id = $1, first_name = $2, last_name = $3, email = $4, phone = $5, position = $6, department = $7, salary = $8, hire_date = $9, status = $10 WHERE id = $11 RETURNING *',
            [employee_id, first_name, last_name, email, phone, position, department, salary, hire_date, status, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Update employee error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

app.delete('/api/employees/:id', authenticateToken, authorize(['hr', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM employees WHERE id = $1', [id]);
        
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }
        
        res.json({ message: 'Employee deleted successfully' });
    } catch (err) {
        console.error('Delete employee error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Initialize database and start server
async function startServer() {
    try {
        console.log('🚀 Starting User Management System...');
        console.log('📊 Environment Variables:');
        console.log('   DATABASE_URL:', !!process.env.DATABASE_URL);
        console.log('   DB_USER:', process.env.DB_USER || 'not set');
        console.log('   DB_HOST:', process.env.DB_HOST || 'not set');
        console.log('   NODE_ENV:', process.env.NODE_ENV || 'development');
        
        await initializeDatabase();
        
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log('🎉 ================================');
            console.log('🚀 Server started successfully!');
            console.log('📡 Port:', PORT);
            console.log('🌐 Environment:', process.env.NODE_ENV || 'development');
            console.log('🔗 URL: http://localhost:' + PORT);
            console.log('🔐 Login: admin / admin123');
            console.log('🎉 ================================');
        });

        // Graceful shutdown
        process.on('SIGTERM', () => {
            console.log('SIGTERM received, shutting down gracefully');
            server.close(() => {
                console.log('Process terminated');
                pool.end();
            });
        });
        
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

module.exports = app;