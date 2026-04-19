import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setSessionToken } from '../../services/api';
import { ProgressSpinner } from 'primereact/progressspinner';

export default function AuthSuccess() {
    const navigate = useNavigate();

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token');
        const accessToken = params.get('access_token');
        if (token) {
            setSessionToken(token);
            if (accessToken) {
                sessionStorage.setItem('google_access_token', accessToken);
            }
            window.history.replaceState({}, document.title, '/auth/success');
        }
        navigate('/', { replace: true });
    }, [navigate]);

    return (
        <div className="flex justify-content-center align-items-center min-h-screen">
            <ProgressSpinner />
        </div>
    );
}
