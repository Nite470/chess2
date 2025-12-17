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
  res.sendFile(path.join(__dirname, 'index212.html'));
});

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
  console.log('Подключен:', socket.id);
  broadcastRoomList();

  socket.on('create_room', (roomId) => {
    if (rooms[roomId]) {
      socket.emit('error_msg', 'Комната занята!');
      return;
    }
    rooms[roomId] = {
      players: [socket.id],
      board: null,
      turn: 'white',
      mode: 'classic',
      // Полная инициализация экономики
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

  socket.on('join_room', async (roomId) => {
    const room = rooms[roomId];
    if (!room) {
      socket.emit('error_msg', 'Комната не найдена!');
      return;
    }

    // === ИСПРАВЛЕНИЕ: ЧИСТКА ПРИЗРАКОВ ===
    // Проверяем, кто реально подключен к комнате через сокеты
    const socketsInRoom = await io.in(roomId).fetchSockets();
    const activeSocketIds = socketsInRoom.map(s => s.id);
    
    // Оставляем в комнате только тех, кто реально онлайн
    room.players = room.players.filter(pid => activeSocketIds.includes(pid));

    if (room.players.includes(socket.id)) return; // Уже здесь

    if (room.players.length >= 2) {
      socket.emit('error_msg', 'Комната полна!');
      return;
    }

    room.players.push(socket.id);
    socket.join(roomId);
    
    // Уведомляем создателя
    io.to(room.players[0]).emit('player_joined', { roomId });
    
    // Отправляем подключившемуся актуальное состояние
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
      // Обновляем состояние на сервере
      room.board = board;
      room.turn = turn;
      if (mode) room.mode = mode;
      if (chimeraTracker) room.chimeraTracker = chimeraTracker;
      if (economy) room.economy = economy;
      if (graveyard) room.graveyard = graveyard;
      if (resHist) room.resHist = resHist;

      // Рассылаем ВСЕМ в комнате (включая отправителя, для синхронизации)
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
    for (const id in rooms) {
        const room = rooms[id];
        if (room.players.includes(socket.id)) {
            room.players = room.players.filter(pid => pid !== socket.id);
            
            if (room.players.length === 0) {
                // Если никого нет, удаляем комнату
                delete rooms[id];
            } else {
                // Если кто-то остался, говорим ему
                socket.to(id).emit('opponent_left');
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
  console.log(`Сервер работает на порту ${PORT}`);
});
