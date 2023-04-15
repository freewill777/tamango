const mongoose = require('mongoose');
const express = require('express');
var cors = require('cors')
const asyncHandler = require('express-async-handler')
const app = express();
const ObjectId = require('mongoose').Types.ObjectId;
const {MONGO_URL} = require("./settings");
var fs = require('fs');

let router = express.Router();

app.use(cors())

let User = require('./Models/User');

mongoose.connect(MONGO_URL)

app.get('/login', asyncHandler(async (req, res) => {
    try {
        var {email, password} = req.query
        const collection = mongoose.connection.db.collection('users')
        const cursor = collection.find({email: email.toLowerCase()})
        const usersFound = await cursor.toArray()
        if (usersFound.length === 0) {
            res.status(500).send('User does not exist');
            return
        }
        const user = usersFound[0]
        const {_id} = user
        if (password === user.password) {
            res.json({id: _id});
        } else {
            res.status(401).json({});
        }
    } catch (err) {
        console.error(`Error retrieving data: ${err.message}`);
        res.status(500).send('Internal server error');
    }
}));

app.post('/register', asyncHandler(async (req, res) => {
    try {
        var {name, password, email} = req.query
        const collection = mongoose.connection.db.collection('users')
        const cursor = collection.find({name: name.toLowerCase()})
        const usersFound = await cursor.toArray()
        if (usersFound.length > 0) {
            res.status(500).send('User already exists');
            return
        }
        const {insertedId: id} = await collection.insertOne({
            name: name.toLowerCase(),
            password,
            email: email.toLowerCase(),
            stats: {
                posts: [],
                videos: [],
                followers: [],
                following: [],
                description1: '',
                description2: '',
                occupation: '',
                avatar: ''
            }
        })
        res.json({id});
    } catch (err) {
        console.error(`Error retrieving data: ${err.message}`);
        res.status(500).send('Internal server error');
    }
}));

app.get('/user', asyncHandler(async (req, res) => {
    try {
        const {id} = req.query
        const collection = mongoose.connection.db.collection('users')
        const cursor = collection.find({_id: new ObjectId(id)})
        const usersFound = await cursor.toArray()
        res.json(usersFound[0]);
    } catch (err) {
        console.error(`Error retrieving data: ${err.message}`);
        res.status(500).send('Internal server error');
    }
}));

app.get('/mediafiles', asyncHandler(async (req, res) => {
    try {
        const {userId} = req.query
        const collection = mongoose.connection.db.collection('mediafiles')
        const cursor = collection.find({userId})
        const posts = await cursor.toArray()
        res.json({userId, posts});
    } catch (err) {
        console.error(`Error retrieving data: ${err.message}`);
        res.status(500).send('Internal server error');
    }
}));

app.post('/like', asyncHandler(async (req, res) => {
    try {
        const {userId, mediafileId} = req.query
        const collection = mongoose.connection.db.collection('mediafiles')
        const filter = {_id: new ObjectId(mediafileId)}
        const cursor = collection.find(filter)
        const mediafile = await cursor.toArray()
        const {likes} = mediafile[0]
        const isLiked = likes.includes(userId)

        console.log(likes)
        const likeMediafile = {
            $push: {
                likes: userId
            }
        }
        const unlikeMediafile = {
            $pull: {
                likes: userId
            }
        }
        if (isLiked) {
            collection.updateOne(filter, unlikeMediafile)
            res.json({userId, mediafileId, message: "Unliked!"});
        } else {
            collection.updateOne(filter, likeMediafile)
            res.json({userId, mediafileId, message: "Liked!"});
        }
    } catch (err) {
        console.error(`Error retrieving data: ${err.message}`);
        res.status(500).send('Internal server error');
    }
}));

app.post('/comments', asyncHandler(async (req, res) => {
    try {
        const {userId, mediafileId, comment} = req.query
        // Insert comment in comments collection
        const comments = mongoose.connection.db.collection('comments')
        const {insertedId: commentId} = await comments.insertOne({
            userId,
            mediafileId,
            text: comment,
            timestamp: Date.now()
        })
        // Add commentid to mediafile
        const collection = mongoose.connection.db.collection('mediafiles')
        const filter = {_id: new ObjectId(mediafileId)}
        const commentMediafile = {
            $push: {
                comments: commentId
            }
        }
        collection.updateOne(filter, commentMediafile)
        res.json({userId, mediafileId, message: "Commented!"});
    } catch (err) {
        console.error(`Error retrieving data: ${err.message}`);
        res.status(500).send('Internal server error');
    }
}));

// GET list of comments by mediafileId
app.get('/comments', asyncHandler(async (req, res) => {
    try {
        const { mediafileId } = req.query
        const collection = mongoose.connection.db.collection('comments')
        const cursor = collection.find({mediafileId})
        const comments = await cursor.toArray()
        res.json(comments);
    } catch (err) {
        console.error(`Error retrieving data: ${err.message}`);
        res.status(500).send('Internal server error');
    }
}));


const multer = require("multer");
const {SERVER_PORT} = require("./settings");
const {settings} = require("express/lib/application");
let insertedid = ''
const upload = multer({
    storage: multer.diskStorage({
        destination: async (req, file, cb) => {
            const userId = req.headers.userid
            const mediaType = req.headers.mediatype
            let dir = `uploads/${userId}/${mediaType}/`;
            console.log(dir)
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, {recursive: true});
            }
            cb(null, dir);
            const ext = MIME_TYPE_MAP[file.mimetype];
            console.log(ext)
            const collection = mongoose.connection.db.collection('mediafiles')
            const {insertedId} = await collection.insertOne({
                userId,
                mediaType,
                timestamp: Date.now(),
                likes: [],
                comments: [],
            })
            const filter = {insertedId}
            const path = dir + insertedId + '.' + ext
            console.log(path)
            const updateMediafile = {
                $set: {path}
            }
            collection.updateOne({_id: new ObjectId(insertedId)},updateMediafile)
            insertedid = insertedId

        },
        filename: (req, file, cb) => {
            ext = MIME_TYPE_MAP[file.mimetype];
            const name = String(insertedid) + '.' + ext;
            if (!!ext) {
                cb(null, name);
            } else {
                console.error('error at writing file to disk !!')
            }

        },
    }),
});

const MIME_TYPE_MAP = {
    'image/png': 'png',
    'image/jpeg': 'jpeg',
    'image/jpg': 'jpg',
    'video/mp4': 'mp4',
    'video/quicktime': 'quicktime'
};

app.post("/upload_files", upload.array("files"), async function (req, res) {
    res.json({message: "Successfully uploaded files"});
});

app.listen(SERVER_PORT, () => {
    console.log(`Server listening on port ${SERVER_PORT} !!`);
});