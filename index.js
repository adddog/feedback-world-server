require("dotenv").config()
var ip = require("ip")
const spawn = require("child_process").spawnSync
const RS = require("randomstring")
const fs = require("fs")
const uuid = require("uuid")
const cors = require("cors")
const randomWord = require("random-word")
const path = require("path")
const https = require("https")
const http = require("http")
const express = require("express")
var bodyParser = require("body-parser")
const fileUpload = require("express-fileupload")
const SignalSockets = require("signal-master/sockets")
const config = require("getconfig")
var getHomePath = require("home-path")

const Passport = require("./passport")

const colors = require("colors")
const geolib = require("geolib")
const {
  isFunction,
  forIn,
  find,
  values,
  keys,
  compact,
  filter,
} = require("lodash")
const { parse } = require("path")

//*******************
//EXPRESS
//*******************

const app = express()

var options = {
  debug: true,
}

app.use(cors())
//app.use(require("express-force-ssl"))
app.use(bodyParser.urlencoded({ extended: false }))
app.use(
  fileUpload({
    limits: { fileSize: 400 * 1024 * 1024 },
  })
)

var router = express.Router()
app.use(router)

/*var server = https.createServer(
  {
    key: fs.readFileSync(
      path.join(getHomePath(), ".localhost-ssl/local_key.pem")
    ),
    cert: fs.readFileSync(
      path.join(getHomePath(), ".localhost-ssl/local_cert.pem")
    ),
  },
  app
)*/

const host =
  process.env.NODE_ENV === "production" ? "127.0.0.1" : "localhost"

//server.listen(process.env.PORT, host)

var server = app.listen(process.env.PORT)

console.log(
  `Listening ${process.env.PROTOCALL} on port  ${process.env.PORT}  on  ${host}`
)

const passport = Passport(app)

//*******************
//express ROUTING
//*******************

router.post("/upload", function(req, res) {
  if (!req.files)
    return res.status(400).send("No files were uploaded.")

  const { video } = req.files
  const name = `${randomWord()} ${randomWord()}.mp4`
  fs.writeFileSync(path.join(__dirname, name), video.data)

  const child = spawn(`youtube-upload`, [
    `--title=${name}`,
    `${name}`,
    `--client-secrets=yt.json`,
    `--playlist PLZRcgvIPIUuVvBYeb2Jk6A8RyrZdk33qp`,
  ])
  const stderr = child.stderr.toString("utf-8")
  const stdout = child.stdout.toString("utf-8")

  fs.unlinkSync(path.join(__dirname, name))

  res.send({ videoId: stdout })
})

router.get("/", function(req, res) {
  res.status(200).send("nothing to see here...")
})

router.get("/room", function(req, res) {
  res.send({ roomId: getNewRoom() })
})

//*******************
//SOCKETS
//*******************

const MAX_MEMBERS_ROOM = 4

var io = SignalSockets(server, config)

const userIds = new Set()
const rooms = new Map()
const roomIds = new Set()

const getAvailableRoomIdsToJoin = () => {
  let _roomIds = []
  for (let room of rooms.values()) {
    if (room.members.size < MAX_MEMBERS_ROOM) {
      _roomIds.push(room.id)
    }
  }
  return _roomIds
}

const getNewRoom = () => {
  let r, _found
  while (!_found) {
    r = RS.generate({
      length: 3,
      charset: "alphabetic",
    })
    _found = !roomIds.has(r)
  }
  return r
}

const createRoom = ({ socketId, roomId }) => {
  if (rooms.has(roomId)) {
    rooms.get(roomId).members.add(socketId)
  } else {
    rooms.set(roomId, {
      id: roomId,
      members: new Set([socketId]),
    })
    console.log(colors.green(`Broadcast room:get ${roomId}`))
  }
  console.log(
    `members in romm ${roomId}: ${rooms.get(roomId).members.size}`
  )
  console.log(rooms.values())
  io.sockets.emit("rooms:get", getAvailableRoomIdsToJoin())
}

const leaveRoom = ({ socketId, roomId }) => {
  if (rooms.has(roomId)) {
    let room = rooms.get(roomId)
    console.log(room)
    room.members.delete(socketId)
    console.log(
      colors.green(`member ${socketId} has left room ${roomId}. members left: ${room.members.size}`)
    )
    destroyRoomIfNoMembers({ room, roomId })
      /*console.log(
        `members in room ${roomId}: ${room.members.size}`
      )*/
    io.sockets.emit("rooms:get", getAvailableRoomIdsToJoin())
  }else{
    console.log(`trying to leaveRoom ${roomId} but it doesnt exist`);
  }
}

const destroyRoomIfNoMembers = ({ room, roomId }) => {
  if (!room.members) return
  if (!room.members.size) {
    room.members.clear()
    room.members = null
    rooms.delete(roomId)
    console.log(`room destroyed: ${roomId}`)
  }
}

io.on("connection", function(socket) {
  userIds.add(socket.id)
  console.log(colors.green(`Reveived id ${socket.id}`))
  console.log(colors.green(`All userIds`))
  console.log(userIds)

  socket.on("disconnect", function() {

    for (let room of rooms.values()) {
      leaveRoom({ socketId: socket.id, roomId: room.id })
      destroyRoomIfNoMembers({ room, roomId: room.id })
    }

    io.sockets.emit("rooms:get", getAvailableRoomIdsToJoin())
    userIds.delete(socket.id)

    console.log(colors.green(`Room remaining: ${rooms.size}`))
    forIn(socket._events, (val, key) => {
      if (isFunction(val)) {
        socket.removeListener(key, val)
        val = null
      }
    })
    console.log(colors.red(`Disconnected id ${socket.id}`))
    console.log(colors.yellow(`Users remaining ${userIds.size}`))
  })

  socket.on("handshake", function(data = {}) {
    if (data.roomId) {
      createRoom({ socketId: socket.id, roomId: data.roomId })
    }
  })

  //******

  socket.on("room:create", ({ roomId }) => {
    createRoom({ socketId: socket.id, roomId })
  })
  //******

  //******

  socket.on("room:leave", function({ roomId }) {
    leaveRoom({ socketId: socket.id, roomId })
  })
  //******

  socket.on("rooms:get", function() {
    socket.emit("rooms:get", getAvailableRoomIdsToJoin())
  })

  socket.on("rooms:canJoin", function({ roomId }) {
    if (!rooms.get(roomId)) {
      socket.emit("rooms:canJoin", {
        canJoin: true,
        members: null,
      })
    } else {
      socket.emit("rooms:canJoin", {
        canJoin: rooms.get(roomId).members.size < MAX_MEMBERS_ROOM,
        members: rooms.get(roomId).members.size,
      })
    }
  })
})
