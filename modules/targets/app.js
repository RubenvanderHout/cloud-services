require("dotenv").config();
const express = require("express");
const { v4: uuidv4 } = require('uuid');
const multipartParser = require("./filerparser")
const AmqpModule = require("./amqp");
const crypto = require("node:crypto");
const createAmqpConnection = AmqpModule.createAmqpConnection;

const blobStorageModule = require("./blobstorage");
const createBlobService = blobStorageModule.createBlobService;

const repository = require("./repository");

const createMongoConnection = repository.createMongoConnection;
const createSubmissionRepo = repository.createSubmissionRepo;
const createTargetRepo = repository.createTargetRepo;

const REQUIRED_ENV_VARS = [
    "PORT", "HOST", "AMQP_HOST",
    "BLOB_ACCOUNT_NAME", "BLOB_CONNECTION_STRING", "BLOB_ACCOUNT_KEY",
    "QUEUE_PHOTO_UPLOADED_TARGET_IMAGE",
    "QUEUE_COMPETITION_STARTED_TARGET_CLOCK",
    "QUEUE_RECEIVE_REGISTRATION_ENDED_CLOCK_TARGET",
    "QUEUE_COMPETITION_CREATED_TARGET_SCORE",
    "QUEUE_PHOTO_DELETED_TARGET_SCORE",
    "BLOB_CONNECTION_STRING", "BLOB_ACCOUNT_KEY",
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

const photoUploaded = process.env.QUEUE_PHOTO_UPLOADED_TARGET_IMAGE;
const competitionStarted = process.env.QUEUE_COMPETITION_STARTED_TARGET_CLOCK;
const registrationEnded = process.env.QUEUE_RECEIVE_REGISTRATION_ENDED_CLOCK_TARGET;
const competetionCreated = process.env.QUEUE_COMPETITION_CREATED_TARGET_SCORE;
const photoDeleted = process.env.QUEUE_PHOTO_DELETED_TARGET_SCORE;

const amqpConfig = {
    url: process.env.AMQP_HOST,
    reconnectDelay: 3000
};

const mongoDbConfig = {
    url: process.env.MONGO_URI,
    auth: {
        username: process.env.MONGO_USER,
        password: process.env.MONGO_PASSWORD
    },
    options: {
        serverSelectionTimeoutMS: 3000
    },
    db: process.env.MONGO_DB,
    reconnectDelay: 5000
};

const blobstorageConfig = {
    accountName: process.env.BLOB_ACCOUNT_NAME,
    connectionString: process.env.BLOB_CONNECTION_STRING,
}

const queues = {
    photoUploaded: {
        name: photoUploaded,
    },
    competitionStarted: {
        name: competitionStarted,
    },
    registrationEnded: {
        name: registrationEnded
    },
    competetionCreated : {
        name: competetionCreated
    },
    photoDeleted : {
        name: photoDeleted
    }
};

const containerClientConfig = {
    access: 'blob',
}

async function main() {
    parseEnvVariables(REQUIRED_ENV_VARS);

    const app = express();
    app.use(express.json());

    const blobStorageClient = createBlobService(blobstorageConfig);

    const mongoConnection = await createMongoConnection(mongoDbConfig);
    const submissionRepo = await createSubmissionRepo(mongoDbConfig.db, mongoConnection);
    const targetRepo = await createTargetRepo(mongoDbConfig.db, mongoConnection);

    const amqpconn = await createAmqpConnection(amqpConfig);
    const startCompetitionQueue = await amqpconn.createProducer(queues.competitionStarted);
    const uploadPhotoQueue = await amqpconn.createProducer(queues.photoUploaded);
    const competetionCreatedQueue = await amqpconn.createProducer(queues.competetionCreated);
    const photoDeletedQueue = await amqpconn.createProducer(queues.photoDeleted);

    amqpconn.createConsumer(queues.registrationEnded, async ({content, ack}) => {
        await targetRepo.setCompetitionFinished(content.competition_id)
        ack();
    })

    app.use((req, _res, next) => {
        const userHeader = req.headers['x-user'];

        try {
            req.user = JSON.parse(userHeader);
        } catch (err) {
            console.warn('Invalid x-user header:', err);
        }

        next();
    });

    // Create a new competition
    app.post('/api/targets/', multipartParser, async (req, res) => {
        // Destructure after ensuring formData exists
        const { file, city, start_timestamp, end_timestamp } = req.formData;

        const filename = file.info.filename
        const fileBuffer = file.buffer;
        const filehash = crypto
            .createHash('sha256')
            .update(fileBuffer)
            .digest('hex');

        const competition_id = uuidv4();


        const client = await blobStorageModule.createContainerClient(blobStorageClient, competition_id, containerClientConfig)
        const targetPictureUrl = await client.uploadBlob(filename, fileBuffer);

        const target = {
            competition_id: String(competition_id),
            city: String(city),
            user_email: String(req.user.email),
            picture_id: String(file.info.filename),
            picture_url: String(targetPictureUrl),
            picture_hash: String(filehash),
            start_timestamp: Number(start_timestamp),
            end_timestamp: Number(end_timestamp),
            is_finished: false
        }
        await targetRepo.createTarget(target);

        const clockMessage = {
            competition_id: target.competition_id,
            start_timestamp: target.start_timestamp,
            end_timestamp: target.end_timestamp,
        };
        await startCompetitionQueue.send(clockMessage);

        const scoresMessage = {
            competition_id: target.competition_id,
            user_email: target.user_email,
            start_timestamp: target.start_timestamp,
            end_timestamp: target.end_timestamp,
        };

        console.log(scoresMessage);

        await competetionCreatedQueue.send(scoresMessage);

        res.json(target)
    });

    // Add a picture to a competion
    app.post('/api/targets/submit/', multipartParser, async (req, res) => {

        const { file, competition_id } = req.formData;
        const filename = file.info.filename

        const targetExists = await targetRepo.targetExists(competition_id);

        if (!targetExists){
            return res.status(400).send("Given competition doesn't exist");
        }

        if (await targetRepo.isFinished(competition_id)) {
            return res.status(410).send("Competition is done no more picture allowed");
        }

        const fileBuffer = file.buffer;
        const filehash = crypto
            .createHash('sha256')
            .update(fileBuffer)
            .digest('hex');

        const validated = await targetRepo.validateFileHashIsUnique(competition_id, filehash);

        if (!validated){
            res.status(422).send("You are uploading the same exact file. This is not allowed")
        };

        const client = await blobStorageModule.createContainerClient(blobStorageClient, competition_id, containerClientConfig)
        const submission_image_url = await client.uploadBlob(filename, fileBuffer);

        const target_image_url = await targetRepo.getTargetPictureUrl(competition_id);

        const unixTimestamp = Math.floor(Date.now() / 1000);

        const submission = {
            competition_id: competition_id,
            submission_time: unixTimestamp,
            user_email: req.user.email,
            target_image_url: target_image_url,
            submission_image_url: submission_image_url,
        }

        await submissionRepo.createSubmission(submission);

        await uploadPhotoQueue.send(submission);

        res.json(submission);
    });

    // Delete your picture from the competetion
    app.delete('/api/targets/:competition_id/:email', async (req, res) => {

        console.log("entered")

        const competition_id = req.params.competition_id;
        const email = req.params.email;

        if(email !== req.user.email){
            return res.status(403).send("Forbidden");
        }
        try {
            await submissionRepo.deleteSubmission(competition_id, email);
            photoDeletedQueue.send({ competition_id: competition_id, user_email: email })
        } catch {
            return res.status(500);
        }

        return res.status(200);
    });

    // Get all targets for a city
    app.get('/api/targets/:city', async (req, res) => {

        const city = req.params.city;
        const targets = await targetRepo.getTargetWithCity(city);

        res.json(targets);
    });

    // Get all targets
    app.get('/api/targets/', async (_req, res) => {
        const targets = await targetRepo.getAll();
        res.json(targets);
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
        await amqpconn.closeAll();
        await mongoConnection.closeAll();
        process.exit(0);
    });

    app.use((err, _req, res, _next) => {
        console.log(err);
        res.status(500).json({ error: 'Internal server error' });
    });

    app.listen(port, host, () => {
        console.log(`Target service running on port ${port}`);
    });
}

main();