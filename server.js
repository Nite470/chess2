const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const path = require('path'); // Добавили модуль для путей

// Настройка Socket.io
const io = new Server(server, {
  cors: {
    origin: "*", // Разрешаем всем (для простоты)
    methods: ["GET", "POST"]
  }
});

// === ВАЖНОЕ ИЗМЕНЕНИЕ 1: Порт ===
// Хостинги (Render, Heroku и др.) выдают порт через process.env.PORT
const PORT = process.env.PORT || 3000;

// === ВАЖНОЕ ИЗМЕНЕНИЕ 2: Раздача клиента ===
// Сервер должен отдавать браузеру ваш HTML файл и картинки (если есть)
app.use(express.static(__dirname)); 

// При заходе на главную страницу отдаем index212.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index212.html'));
});

// Хранилище игровых комнат
let rooms = {};

function broadcastRoomList() {
    const list = [];
    for (const [id, room] of Object.entries(rooms)) {
        if (room.players.length < 2) {
            list.push({ id: id, count: room.players.length });
        }
    }
    io.emit('room_list', list);
}

io.on('connection', (socket) => {
  console.log('Новое подключение:', socket.id);
  broadcastRoomList();

  socket.on('create_room', (roomId) => {
    if (rooms[roomId]) {
      socket.emit('error_msg', 'Комната уже существует!');
      return;
    }
    rooms[roomId] = {
      players: [socket.id],
      board: null,
      turn: 'white',
      mode: 'classic'
    };
    socket.join(roomId);
    socket.emit('game_start', { 
        roomId: roomId, 
        color: 'white',
        board: getDefaultBoard(),
        turn: 'white',
        mode: 'classic'
    });
    broadcastRoomList();
  });

  socket.on('join_room', (roomId) => {
    const room = rooms[roomId];
    if (!room) {
      socket.emit('error_msg', 'Комната не найдена!');
      return;
    }
    if (room.players.length >= 2) {
      socket.emit('error_msg', 'Комната полна!');
      return;
    }
    room.players.push(socket.id);
    socket.join(roomId);
    io.to(room.players[0]).emit('player_joined', { roomId });
    socket.emit('game_start', { 
        roomId: roomId, 
        color: 'black',
        board: room.board || getDefaultBoard(),
        turn: room.turn,
        mode: room.mode || 'classic'
    });
    broadcastRoomList();
  });

  socket.on('make_move', (data) => {
    const { roomId, board, turn, lastMove, mode } = data;
    const room = rooms[roomId];
    if (room) {
      room.board = board;
      room.turn = turn;
      if (mode) room.mode = mode;
      io.in(roomId).emit('receive_move', {
        board: board,
        turn: turn,
        lastMove: lastMove,
        mode: mode
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('Игрок отключился:', socket.id);
    for (const id in rooms) {
        const room = rooms[id];
        const index = room.players.indexOf(socket.id);
        if (index !== -1) {
            room.players.splice(index, 1);
            if (room.players.length === 0) {
                delete rooms[id];
            } else {
                socket.to(id).emit('opponent_left');
                delete rooms[id]; 
            }
            break;
        }
    }
    broadcastRoomList();
  });
});

function getDefaultBoard() {
    const r1 = ['r','n','b','q','k','b','n','r'];
    const R1 = ['R','N','B','Q','K','B','N','R'];
    let b = [];
    for(let i=0;i<8;i++) {
        if(i===0) b.push([...R1]);
        else if(i===1) b.push(Array(8).fill('P'));
        else if(i===6) b.push(Array(8).fill('p'));
        else if(i===7) b.push([...r1]);
        else b.push(Array(8).fill(null));
    }
    return b;
}

server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
