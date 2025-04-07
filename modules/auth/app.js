require("dotenv").config();
const express = require("express");
const jwt = require("jsonwebtoken");
const RepositoryModule = require("./repository");
const createDbPool = RepositoryModule.createDbPool;
const createUserRepository = RepositoryModule.createUserRepository;

const port = process.env.PORT
const host = process.env.HOST

const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;

async function main(){
    const app = express();
    app.use(express.json());

    const pool = await createDbPool();
    const userRepository = createUserRepository(pool);

    app.put('/api/auth/authenticateToken', async (req, res) => {
        const token = req.body.authorization;
        if (!token) return res.status(401).send();

        jwt.verify(token, JWT_SECRET_KEY, (err, rights) => {
            if (err) return res.sendStatus(403);
            res.status(200).json(rights);
        });
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
        process.exit(0);
    });

    app.listen(port, host, () => {
        console.log(`Auth service running on port ${port}`);
    });
}

main();