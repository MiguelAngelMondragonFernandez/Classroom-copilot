import React from 'react';
import { Button } from 'primereact/button';
import { Card } from 'primereact/card';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Login() {
    const { loginWithGoogle } = useAuth();
    const navigate = useNavigate();

    return (
        <div className="flex flex-column align-items-center justify-content-center min-vh-100 p-3 md:p-4 surface-ground">
            <Card className="text-center shadow-6 border-round-2xl p-4 md:p-6 w-full" style={{ maxWidth: '450px' }}>
                <div className="bg-indigo-500 text-white flex align-items-center justify-content-center border-round-circle mx-auto mb-4" style={{ width: '80px', height: '80px' }}>
                    <i className="pi pi-lock text-4xl"></i>
                </div>
                <h2 className="text-2xl md:text-3xl font-bold mb-2">Bienvenido</h2>
                <p className="text-600 mb-6 px-2 md:px-4">Accede a <span className="text-primary font-bold">Classroom Copilot</span> usando tu cuenta de Google.</p>
                <div className="flex flex-column gap-3">
                    <Button
                        label="Entrar con Google"
                        icon="pi pi-google"
                        className="p-button-rounded p-button-lg px-4 md:px-5 shadow-2 w-full"
                        onClick={loginWithGoogle}
                    />
                    <Button
                        label="Volver al Inicio"
                        icon="pi pi-home"
                        className="p-button-rounded p-button-text p-button-secondary w-full"
                        onClick={() => navigate('/')}
                    />
                </div>
                <p className="text-500 text-sm mt-6">Tu información estará segura y vinculada a tu Google Classroom.</p>
            </Card>
        </div>
    );
}
