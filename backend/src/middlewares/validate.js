const ApiError = require('../utils/ApiError');

function validate(schema) {
    return (req, res, next) => {
        const result = schema.safeParse({
            body: req.body,
            query: req.query,
            params: req.params,
        });
        if (!result.success) {
            const details = result.error.issues.map(i => ({ field: i.path.join('.'), message: i.message }));
            return next(ApiError.badRequest('Datos de entrada inválidos', details));
        }
        req.validated = result.data;
        next();
    };
}

module.exports = { validate };
