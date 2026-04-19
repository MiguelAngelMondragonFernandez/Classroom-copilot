import React from 'react';
import { Menubar } from 'primereact/menubar';
import { useNavigate } from 'react-router-dom';
import { Button } from 'primereact/button';
import { Avatar } from 'primereact/avatar';
import { Dropdown } from 'primereact/dropdown';
import { useAuth } from '../../context/AuthContext';
import { useCourse } from '../../context/CourseContext';
import { navbarItems } from '../js/navbar';

export default function NavBar() {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const { courses, selectedCourse, changeCourse, loading: loadingCourses } = useCourse();

    // Transformar items de navbar.js para usar navigate en lugar de url (evitar recargas completas)
    const transformItems = (items) => {
        return items.map(item => {
            const newItem = { ...item };

            if (newItem.url) {
                const targetUrl = newItem.url;
                delete newItem.url; // Quitar url original para usar command
                newItem.command = () => navigate(targetUrl);
            }

            if (newItem.items) {
                newItem.items = transformItems(newItem.items);
            }

            return newItem;
        });
    };

    const modelLinks = transformItems(navbarItems);

    const start = (
        <div className="flex align-items-center mr-0 md:mr-6 px-1 md:px-3 cursor-pointer w-full md:w-auto" onClick={() => navigate('/')}>
            <div className="bg-primary text-white flex align-items-center justify-content-center border-round-md mr-3 shadow-2" style={{ width: '38px', height: '38px' }}>
                <i className="pi pi-sparkles text-2xl"></i>
            </div>
            <span className="font-bold text-lg md:text-xl text-900 uppercase letter-spacing-1 hidden lg:block" style={{ color: 'var(--primary-color)' }}>Classroom Copilot</span>
        </div>
    );

    const end = (
        <div className="flex align-items-center gap-2 md:gap-3 w-full md:w-auto justify-content-between md:justify-content-end flex-wrap md:flex-nowrap">
            {user ? (
                <>
                    <div className="flex align-items-center flex-1 md:flex-initial min-w-0">
                        <Dropdown
                            value={selectedCourse?.id}
                            options={courses}
                            onChange={(e) => changeCourse(e.value)}
                            optionLabel="name"
                            optionValue="id"
                            placeholder={loadingCourses ? "Cargando..." : "Curso"}
                            className="w-full md:w-14rem surface-0 border-300 border-round-lg shadow-1"
                            loading={loadingCourses}
                            filter
                            showClear={false}
                        />
                    </div>
                    <div className="flex align-items-center gap-2 min-w-0">
                        <Avatar
                            image={user.photoURL}
                            shape="circle"
                            className="bg-primary text-white"
                            label={!user.photoURL ? user.displayName?.charAt(0) : null}
                        />
                        <span className="hidden sm:block font-medium text-700">{user.displayName}</span>
                    </div>
                    <Button
                        icon="pi pi-sign-out"
                        rounded text
                        severity="danger"
                        onClick={logout}
                        tooltip="Cerrar Sesión"
                        className="hover:surface-200"
                    />
                </>
            ) : (
                <Button
                    label="Iniciar Sesión"
                    icon="pi pi-sign-in"
                    rounded
                    size="small"
                    className="p-button-outlined shadow-1"
                    onClick={() => navigate('/login')}
                />
            )}
        </div>
    );

    return (
        <div className="sticky top-0 z-5 mb-5 shadow-2 bg-white-alpha-80 backdrop-blur-md">
            <Menubar
                model={modelLinks}
                start={start}
                end={end}
                className="border-none px-2 md:px-4 py-2 bg-transparent"
            />
        </div>
    )
}
