const http = require('http');
const express = require('express');
const socketio = require('socket.io');
const cors = require('cors');
const app = express();
const mongoose = require("mongoose");
const {
  addUser,
  getUsersInRoom,
  getRoomByUserId,
  removeUserWithId,
  addWordBank,
  setCurrentWord,
  setCurrentWordToNull,
  addScoreForUser,
  deleteRoom,
  suffledUnPlayedWords,
  setWordBankToUnPlayedWords,
  resetScoreToZero,
  deleteWord
} = require("./utilities/roomHelper")

const router = require('./router');

//boilerplate setup to create an instance of socket.io
const server = http.createServer(app);
const io = socketio(server);

//added by Chris

const path = require("path");
// const PORT = process.env.PORT || 3001;
app.use(express.urlencoded({
  extended: true
}));
app.use(express.json());

// app.listen(PORT, () => {
//   console.log(`🌎 ==> API server now on port ${PORT}!`);
// });

//end

//Mongoose connections
// mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost/Quizzly",
// {useNewUrlParser: true, useUnifiedTopology: true, useCreateIndex: true, useFindAndModify: false});

mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost/Quizzly");

if (process.env.NODE_ENV === "production") {
  console.log("this is production")
  app.use(express.static("client/build"));
}
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});
app.use(cors());
app.use(router);

//built in method, runs when we have an instance of client connection
io.on('connect', (socket) => {
  socket.on('join', ({
    name,
    room
  }, callback) => {
    (async () => {
      try {
        const id = socket.id;
        const {
          error,
          Room
        } = await addUser(name, room, id);
        if (error) return callback(error);
        socket.join(Room.roomName);

        socket.emit('message', {
          user: 'Admin',
          text: `${name}, welcome to room ${Room.roomName}.`
        });
        socket.broadcast.to(Room.roomName).emit('message', {
          user: 'Admin',
          text: `${name} has joined!`
        });

        io.to(Room.roomName).emit('roomData', {
          room: Room,
          users: await getUsersInRoom(Room.roomName),
          userID: socket.id
        });

        callback();
      } catch (err) {
        throw err
      }
    })();
  });

  socket.on('sendMessage', (message, name, room, callback) => {
    console.log("name, message, room:", name, message, room);

    // maybe check if room exist??
    io.to(room).emit('message', {
      user: name,
      text: message
    });

    callback();
  });


  socket.on('addWord', (flashCard, room, callback) => {
    (async () => {
      try {
        const wordToAdd = flashCard
        const newRoomData = await addWordBank(wordToAdd, room);
        socket.emit('newWord', newRoomData);
        socket.broadcast.to(room).emit('newWord', newRoomData);
        callback(newRoomData);
      } catch (err) {
        throw err
      }
    })();
  });

  socket.on("deleteWord", (flashCard, room, callback) => {
    (async () => {
      try {
        const wordToDelete = flashCard;
        const newRoomData = await deleteWord(room, wordToDelete);
        socket.emit('deleteWord', newRoomData);
        socket.broadcast.to(room).emit('deleteWord', newRoomData);
        callback(newRoomData)
      }
      catch(err) {
        throw err
      }
    })();
  })

  socket.on("startGame", (callback) => {
    (async () => {
      try {
        const room = await getRoomByUserId(socket.id)
        const wordBank = room.wordBank;
        await setWordBankToUnPlayedWords(room.roomName, wordBank);
        await suffledUnPlayedWords(room.roomName);
        setCurrentWord(room.roomName, (newRoomData) => {
          io.to(room.roomName).emit('startGame', newRoomData)
          callback();
        })
      } catch (err) {
        throw err
      }

    })()
  });

  socket.on("endGame", (room, callback) => {

  (async () => {
    try {
      console.log("You ended the Game");
      const roomData = await setCurrentWordToNull(room)
      const newRoomData = await resetScoreToZero(roomData.roomName, roomData.users)
      io.to(newRoomData.roomName).emit('endGame', newRoomData)
      callback();
    }
    catch (err){
      throw err
    }
  })();
  });

  socket.on("correctAnswerSubmitted", (message, name, room, callback) => {
    console.log(message, name, room);
    (async () => {
      try {
        await addScoreForUser(socket.id);

        setCurrentWord(room, (newRoomData) => {
          console.log("SENDING UPDATED SCORE", newRoomData);
          io.to(room).emit('correctAnswerSubmitted', newRoomData)
          callback(newRoomData);
        })
      } catch (err) {
        throw err
      }
    })();
  })


  socket.on('disconnect', () => {
    // const user = removeUser(socket.id);
    (async () => {
      try {
        //Find room that user is in.
        const room = await getRoomByUserId(socket.id)
        // find the user
        let user = room.users.find(user => {
          return user.id === socket.id
        });
        // if the user is the host
        if (user && user.id === room.hostId) {
          // delete the room the host is in
          await deleteRoom(room.roomName)
          io.to(user.room).emit('message', {
            user: 'Admin',
            text: `The host has left the room. The room is now closed`
          });
        } else {
          // remove the user from the room
          await removeUserWithId(socket.id)
          io.to(user.room).emit('message', {
            user: 'Admin',
            text: `${user.name} has left.`
          });
          io.to(user.room).emit('roomData', {
            room: room,
            users: await getUsersInRoom(user.room)
          });

        }
      } catch (err) {
        throw err
      }
    })();
  })
});


// app.get("*", (req, res) => {
//   res.sendFile(path.join(__dirname, "./client/build/index.html"));
// });

server.listen(process.env.PORT || 5000, () => console.log(`Server listening on http://localhost:5000.`));