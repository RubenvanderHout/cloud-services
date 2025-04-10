const { MongoClient } = require('mongodb');


async function createMongoConnection(config) {
    let currentClient = null;
    let isExplicitlyClosed = false;
    let reconnectTimeout = null;

    async function connect() {

        try {
            const client = new MongoClient(config.url, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                ...config.options
            });

            await client.connect();

            // Replace current client reference
            currentClient = client;

            client.on('close', () => {
                if (!isExplicitlyClosed) {
                    console.log('MongoDB connection closed. Reconnecting...');
                    scheduleReconnect();
                }
            });

            client.on('error', (err) => {
                console.error('MongoDB connection error:', err);
            });

            console.log('Successfully connected to MongoDB');
            return client;
        } catch (error) {
            console.error('Failed to connect to MongoDB:', error);
            scheduleReconnect();
        }
    }

    function scheduleReconnect() {
        if (isExplicitlyClosed) return;
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(
            () => connect(),
            config.reconnectDelay || 5000
        );
    }

    async function getDatabase(dbName) {
        if (isExplicitlyClosed) {
            throw new Error('Connection has been explicitly closed');
        }

        // Wait for initial connection
        while (!currentClient) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        return currentClient.db(dbName);
    }

    async function getCollection(dbName, collectionName) {
        const db = await getDatabase(dbName);
        return db.collection(collectionName);
    }

    async function closeAll() {
        isExplicitlyClosed = true;
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        if (currentClient) {
            await currentClient.close();
            currentClient = null;
        }
    }

    await connect();

    return {
        getDatabase,
        getCollection,
        closeAll,
    };
}


// TARGET REPO
async function createTargetRepo(database, mongoConnection) {
    let targetCollection;

    async function constructor() {
        targetCollection = await mongoConnection.getCollection(database, "targets");
    }

    async function createTarget(target) {
        // target should include: competition_id, city, user_email, picture_id, start_timestamp, end_timestamp, is_finished
        const result = await targetCollection.insertOne(target);

        return result;
    }

    async function getTarget(target_id) {
        return await targetCollection.findOne({ target_id });
    }

    async function isFinished(target_id) {
        const target = await targetCollection.findOne({ target_id });

        if(target === null) {
            return false;
        }

        return target ? target.is_finished === true : false;
    }

    async function getTargetWithCity(city) {
        return await targetCollection.find({ city });
    }

    async function getAll(){
        return await targetCollection.find();
    }

    async function updateTarget(target_id, setFields = {}, unsetFields = []) {
        const updateObj = {};
        if (Object.keys(setFields).length) {
            updateObj.$set = setFields;
        }
        if (unsetFields.length) {
            updateObj.$unset = unsetFields.reduce((acc, field) => {
                acc[field] = "";
                return acc;
            }, {});
        }
        return await targetCollection.updateOne({ target_id }, updateObj);
    }

    async function deleteTarget(target_id) {
        return await targetCollection.deleteOne({ target_id });
    }

    async function setCompetitionFinished(target_id) {
        return await targetCollection.updateOne(
            { target_id },
            { $set: { finished: true } }
        );
    }

    await constructor();

    return {
        createTarget,
        getTarget,
        getAll,
        getTargetWithCity,
        isFinished,
        updateTarget,
        deleteTarget,
        setCompetitionFinished,
    };
}

// SUBMISSION REPO
async function createSubmissionRepo(database, mongoConnection) {
    let submissionCollection;

    async function constructor() {
        submissionCollection = await mongoConnection.getCollection(database, "submissions");
    }

    async function createSubmission(submission) {
        // submission should include: competition_id : uuid, user_email, picture_id, submit_timestamp
        const result = await submissionCollection.insertOne(submission);
        return result;
    }

    async function getSubmission(filter = {}) {
        return await submissionCollection.findOne(filter);
    }

    async function updateSubmission(competition_id, user_email, setFields = {}, unsetFields = []) {
        const updateObj = {};
        if (Object.keys(setFields).length) {
            updateObj.$set = setFields;
        }
        if (unsetFields.length) {
            updateObj.$unset = unsetFields.reduce((acc, field) => {
                acc[field] = "";
                return acc;
            }, {});
        }
        // Using competition_id and user_email as identifiers
        return await submissionCollection.updateOne(
            { competition_id, user_email },
            updateObj
        );
    }

    async function deleteSubmission(competition_id, user_email) {
        return await submissionCollection.deleteOne({ competition_id, user_email });
    }

    async function setCompetitionFinished(competition_id) {
        return await submissionCollection.updateMany(
            { competition_id },
            { $set: { finished: true } }
        );
    }

    await constructor();

    return {
        createSubmission,
        getSubmission,
        updateSubmission,
        deleteSubmission,
        setCompetitionFinished,
    };
}

module.exports = {
    createMongoConnection,
    createSubmissionRepo,
    createTargetRepo
}