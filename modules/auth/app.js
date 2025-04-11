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
    "AMQP_HOST", "JWT_SECRET_KEY",
    "QUEUE_SEND_MAIL_AUTH_EMAIL"
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
const sendEmailQueue = process.env.QUEUE_SEND_MAIL_AUTH_EMAIL;

const amqpConfig = {
    url: 'amqp://localhost',
    reconnectDelay: 3000
};

const queues = {
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
    const sendEmailQueue = await amqpconn.createProducer(queues.sendEmailQueue);

    app.put('/api/auth/authenticateToken', async (req, res) => {
        const token = req.body.authorization;
        if (!token) return res.status(401).send();

        jwt.verify(token, JWT_SECRET_KEY, (err, user) => {
            if (err) return res.sendStatus(403);
            res.status(200).json(user);
        });
    });

    app.post('/api/auth/register/:username', async (req, res) => {

        console.log(req.params.username);

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

            console.log({ username: req.params.username, email: req.body.email, password: pass })

            const user = { username: req.params.username, email: req.body.email, password: pass };
            await userRepository.saveUser(user);
            await sendEmailQueue.send({ username: user.username, email: user.email });
            res.status(201).send();
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
            const user = await userRepository.findUser(req.params.username);

            if (user === null) {
                return res.sendStatus(404);
            }
            const result = await bcrypt.compare(req.body.password, user.password)
            if (result) {
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