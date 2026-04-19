const { getPool } = require('../../db/mysqlPool');

async function getProfile(userId) {
    const [rows] = await getPool().execute(
        'SELECT id, google_id, email, nombre_completo, photo_url, token_balance, total_consumed, created_at, updated_at FROM perfiles WHERE id = ?',
        [userId]
    );
    return rows[0] || null;
}

async function updateProfile(userId, { nombre_completo }) {
    await getPool().execute(
        'UPDATE perfiles SET nombre_completo = ?, updated_at = NOW() WHERE id = ?',
        [nombre_completo, userId]
    );
    return getProfile(userId);
}

async function getTokenBalance(userId) {
    const [rows] = await getPool().execute(
        'SELECT token_balance, total_consumed FROM perfiles WHERE id = ?',
        [userId]
    );
    return rows[0] || { token_balance: 0, total_consumed: 0 };
}

async function deductTokens(userId, tokensUsed) {
    await getPool().execute(
        'UPDATE perfiles SET token_balance = GREATEST(0, token_balance - ?), total_consumed = total_consumed + ?, updated_at = NOW() WHERE id = ?',
        [tokensUsed, tokensUsed, userId]
    );
}

module.exports = { getProfile, updateProfile, getTokenBalance, deductTokens };
