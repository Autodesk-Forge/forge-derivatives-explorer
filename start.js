/////////////////////////////////////////////////////////////////////
// Copyright (c) Autodesk, Inc. All rights reserved
// Written by Forge Partner Development
//
// Permission to use, copy, modify, and distribute this software in
// object code form for any purpose and without fee is hereby granted,
// provided that the above copyright notice appears in all copies and
// that both that copyright notice and the limited warranty and
// restricted rights notice below appear in all supporting
// documentation.
//
// AUTODESK PROVIDES THIS PROGRAM "AS IS" AND WITH ALL FAULTS.
// AUTODESK SPECIFICALLY DISCLAIMS ANY IMPLIED WARRANTY OF
// MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.  AUTODESK, INC.
// DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
// UNINTERRUPTED OR ERROR FREE.
/////////////////////////////////////////////////////////////////////

'use strict';

var app = require('./server/server');

// start server
var server = app.listen(app.get('port'), function () {
  if (process.env.FORGE_CLIENT_ID == null || process.env.FORGE_CLIENT_SECRET == null)
    console.log('*****************\nWARNING: Client ID & Client Secret not defined as environment variables.\n*****************');

  console.log('Starting at ' + (new Date()).toString());
  console.log('Server listening on port ' + server.address().port);
});

// Listening to ART server's UDP messages

const dgram = require('dgram');
const udp_server = dgram.createSocket('udp4');
var _socket = null;

udp_server.on('error', (err) => {
  console.log(`server error:\n${err.stack}`);
  server.close();
});

var _counter = 0;
var _limit = 0;
udp_server.on('message', (msg, rinfo) => {
  console.log(`server got: ${msg} from ${rinfo.address}:${rinfo.port}`);
  if (++_counter < _limit) {
    return;
  }
 
  _counter = 0;
  if (_socket) {
    var lines = msg.toString().split('\n');
    for (var key in lines) {
      // String is something like:
      // 6di 4 [0 0 0.000][0.000 0.000 0.000][0.000000 0.000000 0.000000 0.000000 0.000000 0.000000 0.000000 0.000000 0.000000] [1 0 0.000][0.000 0.000 0.000][0.000000 0.000000 0.000000 0.000000 0.000000 0.000000 0.000000 0.000000 0.000000] [2 0 0.000][0.000 0.000 0.000][0.000000 0.000000 0.000000 0.000000 0.000000 0.000000 0.000000 0.000000 0.000000] [3 0 0.000][0.000 0.000 0.000][0.000000 0.000000 0.000000 0.000000 0.000000 0.000000 0.000000 0.000000 0.000000]
      // 6di 4 [id st er][x y z][3x3 trasformation matrix]
      // id = identifier
      // st = state: 0 = not tracked
      // er = drift error estimate
      if (lines[key].startsWith('6di')) {
        // No need to pass on info if object is not tracked
        if (!lines[key].startsWith("6di 4 [0 0")) {
          _socket.emit('ART', lines[key]);
        }
      }
    }
  }
});

udp_server.on('listening', () => {
  const address = udp_server.address();
  console.log(`server listening ${address.address}:${address.port}`);
});

udp_server.bind(5000);

// Socket io communication with browser client

var io = require('socket.io')(server);
io.on('connection', function(socket) {
  console.log('a user connected (id=' + socket.id +')');

  _socket = socket;

  socket.on('hello', function(session) {
    console.log('hello received');
  });
});