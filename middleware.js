import dotenv from "dotenv";
dotenv.config();
import CircuitBreaker from "opossum";
import fetch from "node-fetch";

const timeout = process.env.CIRCUIT_BREAKER_TIMEOUT;
const errorThresholdPercentage =
    process.env.CIRCUIT_BREAKER_ERROR_THRESHOLD_PERCENTAGE;
const resetTimeout = process.env.CIRCUIT_BREAKER_RESET_TIMEOUT;

const CIRCUIT_BREAKER_OPTIONS = {
    timeout: timeout,
    errorThresholdPercentage: errorThresholdPercentage,
    resetTimeout: resetTimeout,
};

export function createServiceMiddleware(serviceBaseUrl) {
    function circuitBreakerLogic(path, config) {
        const targetUrl = new URL(path, serviceBaseUrl)
        // console.log(targetUrl)
        // console.log(config);
        const response = await fetch(targetUrl,
            config
        );
        console.log(response.text());
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response;
    }

    const breaker = new CircuitBreaker(
        circuitBreakerLogic,
        CIRCUIT_BREAKER_OPTIONS
    );

    breaker.on('open', () => console.log(`Circuit OPEN for ${serviceBaseUrl}`));
    breaker.on('close', () => console.log(`Circuit CLOSED for ${serviceBaseUrl}`));
    breaker.on('halfOpen', () => console.log(`Circuit HALF-OPEN for ${serviceBaseUrl}`));
    breaker.on("failure", (error) =>
        console.log(`Circuit breaker FAILURE for: ${serviceBaseUrl} ERROR: ${error.message}`)
    );

    async function callback(req, res, next) {
        const config = {
            method: req.method,
            headers: req.headers,
            body: JSON.stringify(req.body),
        };

        try {
            const data = await breaker.fire(req.originalUrl, config)
            res.json(data).send();
        } catch (error) {
            if (breaker.opened) {
                console.log(error);
                return res.status(503).json({
                    error: "Service Unavailable",
                });
            } else {
                next(error);
            }
        }
    }

    return callback;
}

export function createAuthenicationMiddleware(authServiceUrl) {
    async function circuitBreakerLogic(token) {
        const response = await fetch(authServiceUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
        });

        if (!response.ok) throw new Error('Invalid token');
        return response.json();
    }

    const breaker = new CircuitBreaker(
        circuitBreakerLogic,
        CIRCUIT_BREAKER_OPTIONS
    );

    async function callback(req, res, next){
        try {
            // Split the word Bearer and the token itself
            const token = req.headers.authorization?.split(' ')[1];
            if (!token) return res.status(401).json({ error: 'Missing token' });

            const userData = await breaker.fire(token);

            // Attach user data to request
            req.user = userData;
            next();
        } catch (error) {
            if (breaker.opened) {
                return res.status(503).json({ error: 'Auth service unavailable' });
            }
            res.status(401).json({ error: 'Invalid token' });
        }
    }

    return callback;
}