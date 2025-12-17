const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const path = require('path');

// Настройка Socket.io
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname)); 

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index520.html')); // Ссылаемся на актуальный файл клиента
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
      mode: 'classic',
      // === ЭКОНОМИКА ===
      economy: { white: 0, black: 0 },
      graveyard: { white: [], black: [] },
      resHist: { white: [], black: [] },
      chimeraTracker: {}
    };
    socket.join(roomId);
    socket.emit('game_start', { 
        roomId: roomId, 
        color: 'white',
        board: getDefaultBoard(),
        turn: 'white',
        mode: 'classic',
        economy: { white: 0, black: 0 },
        graveyard: { white: [], black: [] },
        resHist: { white: [], black: [] },
        chimeraTracker: {}
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
        mode: room.mode || 'classic',
        economy: room.economy || { white: 0, black: 0 },
        graveyard: room.graveyard || { white: [], black: [] },
        resHist: room.resHist || { white: [], black: [] },
        chimeraTracker: room.chimeraTracker || {}
    });
    broadcastRoomList();
  });

  socket.on('make_move', (data) => {
    const { roomId, board, turn, lastMove, mode, moveCount, chimeraTracker, economy, graveyard, resHist } = data;
    const room = rooms[roomId];
    if (room) {
      room.board = board;
      room.turn = turn;
      if (mode) room.mode = mode;
      if (chimeraTracker) room.chimeraTracker = chimeraTracker;
      
      // Сохраняем экономику
      if (economy) room.economy = economy;
      if (graveyard) room.graveyard = graveyard;
      if (resHist) room.resHist = resHist;

      io.in(roomId).emit('receive_move', {
        board: board,
        turn: turn,
        lastMove: lastMove,
        mode: mode,
        moveCount: moveCount,
        chimeraTracker: chimeraTracker,
        economy: economy,
        graveyard: graveyard,
        resHist: resHist
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
