// multipart-parser.js
const busboy = require('busboy');

function parseMultipart(req) {
    return new Promise((resolve, reject) => {
        const form = { fields: {}, files: {} };
        const bb = busboy({ headers: req.headers });

        bb.on('field', (name, value) => {
            form.fields[name] = value;
        });

        bb.on('file', (name, file, info) => {
            const chunks = [];
            form.files[name] = { info, buffer: null };

            file.on('data', (chunk) => chunks.push(chunk));
            file.on('end', () => {
                form.files[name].buffer = Buffer.concat(chunks);
            });
        });

        bb.on('close', () => resolve(form));
        bb.on('error', reject);
        req.pipe(bb);
    });
}

// Middleware to add parsed form data to request
async function multipartParser(req, _res, next) {
    try {
        const { fields, files } = await parseMultipart(req);
        req.formData = { ...fields, ...files };
        next();
    } catch (err) {
        next(err);
    }
}

module.exports = multipartParser;