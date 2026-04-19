import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { callGasApi } from '../services/gasApi';

const CourseContext = createContext();

export const CourseProvider = ({ children }) => {
    const { user } = useAuth();
    const [courses, setCourses] = useState([]);
    const [selectedCourse, setSelectedCourse] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchCourses = async () => {
            if (!user) {
                setCourses([]);
                setSelectedCourse(null);
                return;
            }

            setLoading(true);
            try {
                const data = await callGasApi('getCourses', {});
                console.log("[CourseContext] Cursos recibidos:", data);

                if (data && Array.isArray(data)) {
                    setCourses(data);

                    // Recuperar curso seleccionado de localStorage si existe
                    const savedCourseId = localStorage.getItem('selectedCourseId');
                    if (savedCourseId) {
                        const found = data.find(c => c.id === savedCourseId);
                        if (found) {
                            setSelectedCourse(found);
                        } else if (data.length > 0) {
                            setSelectedCourse(data[0]);
                        }
                    } else if (data.length > 0) {
                        setSelectedCourse(data[0]);
                    }
                } else {
                    console.warn("[CourseContext] La API no devolvió un arreglo de cursos:", data);
                    setCourses([]);
                }
            } catch (err) {
                console.error("Error fetching courses:", err);
                setError(err.message);
                setCourses([]); // Asegurar que sea un arreglo vacío en caso de error
            } finally {
                setLoading(false);
            }
        };

        fetchCourses();
    }, [user]);

    const changeCourse = (courseId) => {
        const course = courses.find(c => c.id === courseId);
        if (course) {
            setSelectedCourse(course);
            localStorage.setItem('selectedCourseId', courseId);
        }
    };

    return (
        <CourseContext.Provider value={{
            courses,
            selectedCourse,
            loading,
            error,
            changeCourse
        }}>
            {children}
        </CourseContext.Provider>
    );
};

export const useCourse = () => useContext(CourseContext);
