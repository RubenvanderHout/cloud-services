require("dotenv").config();
const express = require("express");

const AmqpModule = require("./amqp");
const createAmqpConnection = AmqpModule.createAmqpConnection;

const blobStorageModule = require("./blobstorage");

const repository = require("./repository");
const createMongoConnection = repository.createMongoConnection;

const REQUIRED_ENV_VARS = [
    "PORT", "HOST", "AMQP_HOST",
    "BLOB_ACCOUNT_NAME",
    "BLOB_ACCOUNT_KEY",
    "BLOB_CONTAINER_NAME",
    "QUEUE_PHOTO_UPLOADED", "QUEUE_COMPETITION_STARTED"
];

function parseEnvVariables(requiredVars) {
    const missing = requiredVars.filter(varName => !(varName in process.env));

    if (missing.length > 0) {
        console.error('Missing environment variables:', missing.join(', '));
        // Handle missing variables (e.g., exit process)
        process.exit(1);
    }
}

const port = process.env.PORT
const host = process.env.HOST

const photoUploaded = process.env.QUEUE_PHOTO_UPLOADED;
const competitionStarted = process.env.QUEUE_SEND_MAIL;

const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;

const amqpConfig = {
    url: 'amqp://localhost',
    reconnectDelay: 3000
};

const mongoDbConfig = {
    url: 'mongodb://localhost:27017',
    options: {
        serverSelectionTimeoutMS: 3000
    },
    reconnectDelay: 5000
};


const queues = {
    photoUploaded: {
        name: photoUploaded,
    },
    competitionStarted: {
        name: competitionStarted,
    }
};

const upload = multer();

async function main() {
    parseEnvVariables(REQUIRED_ENV_VARS);

    const app = express();
    app.use(express.json());

    const amqpconn = await createAmqpConnection(amqpConfig);
    const startCompetitionQueue = amqpconn.createProducer(queues.competitionStarted);
    const uploadPhotoQueue = amqpconn.createProducer(queues.photoUploaded);

    const mongoConnection = await createMongoConnection(mongoDbConfig);
    const database = await mongoConnection.getDatabase("targets");
    const collection = await mongoConnection.getCollection(database, "competition_files");

    app.post('/api/targets/upload', upload.single('file'), async (req, res) => {

    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
        await amqpconn.closeAll();
        await mongoConnection.closeAll();
        process.exit(0);
    });

    app.listen(port, host, () => {
        console.log(`Target service running on port ${port}`);
    });
}

main();