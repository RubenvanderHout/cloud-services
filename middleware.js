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
    async function circuitBreakerLogic(path, config) {
        const targetUrl = new URL(path, serviceBaseUrl)
        const response = await fetch(targetUrl,
            config
        );
        const json = await response.json();

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return json;
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

    function callback(req, res, next) {
        const config = {
            method: req.method,
            headers: req.headers,
            body: JSON.stringify(req.body),
        };

        try {
            breaker.fire(req.originalUrl, config)
                .then((value) => res.json("done").send())
                .catch((reason) => console.log("problem"));
        } catch (error) {

            console.log("Catchhhhh")

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
        return await response.json();
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