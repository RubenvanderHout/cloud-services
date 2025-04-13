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

            let headers = { ...req.headers, host: undefined, };

            if(req?.user?.data) {
                headers = {
                    ...headers,
                    'x-user': JSON.stringify(req.user.data)
                }
            }

            const config = {
                method: req.method,
                headers: headers, // Remove host header
                body: req.method === 'GET' || req.method === 'HEAD' ? undefined : req,
            };

            const response = await fetch(targetUrl, config);

            if (!response.ok) {
                const error = new Error(`HTTP ${response.status}`);
                error.status = response.status;
                error.statusText = response.statusText;
                error.targetUrl = targetUrl;
                throw error;
            }

            const contentType = response.headers.get('content-type') || '';
            const isJson = contentType.includes('application/json');

            return {
                status: response.status,
                data: isJson ? await response.json() : await response.text(),
            };
        } catch (error) {
            console.log(error);
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
        console.log(`Failure for ${error.targetUrl}: statuscode: ${error.status}, message: ${error.statusText} `)
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
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ authorization: token })
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
            error.serviceUrl = authServiceUrl;
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
    breaker.on('open', () => console.log(`Circuit OPEN for ${authServiceUrl}`));
    breaker.on('close', () => console.log(`Circuit CLOSED for ${authServiceUrl}`));
    breaker.on('halfOpen', () => console.log(`Circuit HALF-OPEN for ${authServiceUrl}`));
    breaker.on('failure', (error) =>
        console.log(`Failure for ${authServiceUrl}:`, error.message)
    );

    breaker.fallback(() => ({
        error: 'Service unavailable',
        status: 503
    }));

    return async function middleware(req, res, next) {
        try {
            // Split the word Bearer and the token itself
            const token = req.headers.authorization?.split(' ')[1];
            if (!token) return res.status(401).json({ error: 'Missing token' });
            const userData = await breaker.fire(token);
            // Attach user data to request
            req.user = userData;
            next();
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