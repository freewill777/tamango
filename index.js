const mongoose = require('mongoose');
const express = require('express');
var cors = require('cors')
const asyncHandler = require('express-async-handler')
const app = express();
const ObjectId = require('mongoose').Types.ObjectId;

let router = express.Router();

app.use(cors())

let User = require('./Models/User');

mongoose.connect('mongodb://127.0.0.1:27017/codex')

app.get('/login', asyncHandler(async (req, res) => {
    try {
        var { name, password } = req.query
        const collection = mongoose.connection.db.collection('users')
        const cursor = collection.find({ name })
        const usersFound = await cursor.toArray()
        if (usersFound.length === 0) {
            res.status(500).send('User does not exist');
            return
        }
        const user = usersFound[0]
        const { _id } = user
        if (password === user.password) {
            res.json({ id: _id });
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
        var { name, password } = req.query
        const collection = mongoose.connection.db.collection('users')
        const cursor = collection.find({ name })
        const usersFound = await cursor.toArray()
        if (usersFound.length > 0) {
            res.status(500).send('User already exists');
            return
        }
        const { insertedId: id } = await collection.insertOne({
            name,
            password,
            stats: {
                posts: 0,
                videos: 0,
                followers: 0,
                following: 0,
                description1: '',
                description2: '',
                occupation: '',
                avatar: ''
            }
        })
        res.json({ id });
    } catch (err) {
        console.error(`Error retrieving data: ${err.message}`);
        res.status(500).send('Internal server error');
    }
}));

app.get('/user', asyncHandler(async (req, res) => {
    try {
        const { id } = req.query
        const collection = mongoose.connection.db.collection('users')
        const cursor = collection.find({ _id: new ObjectId(id) })
        const usersFound = await cursor.toArray()
        res.json(usersFound[0]);
    } catch (err) {
        console.error(`Error retrieving data: ${err.message}`);
        res.status(500).send('Internal server error');
    }
}));

app.get('/blog', asyncHandler(async (req, res) => {
    try {
        const { id } = req.query
        const collection = mongoose.connection.db.collection('posts')
        const cursor = collection.find({})
        const posts = await cursor.toArray()
        res.json({ id, posts });
    } catch (err) {
        console.error(`Error retrieving data: ${err.message}`);
        res.status(500).send('Internal server error');
    }
}));

app.listen(3000, () => {
    console.log('Server listening on port 3000 !');
});