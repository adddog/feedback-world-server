require("dotenv").config()
var ip = require('ip');
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

const app = express()

app.get("/", function(req, res, next) {
  res.send("Hello world!")
})

var getHomePath = require("home-path")

var server = https.createServer(
  {
    key: fs.readFileSync(
      path.join(getHomePath(), ".localhost-ssl/key.pem")
    ),
    cert: fs.readFileSync(
      path.join(getHomePath(), ".localhost-ssl/cert.pem")
    ),
  },
  app
)

const host = process.env.NODE_ENV==="production" ? "127.0.0.1" : "0.0.0.0"
server.listen(process.env.PORT, host)

console.log(`Listening https on port  ${process.env.PORT}  on  ${host}`)

var options = {
  debug: true,
}

app.use(cors())
app.use(require("express-force-ssl"))
app.use(bodyParser.urlencoded({ extended: false }))
app.use(
  fileUpload({
    limits: { fileSize: 400 * 1024 * 1024 },
  })
)

var router = express.Router()
app.use(router)

const passport = Passport(app)

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

var io = SignalSockets(server, config)

const users = {}
const rooms = {}
const userIds = []
const roomIds = new Set()

const getAvailableRoomIdsToJoin = () =>
  values(rooms)
    .filter(({ members }) => members.length <= 4)
    .map(({ id }) => id)

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

router.get("/", function(req, res) {
  res.status(200).send("nothing to see here...")
})

router.get("/room", function(req, res) {
  console.log(getNewRoom())
  res.send({ roomId: getNewRoom() })
})

io.on("connection", function(socket) {
  socket.on("disconnect", function() {
    for (const roomId in rooms) {
      let room = rooms[roomId]
      room.members.forEach((member, i) => {
        console.log("-------")
        console.log(member.socketId, socket.socketId)
        console.log(member.socketId === socket.socketId)
        console.log("-------")
        if (member.socketId === socket.socketId) {
          member = null
          room.members[i] = null
        }
      })
      room.members = compact(room.members)
      if (!room.members.length) {
        rooms[roomId] = null
        delete rooms[roomId]
      }
    }
    io.sockets.emit("rooms:get", keys(rooms))
    var i = userIds.indexOf(socket.socketId)
    console.log(colors.green(`Rooms: ${JSON.stringify(rooms)}`))
    console.log(colors.red(`Disconnected id at index ${i}`))
    forIn(socket._events, (val, key) => {
      if (isFunction(val)) {
        socket.removeListener(key, val)
        val = null
      }
    })
    if (i >= 0) {
      userIds.splice(i, 1)
      delete users[socket.socketId]
      console.log(colors.red(`Disconnected id ${socket.socketId}`))
      console.log(colors.yellow(`Users remaining ${userIds.length}`))
    }
  })

  socket.on("handshake", id => {
    users[id] = socket
    users[id].socketId = id
    if (userIds.indexOf(id) < 0) {
      userIds.push(id)
    }
    console.log(colors.green(`Reveived id ${id}`))
    console.log(colors.green(`All userIds`))
    console.log(userIds)
    socket.emit("handshake", getNewRoom())
  })

  socket.on("peer:connect", data => {
    const { peerId, id } = data
    users[peerId].emit("peer:connect:request", id)
  })

  socket.on("peer:connect:accept", data => {
    const { peerId, id } = data
    users[peerId].emit("peer:connect:accepted", id)
    socket.emit("peer:connect:accepted", peerId)
  })

  socket.on("room:create", roomId => {
    rooms[roomId] = rooms[roomId] || {
      id: roomId,
      members: [],
    }
    roomIds.add(roomId)
    if (!find(rooms[roomId].members, { socketId: socket.socketId })) {
      rooms[roomId].members.push({ socketId: socket.socketId })
    }
    console.log(colors.green(`Broadcast ${roomId}`))
    console.log(`members: ${rooms[roomId].members.length}`)
    io.sockets.emit("rooms:get", getAvailableRoomIdsToJoin())
  })

  socket.on("rooms:get", () => {
    socket.emit("rooms:get", getAvailableRoomIdsToJoin())
  })
})
