require("dotenv").config();
const express = require("express");
const { v4: uuidv4 } = require('uuid');

const AmqpModule = require("./amqp");
const createAmqpConnection = AmqpModule.createAmqpConnection;

const blobStorageModule = require("./blobstorage");
const uploadBlob = blobStorageModule.uploadBlob;

const repository = require("./repository");
const createMongoConnection = repository.createMongoConnection;
const createSubmissionRepo = repository.createSubmissionRepo;
const createTargetRepo = repository.createTargetRepo;

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
const registrationEnded = process.env.QUEUE_RECEIVE_REGISTRATION_ENDED;
const competetionCreated = process.env.QUEUE_COMPETITION_CREATED;

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
    },
    registrationEnded: {
        name: registrationEnded
    },
    competetionCreated : {
        name: competetionCreated
    }
};

const upload = multer();

async function main() {
    parseEnvVariables(REQUIRED_ENV_VARS);

    const app = express();
    app.use(express.json());


    const mongoConnection = await createMongoConnection(mongoDbConfig);
    const database = await mongoConnection.getDatabase("targets");

    const submissionRepo = await createSubmissionRepo(database);
    const targetRepo = await createTargetRepo(database);

    const amqpconn = await createAmqpConnection(amqpConfig);
    const startCompetitionQueue = await amqpconn.createProducer(queues.competitionStarted);
    const uploadPhotoQueue = await amqpconn.createProducer(queues.photoUploaded);
    const competetionCreatedQueue = await amqpconn.createProducer(queues.competetionCreated);

    amqpconn.createConsumer(queues.registrationEnded, (content, ack) => {
        targetRepo.setCompetitionFinished(content.competitionId)
        ack();
    })

    // Create a new competition
    app.post('/api/targets/', upload.single('file'), async (req, res) => {

        const fileBuffer = req.file.buffer;
        const filehash = crypto
            .createHash('sha256')
            .update(fileBuffer)
            .digest('hex');

        // Todo refactor blob storage api to work better
        // blobStorageModule.uploadBlob()

        const token = req.headers.authorization.split(' ')[1];
        const decodedToken = jwt.verify(token, JWT_SECRET_KEY);

        const target = {
            competition_id: uuidv4(),
            city: req.body.city,
            user_email: decodedToken.email,
            picture_id: filehash,
            start_timestamp: req.body.start_timestamp,
            end_timestamp: req.body.end_timestamp,
            is_finished: false
        }

        await targetRepo.createTarget(target);

        await startCompetitionQueue.send(target);
        await uploadPhotoQueue.send(target);
        await competetionCreatedQueue.send(target);

        res.json(target).send("Competition created");
    });

    // Add a picture to a competion
    app.post('/api/targets/:targetId', upload.single('file'), async (req, res) => {

        if(await targetRepo.isFinished()) {
            res.status(410).send("Competition is done no more picture allowed");
        }

        // TODO check if this id actualy exists
        const competitionId = req.params.id;

        const fileBuffer = req.file.buffer;
        const filehash = crypto
            .createHash('sha256')
            .update(fileBuffer)
            .digest('hex');

        // Todo refactor blob storage api to work better
        // blobStorageModule.uploadBlob()

        const token = req.headers.authorization.split(' ')[1];
        const decodedToken = jwt.verify(token, JWT_SECRET_KEY);



        const target = {
            competition_id: competitionId,
            user_email: decodedToken.email,
            picture_id: filehash,
            submit_timestamp: req.body.submit_timestamp,
        }

        await submissionRepo.createSubmission(target);

        await uploadPhotoQueue.send(target);

        res.json(target).send("Images added to competition");
    });

    // // Delete your picture from the competetion
    // app.delete('/api/targets/:targetId/:email', async (req, res) => {

    // });

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

    app.listen(port, host, () => {
        console.log(`Target service running on port ${port}`);
    });
}

main();