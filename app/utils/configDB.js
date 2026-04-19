// En Vite, las variables ya se cargan automáticamente desde el .env
// No es necesario importar ni configurar dotenv manualmente

export const configDB = {
    VITE_DB_URL: import.meta.env.VITE_DB_URL,
    VITE_API_DB: import.meta.env.VITE_API_DB
}