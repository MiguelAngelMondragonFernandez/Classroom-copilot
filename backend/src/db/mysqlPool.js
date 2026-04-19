const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

let pool = null;

function getPool() {
    if (!pool) {
        pool = mysql.createPool({
            host: process.env.DB_HOST,
            port: parseInt(process.env.DB_PORT || '3306'),
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            enableKeepAlive: true,
            keepAliveInitialDelay: 0,
            timezone: '+00:00',
            charset: 'utf8mb4',
        });

        logger.info('[DB] Pool MySQL singleton creado');
    }
    return pool;
}

async function closePool() {
    if (pool) {
        await pool.end();
        pool = null;
        logger.info('[DB] Pool MySQL cerrado');
    }
}

async function testConnection() {
    const conn = await getPool().getConnection();
    await conn.ping();
    conn.release();
    logger.info('[DB] Conexión MySQL verificada correctamente');
}

module.exports = { getPool, closePool, testConnection };
