// const { Pool } = require('pg');
// const bcrypt = require('bcrypt');
// require('dotenv').config();
// console.log('DB_PASSWORD:', process.env.DB_PASSWORD);
// // Database connection
// const pool = new Pool({
//     user: process.env.DB_USER || 'postgres',
//     host: process.env.DB_HOST || 'localhost',
//     database: process.env.DB_NAME || 'user_management',
//     password: process.env.DB_PASSWORD,   // เอา || 'password' ออก
//     port: process.env.DB_PORT || 5432,
// });


// async function setupDatabase() {
//     const client = await pool.connect();
    
//     try {
//         console.log('🔄 กำลังสร้างตารางฐานข้อมูล...');
        
//         // Create tables
//         await client.query(`
//             CREATE TABLE IF NOT EXISTS users (
//                 id SERIAL PRIMARY KEY,
//                 username VARCHAR(100) UNIQUE NOT NULL,
//                 email VARCHAR(255) UNIQUE NOT NULL,
//                 password VARCHAR(255) NOT NULL,
//                 role VARCHAR(20) CHECK (role IN ('admin', 'sales', 'hr')) NOT NULL,
//                 full_name VARCHAR(255) NOT NULL,
//                 phone VARCHAR(20),
//                 department VARCHAR(100),
//                 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//                 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//             );
//         `);

//         await client.query(`
//             CREATE TABLE IF NOT EXISTS customers (
//                 id SERIAL PRIMARY KEY,
//                 customer_name VARCHAR(255) NOT NULL,
//                 company_name VARCHAR(255),
//                 email VARCHAR(255),
//                 phone VARCHAR(20),
//                 address TEXT,
//                 contact_person VARCHAR(255),
//                 status VARCHAR(20) DEFAULT 'active',
//                 created_by INTEGER REFERENCES users(id),
//                 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//                 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//             );
//         `);

//         await client.query(`
//             CREATE TABLE IF NOT EXISTS employees (
//                 id SERIAL PRIMARY KEY,
//                 employee_id VARCHAR(20) UNIQUE NOT NULL,
//                 first_name VARCHAR(255) NOT NULL,
//                 last_name VARCHAR(255) NOT NULL,
//                 email VARCHAR(255) UNIQUE,
//                 phone VARCHAR(20),
//                 position VARCHAR(100),
//                 department VARCHAR(100),
//                 salary DECIMAL(10,2),
//                 hire_date DATE,
//                 status VARCHAR(20) DEFAULT 'active',
//                 created_by INTEGER REFERENCES users(id),
//                 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//                 updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//             );
//         `);

//         // Create trigger function
//         await client.query(`
//             CREATE OR REPLACE FUNCTION update_updated_at_column()
//             RETURNS TRIGGER AS $$
//             BEGIN
//                 NEW.updated_at = CURRENT_TIMESTAMP;
//                 RETURN NEW;
//             END;
//             $$ language 'plpgsql';
//         `);

//         // Create triggers
//         await client.query(`
//             DROP TRIGGER IF EXISTS update_users_updated_at ON users;
//             CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users 
//                 FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
//         `);

//         await client.query(`
//             DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
//             CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers 
//                 FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
//         `);

//         await client.query(`
//             DROP TRIGGER IF EXISTS update_employees_updated_at ON employees;
//             CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON employees 
//                 FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
//         `);

//         console.log('✅ สร้างตารางฐานข้อมูลสำเร็จ');

//         // Check if admin user exists
//         const adminCheck = await client.query('SELECT id FROM users WHERE username = $1', ['admin']);
        
//         if (adminCheck.rows.length === 0) {
//             console.log('🔄 กำลังสร้างผู้ใช้งานเริ่มต้น...');
            
//             // Create default users
//             const adminPassword = await bcrypt.hash('admin123', 10);
//             const salesPassword = await bcrypt.hash('sales123', 10);
//             const hrPassword = await bcrypt.hash('hr123', 10);

//             await client.query(`
//                 INSERT INTO users (username, email, password, role, full_name, department) VALUES 
//                 ('admin', 'admin@company.com', $1, 'admin', 'ผู้ดูแลระบบ', 'IT'),
//                 ('sales01', 'sales@company.com', $2, 'sales', 'พนักงานขาย', 'Sales'),
//                 ('hr01', 'hr@company.com', $3, 'hr', 'พนักงานบุคคล', 'HR')
//             `, [adminPassword, salesPassword, hrPassword]);

//             console.log('✅ สร้างผู้ใช้งานเริ่มต้นสำเร็จ');
//             console.log('📋 ข้อมูลเข้าสู่ระบบ:');
//             console.log('   Admin: admin / admin123');
//             console.log('   Sales: sales01 / sales123');
//             console.log('   HR: hr01 / hr123');
//         } else {
//             console.log('ℹ️  ผู้ใช้งานเริ่มต้นมีอยู่แล้ว');
//         }

//         // Create sample data
//         const customerCheck = await client.query('SELECT id FROM customers LIMIT 1');
//         if (customerCheck.rows.length === 0) {
//             console.log('🔄 กำลังสร้างข้อมูลตัวอย่าง...');
            
//             // Get admin user ID
//             const adminUser = await client.query('SELECT id FROM users WHERE username = $1', ['admin']);
//             const adminId = adminUser.rows[0].id;

//             // Insert sample customers
//             await client.query(`
//                 INSERT INTO customers (customer_name, company_name, email, phone, address, contact_person, created_by) VALUES 
//                 ('บริษัท ABC จำกัด', 'ABC Company Ltd.', 'contact@abc.com', '02-123-4567', '123 ถนนสุขุมวิท กรุงเทพฯ', 'คุณสมชาย', $1),
//                 ('ร้านค้าปลีก XYZ', 'XYZ Retail', 'info@xyz.com', '02-987-6543', '456 ถนนรัชดาภิเษก กรุงเทพฯ', 'คุณสมหญิง', $1)
//             `, [adminId]);

//             // Insert sample employees
//             await client.query(`
//                 INSERT INTO employees (employee_id, first_name, last_name, email, phone, position, department, salary, hire_date, created_by) VALUES 
//                 ('EMP001', 'สมชาย', 'ใจดี', 'somchai@company.com', '081-234-5678', 'นักพัฒนา', 'IT', 45000.00, '2024-01-15', $1),
//                 ('EMP002', 'สมหญิง', 'ขยัน', 'somying@company.com', '081-987-6543', 'นักการตลาด', 'Marketing', 40000.00, '2024-02-01', $1)
//             `, [adminId]);

//             console.log('✅ สร้างข้อมูลตัวอย่างสำเร็จ');
//         }

//         console.log('🎉 ติดตั้งระบบเสร็จสิ้น!');
//         console.log('🚀 เริ่มเซิร์ฟเวอร์ด้วย: npm start');
        
//     } catch (error) {
//         console.error('❌ เกิดข้อผิดพลาด:', error);
//     } finally {
//         client.release();
//         await pool.end();
//     }
// }

// // Run setup
// setupDatabase();