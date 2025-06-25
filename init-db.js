const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

async function initializeDatabase() {
    const client = await pool.connect();

    try {
        console.log('🔄 กำลังสร้างตารางฐานข้อมูล...');

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

        console.log('✅ สร้างตารางฐานข้อมูลสำเร็จ');

        // Check if admin user exists
        const adminCheck = await client.query('SELECT id FROM users WHERE username = $1', ['admin']);

        if (adminCheck.rows.length === 0) {
            console.log('🔄 กำลังสร้างผู้ใช้งานเริ่มต้น...');

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

            console.log('✅ สร้างผู้ใช้งานเริ่มต้นสำเร็จ');
            console.log('📋 ข้อมูลเข้าสู่ระบบ:');
            console.log('   Admin: admin / admin123');
            console.log('   Sales: sales01 / sales123');
            console.log('   HR: hr01 / hr123');
        }

        // Create sample data สำหรับ Demo
        const customerCheck = await client.query('SELECT id FROM customers LIMIT 1');
        if (customerCheck.rows.length === 0) {
            console.log('🔄 กำลังสร้างข้อมูลตัวอย่างสำหรับ Demo...');

            // Get admin user ID
            const adminUser = await client.query('SELECT id FROM users WHERE username = $1', ['admin']);
            const adminId = adminUser.rows[0].id;

            // Insert sample customers with more realistic data
            await client.query(`
                INSERT INTO customers (customer_name, company_name, email, phone, address, contact_person, created_by) VALUES 
                ('บริษัท ABC จำกัด', 'ABC Company Ltd.', 'contact@abc-demo.com', '02-123-4567', '123 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110', 'คุณสมชาย ใจดี', $1),
                ('ร้านค้าปลีก XYZ', 'XYZ Retail Co.', 'info@xyz-demo.com', '02-987-6543', '456 ถนนรัชดาภิเษก แขวงลาดยาว เขตจตุจักร กรุงเทพฯ 10900', 'คุณสมหญิง ขยัน', $1),
                ('บริษัท เทคโนโลยี DEF', 'DEF Technology Ltd.', 'hello@def-demo.com', '02-555-1234', '789 ถนนพหลโยธิน แขวงสามเสนใน เขตพญาไท กรุงเทพฯ 10400', 'คุณประเสริฐ เก่ง', $1),
                ('ห้างหุ้นส่วน GHI', 'GHI Partnership', 'support@ghi-demo.com', '02-777-8888', '321 ถนนเพชรบุรี แขวงมักกะสัน เขตราชเทวี กรุงเทพฯ 10400', 'คุณวิมล มานะ', $1)
            `, [adminId]);

            // Insert sample employees with more realistic data
            await client.query(`
                INSERT INTO employees (employee_id, first_name, last_name, email, phone, position, department, salary, hire_date, created_by) VALUES 
                ('EMP001', 'สมชาย', 'ใจดี', 'somchai@company-demo.com', '081-234-5678', 'นักพัฒนาระบบ', 'IT', 45000.00, '2024-01-15', $1),
                ('EMP002', 'สมหญิง', 'ขยัน', 'somying@company-demo.com', '081-987-6543', 'นักการตลาดออนไลน์', 'Marketing', 38000.00, '2024-02-01', $1),
                ('EMP003', 'ประเสริฐ', 'เก่งมาก', 'prasert@company-demo.com', '081-555-7777', 'นักบัญชี', 'Finance', 42000.00, '2024-03-01', $1),
                ('EMP004', 'วิมล', 'มานะ', 'wimon@company-demo.com', '081-999-1111', 'ผู้จัดการฝ่ายบุคคล', 'HR', 55000.00, '2023-12-01', $1),
                ('EMP005', 'รัชนี', 'ทำงาน', NULL, '081-666-2222', 'ผู้ช่วยผู้จัดการ', 'Operations', NULL, NULL, $1)
            `, [adminId]);

            console.log('✅ สร้างข้อมูลตัวอย่างสำเร็จ');
            console.log('📊 ข้อมูล Demo:');
            console.log('   - ลูกค้า: 4 รายการ');
            console.log('   - พนักงาน: 5 รายการ');
            console.log('ℹ️  หมายเหตุ: ข้อมูลเหล่านี้เป็นข้อมูลตัวอย่างสำหรับการทดสอบระบบ');
        }
        // แสดงผู้ใช้งานทั้งหมด
        const allUsers = await client.query('SELECT username, email, role FROM users ORDER BY id');
        console.log('👥 ผู้ใช้งานทั้งหมด:');
        allUsers.rows.forEach(user => {
            console.log(`   - ${user.username} | ${user.email} | role: ${user.role}`);
        });

        console.log('🎉 ติดตั้งระบบเสร็จสิ้น!');
        console.log('🌐 ระบบพร้อมใช้งานเป็น Demo System');

    } catch (error) {
        console.error('❌ เกิดข้อผิดพลาด:', error);
        throw error;
    } finally {
        client.release();
    }
}

module.exports = { initializeDatabase };