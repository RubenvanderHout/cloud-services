require("dotenv").config();
const MongoClient = require('mongodb').MongoClient;

// Function to connect to MongoDB
async function connectToMongoDB() {
    const mongoClient = new MongoClient(
        process.env.MONGO_URI,
        {auth: {
        username: process.env.MONGO_USER,
        password: process.env.MONGO_PASSWORD
        }}
    );
    await mongoClient.connect();
    return mongoClient;
}

async function storeTimerToDB(mongoClient, timer) {
    const db = mongoClient.db(process.env.MONGO_DB);
    const collection = db.collection('timers');
    await collection.insertOne(timer);
}

async function getRunningTimers(mongoClient) {
    const db = mongoClient.db(process.env.MONGO_DB);
    const collection = db.collection('timers');
    // a timer can be defined as running if the end time is greater than the current time
    const currentTime = new Date();
    const runningTimers = await collection.find({
        endTime: { $gt: currentTime }
    }).toArray();
    return runningTimers;
}

module.exports = {
    connectToMongoDB,
    storeTimerToDB,
    getRunningTimers 
}