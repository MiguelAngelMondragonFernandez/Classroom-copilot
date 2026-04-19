import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { setSessionToken } from '../services/api';
import api from '../services/api';
import Swal from 'sweetalert2';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
const GOOGLE_TOKEN_KEY = 'google_access_token';
const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [googleToken, setGoogleToken] = useState(null);

    const fetchMe = useCallback(async () => {
        try {
            const data = await api.get('/api/users/me');
            setUser(data);
            return true;
        } catch {
            setUser(null);
            return false;
        }
    }, []);

    const fetchGoogleToken = useCallback(async () => {
        const cached = sessionStorage.getItem(GOOGLE_TOKEN_KEY);
        if (cached) {
            setGoogleToken(cached);
            return cached;
        }
        try {
            const data = await api.post('/auth/refresh', {});
            const token = data?.access_token;
            if (token) {
                sessionStorage.setItem(GOOGLE_TOKEN_KEY, token);
                setGoogleToken(token);
                return token;
            }
        } catch (err) {
            console.warn('No se pudo obtener token de Google:', err);
        }
        setGoogleToken(null);
        return null;
    }, []);

    useEffect(() => {
        // Leer token desde URL (redireccionado desde /auth/google/callback)
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');
        if (token) {
            setSessionToken(token);
            window.history.replaceState({}, document.title, window.location.pathname);
        }

        const stored = localStorage.getItem('session_token');
        if (stored) {
            fetchMe().then((ok) => {
                if (ok) fetchGoogleToken();
            }).finally(() => setLoading(false));
        } else {
            setLoading(false);
        }

        const handleSessionExpired = () => {
            setUser(null);
            setGoogleToken(null);
            setSessionToken(null);
            sessionStorage.removeItem(GOOGLE_TOKEN_KEY);
            Swal.fire({
                title: 'Sesión Expirada',
                text: 'Tu sesión ha caducado. Por favor, vuelve a iniciar sesión.',
                icon: 'warning',
                confirmButtonColor: '#6366f1',
            });
        };
        window.addEventListener('auth-session-expired', handleSessionExpired);
        return () => window.removeEventListener('auth-session-expired', handleSessionExpired);
    }, [fetchMe, fetchGoogleToken]);

    const loginWithGoogle = () => {
        window.location.href = `${API_BASE}/auth/google/login`;
    };

    const logout = async () => {
        try { await api.post('/auth/logout', {}); } catch { /* ignora errores */ }
        setUser(null);
        setGoogleToken(null);
        setSessionToken(null);
        sessionStorage.removeItem(GOOGLE_TOKEN_KEY);
    };

    return (
        <AuthContext.Provider value={{ user, loading, googleToken, loginWithGoogle, logout, refreshGoogleToken: fetchGoogleToken }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
