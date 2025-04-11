import swaggerJsdoc from 'swagger-jsdoc';

/**
 * @type {swaggerJsdoc.Options}
 */
const swaggerOptions = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Competition API Gateway',
            version: '1.0.0',
            description: 'API for managing competitions, targets, and scores',
            contact: {
                name: 'API Support',
                email: 'support@example.com'
            }
        },
        servers: [
            {
                url: 'http://localhost:3000', // Will be replaced with actual host/port
                description: 'Development server'
            }
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT'
                }
            },
            schemas: {
                // Reusable schemas
                Target: {
                    type: 'object',
                    required: ['competition_id', 'city', 'user_email'],
                    properties: {
                        competition_id: {
                            type: 'string',
                            format: 'uuid',
                            example: '550e8400-e29b-41d4-a716-446655440000'
                        },
                        city: {
                            type: 'string',
                            example: 'New York'
                        },
                        user_email: {
                            type: 'string',
                            format: 'email',
                            example: 'user@example.com'
                        },
                        picture_id: {
                            type: 'string',
                            example: 'target.jpg'
                        },
                        picture_url: {
                            type: 'string',
                            format: 'url',
                            example: 'https://storage.example.com/target.jpg'
                        },
                        picture_hash: {
                            type: 'string',
                            example: 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e'
                        },
                        start_timestamp: {
                            type: 'integer',
                            example: 1712345678
                        },
                        end_timestamp: {
                            type: 'integer',
                            example: 1712432078
                        },
                        is_finished: {
                            type: 'boolean',
                            example: false
                        }
                    }
                },
                Submission: {
                    type: 'object',
                    properties: {
                        competition_id: {
                            type: 'string',
                            format: 'uuid'
                        },
                        submission_time: {
                            type: 'integer'
                        },
                        user_email: {
                            type: 'string',
                            format: 'email'
                        },
                        target_image_url: {
                            type: 'string',
                            format: 'url'
                        },
                        submission_image_url: {
                            type: 'string',
                            format: 'url'
                        }
                    }
                },
                Score: {
                    type: 'object',
                    properties: {
                        competition_id: {
                            type: 'string',
                            format: 'uuid'
                        },
                        user_email: {
                            type: 'string',
                            format: 'email'
                        },
                        score: {
                            type: 'number',
                            example: 95.5
                        },
                        timestamp: {
                            type: 'integer',
                            example: 1712345678
                        }
                    }
                },
                ErrorResponse: {
                    type: 'object',
                    properties: {
                        error: {
                            type: 'string',
                            example: 'Error message'
                        }
                    }
                }
            },
            responses: {
                UnauthorizedError: {
                    description: 'Authentication token is missing or invalid'
                },
                ForbiddenError: {
                    description: 'User does not have permission to access this resource'
                },
                NotFoundError: {
                    description: 'The requested resource was not found'
                }
            }
        },
        tags: [
            {
                name: 'Gateway',
                description: 'Gateway health and status endpoints'
            },
            {
                name: 'Scores',
                description: 'Competition scores management'
            },
            {
                name: 'Targets',
                description: 'Competition targets management'
            }
        ],
        externalDocs: {
            description: 'Find out more about our API',
            url: 'https://example.com/docs'
        }
    },
    apis: [] // We'll define paths programmatically
};

/**
 * API Paths definitions
 */
const paths = {
    '/api/health': {
        get: {
            tags: ['Gateway'],
            summary: 'Check API health status',
            description: 'Returns the health status of the API gateway',
            responses: {
                200: {
                    description: 'API is healthy',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                properties: {
                                    status: {
                                        type: 'string',
                                        example: 'OK'
                                    }
                                }
                            }
                        }
                    }
                },
                500: {
                    description: 'API is unhealthy',
                    content: {
                        'application/json': {
                            schema: {
                                $ref: '#/components/schemas/ErrorResponse'
                            }
                        }
                    }
                }
            }
        }
    },
    '/api/scores/{competition_id}': {
        get: {
            tags: ['Scores'],
            summary: 'Get all scores for a competition',
            description: 'Retrieve all scores for a specific competition',
            security: [{ bearerAuth: [] }],
            parameters: [
                {
                    name: 'competition_id',
                    in: 'path',
                    required: true,
                    schema: {
                        type: 'string',
                        format: 'uuid'
                    },
                    description: 'The competition ID'
                }
            ],
            responses: {
                200: {
                    description: 'List of scores for the competition',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'array',
                                items: {
                                    $ref: '#/components/schemas/Score'
                                }
                            }
                        }
                    }
                },
                404: {
                    description: 'Competition not found',
                    content: {
                        'application/json': {
                            schema: {
                                $ref: '#/components/schemas/ErrorResponse'
                            }
                        }
                    }
                },
                401: {
                    $ref: '#/components/responses/UnauthorizedError'
                }
            }
        }
    },
    '/api/scores/{competition_id}/{user_email}': {
        get: {
            tags: ['Scores'],
            summary: 'Get scores for a specific user in a competition',
            description: 'Retrieve scores for a specific user in a specific competition',
            security: [{ bearerAuth: [] }],
            parameters: [
                {
                    name: 'competition_id',
                    in: 'path',
                    required: true,
                    schema: {
                        type: 'string',
                        format: 'uuid'
                    }
                },
                {
                    name: 'user_email',
                    in: 'path',
                    required: true,
                    schema: {
                        type: 'string',
                        format: 'email'
                    }
                }
            ],
            responses: {
                200: {
                    description: "User's scores for the competition",
                    content: {
                        'application/json': {
                            schema: {
                                $ref: '#/components/schemas/Score'
                            }
                        }
                    }
                },
                404: {
                    $ref: '#/components/responses/NotFoundError'
                },
                401: {
                    $ref: '#/components/responses/UnauthorizedError'
                }
            }
        }
    },
    '/api/targets/': {
        post: {
            tags: ['Targets'],
            summary: 'Create a new competition',
            description: 'Create a new competition with a target picture',
            security: [{ bearerAuth: [] }],
            requestBody: {
                required: true,
                content: {
                    'multipart/form-data': {
                        schema: {
                            type: 'object',
                            properties: {
                                file: {
                                    type: 'string',
                                    format: 'binary',
                                    description: 'The target picture file'
                                },
                                filename: {
                                    type: 'string',
                                    example: 'target.jpg'
                                },
                                city: {
                                    type: 'string',
                                    example: 'New York'
                                },
                                start_timestamp: {
                                    type: 'integer',
                                    example: 1712345678
                                },
                                end_timestamp: {
                                    type: 'integer',
                                    example: 1712432078
                                }
                            }
                        }
                    }
                }
            },
            responses: {
                200: {
                    description: 'Competition created successfully',
                    content: {
                        'application/json': {
                            schema: {
                                $ref: '#/components/schemas/Target'
                            }
                        }
                    }
                },
                401: {
                    $ref: '#/components/responses/UnauthorizedError'
                },
                500: {
                    description: 'Internal server error',
                    content: {
                        'application/json': {
                            schema: {
                                $ref: '#/components/schemas/ErrorResponse'
                            }
                        }
                    }
                }
            }
        },
        get: {
            tags: ['Targets'],
            summary: 'Get all targets',
            description: 'Retrieve all targets across all cities',
            responses: {
                200: {
                    description: 'List of all targets',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'array',
                                items: {
                                    $ref: '#/components/schemas/Target'
                                }
                            }
                        }
                    }
                }
            }
        }
    },
    '/api/targets/{competition_id}': {
        post: {
            tags: ['Targets'],
            summary: 'Add a picture to a competition',
            description: 'Submit a picture to an existing competition',
            security: [{ bearerAuth: [] }],
            parameters: [
                {
                    name: 'competition_id',
                    in: 'path',
                    required: true,
                    schema: {
                        type: 'string',
                        format: 'uuid'
                    }
                }
            ],
            requestBody: {
                required: true,
                content: {
                    'multipart/form-data': {
                        schema: {
                            type: 'object',
                            properties: {
                                file: {
                                    type: 'string',
                                    format: 'binary',
                                    description: 'The submission picture file'
                                },
                                filename: {
                                    type: 'string',
                                    example: 'submission.jpg'
                                }
                            }
                        }
                    }
                }
            },
            responses: {
                200: {
                    description: 'Picture added successfully',
                    content: {
                        'application/json': {
                            schema: {
                                $ref: '#/components/schemas/Submission'
                            }
                        }
                    }
                },
                403: {
                    $ref: '#/components/responses/ForbiddenError'
                },
                404: {
                    $ref: '#/components/responses/NotFoundError'
                },
                410: {
                    description: 'Competition is finished',
                    content: {
                        'application/json': {
                            schema: {
                                $ref: '#/components/schemas/ErrorResponse'
                            }
                        }
                    }
                },
                422: {
                    description: 'Duplicate file upload',
                    content: {
                        'application/json': {
                            schema: {
                                $ref: '#/components/schemas/ErrorResponse'
                            }
                        }
                    }
                }
            }
        }
    },
    '/api/targets/{competition_id}/{email}': {
        delete: {
            tags: ['Targets'],
            summary: 'Delete your picture from the competition',
            description: 'Remove a submission from a competition',
            security: [{ bearerAuth: [] }],
            parameters: [
                {
                    name: 'competition_id',
                    in: 'path',
                    required: true,
                    schema: {
                        type: 'string',
                        format: 'uuid'
                    }
                },
                {
                    name: 'email',
                    in: 'path',
                    required: true,
                    schema: {
                        type: 'string',
                        format: 'email'
                    }
                }
            ],
            responses: {
                200: {
                    description: 'Picture deleted successfully'
                },
                403: {
                    $ref: '#/components/responses/ForbiddenError'
                },
                500: {
                    description: 'Internal server error',
                    content: {
                        'application/json': {
                            schema: {
                                $ref: '#/components/schemas/ErrorResponse'
                            }
                        }
                    }
                }
            }
        }
    },
    '/api/targets/{city}': {
        get: {
            tags: ['Targets'],
            summary: 'Get all targets for a city',
            description: 'Retrieve all targets for a specific city',
            parameters: [
                {
                    name: 'city',
                    in: 'path',
                    required: true,
                    schema: {
                        type: 'string'
                    }
                }
            ],
            responses: {
                200: {
                    description: 'List of targets in the city',
                    content: {
                        'application/json': {
                            schema: {
                                type: 'array',
                                items: {
                                    $ref: '#/components/schemas/Target'
                                }
                            }
                        }
                    }
                }
            }
        }
    }
};

// Merge paths into the options
swaggerOptions.definition.paths = paths;

/**
 * Generates the Swagger/OpenAPI specification
 * @param {string} host The host URL to include in the docs
 * @returns {object} The OpenAPI specification
 */
export function generateSwaggerSpec(host) {
    const spec = JSON.parse(JSON.stringify(swaggerOptions));
    spec.definition.servers[0].url = host;
    return swaggerJsdoc(spec);
}