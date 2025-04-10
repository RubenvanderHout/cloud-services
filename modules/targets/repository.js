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

module.exports = {
    createMongoConnection
}