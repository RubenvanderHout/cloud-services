import dotenv from "dotenv";
dotenv.config();
import CircuitBreaker from "opossum";
import fetch from "node-fetch";

const timeout = process.env.CIRCUIT_BREAKER_TIMEOUT;
const errorThresholdPercentage =
    process.env.CIRCUIT_BREAKER_ERROR_THRESHOLD_PERCENTAGE;
const resetTimeout = process.env.CIRCUIT_BREAKER_RESET_TIMEOUT;

const DEFAULT_CIRCUIT_BREAKER_OPTIONS = {
    timeout: timeout,
    errorThresholdPercentage: errorThresholdPercentage,
    resetTimeout: resetTimeout,
};

export function createServiceMiddleware(serviceBaseUrl, CIRCUIT_BREAKER_OPTIONS = {}) {
    const handler = async (req) => {
        try {
            const targetUrl = new URL(req.originalUrl, serviceBaseUrl);

            const config = {
                method: req.method,
                headers: { ...req.headers, host: undefined }, // Remove host header
                body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined
            };

            const response = await fetch(targetUrl, config);

            if (!response.ok) {
                const error = new Error(`HTTP ${response.status}`);
                error.status = response.status;
                throw error;
            }

            const contentType = response.headers.get('content-type') || '';
            const isJson = contentType.includes('application/json');

            return {
                status: response.status,
                data: isJson ? await response.json() : await response.text(),
            };
        } catch (error) {
            error.serviceUrl = serviceBaseUrl;
            throw error;
        }
    }

    const breaker = new CircuitBreaker(
        handler,
        {
            DEFAULT_CIRCUIT_BREAKER_OPTIONS,
            ...CIRCUIT_BREAKER_OPTIONS
        }
    );

    breaker.on('open', () => console.log(`Circuit OPEN for ${serviceBaseUrl}`));
    breaker.on('close', () => console.log(`Circuit CLOSED for ${serviceBaseUrl}`));
    breaker.on('halfOpen', () => console.log(`Circuit HALF-OPEN for ${serviceBaseUrl}`));
    breaker.on('failure', (error) =>
        console.log(`Failure for ${serviceBaseUrl}:`, error.message)
    );

    breaker.fallback(() => ({
        error: 'Service unavailable',
        status: 503
    }));

    return async function middleware(req, res, next) {
        try {
            const result = await breaker.fire(req);

            res.status(result.status);
            if (result.data !== undefined) {
                return res.send(result.data);
            }
            res.end();

        } catch (error) {
            if (error.code === 'ETIMEDOUT' || error.code === 'ECIRCUITOPEN') {
                return res.status(503).json({
                    error: 'Service temporarily unavailable',
                    service: serviceBaseUrl
                });
            }

            if (error.status) {
                return res.status(error.status).json({
                    error: error.message,
                    service: serviceBaseUrl
                });
            }

            // Unknown errors
            next(error);
        }
    };
}
export function createAuthenicationMiddleware(authServiceUrl, CIRCUIT_BREAKER_OPTIONS = {}) {
    const handler = async (token) => {
        try {
            const config = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            };

            const response = await fetch(authServiceUrl, config);

            if (!response.ok) {
                const error = new Error(`HTTP ${response.status}`);
                error.status = response.status;
                throw error;
            }

            const contentType = response.headers.get('content-type') || '';
            const isJson = contentType.includes('application/json');

            return {
                status: response.status,
                data: isJson ? await response.json() : await response.text(),
            };
        } catch (error) {
            error.serviceUrl = serviceBaseUrl;
            throw error;
        }
    }

    const breaker = new CircuitBreaker(
        handler,
        {
            DEFAULT_CIRCUIT_BREAKER_OPTIONS,
            ...CIRCUIT_BREAKER_OPTIONS
        }
    );


    return async function middleware(req, res, next) {
        try {
            // Split the word Bearer and the token itself
            const token = req.headers.authorization?.split(' ')[1];
            if (!token) return res.status(401).json({ error: 'Missing token' });

            const result = await breaker.fire(token);

            res.status(result.status);
            if (result.data !== undefined) {
                return res.send(result.data);
            }
            res.end();

        } catch (error) {
            if (error.code === 'ETIMEDOUT' || error.code === 'ECIRCUITOPEN') {
                return res.status(503).json({
                    error: 'AUTH Service temporarily unavailable',
                    service: authServiceUrl
                });
            }

            if (error.status) {
                return res.status(error.status).json({
                    error: error.message,
                    service: authServiceUrl
                });
            }

            // Unknown errors
            next(error);
        }
    };
}