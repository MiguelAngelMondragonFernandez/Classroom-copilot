import { createClient } from '@supabase/supabase-js'
import { getAuth } from "firebase/auth";

const supabaseUrl = import.meta.env.VITE_DB_URL
const supabaseAnonKey = import.meta.env.VITE_API_DB

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('⚠️ Supabase URL o Anon Key no configurados. Verifica el archivo .env')
}

// Inicializamos el cliente con la función de recuperación de token de Firebase
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
        fetch: async (url, options = {}) => {
            const auth = getAuth();
            const user = auth.currentUser;

            // Creamos una instancia de Headers a partir de lo que Supabase ya preparó
            const headers = new Headers(options.headers || {});

            /* 
            // Si hay usuario en Firebase, inyectamos su token de identidad
            // NOTA: Se comenta porque causa 401 si Supabase no tiene el JWT Secret de Firebase.
            if (user) {
                try {
                    const token = await user.getIdToken();
                    headers.set('Authorization', `Bearer ${token}`);
                } catch (e) {
                    console.error("Error al obtener ID Token de Firebase:", e);
                }
            }
            */

            // ASEGURAR que el apikey esté presente. Supabase lo espera siempre.
            if (!headers.has('apikey')) {
                headers.set('apikey', supabaseAnonKey);
            }

            // Devolvemos los headers al objeto de opciones
            options.headers = Object.fromEntries(headers.entries());

            return fetch(url, options);
        },
    },
});
