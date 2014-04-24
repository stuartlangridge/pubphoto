var app = require('express')()
  , server = require('http').createServer(app)
  , io = require('socket.io').listen(server);

var port = process.env.PORT || 3006;
server.listen(port);

var CHARS = "0123456789ACFHNRUWXY".split("");

var SLOTS = {};
CHARS.forEach(function(c1) {
  CHARS.forEach(function(c2) {
    CHARS.forEach(function(c3) {
      CHARS.forEach(function(c4) {
        if (c1 == c2 || c1 == c3 || c1 == c4 || c2 == c3 || c2 == c4 || c3 == c4) {
          /* Don't allow slots which are doubles, such as "AA", so that nobody
             can accidentally press the same letter twice by accident */
          return;
        }
        SLOTS[c1+c2+c3+c4] = {allocated: false, timestamp: 0, sender: null, receiver: null};
      });
    });
  });
});

app.get('/', function (req, res) {
  res.sendfile(__dirname + '/index.html');
});
app.get('/megapix-image.js', function (req, res) {
  res.sendfile(__dirname + '/megapix-image.js');
});

function shuffle(array) {
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
    return array;
}

// clear old slots
setInterval(function() {
  var now = (new Date()).getTime();
  for (var k in SLOTS) {
    if (SLOTS[k].allocated && ((now - SLOTS[k].timestamp) > 60000)) {
      console.log("Clearing old slot", k);
      SLOTS[k].allocated = false;
      SLOTS[k].socket = null;
    }
  }
}, 180000);

//io.set('transports',['xhr-polling']);

io.sockets.on('connection', function (socket) {
    var slot;
  
    socket.on("disconnect", function() {
        if (slot) {
            SLOTS[slot].allocated = false;
            console.log("Slot", slot, "vanished; freeing it.");
        }
    });
  
    socket.on("request_slot", function request_slot() {
        var keys = Object.keys(SLOTS).slice(0);
        shuffle(keys);
        for (var i=0; i<keys.length; i++) {
            if (!SLOTS[keys[i]].allocated) {
                SLOTS[keys[i]].allocated = true;
                SLOTS[keys[i]].timestamp = (new Date()).getTime();
                SLOTS[keys[i]].sender = socket.id;
                SLOTS[keys[i]].receiver = null;
                slot = keys[i];
                break;
            }
        }
        if (slot) {
            socket.emit('slot_answer', {slot:slot});
        } else {
            console.log("All slots filled; spinning");
            setTimeout(request_slot, 500);
        }
    });
  
    socket.on("request_from_slot", function(data) {
        if (!data.slot) {
            return socket.emit("servererror", {code: "no_slot", text: "No slot specified"});
        }
        if (!SLOTS[data.slot]) { 
            return socket.emit("servererror", {code: "bad_slot", text: "Bad slot specified"});
        }
        if (!SLOTS[data.slot].allocated) { 
            return socket.emit("servererror", {code: "old_slot", text: "That code has run out. Ask them to send the image again."});
        }
        SLOTS[data.slot].receiver = socket.id;
        SLOTS[data.slot].timestamp = (new Date()).getTime();
        io.sockets.socket(SLOTS[data.slot].sender).emit("transmit_now");
        slot = data.slot;
    });
  
    socket.on("transmission", function(data) {
        if (!SLOTS[slot].allocated) {
            return socket.emit("servererror", {code: "old_slot", text: "That code has run out. Ask them to send the image again."});
        }
        if (!SLOTS[slot].receiver) {
            return socket.emit("servererror", {code: "old_slot", text: "That code has run out. Ask them to send the image again."});
        }
        // retransmit the data to the receiver
        setTimeout(function() {
        io.sockets.socket(SLOTS[slot].receiver).emit("transmission", data);
        }, 4000);
        // and bump the timestamp so we don't garbage collect it mid-transmission
        SLOTS[slot].timestamp = (new Date()).getTime();
    });
  
    socket.on("got_all", function() {
        // receiver has received everything; tear it all down
        io.sockets.socket(SLOTS[slot].sender).emit("got_all");
        SLOTS[slot].allocated = false;
        console.log("Slot", slot, "finished with; freeing it.");
    });
});

