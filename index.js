const mongoose = require('mongoose');
const express = require('express');
var cors = require('cors')
const asyncHandler = require('express-async-handler')
const app = express();
const ObjectId = require('mongoose').Types.ObjectId;
const {MONGO_URL} = require("./settings");
var fs = require('fs');
const path = require('path');

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
        const cursor = collection.find({email: email.toLowerCase()})
        const usersFound = await cursor.toArray()
        if (usersFound.length > 0) {
            res.status(500).send('A user with this e-mail already exists');
            return
        }
        const {insertedId: id} = await collection.insertOne({
            name: name.toLowerCase(), password, email: email.toLowerCase(), stats: {
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

//GET Mediafiles by {userId}
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

//{userId} likes {mediafileId}
app.post('/like', asyncHandler(async (req, res) => {
    try {
        const {userId, mediafileId} = req.query
        const collection = mongoose.connection.db.collection('mediafiles')
        const filter = {_id: new ObjectId(mediafileId)}
        const cursor = collection.find(filter)
        const mediafile = await cursor.toArray()
        const {likes} = mediafile[0]
        const isLiked = likes.includes(userId)
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

//{senderUserId} follows  {recvUserId}
app.post('/follow', asyncHandler(async (req, res) => {
    try {
        const {senderUserId, recvUserId} = req.query
        const collection = mongoose.connection.db.collection('users')

        const recvFilter = {_id: new ObjectId(recvUserId)}
        const recvCursor = collection.find(recvFilter)
        const recvUser = await recvCursor.toArray()

        const senderFilter = {_id: new ObjectId(senderUserId)}

        const {stats} = recvUser[0]
        const {followers} = stats
        const isFollowed = followers.includes(senderUserId)

        if (isFollowed) {
            collection.updateOne(recvFilter, {$pull: {"stats.followers": senderUserId}})
            collection.updateOne(senderFilter, {$pull: {"stats.following": recvUserId}})
            res.json({message: `${senderUserId} unfollowed ${recvUserId}!`});
        }
        if (!isFollowed) {
            collection.updateOne(recvFilter, {$push: {"stats.followers": senderUserId}})
            collection.updateOne(senderFilter, {$push: {"stats.following": recvUserId}})
            res.json({message: `${senderUserId} followed ${recvUserId}!`});
        }
    } catch (err) {
        console.error(`Error retrieving data: ${err.message}`);
        res.status(500).send('Internal server error');
    }
}));

//Get list of users {userId} is following
app.get('/following', async (req, res) => {
    const {userId} = req.query
    const collection = mongoose.connection.db.collection('users')
    const cursor = collection.find({_id: new ObjectId(userId)})
    const users = await cursor.toArray()
    const {following: followingIds} = users[0].stats
    console.log(followingIds)
    const following = followingIds.map(async id => {
        const cursorFollowing = collection.find({_id: new ObjectId(id)})
        const usersFollowing = await cursorFollowing.toArray()
        const {name} = usersFollowing[0]
        console.log(id, name)
        return {id, name}
    })
    res.json(await Promise.all(following))
});

//Get list of users following {userId}
app.get('/followers', async (req, res) => {
    const {userId} = req.query
    const collection = mongoose.connection.db.collection('users')
    const cursor = collection.find({_id: new ObjectId(userId)})
    const users = await cursor.toArray()
    const {followers: followerIds} = users[0].stats
    console.log(followerIds)
    const followers = followerIds.map(async id => {
        const cursorFollowing = collection.find({_id: new ObjectId(id)})
        const usersFollowing = await cursorFollowing.toArray()
        const {name} = usersFollowing[0]
        console.log(id, name)
        return {id, name}
    })
    res.json(await Promise.all(followers))
});

//Create Group by {name}
app.post('/group', asyncHandler(async (req, res) => {
    try {
        const {name} = req.query
        const collection = mongoose.connection.db.collection('groups')
        const {insertedId: id} = await collection.insertOne({
            groupName: name, members: [], files: []
        })
        res.json({id});
    } catch (err) {
        console.error(`Error retrieving data: ${err.message}`);
        res.status(500).send('Internal server error');
    }
}));

//Join/Leave group by {groupId, userId, action}
app.put('/group', asyncHandler(async (req, res) => {
    try {
        const {groupId, userId, action} = req.query
        const collection = mongoose.connection.db.collection('groups')
        const filter = {_id: new ObjectId(groupId)}
        const cursor = collection.find(filter)
        const groupFound = await cursor.toArray()
        const {members} = groupFound[0]

        if (!members.includes(userId) && action === "join") {
            await collection.updateOne(filter, {
                $push: {
                    members: userId
                }
            })
            res.status(200).send('User joined group.');
        } else if (members.includes(userId) && action == "join"){
            res.status(201).send('User is already a member of the group.');
        }

        if (members.includes(userId) && action === "leave") {
            await collection.updateOne(filter, {
                $pull: {
                    members: userId
                }
            })
            res.status(200).send('User left group.');
        } else if (!members.includes(userId) && action == "leave"){
            res.status(201).send('User is not a member of the group.');
        }
    } catch (err) {
        console.error(`Error retrieving data: ${err.message}`);
        res.status(500).send('Internal server error');
    }
}));

//Add comment to mediafile by {userId, mediafileId, comment}
app.post('/comments', asyncHandler(async (req, res) => {
    try {
        const {userId, mediafileId, comment} = req.query
        // Insert comment in comments collection
        const comments = mongoose.connection.db.collection('comments')
        const {insertedId: commentId} = await comments.insertOne({
            userId, mediafileId, text: comment, timestamp: Date.now()
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
        const {mediafileId} = req.query
        const collection = mongoose.connection.db.collection('comments')
        const cursor = collection.find({mediafileId})
        const comments = await cursor.toArray()
        res.json(comments);
    } catch (err) {
        console.error(`Error retrieving data: ${err.message}`);
        res.status(500).send('Internal server error');
    }
}));

//GET photo by {userId, index}
app.get('/photo', (req, res) => {
    const {userId, index} = req.query
    const photoDirPath = path.join(__dirname, 'uploads', userId, 'image');
    const photoFileNames = fs.readdirSync(photoDirPath);
    const photoPaths = photoFileNames.map(fileName => path.join(photoDirPath, fileName));
    if (photoPaths.length > 0) {
        res.sendFile(photoPaths[index]);
    } else {
        res.status(404).send('No photos found');
    }
});

app.get('/avatar', (req, res) => {
    const {userId} = req.query
    const photoDirPath = path.join(__dirname, 'uploads', userId, 'avatar');
    const photoFileNames = fs.readdirSync(photoDirPath);
    const photoPaths = photoFileNames.map(fileName => path.join(photoDirPath, fileName));
    if (photoPaths.length > 0) {
        res.sendFile(photoPaths[0]);
    } else {
        res.status(404).send('No photos found');
    }
});

app.get('/photos-length', (req, res) => {
    const {userId} = req.query
    const photoDirPath = path.join(__dirname, 'uploads', userId, 'image');
    const photoFileNames = fs.readdirSync(photoDirPath);
    res.json(photoFileNames.length)
});

app.get('/video', (req, res) => {
    const {userId, index} = req.query
    const photoDirPath = path.join(__dirname, 'uploads', userId, 'video');
    const photoFileNames = fs.readdirSync(photoDirPath);
    const photoPaths = photoFileNames.map(fileName => path.join(photoDirPath, fileName));
    if (photoPaths.length > 0) {
        res.sendFile(photoPaths[index]);
    } else {
        res.status(404).send('No photos found');
    }
});

app.get('/videos-length', (req, res) => {
    const {userId} = req.query
    const photoDirPath = path.join(__dirname, 'uploads', userId, 'video');
    const photoFileNames = fs.readdirSync(photoDirPath);
    res.json(photoFileNames.length)
});

//GET newsfeed by {userId}
app.get('/newsfeed', async (req, res) => {
    const {userId} = req.query
    const collection = mongoose.connection.db.collection('newsfeed')
    const cursor = collection.find({userId})
    return await cursor.toArray()
});


const multer = require("multer");
const {SERVER_PORT} = require("./settings");
let insertedid = ''
const upload = multer({
    storage: multer.diskStorage({
        destination: async (req, file, cb) => {
            const {userid: userId, mediatype: mediaType} = req.headers
            const { avatar } = req.query
            let dir = `uploads/${userId}/${mediaType}/`;
            if (!!avatar) {
                dir = `uploads/${userId}/avatar/`;
            }
            console.log(dir)
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, {recursive: true});
            }

            const ext = MIME_TYPE_MAP[file.mimetype];
            console.log(ext)
            const collection = mongoose.connection.db.collection('mediafiles')
            const {insertedId} = await collection.insertOne({
                userId, mediaType, timestamp: Date.now(), likes: [], comments: [],
            })
            const path = dir + insertedId + '.' + ext
            console.log(path)
            const updateMediafile = {
                $set: {path}
            }
            collection.updateOne({_id: new ObjectId(insertedId)}, updateMediafile)
            insertedid = insertedId
            cb(null, dir);
        }, filename: (req, file, cb) => {
            const ext = MIME_TYPE_MAP[file.mimetype];
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
    'image/png': 'png', 'image/jpeg': 'jpeg', 'image/jpg': 'jpg', 'video/mp4': 'mp4', 'video/quicktime': 'mov'
};

app.post("/upload_files", upload.array("files"), async function (req, res) {
    res.json({message: "Successfully uploaded files"});
});

app.listen(SERVER_PORT, () => {
    console.log(`Server listening on port ${SERVER_PORT} !!`);
});