import dotenv from "dotenv";
dotenv.config();
import express from "express";
import { generateSwaggerSpec } from './api-docs.js';
import swaggerUi from 'swagger-ui-express';

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


const swaggerSpec = generateSwaggerSpec(`http://${host}:${port}`);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const isAuthencitated = createAuthenicationMiddleware(authEndpointURL);

const authServiceMiddleware = createServiceMiddleware(authsUrl);
const scoresServiceMiddleware = createServiceMiddleware(scoresUrl);
const targetsServiceMiddleware = createServiceMiddleware(targetsUrl);

app.all(['/api/auth/', '/api/auth/*path'], authServiceMiddleware);
app.all(['/api/scores/', '/api/scores/*path'], isAuthencitated, scoresServiceMiddleware);
app.all(['/api/targets/', '/api/targets/*path'], isAuthencitated, targetsServiceMiddleware);

// Health check endpoint
app.get("/api/health", (_req, res) => {
    res.status(200).json({
        status: "OK",
    });
});

app.use((error, _req, res, _next) => {
    console.error('Global error handler:', error);
    res.status(500).json({ error: 'Internal server error' });
});
app.listen(port, host, () => {
    console.log(`Proxy server running on port ${port}`);
    console.log(`Auth service: ${authsUrl}`);
    console.log(`Scores service: ${scoresUrl}`);
    console.log(`Target service: ${targetsUrl}`);
    console.log(`Swagger UI available at http://${host}:${port}/api-docs`);
});
