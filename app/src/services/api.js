/**
 * Cliente HTTP base para el backend Express propio.
 * Reemplaza a gasApi.js y geminiApi.js.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

async function request(path, options = {}) {
    const url = `${API_BASE}${path}`;
    const token = getSessionToken();

    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
    };

    const response = await fetch(url, { ...options, headers, credentials: 'include' });

    if (response.status === 401) {
        window.dispatchEvent(new CustomEvent('auth-session-expired'));
        throw new Error('Sesión expirada');
    }

    const text = await response.text();
    const contentType = response.headers.get('content-type') || '';

    let data = {};
    if (text) {
        if (contentType.includes('application/json')) {
            try {
                data = JSON.parse(text);
            } catch (parseErr) {
                throw new Error(`Error ${response.status}: La respuesta JSON del servidor es inválida.`);
            }
        } else {
            data = { success: response.ok, error: text };
        }
    }

    if (!response.ok || !data.success) {
        const errMsg = typeof data.error === 'string'
            ? data.error
            : (data.error?.message || (text || JSON.stringify(data.error || 'Error desconocido')));
        throw new Error(errMsg);
    }

    return data.data;
}

function getSessionToken() {
    return localStorage.getItem('session_token');
}

export function setSessionToken(token) {
    if (token) localStorage.setItem('session_token', token);
    else localStorage.removeItem('session_token');
}

export function get(path, params = {}) {
    const query = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '';
    return request(`${path}${query}`);
}

export function post(path, body) {
    return request(path, { method: 'POST', body: JSON.stringify(body) });
}

export function patch(path, body) {
    return request(path, { method: 'PATCH', body: JSON.stringify(body) });
}

export function del(path) {
    return request(path, { method: 'DELETE' });
}

export default { get, post, patch, del };
