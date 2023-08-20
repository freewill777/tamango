const mongoose = require("mongoose");
const express = require("express");
var cors = require("cors");
const asyncHandler = require("express-async-handler");
const app = express();
const ObjectId = require("mongoose").Types.ObjectId;
const { MONGO_URL } = require("./settings");
var fs = require("fs");
const path = require("path");
const http = require("http");
const moment = require("moment/moment");

app.use(cors());

mongoose.connect(MONGO_URL);

function createChatLedger() {
	const messages = [];

	function addMessage(message) {
		messages.push(message);
	}

	function getMessages() {
		return messages;
	}

	return {
		addMessage,
		getMessages,
	};
}

const ledger = createChatLedger();

const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

if (!fs.existsSync("./events")) {
	fs.mkdirSync("./events", { recursive: true });
}

io.on("connection", (socket) => {
	setTimeout(() => io.emit("chat ledger", ledger.getMessages()), 500);
	socket.on("chat message", (msg) => {
		console.log("message: " + msg);
		ledger.addMessage({ ...msg, date: moment().calendar() });
		io.emit("chat ledger", ledger.getMessages());
	});
	socket.on("disconnect", () => {
		console.log("disconnect");
	});
});

server.listen(4000, () => {
	console.log("sockets listening on 3000");
});

app.get(
	"/login",
	asyncHandler(async (req, res) => {
		try {
			var { email, password } = req.query;
			const collection = mongoose.connection.db.collection("users");
			const cursor = collection.find({ email: email.toLowerCase() });
			const usersFound = await cursor.toArray();
			if (usersFound.length === 0) {
				res.status(500).json("User does not exist");
				return;
			}
			const user = usersFound[0];
			const { _id } = user;
			if (password === user.password) {
				res.json({ id: _id });
			} else {
				res.status(401).json({});
			}
		} catch (err) {
			console.error(`Error retrieving data: ${err.message}`);
			res.status(500).json("Internal server error");
		}
	})
);

app.post(
	"/register",
	asyncHandler(async (req, res) => {
		try {
			var { name, password, email } = req.query;
			const collection = mongoose.connection.db.collection("users");
			const cursor = collection.find({ email: email.toLowerCase() });
			const usersFound = await cursor.toArray();
			if (usersFound.length > 0) {
				res.status(500).json("A user with this e-mail already exists");
				return;
			}
			const { insertedId: id } = await collection.insertOne({
				name: name.toLowerCase(),
				password,
				email: email.toLowerCase(),
				stats: {
					posts: [],
					videos: [],
					followers: [],
					following: [],
					description1: "",
					description2: "",
					occupation: "",
					avatar: "",
				},
			});

			fs.mkdirSync(`./uploads/${id}/avatar`, { recursive: true });
			fs.mkdirSync(`./uploads/${id}/image`, { recursive: true });
			fs.mkdirSync(`./uploads/${id}/story`, { recursive: true });
			fs.mkdirSync(`./uploads/${id}/video`, { recursive: true });

			res.status(200).json({ id });
		} catch (err) {
			res.status(537).json("Error when creating user");
		}
	})
);

app.get(
	"/user",
	asyncHandler(async (req, res) => {
		try {
			const { id } = req.query;
			const collection = mongoose.connection.db.collection("users");
			const cursor = collection.find({ _id: new ObjectId(id) });
			const usersFound = await cursor.toArray();
			res.json(usersFound[0]);
		} catch (err) {
			res.status(500).json("Internal server error");
		}
	})
);

//GET Mediafiles by {userId}
app.get(
	"/mediafiles",
	asyncHandler(async (req, res) => {
		try {
			const { userId } = req.query;
			const collection = mongoose.connection.db.collection("mediafiles");
			const cursor = collection.find({ userId });
			const posts = await cursor.toArray();
			res.json({ userId, posts });
		} catch (err) {
			res.status(500).json("Internal server error");
		}
	})
);

//{userId} likes {mediafileId}
app.post(
	"/like",
	asyncHandler(async (req, res) => {
		try {
			const { userId, mediafileId } = req.query;
			const collection = mongoose.connection.db.collection("mediafiles");
			const filter = { _id: new ObjectId(mediafileId) };
			const cursor = collection.find(filter);
			const mediafile = await cursor.toArray();
			const { likes } = mediafile[0];
			const isLiked = likes.includes(userId);
			const likeMediafile = {
				$push: {
					likes: userId,
				},
			};
			const unlikeMediafile = {
				$pull: {
					likes: userId,
				},
			};
			if (isLiked) {
				collection.updateOne(filter, unlikeMediafile);
				res.json({ userId, mediafileId, message: "Unliked!" });
			} else {
				collection.updateOne(filter, likeMediafile);
				res.json({ userId, mediafileId, message: "Liked!" });
			}
		} catch (err) {
			res.status(500).json("Internal server error");
		}
	})
);

//{senderUserId} follows  {recvUserId}
app.post(
	"/follow",
	asyncHandler(async (req, res) => {
		try {
			const { senderUserId, recvUserId } = req.query;
			const collection = mongoose.connection.db.collection("users");

			const recvFilter = { _id: new ObjectId(recvUserId) };
			const recvCursor = collection.find(recvFilter);
			const recvUser = await recvCursor.toArray();

			const senderFilter = { _id: new ObjectId(senderUserId) };

			const { stats } = recvUser[0];
			const { followers } = stats;
			const isFollowed = followers.includes(senderUserId);

			if (isFollowed) {
				collection.updateOne(recvFilter, {
					$pull: { "stats.followers": senderUserId },
				});
				collection.updateOne(senderFilter, {
					$pull: { "stats.following": recvUserId },
				});
				res.json({ message: `${senderUserId} unfollowed ${recvUserId}!` });
			}
			if (!isFollowed) {
				collection.updateOne(recvFilter, {
					$push: { "stats.followers": senderUserId },
				});
				collection.updateOne(senderFilter, {
					$push: { "stats.following": recvUserId },
				});
				res.json({ message: `${senderUserId} followed ${recvUserId}!` });
			}
		} catch (err) {
			console.error(`Error retrieving data: ${err.message}`);
			res.status(500).json("Internal server error");
		}
	})
);

//Get list of users {userId} is following
app.get("/following", async (req, res) => {
	const { userId } = req.query;
	const collection = mongoose.connection.db.collection("users");
	const cursor = collection.find({ _id: new ObjectId(userId) });
	const users = await cursor.toArray();
	const { following: followingIds } = users[0].stats;
	const following = followingIds.map(async (id) => {
		const cursorFollowing = collection.find({ _id: new ObjectId(id) });
		const usersFollowing = await cursorFollowing.toArray();
		const { name } = usersFollowing[0];
		return { id, name };
	});
	res.json(await Promise.all(following));
});

//Get list of users following {userId}
app.get("/followers", async (req, res) => {
	const { userId } = req.query;
	const collection = mongoose.connection.db.collection("users");
	const cursor = collection.find({ _id: new ObjectId(userId) });
	const users = await cursor.toArray();
	const { followers: followerIds } = users[0].stats;

	const followers = followerIds.map(async (id) => {
		const cursorFollowing = collection.find({ _id: new ObjectId(id) });
		const usersFollowing = await cursorFollowing.toArray();
		const { name } = usersFollowing[0];

		return { id, name };
	});
	res.json(await Promise.all(followers));
});

//Create Group by {name}
app.post(
	"/group",
	asyncHandler(async (req, res) => {
		try {
			const { name } = req.query;
			const collection = mongoose.connection.db.collection("groups");
			const { insertedId: id } = await collection.insertOne({
				groupName: name,
				members: [],
				files: [],
			});
			res.json({ id });
		} catch (err) {
			console.error(`Error retrieving data: ${err.message}`);
			res.status(500).json("Internal server error");
		}
	})
);

//Get groups
app.get("/groups", async (req, res) => {
	const collection = mongoose.connection.db.collection("groups");
	const cursor = collection.find();
	const groups = await cursor.toArray();

	res.json(groups);
});

//Join/Leave group by {groupId, userId, action}
app.put(
	"/group",
	asyncHandler(async (req, res) => {
		try {
			const { groupId, userId, action } = req.query;
			const collection = mongoose.connection.db.collection("groups");
			const filter = { _id: new ObjectId(groupId) };
			const cursor = collection.find(filter);
			const groupFound = await cursor.toArray();
			const { members } = groupFound[0];

			if (!members.includes(userId) && action === "join") {
				await collection.updateOne(filter, {
					$push: {
						members: userId,
					},
				});
				res.status(200).json("User joined group.");
			} else if (members.includes(userId) && action == "join") {
				res.status(201).json("User is already a member of the group.");
			}

			if (members.includes(userId) && action === "leave") {
				await collection.updateOne(filter, {
					$pull: {
						members: userId,
					},
				});
				res.status(200).json("User left group.");
			} else if (!members.includes(userId) && action == "leave") {
				res.status(201).json("User is not a member of the group.");
			}
		} catch (err) {
			res.status(500).json("Internal server error");
		}
	})
);

//Add comment to mediafile by {userId, mediafileId, comment}
app.post(
	"/comments",
	asyncHandler(async (req, res) => {
		try {
			const { userId, mediafileId, comment } = req.query;
			// Insert comment in comments collection
			const comments = mongoose.connection.db.collection("comments");
			const { insertedId: commentId } = await comments.insertOne({
				userId,
				mediafileId,
				text: comment,
				timestamp: Date.toLocaleString(),
			});
			// Add commentid to mediafile
			const collection = mongoose.connection.db.collection("mediafiles");
			const filter = { _id: new ObjectId(mediafileId) };
			const commentMediafile = {
				$push: {
					comments: commentId,
				},
			};
			collection.updateOne(filter, commentMediafile);
			res.json({ userId, mediafileId, message: "Commented!" });
		} catch (err) {
			console.error(`Error retrieving data: ${err.message}`);
			res.status(500).json("Internal server error");
		}
	})
);

// GET list of comments by mediafileId
app.get(
	"/comments",
	asyncHandler(async (req, res) => {
		try {
			const { mediafileId } = req.query;
			const collection = mongoose.connection.db.collection("comments");
			const cursor = collection.find({ mediafileId });
			const comments = await cursor.toArray();
			res.json(comments);
		} catch (err) {
			console.error(`Error retrieving data: ${err.message}`);
			res.status(500).json("Internal server error");
		}
	})
);
	
// GET User Avatar
app.get("/avatar", (req, res) => {
	const { userId } = req.query;
	const photoDirPath = path.join(__dirname, "uploads", userId, "avatar");
	const photoFileNames = fs.readdirSync(photoDirPath);
	const photoPaths = photoFileNames.map((fileName) =>
		path.join(photoDirPath, fileName)
	);
	if (photoPaths.length > 0) {
		res.sendFile(photoPaths[0]);
	} else {
		res.status(404).json("No photos found");
	}
});

// GET User Media
app.get("/media", (req, res) => {
	const { userId, index } = req.query;
	const dirPath = path.join(__dirname, "uploads", userId, "media");

	fs.mkdir(dirPath, (err) => {
		if (err) return;
	});
	const fileNames = fs.readdirSync(dirPath);
	const filePaths = fileNames.map((fileName) =>
		path.join(dirPath, fileName)
	);
	if (filePaths.length > 0) {
		res.sendFile(filePaths[index]);
	} else {
		res.status(469).json("No files found");
	}
});

//GET User Photo by {userId, index}
app.get("/photo", (req, res) => {
	const { userId, index } = req.query;
	const dirPath = path.join(__dirname, "uploads", userId, "image");
	fs.mkdir(dirPath, (err) => {
		if (err) {
			return;
		}
	});
	const photoFileNames = fs.readdirSync(dirPath);
	const photoPaths = photoFileNames.map((fileName) =>
		path.join(dirPath, fileName)
	);
	if (photoPaths.length > 0) {
		res.sendFile(photoPaths[index]);
	} else {
		res.status(404).json("No photos found");
	}
});


app.get("/photos-length", (req, res) => {
	const { userId } = req.query;
	const photoDirPath = path.join(__dirname, "uploads", userId, "image");
	const photoFileNames = fs.readdirSync(photoDirPath);
	res.json(photoFileNames.length);
});

app.get("/video", (req, res) => {
	const { userId, index } = req.query;
	const dirPath = path.join(__dirname, "uploads", userId, "video");

	fs.mkdir(dirPath, (err) => {
		if (err) return;
	});
	const photoFileNames = fs.readdirSync(dirPath);
	const photoPaths = photoFileNames.map((fileName) =>
		path.join(dirPath, fileName)
	);
	if (photoPaths.length > 0) {
		res.sendFile(photoPaths[index]);
	} else {
		res.status(404).json("No photos found");
	}
});

app.get("/videos-length", (req, res) => {
	const { userId } = req.query;
	const photoDirPath = path.join(__dirname, "uploads", userId, "video");
	const photoFileNames = fs.readdirSync(photoDirPath);
	res.json(photoFileNames.length);
});

//GET newsfeed by {userId}
app.get("/newsfeed", async (req) => {
	const { userId } = req.query;
	const collection = mongoose.connection.db.collection("newsfeed");
	const cursor = collection.find({ userId });
	return await cursor.toArray();
});

const multer = require("multer");
const { SERVER_PORT } = require("./settings");

let insertedid = "";

const upload = multer({
	storage: multer.diskStorage({
		destination: async (req, file, cb) => {
			const {
				userid: userId,
				mediatype: mediaType,
				story,
				iseventimage: isEventImage,
				eventid: eventId,
			} = req.headers;

			const { avatar } = req.query;
			let dir = `uploads/${userId}/${mediaType}/`;
			let dir2 = `uploads/${userId}/media`;
			if (story === "yes") {
				dir = `uploads/${userId}/story`;
			}

			if (isEventImage === "yes") {
				dir = `events/${eventId}/media`;
			}

			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}
			if (avatar) {
				dir = `uploads/${userId}/avatar/`;
				try {
					fs.rmdirSync(dir, { recursive: true });
				} catch (err) {
					console.error(err);
				}
			}
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}

			const ext = MIME_TYPE_MAP[file.mimetype];
			const collection = mongoose.connection.db.collection("mediafiles");
			const { insertedId } = await collection.insertOne({
				userId,
				mediaType,
				timestamp: Date.now(),
				likes: [],
				comments: [],
			});
			const path = dir + insertedId + "." + ext;
			const updateMediafile = {
				$set: { path },
			};
			collection.updateOne({ _id: new ObjectId(insertedId) }, updateMediafile);
			insertedid = insertedId;
			cb(null, dir);
			cb(null, dir2);
		},
		filename: (req, file, cb) => {
			const ext = MIME_TYPE_MAP[file.mimetype];
			const name = String(insertedid) + "." + ext;
			if (ext) {
				cb(null, name);
			} else {
				console.error("error at writing file to disk !!");
			}
		},
	}),
});

const MIME_TYPE_MAP = {
	"image/png": "png",
	"image/jpeg": "jpeg",
	"image/jpg": "jpg",
	"video/mp4": "mp4",
	"video/quicktime": "mov",
};

app.post("/upload_files", upload.array("files"), async function (req, res) {
	res.json({ message: "Successfully uploaded files" });
});

app.get("/stories", async (req, res) => {
	const stories = [{ key: 1, name: "Add Story" }];
	const rootPath = path.resolve(__dirname, "uploads");

	const collection = mongoose.connection.db.collection("users");
	const cursor = collection.find();
	const users = await cursor.toArray();

	users.forEach((user) => {
		const fullPath = path.join(rootPath, user._id.toString(), "story");
		const storiesList = fs.readdirSync(fullPath);
		if (storiesList.length) {
			stories.push({ id: user._id.toString(), userName: user.name });
		}
	});

	res.json(stories);
});

//GET story by {userId, index}
const sharp = require("sharp");

app.get("/story", async (req, res) => {
	const { userId, index } = req.query;
	const dirPath = path.join(__dirname, "uploads", userId, "story");
	const fileNames = fs.readdirSync(dirPath);

	if (index < 0 || index >= fileNames.length) {
		return res.status(400).send("Invalid index");
	}

	const filePath = path.join(dirPath, fileNames[index]);

	if (filePath.includes(".jpeg")) {
		handleJpegFile(filePath, res);
	} else if (filePath.includes(".mp4")) {
		res.set("Content-Type", "video/mp4");
		res.sendFile(filePath);
		// await handleMovFileAsync(filePath, res);
	} else {
		res.status(400).send("Invalid file type");
	}
});

function handleJpegFile(filePath, res) {
	console.log("jpeg ==============");
	sharp(filePath)
		.resize({ width: 400 })
		.jpeg({ quality: 30 })
		.rotate()
		.toBuffer((err, data) => {
			if (err) {
				console.error("Error processing image:", err);
				return res.status(400).send("Error processing image");
			}

			res.set("Content-Type", "image/jpeg");
			res.send(data);
		});
}

app.get("/events", async (req, res) => {
	const collection = mongoose.connection.db.collection("events");
	const cursor = collection.find();
	const events = await cursor.toArray();

	res.json(events);
});

app.delete("/events/:eventId", async (req, res) => {
	const eventId = req.params.eventId;

	try {
		const collection = mongoose.connection.db.collection("events");
		const result = await collection.deleteOne({
			_id: mongoose.Types.ObjectId(eventId),
		});

		if (result.deletedCount === 1) {
			res.json({ message: "Event deleted successfully" });
		} else {
			res.status(404).json({ error: "Event not found" });
		}
	} catch (error) {
		res
			.status(500)
			.json({ error: "An error occurred while deleting the event" });
	}
});

app.get(
	"/event",
	asyncHandler(async (req, res) => {
		try {
			const { id } = req.query;
			const collection = mongoose.connection.db.collection("events");
			const cursor = collection.find({ _id: new mongoose.Types.ObjectId(id) });
			const found = await cursor.toArray();
			res.json(found[0]);
		} catch (err) {
			console.error(err);
			res.status(500).json("Internal server error");
		}
	})
);

app.get("/event-media", (req, res) => {
	const { eventId } = req.query;
	const photoDirPath = path.join(__dirname, "events", eventId, "media");
	const photoFileNames = fs.readdirSync(photoDirPath);
	const photoPaths = photoFileNames.map((fileName) =>
		path.join(photoDirPath, fileName)
	);
	if (photoPaths.length > 0) {
		res.sendFile(photoPaths[0]);
	} else {
		res.status(404).json("No photos found");
	}
});

app.post("/events", async (req, res) => {
	const { userid, eventdate, eventname } = req.headers;

	const collection = mongoose.connection.db.collection("events");
	const { insertedId } = await collection.insertOne({
		date: eventdate,
		name: eventname,
	});

	fs.mkdirSync(`./events/${insertedId}`, { recursive: true });
	fs.mkdirSync(`./events/${insertedId}/media`, { recursive: true });
	fs.appendFile(
		`./events/${insertedId}/info.txt`,
		`
    event id: ${insertedId};
    user id: ${userid};
    event date: ${eventdate};
    event name: ${eventname};
    media files: ${insertedId} // ??
  `,
		function (err) {
			if (err) throw err;
			console.log("Saved!");
		}
	);

	res.json({ id: insertedId });
});

app.listen(SERVER_PORT, () => {
	console.log(`express listening on port ${SERVER_PORT} !!`);
});
