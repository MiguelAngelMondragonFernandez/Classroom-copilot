const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');

function errorHandler(err, req, res, next) {
    if (err instanceof ApiError) {
        return res.status(err.statusCode).json({
            success: false,
            error: err.message,
            ...(err.details && { details: err.details }),
        });
    }

    logger.error({ err, url: req.url, method: req.method }, 'Error no controlado');

    res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message,
    });
}

function notFoundHandler(req, res) {
    res.status(404).json({ success: false, error: `Ruta no encontrada: ${req.method} ${req.url}` });
}

module.exports = { errorHandler, notFoundHandler };
