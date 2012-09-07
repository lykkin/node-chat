//Client-side interface
var socket = io.connect()
 ,  name = ''    //get renaming working!!
 ,  myRoom = ''  //used as current room
 ,  users = {}   //use these objects to hash over roomname for message logs/userlist.
                 //set up message passing to certainrooms that will append to message[room]
                 //get it all to work right when going from room to room.
 ,  messages = {};

socket.on('connect', function() {

  while(name === "null" || name == ''){
    name = prompt('input user id:');
  }

  socket.emit('name', name);
  while(myRoom === "null" || myRoom == ''){
    myRoom = prompt('room id:');
  }
  join(myRoom);
  $('#selected').text('');
  $('#selected').append("<a href='#'>" + myRoom + "</a>");
});

$.get('/tmpl/message.html', function(html) {
  $.template('message', html);
});

$.get('/tmpl/user.html', function(html) {
  $.template('user', html);
});

socket.on('message', function(mess, name, room) {
	console.log(room);
  if(room[0] !== '#'){
    room = '#' + room;
  }
  messages[room].push({
    name: name
  , message: mess
  });
  if(room === ('#' + myRoom)){
    name ? output(mess, name) : output(mess);
  }
});

socket.on('ircList', function(list, room){
  if(!users[room]){
    users[room] = [];
  }
  for(var x in list){
     users[room].push(x);
     $('#userContainer').append($.tmpl('user', {
       user    : x,
       userId  : x
     }));
  }
  output('session in irc room ' + room + ' connected', 'server');
});

socket.on('joined', function(name, room){
  if(room[0] !== '#'){
    room = '#' + room;
  }
  if(!users[room]){
    users[room] = [];
  }
  users[room].push(name);
  if(room === ('#' + myRoom)){
    $('#userContainer').append($.tmpl('user', {
      user    : name,
      userId  : name
    }));
  }
});

socket.on('left', function(name, room){
  if(room[0] !== '#'){
    room = '#' + room;
  }
  if(!users[room]){
    users[room] = [];
    return;
  }
  users[room].splice(users[room].indexOf(name),1)
  $('#' + name).remove();
});

$(function() {
  $('#newTab').click(function(){
     console.log('test');
  });
  var f; 
  $('#tabs li').click(f = function(e){
    if(e.target.parentElement.id !== 'newTab'){ //already created tab
      $('#selected').attr('id', '');
      e.target.parentElement.id = 'selected';
      myRoom = e.target.text;
      $('#output')[0].innerHTML = '';
      $('#userContainer')[0].innerHTML = '';
      populateUsers(myRoom);
      populateMessages(myRoom);
    } else { //create new tab
      $('#selected').attr('id', '');
      $("<li id='selected'><a href='#'>emuChat</a></li>").insertBefore('#newTab');
      $('#selected').click(f);
      $('#output').empty();
      $('#userContainer').empty();
      myRoom = prompt('room id:');
      while(myRoom === '' || myRoom === 'null' || users['#'+myRoom]){

      }
      join(myRoom);
      $('#selected').text('');
      $('#selected').append('<a href="#">'+myRoom+'</a>');
    }
  });

  $('#conOp').click(function(){
    if(myRoom != ''){
      close(myRoom);
      myRoom = '';
      var removed = $('#selected');
      if(removed.next().attr('id') !== 'newTab'){
        removed.next().attr('id', 'selected');
      } else {
        if(removed.prev().length !== 0){
          removed.prev().attr('id', 'selected');
        }
      }
      removed.remove();
      var newRoom = $('#selected').text();
      myRoom = newRoom;
      $('#output')[0].innerHTML = '';
      $('#userContainer')[0].innerHTML = '';
      populateUsers(myRoom);
      populateMessages(myRoom);
    }
  });

  $('#input').keydown(function(e) {
    if(e.keyCode == 13) {
      if($('#input').val() === ''){
        return false;
      }else{
        send();
        return false;
      }
    } 
  });
  $('#send').click(function(){
    send();
    });
});

function populateUsers(room){
  if(room[0] !== '#'){
    room = '#' + room;
  }
  list = users[room];
  for(var i = 0; i < list.length; i++){
    $('#userContainer').append($.tmpl('user', {
      user    : list[i],
      userId  : list[i]
    }));
  }
}

function populateMessages(room) {
  if(room[0] !== '#'){
    room = '#' + room;
  }
  list = messages[room];
  for(var i = 0; i < list.length; i++){
    output(list[i].message, list[i].name);
  }
}

function output(message, username){
  var scroll = false;
  var focus = $('#output')[0].scrollHeight - ($('#output')[0].scrollTop + $('#output').height());
  if(focus < 5){
    scroll = true;
  }
  if(!username){
    if(message.user === $('#output')[0].lastChild.childNodes[1].textContent){
      temp = document.createElement('p');
      tempText = document.createTextNode(message.content);
      temp.appendChild(tempText);
      $('#output')[0].lastChild.childNodes[5].insertBefore(temp, $('#output')[0].lastChild.childNodes[5].lastChild);
    }else{
      $('#output').append($.tmpl('message', message))
    }
  }else{
    if($('#output')[0].lastChild !== null  && username === $('#output')[0].lastChild.childNodes[1].textContent){
      temp = document.createElement('p');
      tempText = document.createTextNode(message);
      temp.appendChild(tempText);
      $('#output')[0].lastChild.childNodes[5].insertBefore(temp, $('#output')[0].lastChild.childNodes[5].lastChild);
    }else{
      $('#output').append($.tmpl('message', {
        user    : username
      , content : message
      , time    : time()
      }));
    }
  }
  if(scroll){
    $('#output').scrollTop($('#output')[0].scrollHeight);
  }
}

function send (opt) {
  input = $('#input'); 
  socket.emit('message', opt ? opt : input.val(), myRoom, name);
  opt || input.val('');
}

function close(e) {
  socket.emit('close', name, e);
  delete users['#' + e];
  delete messages['#' + e];
  $('#output').empty();
  $('#userContainer').empty();
}

function join(e){
  socket.emit('join', e);
  output('welcome to ' + e + ', have a good time!', 'server');
  users["#" + e] = users["#"+e] ? users["#"+e] : [name];
  $('#userContainer').append($.tmpl('user', {
    user    : name,
    userId  : name
  }));
  if(!messages[e]){
    messages['#' + e] = [];
    messages['#'+e].push({
      name: 'server'
    , message: 'welcome to ' + e + ', have a good time!'
    });
  }
}

function time() {
  var d       = new Date()
   ,  hours   = d.getHours()
   ,  minutes = d.getMinutes()
   ,  apm     = hours >= 12 ? 'pm' : 'am';
  
  if(hours <= 9){
    hours = '0' + hours;
  }
  
  if(minutes <= 9 ){
    minutes = '0' + minutes;
  }

  return (hours%12 == 0 ? 12 : hours%12) + ':' + minutes + ' ' + apm; 
}
