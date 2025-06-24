
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

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
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
        console.error(err);
        res.status(500).json({ error: 'Server error' });
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

// === SALES ROUTES (Customers Management) ===
// Get all customers
app.get('/api/customers', authenticateToken, authorize(['sales', 'admin']), async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT c.*, u.full_name as created_by_name FROM customers c LEFT JOIN users u ON c.created_by = u.id ORDER BY c.created_at DESC'
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Create customer
app.post('/api/customers', authenticateToken, authorize(['sales', 'admin']), async (req, res) => {
    try {
        const { customer_name, company_name, email, phone, address, contact_person, status } = req.body;
        
        const result = await pool.query(
            'INSERT INTO customers (customer_name, company_name, email, phone, address, contact_person, status, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
            [customer_name, company_name, email, phone, address, contact_person, status || 'active', req.user.id]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
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

// === HR ROUTES (Employees Management) ===
// Get all employees
app.get('/api/employees', authenticateToken, authorize(['hr', 'admin']), async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT e.*, u.full_name as created_by_name FROM employees e LEFT JOIN users u ON e.created_by = u.id ORDER BY e.created_at DESC'
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Create employee
app.post('/api/employees', authenticateToken, authorize(['hr', 'admin']), async (req, res) => {
    try {
        const { employee_id, first_name, last_name, email, phone, position, department, salary, hire_date, status } = req.body;
        
        const result = await pool.query(
            'INSERT INTO employees (employee_id, first_name, last_name, email, phone, position, department, salary, hire_date, status, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *',
            [employee_id, first_name, last_name, email, phone, position, department, salary, hire_date, status || 'active', req.user.id]
        );
        
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        if (err.code === '23505') {
            res.status(400).json({ error: 'Employee ID or email already exists' });
        } else {
            res.status(500).json({ error: 'Server error' });
        }
    }
});

// Update employee
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
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete employee
app.delete('/api/employees/:id', authenticateToken, authorize(['hr', 'admin']), async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query('DELETE FROM employees WHERE id = $1', [id]);
        
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }
        
        res.json({ message: 'Employee deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
// เพิ่มที่ท้ายไฟล์ server.js ก่อน app.listen()

const { initializeDatabase } = require('./init-db');

// Initialize database and start server
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

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});