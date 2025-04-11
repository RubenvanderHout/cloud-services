import dotenv from "dotenv";
dotenv.config();
import express from "express";
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
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


const options = {
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'API Gateway',
        version: '1.0.0',
        description: 'Documentation for the API Gateway that routes requests to microservices',
      },
      servers: [
        {
          url: `http://${host}:${port}`,
          description: 'Development server',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          }
        }
      },
      security: [{
        bearerAuth: []
      }]
    },
    apis: ['./*.js'], // files containing annotations as above
  };
  
  const specs = swaggerJsdoc(options);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

  /**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Check API health status
 *     description: Returns the health status of the API gateway
 *     responses:
 *       200:
 *         description: API is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: OK
 */

const isAuthencitated = createAuthenicationMiddleware(authEndpointURL);

const authServiceMiddleware = createServiceMiddleware(authsUrl, "/api/auth/");
const scoresServiceMiddleware = createServiceMiddleware(scoresUrl, "/api/scores/");
const targetsServiceMiddleware = createServiceMiddleware(targetsUrl, "/api/targets/");

app.all(['/api/auth/', '/api/auth/*path'], authServiceMiddleware);
app.all(['/api/scores/', '/api/scores/*path'], isAuthencitated, scoresServiceMiddleware);
app.all(['/api/targets/', '/api/targets/*path'], isAuthencitated, targetsServiceMiddleware);

// Health check endpoint
app.get("/api/health", (_req, res) => {
    res.status(200).json({
        status: "OK",
    });
});

app.use((err, _req, res, _next) => {
    console.log(err);
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, host, () => {
    console.log(`Proxy server running on port ${port}`);
    console.log(`Auth service: ${authsUrl}`);
    console.log(`Scores service: ${scoresUrl}`);
    console.log(`Target service: ${targetsUrl}`);
    console.log(`Swagger UI available at http://${host}:${port}/api-docs`);
});
