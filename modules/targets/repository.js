const { MongoClient } = require('mongodb');


async function createMongoConnection(config) {
    let currentClient = null;
    let isExplicitlyClosed = false;
    let reconnectTimeout = null;

    async function connect() {

        try {
            const client = new MongoClient(config.url, {
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
async function createTargetRepo(dbName, mongoConnection) {
    let targetCollection;

    async function constructor() {
        try {
            targetCollection = await mongoConnection.getCollection(dbName, "targets");
        } catch(err) {
            console.log(err)
            throw err;
        }
    }

    async function createTarget(target) {
        try {
            if (!target || typeof target !== 'object') {
                throw new Error('Invalid target object');
            }
            await targetCollection.insertOne(target);
        } catch (error) {
            console.error('Error creating target:', error);
            throw new Error('Failed to create target');
        }
    }

    async function getTarget(target_id) {
        try {
            if (!target_id) {
                throw new Error('Missing target_id parameter');
            }
            return await targetCollection.findOne({ competition_id: target_id });
        } catch (error) {
            throw new Error('Failed to retrieve target');
        }
    }

    async function getAll() {
        try {
            return await targetCollection.find({}).toArray();
        } catch (error) {
            throw new Error('Failed to retrieve targets');
        }
    }

    async function getTargetWithCity(city) {
        try {
            if (!city) {
                throw new Error('Missing city parameter');
            }
            return await targetCollection.find({ city }).toArray();
        } catch (error) {
            console.error(`Error getting targets for city ${city}:`, error);
            throw new Error('Failed to retrieve targets by city');
        }
    }

    async function validateFileHashIsUnique(target_id, uploadedPictureHash) {
        try {
            const existing = await targetCollection.findOne({
                picture_hash: uploadedPictureHash,
                target_id: { $ne: target_id }
            });
            return !existing;
        } catch (error) {
            console.error('Error validating file hash uniqueness:', error);
            throw new Error('Failed to validate file hash');
        }
    }

    async function targetExists(target_id) {
        const target = await getTarget(target_id);
        return target !== null;
    }

    async function isFinished(target_id) {
        const target = await getTarget(target_id);
        return target?.is_finished || false;
    }

    async function getTargetPictureUrl(target_id) {
        const target = await getTarget(target_id);
        return target?.picture_url || null;
    }

    async function deleteTarget(target_id) {
        try {
            if (!target_id) {
                throw new Error('Missing target_id parameter');
            }
            return await targetCollection.deleteOne({ target_id });
        } catch (error) {
            throw new Error('Failed to delete target');
        }
    }

    async function setCompetitionFinished(target_id) {
        try {
            if (!target_id) {
                throw new Error('Missing target_id parameter');
            }
            return await targetCollection.updateOne(
                { competition_id: target_id },
                { $set: { is_finished: true } }
            );
        } catch (error) {
            throw new Error('Failed to update target');
        }
    }

    await constructor();

    return {
        createTarget,
        getTarget,
        getAll,
        getTargetPictureUrl,
        validateFileHashIsUnique,
        targetExists,
        getTargetWithCity,
        isFinished,
        deleteTarget,
        setCompetitionFinished,
    };
}

// SUBMISSION REPO
async function createSubmissionRepo(dbname, mongoConnection) {
    let submissionCollection;

    async function constructor() {
        try {
            submissionCollection = await mongoConnection.getCollection(dbname, "submissions");
        } catch (err) {
            console.log(err)
            throw err;
        }
    }

    async function createSubmission(submission) {
        try {
            if (!submission || typeof submission !== 'object') {
                throw new Error('Invalid submission object');
            }
            const result = await submissionCollection.insertOne(submission);
            return result;
        } catch (error) {
            console.error('Error creating submission:', error);
            throw new Error('Failed to create submission');
        }
    }

    async function getSubmission(filter = {}) {
        try {
            if (!filter || typeof filter !== 'object') {
                throw new Error('Invalid filter parameter');
            }
            return await submissionCollection.findOne(filter);
        } catch (error) {
            console.error('Error getting submission:', error);
            throw new Error('Failed to retrieve submission');
        }
    }

    async function deleteSubmission(competition_id, user_email) {
        try {
            if (!competition_id) {
                throw new Error('Missing competition_id parameter');
            }
            if (!user_email) {
                throw new Error('Missing user_email parameter');
            }

            await submissionCollection.deleteOne({ competition_id: competition_id, user_email: user_email });
        } catch (error) {
            console.error(`Error marking competition ${competition_id} as finished:`, error);
            throw new Error('Failed to delete submission');
        }
    }


    async function setCompetitionFinished(competition_id) {
        try {
            if (!competition_id) {
                throw new Error('Missing competition_id parameter');
            }
            const result = await submissionCollection.updateMany(
                { competition_id },
                { $set: { is_finished: true } }
            );
            return result;
        } catch (error) {
            console.error(`Error marking competition ${competition_id} as finished:`, error);
            throw new Error('Failed to update competition status');
        }
    }

    await constructor();

    return {
        createSubmission,
        getSubmission,
        deleteSubmission,
        setCompetitionFinished,
    };
}

module.exports = {
    createMongoConnection,
    createSubmissionRepo,
    createTargetRepo
}