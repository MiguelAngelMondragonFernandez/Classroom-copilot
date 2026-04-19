const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const pinoHttp = require('pino-http');
const logger = require('./utils/logger');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');

// Rutas de módulos
const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const coursesRoutes = require('./modules/courses/courses.routes');
const planningRoutes = require('./modules/planning/planning.routes');
const materialsRoutes = require('./modules/materials/materials.routes');
const evaluationsRoutes = require('./modules/evaluations/evaluations.routes');
const aiRoutes = require('./modules/ai/ai.routes');

const app = express();

// Seguridad
app.use(helmet());
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

// Rate limiting global
app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Demasiadas peticiones. Intenta más tarde.' },
}));

// Rate limit estricto para IA
app.use('/api/ai', rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: { success: false, error: 'Límite de consultas AI alcanzado. Espera 1 minuto.' },
}));

// Logging y parsing
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Rutas API
app.use('/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/courses', coursesRoutes);
app.use('/api/planning', planningRoutes);
app.use('/api/materials', materialsRoutes);
app.use('/api/evaluations', evaluationsRoutes);
app.use('/api/ai', aiRoutes);

// Manejo de errores
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
