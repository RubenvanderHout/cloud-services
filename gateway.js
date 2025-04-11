import dotenv from "dotenv";
dotenv.config();
import express from "express";
import { createAuthenicationMiddleware, createServiceMiddleware } from "./middleware.js";

const port = process.env.PORT;
const host = process.env.HOST;
const authsUrl = process.env.URL_AUTH;
const scoresUrl = process.env.URL_SCORES;
const targetsUrl = process.env.URL_TARGETS;
const authEndpoint = process.env.ENDPOINT_AUTHENTICATE;

const authEndpointURL = authsUrl + authEndpoint;

const app = express();
app.use(express.json());

const isAuthencitated = createAuthenicationMiddleware(authEndpointURL);

const authServiceMiddleware = createServiceMiddleware(authsUrl);
const scoresServiceMiddleware = createServiceMiddleware(scoresUrl);
const targetsServiceMiddleware = createServiceMiddleware(targetsUrl);

app.all('/api/auth/*', authServiceMiddleware);
app.all('/api/scores/*', isAuthencitated, scoresServiceMiddleware);
app.all('/api/targets/*', isAuthencitated, targetsServiceMiddleware);

// Health check endpoint
app.get("/health", (_req, res) => {
    res.status(200).json({
        status: "OK",
        circuitState: breaker.stats,
    });
});

app.use((_err, _req, res, _next) => {
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, host, () => {
    console.log(`Proxy server running on port ${port}`);
    console.log(`Auth service: ${authsUrl}`);
    console.log(`Scores service: ${scoresUrl}`);
    console.log(`Target service: ${targetsUrl}`);
});
