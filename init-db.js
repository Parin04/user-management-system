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

        console.log('🎉 ติดตั้งระบบเสร็จสิ้น!');
        
    } catch (error) {
        console.error('❌ เกิดข้อผิดพลาด:', error);
        throw error;
    } finally {
        client.release();
    }
}

module.exports = { initializeDatabase };