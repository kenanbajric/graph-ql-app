//core Node modules
const path = require('path');

//3rd
const express = require('express');
const bodyParser = require('body-parser'); //nemam instliran dependecy, i nisam siguran da li je potrebno
const mongoose = require('mongoose'); //importujemo instalirani mongoose u projekat
const multer = require('multer');
const  { v4: uuidv4 } = require('uuid'); //ovo trebam istraziti
// const cors = require('cors'); //ovu ideju sam nasao na stackoverflow - https://stackoverflow.com/questions/35588699/response-to-preflight-request-doesnt-pass-access-control-check
//ovdje je bio problem sa typo u kontroleru updatePost, kada sam to ispravio, aplikaicja je proradila

//graphQL
const { graphqlHTTP } = require('express-graphql');
const graphqlSchema = require('./graphql/schema');
const graphqlResolver = require('./graphql/resolvers');
const auth = require('./middleware/auth');
const { clearImage } = require('./util/file');

const app = express();

//gdje cemo pohraniti image
const fileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'images');
    },
    filename: (req, file, cb) => {
        cb(null, uuidv4())
    }
});

//koje formate prihvatamo za upload
const fileFilter = (req, file, cb) => {
    if (file.mimetype === 'image/png' || file.mimetype === 'image/jpg' || file.mimetype === 'image/jpeg') {
        cb(null, true)
    } else {
        cb(null, false)
    }
}

// app.use(express.urlencoded()); // x-www-form-urlencoded <form>
app.use(express.json()); //application/json parser
//register multer
app.use(
    multer({storage: fileStorage, fileFilter: fileFilter}).single('image')
);
//serve images folder statically
app.use('/images', express.static(path.join(__dirname, 'images')));

// app.use(cors()); //nasao na stackoverflow - veza u komentaru gdje importujem const cors

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(auth);

//pravimo REST endpoint samo za imaage upload
app.put('/post-image', (req, res, next) => {
    if (!req.isAuth) {
        throw new Error('Not authenticated!');
    }
    if (!req.file) {
        return res.status(200).json({ message: 'No file provided!' });
    }
    if (req.body.oldPath) {
        clearImage(req.body.oldPath);
    }
    return res.status(201).json({ message: 'File stored.', filePath: req.file.path })
});

app.use('/graphql', graphqlHTTP({
    schema: graphqlSchema,
    rootValue: graphqlResolver,
    graphiql: true,
    customFormatErrorFn: (err) => {
        if (!err.originalError) {
            return err;
        }
        const data = err.originalError.data;
        const message = err.message || 'An error occurred.';
        const code = err.originalError.code || 500;
        return {
            message: message,
            status: code,
            data: data
        }
    }
}));

//error handling middleware
app.use((error, req, res, next) => {
    console.log(error);
    const status = error.statusCode || 500;
    const message = error.message;
    const data = error.data;
    res.status(status).json({ message: message, data: data })
})

mongoose
    .connect('mongodb+srv://johnny:1234@cluster0.awjuf.mongodb.net/messages?retryWrites=true&w=majority')
    .then(result => {
       app.listen(8080);
    })
    .catch(err => console.log(err));


