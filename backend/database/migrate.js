require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function runMigrations() {
    console.log('Conectando a MySQL...');
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT || '3306'),
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        multipleStatements: true,
    });

    console.log('Conexión establecida. Ejecutando migraciones...\n');

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();

    for (const file of files) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        console.log(`Aplicando: ${file}`);
        await conn.query(sql);
        console.log(`  ✓ ${file} ejecutado correctamente`);
    }

    await conn.end();
    console.log('\nMigraciones completadas exitosamente.');
}

runMigrations().catch(err => {
    console.error('Error en migración:', err.message);
    process.exit(1);
});
