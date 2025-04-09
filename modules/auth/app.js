require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs")

const RepositoryModule = require("./repository");
const createDbPool = RepositoryModule.createDbPool;
const createUserRepository = RepositoryModule.createUserRepository;

const AmqpModule = require("./amqp");
const createAmqpConnection = AmqpModule.createAmqpConnection;

const REQUIRED_ENV_VARS = [
    "PORT", "HOST", "DB_DATABASE",
    "DB_USER", "DB_PASSWORD", "DB_PORT",
    "AMQP_HOST", "JWT_SECRET_KEY", "QUEUE_RECEIVE_MAIL",
    "QUEUE_SEND_MAIL"
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

const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;
const receivedEmailConfirmationQueue = process.env.QUEUE_RECEIVE_MAIL;
const sendEmailQueue = process.env.QUEUE_SEND_MAIL;

const amqpConfig = {
    hostname: process.env.AMQP_HOST,  
    port: process.env.AMQP_PORT,     
    username: process.env.AMQP_USER,  
    password: process.env.AMQP_PASS ,
    reconnectDelay: 3000
};

const queues = {
    receivedEmailConfirmationQueue: {
        name: receivedEmailConfirmationQueue,
    },
    sendEmailQueue: {
        name: sendEmailQueue,
    }
};

async function main() {
    parseEnvVariables(REQUIRED_ENV_VARS);

    const app = express();
    app.use(express.json());

    const pool = await createDbPool();
    const userRepository = createUserRepository(pool);

    const amqpconn = await createAmqpConnection(amqpConfig);
    amqpconn.createConsumer(queues.receivedEmailConfirmationQueue, async ({ content, ack }) => {
        userRepository.updateUserConfirmed(content);
        ack();
    });

    const sendEmailQueue = amqpconn.createProducer(queues.sendEmailQueue);

    app.put('/api/auth/authenticateToken', async (req, res) => {
        const token = req.body.authorization;
        if (!token) return res.status(401).send();

        jwt.verify(token, JWT_SECRET_KEY, (err, rights) => {
            if (err) return res.sendStatus(403);
            res.status(200).json(rights);
        });
    });

    app.post('/api/auth/register/:username', async (req, res) => {

        if (req.params.username === null || typeof req.params.username !== "string") {
            return res.status(400).send('Username not correct');
        }

        if (req.body.email === null || typeof req.body.email !== "string") {
            return res.status(400).send('Email not correct');
        }

        if (req.body.password === null || typeof req.body.password !== "string") {
            return res.status(400).send('Password not correct');
        }

        try {
            const pass = await bcrypt.hash(req.body.password, 10);
            const user = { username: req.params.username, email: req.body.email, password: pass, confirmed: 0 };
            userRepository.saveUser(user);
            sendEmailQueue.send({ username: user.username, email: user.email });
            res.status(201).send('User registered successfully');
        } catch (err) {
            console.error(err)
            res.status(500).send("Internal Server Error");
        }
    });

    app.post('/api/auth/login/:username', async (req, res) => {

        if (req.params.username === null || typeof req.params.username !== "string") {
            return res.status(400).send('Username not correct');
        }

        if (req.body.password === null || typeof req.body.password !== "string") {
            return res.status(400).send('Password not correct');
        }

        try {
            const user = userRepository.findUser(req.params.username);

            if (user === null) {
                return res.sendStatus(404);
            }

            if (user.confirmed === 0) {
                return res.status(401).send('User not confirmed yet');
            }

            if (await bcrypt.compare(req.body.password, user.password)) {
                const rights = { username: user.username, email: user.email };
                const accessToken = jwt.sign(rights, JWT_SECRET_KEY);
                res.json({ token: accessToken });
            } else {
                res.status(401).send('Incorrect password');
            }
        } catch (err) {
            console.log(err)
            res.status(500).send("Internal Server Error");
        }
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
        await amqpconn.closeAll();
        process.exit(0);
    });

    app.listen(port, host, () => {
        console.log(`Auth service running on port ${port}`);
    });
}

main();