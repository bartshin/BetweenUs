import http from "http"
// import WebSocket from "ws"
import SocketIO from "socket.io"
import express from "express"

const app = express()

app.set("view engine", "pug")
app.set("views", __dirname + "/views")
app.use("/public", express.static(__dirname + "/public"))

app.get("/", (req, res) => res.render("home"))
app.get("/*", (req, res) => res.redirect("/"))

const httpServer = http.createServer(app)


const port = 3000
const logListen = () => console.log("Server listening on port: " + port)
httpServer.listen(port, logListen)
const wsServer = SocketIO(httpServer)

const maxUserInRoom = 4
const openedRooms = new Map()
const users = new Map()

wsServer.on("connection", (socket) => {
    users.set(socket.id, {
        nickname: "Annonymous",
        id: socket.id,
        enteredRooms: null
    })
   
    // Nickname
    socket.on("changeNickname", (newNickname, completion) => {
        users.get(socket.id).nickname = newNickname
        completion(newNickname)
    })

    // Room
    socket.on("createRoom", (roomName, isVideoRecording, completion) => {
        if (!openedRooms.has(roomName)) {
            socket.join(roomName)
            users.get(socket.id).enteredRoom = { 
                roomName: roomName,
                creator: socket.id 
            }
            socket.to(roomName).emit("enterRoom", socket.nickname)
            openedRooms.set(roomName, {
                roomName: roomName,
                creator: socket.id,
                videoSenders: isVideoRecording ? [socket.id]: [],
                participants: [socket.id]
            })
            completion(openedRooms.get(roomName), true)
            wsServer.emit("refreshRoom")
        }else {
            completion(roomName, false)
        }
    })

    socket.on("disconnecting", () => {
        const enteredRoom = users.get(socket.id).enteredRoom
        if (enteredRoom) {
            const room = openedRooms.get(enteredRoom.roomName)
            if (!room) {
                return
            }
            const roomName = enteredRoom.roomName
            const index = room.participants.indexOf(socket.id)
            if (index != -1 ) {
                room.participants.splice(index, 1)
            }
            if (room.participants.length === 0) {
                openedRooms.delete(roomName)
            } 
        }
        wsServer.emit("userLeft", users.get(socket.id))
        users.delete(socket.id)
    })

    socket.on("getRoomlist", (completion) => {
        const roomList = {}
        openedRooms.forEach((room, roomName, mapObejct) => {
            roomList[roomName] = room
        })
        completion(roomList)
    })

    socket.on("getUser", (userIds, completion) => {
        const usersToReturn = {}
        userIds.forEach((id) => {
            usersToReturn[id] = users.get(id) 
        })
        completion(usersToReturn)
    })

    socket.on("getRoom", (roomName, completion) => {
        const room = openedRooms.get(roomName)
        completion(room)
    })

    socket.on("joinRoom", (roomName, isVideoRecording, completion) => {
        const room = openedRooms.get(roomName)
        if (room && room.participants.length < maxUserInRoom) {
            room.participants.push(socket.id)
            if(isVideoRecording) {
                room.videoSenders.push(socket.id)
            }
            socket.join(roomName)
            const user = users.get(socket.id)
            user.enteredRoom = room
            completion(room, true)
            socket.to(roomName).emit("newParticipant", user, isVideoRecording)
        }else {
            completion(room, false)
        }
    })

    socket.on("offer", (offer, {
        sender,
        receiver
    }) => {
        socket.to(receiver).emit("offer", offer, sender)
    })

    socket.on("answer", (answer, receiver) => {
        socket.to(receiver).emit("answer", answer, socket.id)
    })

    socket.on("iceCandidate", (candidate, roomName, senderId) => {
        socket.to(roomName).emit("iceCandidate", candidate, senderId)
    })

    socket.on("log", (log) => {
        console.log(log)
    })

    socket.on("turnVideoRecording", (toOn, roomName) => {
        const room = openedRooms.get(roomName)
        if (toOn) {
            room.videoSenders.push(socket.id)
        }else {
            const index = room.videoSenders.indexOf(socket.id)
            if (index != -1) {
                room.videoSenders.splice(index, 1)
            }
        }
        socket.to(roomName).emit("turnVideoRecording", toOn, socket.id)
    })

})