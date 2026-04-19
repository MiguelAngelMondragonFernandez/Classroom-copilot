const { getPool } = require('../../db/mysqlPool');
const { encrypt, decrypt } = require('../../utils/crypto');

async function upsertUser({ googleId, email, displayName, photoUrl, refreshToken }) {
    const pool = getPool();
    const encryptedToken = encrypt(refreshToken);
    const [rows] = await pool.execute(
        `INSERT INTO perfiles (google_id, email, nombre_completo, photo_url, refresh_token)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           nombre_completo = VALUES(nombre_completo),
           photo_url = VALUES(photo_url),
           refresh_token = VALUES(refresh_token),
           updated_at = NOW()`,
        [googleId, email, displayName, photoUrl, encryptedToken]
    );
    return findByGoogleId(googleId);
}

async function findByGoogleId(googleId) {
    const pool = getPool();
    const [rows] = await pool.execute(
        'SELECT * FROM perfiles WHERE google_id = ? LIMIT 1',
        [googleId]
    );
    if (!rows.length) return null;
    const user = rows[0];
    user.refresh_token = decrypt(user.refresh_token);
    return user;
}

async function findById(id) {
    const pool = getPool();
    const [rows] = await pool.execute(
        'SELECT * FROM perfiles WHERE id = ? LIMIT 1',
        [id]
    );
    if (!rows.length) return null;
    const user = rows[0];
    user.refresh_token = decrypt(user.refresh_token);
    return user;
}

async function updateRefreshToken(id, refreshToken) {
    const pool = getPool();
    await pool.execute(
        'UPDATE perfiles SET refresh_token = ?, updated_at = NOW() WHERE id = ?',
        [encrypt(refreshToken), id]
    );
}

module.exports = { upsertUser, findByGoogleId, findById, updateRefreshToken };
