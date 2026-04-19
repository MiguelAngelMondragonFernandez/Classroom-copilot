require('dotenv').config();
const { loadEnv } = require('./src/config/env');
const logger = require('./src/utils/logger');
const { testConnection, closePool } = require('./src/db/mysqlPool');

async function bootstrap() {
    try {
        // Validar variables de entorno
        const env = loadEnv();
        logger.info(`Entorno: ${env.NODE_ENV}`);

        // Verificar conexión MySQL
        await testConnection();

        // Arrancar servidor
        const app = require('./src/app');
        const port = parseInt(env.PORT, 10);

        const server = app.listen(port, () => {
            logger.info(`Servidor escuchando en http://localhost:${port}`);
        });

        // Shutdown limpio
        const shutdown = async (signal) => {
            logger.info(`${signal} recibido, cerrando servidor...`);
            server.close(async () => {
                await closePool();
                logger.info('Servidor cerrado limpiamente');
                process.exit(0);
            });
            setTimeout(() => { logger.error('Forzando cierre'); process.exit(1); }, 10000);
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));

    } catch (err) {
        logger.error({ err }, 'Error fatal al iniciar el servidor');
        process.exit(1);
    }
}

bootstrap();
