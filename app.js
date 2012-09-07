
//Server-side interface
var express = require('express')
  , mongoose = require('mongoose') 
  , app = express()
  , http = require('http')
  , server = http.createServer(app)
  , sio = require('socket.io').listen(server)
  , irc = require('irc')
  , uuid = require('node-uuid')
  , redis = require('redis')
  , serCli = redis.createClient() //server client of redis, used to store usernames, channels and publish to channels as well
  , Schema = mongoose.Schema
  , creatingUser = false
  , rooms = {};

mongoose.connect('mongodb://localhost/chat');

var UserSchema = new Schema({
    rooms : [String]
  , name : {
      type : String
    , unique : true
    }
  , irc : Boolean
})

UserSchema.static('findCreate', function (name, fromIrc, callback){
  var self = this;
  this.creatingUser = this.creatingUser | false;
  this.findOne({name : name}, function(err, doc){
    if(doc){
      callback(null, doc);
    } else{
      if(!self.creatingUser){
        self.creatingUser = true;
        self.create({name : name, irc : fromIrc, rooms : []}, function (err, doc) {
          self.creatingUser = false;
          return callback(err, doc);
        });
      }
    }
  });
});

var Users = mongoose.model('User', UserSchema);

function MessageQ () {
  this.queue = [];
  this.connected = false;
  irc.Client.apply(this, arguments);
  this.addListener('connect', function(){
    this.connected = true;
    this.dequeue();
    socket.emit('message', 'You have joined the irc room #' + room + '!', 'server', room);
  });

  this.joinRoom = function (socket, room, name){
    //if(!this[room + 'listener']){
    Users.findCreate(name, false, function (err, doc){
      if(doc.rooms.indexOf('#' + room) === -1){
        doc.rooms.push('#' + room);
        doc.save();
      }
    });
    if(rooms['#' + room] == null){
      rooms['#' + room] = [];
    } else  {
    console.log(rooms['#' + room]);
      for (x in rooms['#' + room]){
        rooms['#' + room][x].emit('joined', name, room);
        rooms['#' + room][x].get('name', function(err, name){
          socket.emit('joined', name, room); 
        });
      }
    }

    rooms['#' + room].push(socket);

    this[room + 'joinListener']  = function (name){
      Users.findCreate(name, true, function(err, doc){
        if(doc.irc){
          socket.emit('joined', name, room);
        }
      });
    } 
    
    
    this[room + 'messageListener'] = function (from, message){
      if(!this.connected){
        Users.findCreate(from, false, function (err, doc){
          if(doc.irc){
            socket.emit('message', message, from, room);
          }
        });
      } else {
        Users.findCreate(from, true, function (err, doc){
          if(doc.irc){
            socket.emit('message', message, from, room);
          }
        });
      }
    }

    this[room + 'partListener'] = function (name, reason, message){
      Users.findCreate(name, true, function(err, doc){
        if(doc.irc){
          socket.emit('left', name, room);
        }
      });
    }

    this[room + 'listener'] = redis.createClient();
    this[room + 'listener'].on('message', function(room, message){
      serCli.get('senderNameUniqueId', function(err, name){
        socket.emit('message', message, name, room);
      });
    });
    this[room + 'listener'].subscribe('#' + room);
    if(!this.connected){
      this.enqueue('joinIRCRoom', arguments);
    } else{
      joinIRCRoom(arguments);
    }
  }

  this.joinIRCRoom = function(socket, room, name) {
    this.join('#' + room, function(){
      this.addListener('message#' + room, this[room + 'messageListener']);
      this.addListener('join#' + room, this[room + 'joinListener']);
      this.addListener('part#' + room, this[room + 'partListener']);
    });
  }
  this.leaveIRCRoom = function(name, room){
    this.part('#'+ room);
    this.removeListener('message#' + room, this[room + 'messageListener']);
    this.removeListener('join#' + room, this[room + 'joinListener']);
    this.removeListener('part#' + room, this[room + 'partListener']);
  }
  this.leaveRoom = function (name, room, socket){
    var self = this;
    rooms['#' + room].splice(rooms['#' + room].indexOf(socket), 1);
    for (x in rooms['#' + room]){
      rooms['#' + room][x].emit('left', name, room);
    }
    this[room + 'listener'].quit(function(){
      this[room + 'listener'] = false;
      if(!self.connected){
	      self.enqueue('leaveIRCRoom', [name, room]);
	    } else {
	      leaveIRCRoom(name, room);
	    }
    });
    Users.findCreate(name, true, function(err, doc){
      doc.rooms.pull(room);
      doc.save();
    });
  }
}

MessageQ.prototype.sendMessage = function (room, message){
  serCli.publish(room, message);
  if(this.connected){
    this.say(room, message);
  }
}

MessageQ.prototype.__proto__ = irc.Client.prototype;
MessageQ.prototype.constructor = MessageQ;

MessageQ.prototype.enqueue = function(name, args){
  this.queue.push([name, args]);
}

MessageQ.prototype.dequeue = function(){
  this.queue.forEach(function(element){
    this[element[0]].apply(this, element[1]);
  }, this);
}

                                
app.configure(function() {           
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
  app.use('/views', express.static(__dirname + '/views'));
  app.engine('ejs', require('ejs-locals'));
  app.locals._layoutFile = '/layout.ejs';
  app.set('view engine', 'ejs');
});

server.listen(8001);

app.get('/', function(req, res) {
  res.render('home');
});

sio.sockets.on('connection', function(socket) {
  var roomed = false;
  socket.on('name', function(name){
    if(roomed){
      roomed(name);
      roomed = false;
    }
    socket.set('name', name);
    socket.set('ircQ', new MessageQ('10.0.0.10', name), function(){
      console.log(arguments);
      socket.get('ircQ', function(err, ircCli){
        ircCli.addListener('names', function(room, userList){
          for (fromList in userList) {
            Users.findCreate(fromList, true, function(err, doc){
              if(fromList !== name){
                if(doc.rooms.indexOf(room) === -1){
                  doc.rooms.push(room);
                  doc.save();
                }
              }
            });
          }
          socket.emit('ircList', userList, room);
        });
      });
    });
  });

  socket.on('close', function(name, room){
    socket.get('ircQ', function(err, ircCli){
      ircCli.leaveRoom(name, room, socket);
    });
  });
  
  socket.on('join', function(room){
    socket.get('name', function(err, name){
      socket.get('ircQ', function(err, ircCli){
        if(name){
          ircCli.joinRoom(socket, room, name);
        } else {
          roomed = (function (named) {return ircCli.joinRoom(socket, room, named)}); 
        }
      });
    });
  });

  socket.on('disconnect', function(){
    socket.get('ircQ', function(err, ircCli){
      ircCli.disconnect();
    });
  });

  socket.on('message', function(message, room, name){
    serCli.set('senderNameUniqueId', name);
    socket.get('ircQ', function(err, ircCli){
      ircCli.sendMessage('#' + room, message);
    });
  });
});
