import ImageProcessor from './imageProcessor.js'

const socket = io()
let enteredRoom = {}

// Nick name
const nicknameInput = document.getElementById("nicknameInput")
const nicknameLabel = document.getElementById("nicknameLabel")

nicknameInput.addEventListener("keypress", (event) => {
    const newNickname = nicknameInput.value
    if(event.key == "Enter" && newNickname.replace(/\s/g, '') !== "") {
        socket.emit("changeNickname", newNickname, changeNickname)
        nicknameInput.style.display = "none"
        nicknameLabel.style.display = "inline"
    }
})

// Room
const createRoomLabel = document.getElementById("createRoomLabel")
const createRoomForm = document.getElementById("createRoomForm")
const roomList = document.getElementById("roomList")

function changeNickname(nickname) {
    nicknameLabel.innerText = nickname
}

function refreshRoomlist() {
    socket.emit("getRoomlist", (rooms) => {
        const list = roomList.querySelector("ul")
        list.innerHTML = ""
        for (let roomName in rooms) {
            let room = rooms[roomName]
            const li = document.createElement("li")
            const userCount = room.participants.length
            li.innerText = `${roomName} (${userCount}/4)`
            li.dataset.roomName = roomName
            li.style.backgroundColor = "green"
            li.style.paddingLeft = "1em"
            li.style.borderRadius = "20px"
            li.style.cursor = "pointer"
            li.addEventListener("click", (event) => {
                joinRoom(event.target.dataset.roomName)
            })
            list.append(li)
        }
    })
}

function getRoomInfo(roomName) {
    return new Promise((resolve, reject) => {
        socket.emit("getRoom", roomName, (room) => {
            if (room) {
                resolve(room)
            }else {
                reject("Not found")
            }
        })
    })
}

async function joinRoom(roomName) {
    hideRoomList()
    getRoomInfo(roomName).then(async (room) => {
        await showSettings(() => {
            socket.emit("joinRoom", roomName, userDevice.isVideoRecording, enterRoom)
            showServerMessage(`You joined in ${roomName}`)
            for(const id of room.participants) {
                connections[id] = createConnection(id)
            }
        })
    })
    .catch(error => {
        window.alert(`Fail to join to ${roomName}`)
        console.log(error)
    })
}

function enterRoom(room, isSuccess) {
    if (isSuccess) {
        enteredRoom = room
        updateUserList()
    }else {
        window.alert(`Fail to enter ${room.roomName}`)
    }
}

createRoomForm.addEventListener("submit", async (event) => {
    event.preventDefault()
    const roomName = createRoomForm.querySelector("input").value
    hideRoomList()
    await showSettings(() => {
        socket.emit("createRoom", roomName, userDevice.isVideoRecording,enterRoom)
    })
})

refreshRoomlist()

socket.on("userLeft", (user) => {
    refreshRoomlist()
    if (!enteredRoom.participants) {
        return
    }
    const indexInRoom = enteredRoom.participants.indexOf(user.id)
    if (indexInRoom == -1) {
        return
    }
    enteredRoom.participants.splice(indexInRoom, 1)
    showServerMessage(`${user.nickname} left`)
    updateUserList()
    if(showingVideos[user.id]) {
        const video = showingVideos[user.id]
        video.display = "none"
        if (highlightedUser && highlightedUser.id == user.id) {
            clearHighlightVideo()
        }else {
            video.remove()
        }
    }
    highlightedUser = null
})

socket.on("refreshRoom", refreshRoomlist)

// Settings
const settings = document.getElementById("settings")
const preview = document.getElementById("preview")
const cameraSetting = document.getElementById("cameraSetting")
const micSetting = document.getElementById("micSetting")
const confirmSettingButton = document.getElementById("confirmSetting")
let inputStream

settings.style.display = "none"

const userDevice = {
    cameras: [],
    microphones: [],
    selectedCamera: null,
    selectedMicrophone: null,
    isVideoRecording: true,
    isAudioRecording: true
}

async function startRecording(selectedDeviceId, completion) {
    const constraint = selectedDeviceId ? {
        audio: selectedDeviceId.audio? { deviceId: selectedDeviceId.audio }: userDevice.isAudioRecording,
        video: selectedDeviceId.video? { deviceId: selectedDeviceId.video }: userDevice.isVideoRecording
    }: {
        audio: true,
        video: {
            facingMode: "user"
        }
    }
    try {
        inputStream = await navigator.mediaDevices.getUserMedia(constraint)
    completion()
    }catch(error) {
        console.log(constraint, error)
        window.alert("Fail to get audio, video device please check recording device")
    }
}

cameraSetting.querySelector("input").addEventListener(("change"), (event) => {
    const isCameraOn = event.target.checked
    turnVideoRecording(isCameraOn)
    preview.srcObject = inputStream
})

function turnVideoRecording(toOn) {
    inputStream.getVideoTracks().forEach((track) => {
        track.enabled = toOn
    })
    userDevice.isVideoRecording = toOn
}

micSetting.querySelector("input").addEventListener(("change"), (event) => {
    const isMicOn = event.target.checked
    turnAudioRecording(isMicOn)
    preview.srcObject = inputStream
})

function turnAudioRecording(toOn) {
    inputStream.getAudioTracks().forEach((track) => {
        track.enabled = toOn
    })
    userDevice.isAudioRecording = toOn
}

async function showSettings(confirmHandler) {
    await startRecording(null, async () => {
        preview.srcObject = inputStream
        settings.style.display = "block"
        await setDeviceId()
        initSettings(confirmHandler)
    })
}

function hideRoomList() {
    roomList.hidden = true
    createRoomLabel.hidden = true
    createRoomForm.hidden = true
}

async function setDeviceId() {
    const devices = await navigator.mediaDevices.enumerateDevices()
    const currentVideoDevice = inputStream?.getVideoTracks()[0].label
    const currentMicDevice = inputStream?.getAudioTracks()[0].label
    const cameraSelect = cameraSetting.querySelector("select")
    const micSelect = micSetting.querySelector("select")
    const enrolledIds = new Set()
    devices.forEach((device) => {
        if (!device.deviceId || device.deviceId === "default" || enrolledIds.has(device.deviceId)) { return }
        enrolledIds.add(device.deviceId)
        if (device.kind === "videoinput") {
            const option = document.createElement("option")
            option.innerText = device.label
            option.value = device.deviceId
            option.checked = (currentVideoDevice == device.label)
            cameraSelect.append(option)
            userDevice.cameras.push(device)
            if (currentVideoDevice == device.label) {
                userDevice.selectedCamera = device
            }
        }
        else if (device.kind === "audioinput") {
            const option = document.createElement("option")
            option.innerText = device.label
            option.value = device.deviceId
            option.checked = (currentMicDevice == device.label)
            micSelect.append(option)
            userDevice.microphones.push(device)
            if (currentMicDevice == device.label) {
                userDevice.selectedMicrophone = device
            }
        }
    })
}

function initSettings(confirmHandler) {
    cameraSetting.querySelector("input").checked = true
    micSetting.querySelector("input").checked = true
    micSetting.querySelector("select").addEventListener("input", async (event) => {
        const deviceId = {
            audio: event.target.value
        }
        await startRecording(deviceId, () => {
            userDevice.microphones.forEach((mic) => {
                if (mic.deviceId == deviceId.audio) {
                    userDevice.selectedMicrophone = mic
                }
            })
            console.log("Microphone changed ", userDevice.selectedMicrophone.label)
        })
    })
    cameraSetting.querySelector("select").addEventListener("input", async (event) => {
        const deviceId = {
            video: event.target.value
        }
        await startRecording(deviceId, () => {
            userDevice.cameras.forEach ((camera) => {
                if (camera.deviceId == deviceId.video) {
                    userDevice.selectedCamera = camera
                }
            })
            console.log("Camera changed ", userDevice.selectedCamera.label)
        })
    })
    confirmSettingButton.addEventListener("click", (event) => {
        event.preventDefault()
        if (inputStream) {
            confirmHandler()
            settings.style.display = "none"
            preview.srcObject = null
            showVideoChat()
        }
    })
}

// Video chat

const videoChat = document.getElementById("videoChat")
const userVideo = document.getElementById("userVideo")
const highlightVideo = document.getElementById("highlightVideo")
const cameraToggleButton = document.getElementById("cameraToggleButton")
const micToggleButton = document.getElementById("micToggleButton")
const fullScreenButton = document.getElementById("fullScreenButton")
const otherUsersVideo = document.getElementById("otherUsersVideo")
videoChat.style.display = "none"
let showingVideos = {}
let highlightedUser = null
let imageProcessor 


function showVideoChat() {
    if (inputStream) {
        videoChat.style.display = "flex"
        imageProcessor = new ImageProcessor(userVideo.querySelector("video"), userVideo.querySelector("canvas"))
        userVideo.querySelector("video").srcObject = inputStream
        if (userVideo.querySelector("video").paused) {
            userVideo.querySelector("video").play()
        }
        cameraToggleButton.style.setProperty('--color', userDevice.isVideoRecording ? "green": "pink")
        micToggleButton.style.setProperty('--color', userDevice.isAudioRecording ? "green": "pink")
        cameraToggleButton.addEventListener("click", (event) => {
            const toOn = !userDevice.isVideoRecording
            turnVideoRecording(toOn)
            cameraToggleButton.style.setProperty('--color', userDevice.isVideoRecording ? "green": "pink")
            userVideo.querySelector("video").srcObject = inputStream
            if (userVideo.querySelector("video").paused) {
                userVideo.querySelector("video").play()
            }
            imageProcessor.turnSwitch(toOn)
            socket.emit("turnVideoRecording", toOn, enteredRoom.roomName)
        })
        micToggleButton.addEventListener("click", (event) => {
            const toOn = !userDevice.isAudioRecording
            turnAudioRecording(toOn)
            micToggleButton.style.setProperty('--color', userDevice.isAudioRecording ? "green": "pink")
            userVideo.querySelector("video").srcObject = inputStream
            if (userVideo.querySelector("video").paused) {
                userVideo.querySelector("video").play()
            }
        })
        highlightVideo.querySelector("video").addEventListener("loadeddata", (event) => {
            showHighlightedUser()
        })
        fullScreenButton.addEventListener("click", (event) => {
            const video = highlightVideo.querySelector("video")
            if (video.requestFullscreen) {
                video.requestFullscreen();
              } else if (video.mozRequestFullScreen) {
                video.mozRequestFullScreen();
              } else if (video.webkitRequestFullscreen) {
                video.webkitRequestFullscreen();
              } else if (video.msRequestFullscreen) { 
                video.msRequestFullscreen();
              }
        })
        
    }else {
        window.alert("Fail to show video chat user stream is undefined")
    }
}

function showHighlightedUser() {
    socket.emit("getUser", [highlightedUser.id], (users) => {
        const user = users[highlightedUser.id]
        highlightedUser = user
        highlightVideo.querySelector("h3").innerText = user.nickname
    })
}

function clearHighlightVideo() {
    highlightVideo.querySelector("video").srcObject = null
    highlightVideo.querySelector("h3").innerText = ""
}

// RTC

let connections = {}

function createConnection(opponentId) {
    const connection = new RTCPeerConnection()
    connection.addEventListener("icecandidate", (data) => {
        socket.emit("iceCandidate", data.candidate, enteredRoom.roomName, socket.id)
    })
    connection.addEventListener("track", (data) => {
        const receivedStream = data.streams[0]
        addStreamToVideo(receivedStream, opponentId)
    })
    const audioTrack = inputStream
    .getTracks()
    .find((track) => track.kind == "audio")
    const canvasStream = userVideo.querySelector("canvas").captureStream()
    const videoTrack = canvasStream.getVideoTracks()[0]
    connection.addTrack(audioTrack, inputStream)
    connection.addTrack(videoTrack, canvasStream)
    return connection
}

function addStreamToVideo(stream, opponentId){
    let video
    if(highlightedUser && opponentId == highlightedUser.id){
        video = highlightVideo.querySelector("video")
        highlightVideo.style.display = "block"
    }else {
        video = document.createElement("video")
        video.setAttribute('autoplay', "")
        video.setAttribute('playsinline', "")
        video.style.display = "inline"
        video.style.width = "300px"
        video.style.height = "200px"
        otherUsersVideo.append(video)
    }
    video.srcObject = stream
    showingVideos[opponentId] = video
    if (video.paused) {
        video.play()
    }
}

function setHighlightUserIfNeeded(opponentId) {
    if (enteredRoom.videoSenders.includes(opponentId)) {
        highlightedUser = { id: opponentId }
    }
}

socket.on("newParticipant", async (user, isSendingVideo) => {
    const connection = createConnection(user.id)
    enteredRoom.participants.push(user.id)
    if (isSendingVideo) {
        enteredRoom.videoSenders.push(user.id)
    }
    if(!highlightedUser) {
        setHighlightUserIfNeeded(user.id)
    }
    
    connections[user.id] = connection
    chatChannels[user.id] = connection.createDataChannel("chat")
    chatChannels[user.id].addEventListener("message", showChat)
    fileChannels[user.id] = createFileChannel(user.id)
    addListenerToFileChannel(user.id)
    const offer = await connection.createOffer()
    connection.setLocalDescription(offer)
    socket.emit("offer", offer, {
        sender: socket.id,
        receiver: user.id
    })
    updateUserList()
    showServerMessage(`${user.nickname} joined`)
})

socket.on("offer", async (offer, senderId) => {
    const connection = connections[senderId]
    connection.addEventListener("datachannel", (event) => {
        if(event.channel.label == "chat") {
            chatChannels[senderId] = event.channel
            chatChannels[senderId].addEventListener("message", showChat)
        }
        else if(event.channel.label == "file") {
            fileChannels[senderId] = event.channel
            addListenerToFileChannel(senderId)
        }
    })
    if(!highlightedUser) {
        setHighlightUserIfNeeded(senderId)
    }
    connection.setRemoteDescription(offer)
    const answer = await connection.createAnswer()
    connection.setLocalDescription(answer)
    socket.emit("answer", answer, senderId) 
})

socket.on("answer", (answer, senderId) => {
    const connection = connections[senderId]
    connection.setRemoteDescription(answer)
})

socket.on("iceCandidate", (candidate, senderId) => {
    const connection = connections[senderId]
    connection.addIceCandidate(candidate)
})

socket.on("turnVideoRecording", (toOn, senderId) => {
    const showingVideo = showingVideos[senderId]
    if (toOn) {
        enteredRoom.videoSenders.push(senderId)
    }else {
        const index = enteredRoom.videoSenders.indexOf(senderId)
        if (index != -1){
            enteredRoom.videoSenders.splice(index, 1)
        }
    }
    if (showingVideo) {
        showingVideo.style.display =  toOn ? "inline": "none"
    }
})

// Control

const controls = document.getElementById("controls")
const brightnessControl = controls.querySelector("#brightness")
const saturationControl = controls.querySelector("#saturation")

brightnessControl.addEventListener("input", (event) => {
    const inputBrightness = event.target.value
    imageProcessor.brightness = inputBrightness
})

saturationControl.addEventListener("input", (event) => {
    const inputSaturation = event.target.value
    imageProcessor.saturation = inputSaturation
})

// Chat

const chatChannels = {}
const fileChannels = {}
const receivingFiles = {}
const chatForm = document.getElementById("chatForm")
const chatBox = chatForm.querySelector("#chatBox")
const userListBox = chatForm.querySelector("#userListBox")
const fileBoard = chatForm.querySelector("#fileBoard")
const chatOption = document.getElementById("chatOption")
const participantsOption = document.getElementById("participantsOption")
const fileBoardOption = document.getElementById("fileBoardOption")
const chatInput = document.getElementById("chatInput")
const fileInput = document.getElementById("fileInput")
let usersInRoom = {}
const uploadingFiles = new Set()


chatOption.addEventListener("click", (event) => {
    [userListBox, fileBoard].forEach((element) => {
        element.style.display = "none"
    })
    chatBox.style.display = "block"
    chatInput.style.display = "flex"
})

participantsOption.addEventListener("click", (event) => {
    [chatBox, chatInput, fileBoard].forEach((element) => {
        element.style.display = "none"
    })
    userListBox.style.display = "block"
})

fileBoardOption.addEventListener("click" , (event) => {
    [chatBox, chatInput, userListBox].forEach((element) => {
        element.style.display = "none"
    })
    fileBoard.style.display = "block"
})

chatInput.querySelector("button").addEventListener("click", (event) => {
    event.preventDefault()
    const input = chatInput.querySelector("input")
    const message = input.value
    input.value = ""
    const timeString = getTimeString(new Date())

    const li = document.createElement("li")
    li.classList.add("chatBubble")
    li.classList.add("userChat")
    const content = document.createElement("p")
    content.innerText = message
    const timeSpan = document.createElement("span")
    timeSpan.classList.add("userChatTime")
    timeSpan.innerText = timeString
    li.append(content)
    li.append(timeSpan)
    chatBox.querySelector("ul").append(li)
    const noti = JSON.stringify({
        sender: socket.id,
        type: "chat",
        message: message,
        timeString: timeString,
        isPrivate: false
    })
    for (const opponentId in chatChannels) {
        const channel = chatChannels[opponentId]
        channel.send(noti)
    }
}) 

fileInput.addEventListener("change", (event) => {
    event.preventDefault()
    const maxFileSize = 10000000 // 10mb
    let accFileSize = 0
    for (const file of fileInput.files) {
        accFileSize += file.size
        if(accFileSize > maxFileSize) {
            window.alert("Please upload in 10mb")
            return
        }
    }
    fileInput.setAttribute("disabled", "")
    for (const file of fileInput.files) {
        uploadingFiles.add(file.name)
        handleFile(file)
    }
})


function showServerMessage(message) {
    const chat = chatBox.querySelector("ul")
    const li = document.createElement("li")
    li.innerText = message
    li.style.color = "grey"
    chat.append(li)
}

function updateUserList() {
    socket.emit("getUser", enteredRoom.participants, (users) => {
        usersInRoom = users
        const userList = userListBox.querySelector("ul")
        userList.innerHTML = ""
        for(const id in users) {
            const li = document.createElement("li")
            const user = users[id]
            li.innerText = user.nickname + (user.id == socket.id ? " (me)": "")
            userList.append(li)
        }
    })
}

function getTimeString(date) {
    const hour = date.getHours()
    const minute = date.getMinutes()
    return (hour < 10 ? `0${hour}`: `${hour}`) + ":" + (minute < 10 ? `0${minute}`: `${minute}`)
}

function showChat(message) {
    const parsed = JSON.parse(message.data)
    let senderNickname = usersInRoom[parsed.sender].nickname
    if(!senderNickname) {
        senderNickname = "Unknown"
    }
    if(parsed.type == "chat"){
        const li = document.createElement("li")
        li.classList.add("chatBubble")
        const senderSpan = document.createElement("span")
        senderSpan.classList.add("chatBubbleSender")
        senderSpan.innerText = senderNickname
        li.append(senderSpan)
        const content = document.createElement("p")
        content.innerText = parsed.message
        li.append(content)
        const timeSpan = document.createElement("span")
        timeSpan.classList.add("chatBubbleTime")
        timeSpan.innerText = parsed.timeString
        li.append(timeSpan)
        chatBox.querySelector("ul").append(li)
    }else if(parsed.type == "file") {
        receivingFiles[parsed.sender] = {
            filename: parsed.filename,
            fileSize: parsed.fileSize,
            receivedSize: 0,
            data: []
        }
    }
}

function createFileChannel(opponentId) {
    const connection = connections[opponentId]
    const fileChannel = connection.createDataChannel("file")
    fileChannel.binaryType = "arraybuffer"
    return fileChannel
}

function addListenerToFileChannel(opponentId) {
    const fileChannel = fileChannels[opponentId]
    fileChannel.opponentId = opponentId
    fileChannel.addEventListener("open", (event) => {
        console.log("File channel is opened", event)
    })
    fileChannel.addEventListener("close", (event) => {
        console.log("File channel is closed", event)
    })
    fileChannel.addEventListener("error", (event) => {
        console.log("File channel error", event)
    })
    fileChannel.addEventListener("message", (event) => {
        const opponentId = event.target.opponentId
        receivingFiles[opponentId].data.push(event.data)
        receivingFiles[opponentId].receivedSize += event.data.byteLength

        if(receivingFiles[opponentId].fileSize == receivingFiles[opponentId].receivedSize) {
            const receivedFile = new Blob(receivingFiles[opponentId].data)
            const filename = receivingFiles[opponentId].filename
            const fileSize = receivingFiles[opponentId].fileSize / 1000000 // Byte to mb
            const senderNickname = usersInRoom[opponentId].nickname
            const downloadAnchor = document.createElement("a")
            downloadAnchor.href = URL.createObjectURL(receivedFile)
            downloadAnchor.download = filename
            downloadAnchor.textContent = filename
            const info = document.createElement("p")
            info.innerText = `by: ${senderNickname} (${fileSize}mb)`
            const li = document.createElement("li")
            li.classList.add("fileList")
            li.append(downloadAnchor)
            li.append(info)
            document.getElementById("fileBoard").querySelector("ul").append(li)
            receivingFiles[opponentId] = null
        }
    })
}

function handleFile(file) {
    const fileReader = new FileReader()
    const chunkSize = 16384
    notifySendingFile(file)
    let offset = 0 
    fileReader.addEventListener("error", (event) => {
        window.alert("Fail to read file")
        console.log("File reader error", event)
    })
    fileReader.addEventListener("abort", (event) => {
        window.alert("Aboart upload file")
        console.log("Fiel reader aborted", event)
    })
    fileReader.addEventListener("load", (event) => {
        sendChunk(event.target.result, file.name)
        offset += event.target.result.byteLength
        logSendingProgress(offset, file.size, file.name)
        if(offset < file.size) {
            readSlice(offset)
        }
    })

    const readSlice = offset => {
        const slice = file.slice(offset, offset + chunkSize)
        fileReader.readAsArrayBuffer(slice)
    }
    readSlice(0)
}

function sendChunk(chunk, filename) {
    for(const opponentId in fileChannels) {
        const channel = fileChannels[opponentId]
        channel.send(chunk)
    }
}

function logSendingProgress(done, total, filename) {
    if(done == total) {
        uploadingFiles.delete(filename)
        const li = document.createElement("li")
        li.classList.add("fileList")
        const info = document.createElement("p")
        info.innerText = `${filename} (uploaded)`
        li.append(info)
        document.getElementById("fileBoard").querySelector("ul").append(li)
        if(uploadingFiles.size == 0 ) {
            fileInput.removeAttribute("disabled")
        }
    }
}

function notifySendingFile(file) {
    const noti = JSON.stringify({
        sender: socket.id,
        type: "file",
        filename: file.name,
        fileSize: file.size,
        isPrivate: false
    })
    for(const opponentId in fileChannels) {
        const chatChannel = chatChannels[opponentId]
        chatChannel.send(noti)  
    }
}
    
