/*!
 * agentkeepalive - test/agent.test.js
 *
 * Copyright(c) 2012 - 2013 fengmk2 <fengmk2@gmail.com>
 * MIT Licensed
 */

"use strict";

/**
 * Module dependencies.
 */

var http = require('http');
var urlparse = require('url').parse;
var should = require('should');
var pedding = require('pedding');
var Agent = require('../');

describe('agent.test.js', function () {

  var agentkeepalive = new Agent({
    keepAlive: true,
    keepAliveMsecs: 1000,
    maxSockets: 5,
    maxFreeSockets: 5,
  });
  var port = null;
  var app = http.createServer(function (req, res) {
    if (req.url === '/error') {
      res.destroy();
      return;
    } else if (req.url === '/hang') {
      // Wait forever.
      return;
    } else if (req.url === '/remote_close') {
      setTimeout(function () {
        req.connection.end();
      }, 500);
    }
    var info = urlparse(req.url, true);
    if (info.query.timeout) {
      setTimeout(function () {
        res.end(info.query.timeout);
      }, parseInt(info.query.timeout, 10));
      return;
    }
    res.end(JSON.stringify({
      info: info,
      url: req.url,
      headers: req.headers,
      socket: req.socket._getpeername()
    }));
  });

  before(function (done) {
    app.listen(0, function () {
      port = app.address().port;
      done();
    });
  });

  it('should default options set right', function () {
    var agent = agentkeepalive;
    agent.should.have.property('keepAlive', true);
    agent.should.have.property('keepAliveMsecs', 1000);
    agent.should.have.property('maxSockets', 5);
    agent.should.have.property('maxFreeSockets', 5);
  });

  var remotePort = null;

  it('should request / 200 status', function (done) {
    var name = 'localhost:' + port + '::';
    agentkeepalive.sockets.should.not.have.key(name);
    agentkeepalive.get({
      port: port,
      path: '/'
    }, function (res) {
      res.should.status(200);
      res.on('data', function (data) {
        data = JSON.parse(data);
        // cache for next test
        remotePort = data.socket.port;
      });
      res.on('end', function () {
        agentkeepalive.sockets.should.have.key(name);
        agentkeepalive.freeSockets.should.not.have.key(name);
        setTimeout(function () {
          agentkeepalive.sockets.should.not.have.key(name);
          agentkeepalive.freeSockets.should.have.key(name);
          agentkeepalive.freeSockets[name].should.length(1);
          done();
        }, 10);
      });
    });
    agentkeepalive.sockets.should.have.key(name);
    agentkeepalive.sockets[name].should.length(1);
    agentkeepalive.freeSockets.should.not.have.key(name);
  });

  it('should request again and use the same socket', function (done) {
    var name = 'localhost:' + port + '::';
    agentkeepalive.sockets.should.not.have.key(name);
    agentkeepalive.freeSockets.should.have.key(name);
    agentkeepalive.freeSockets[name].should.length(1);
    agentkeepalive.get({
      port: port,
      path: '/foo',
    }, function (res) {
      res.should.status(200);
      res.on('data', function (data) {
        data = JSON.parse(data);
        data.socket.port.should.equal(remotePort);
      });
      res.on('end', function () {
        agentkeepalive.sockets.should.have.key(name);
        agentkeepalive.freeSockets.should.have.not.key(name);
        setTimeout(function () {
          agentkeepalive.sockets.should.not.have.key(name);
          agentkeepalive.freeSockets.should.have.key(name);
          agentkeepalive.freeSockets[name].should.length(1);
          done();
        }, 10);
      });
    });
    agentkeepalive.sockets.should.have.key(name);
    agentkeepalive.sockets[name].should.length(1);
    agentkeepalive.freeSockets.should.have.not.key(name);
  });

  it('should remove keepalive socket when server side destroy()', function (done) {
    var name = 'localhost:' + port + '::';
    agentkeepalive.sockets.should.have.not.key(name);
    agentkeepalive.freeSockets.should.have.key(name);
    agentkeepalive.freeSockets[name].should.length(1);
    var req = agentkeepalive.get({
      port: port,
      path: '/error',
    }, function (res) {
      throw new Error('should not call this');
    });
    req.on('error', function (err) {
      should.exist(err);
      err.message.should.equal('socket hang up');
      agentkeepalive.sockets.should.have.key(name);
      agentkeepalive.freeSockets.should.have.not.key(name);
      setTimeout(function () {
        agentkeepalive.sockets.should.not.have.key(name);
        agentkeepalive.freeSockets.should.have.not.key(name);
        done();
      }, 10);
    });
    agentkeepalive.sockets.should.have.key(name);
    agentkeepalive.sockets[name].should.length(1);
    agentkeepalive.freeSockets.should.have.not.key(name);
  });

  it('should remove socket when socket.destroy()', function (done) {
    var name = 'localhost:' + port + '::';
    agentkeepalive.sockets.should.have.not.key(name);
    agentkeepalive.freeSockets.should.have.not.key(name);
    agentkeepalive.get({
      port: port,
      path: '/',
    }, function (res) {
      res.should.status(200);
      res.resume();
      res.on('end', function () {
        agentkeepalive.sockets.should.have.key(name);
        agentkeepalive.sockets[name].should.length(1);
        agentkeepalive.freeSockets.should.have.not.key(name);
        setTimeout(function () {
          agentkeepalive.sockets.should.have.not.key(name);
          agentkeepalive.freeSockets.should.have.key(name);
          agentkeepalive.freeSockets[name].should.length(1);
          agentkeepalive.freeSockets[name][0].destroy();
          console.log('wait 10ms')
          setTimeout(function () {
            console.log('10ms')
            agentkeepalive.sockets.should.not.have.key(name);
            agentkeepalive.freeSockets.should.not.have.key(name);
            done();
          }, 10);
        }, 10);
      });
    }).on('error', done);
  });

  it('should use new socket when hit the max keepalive time: 1000ms', function (done) {
    // socket._handle will not timeout ...
    var name = 'localhost:' + port + '::';
    agentkeepalive.sockets.should.have.not.key(name);
    agentkeepalive.freeSockets.should.have.not.key(name);
    agentkeepalive.get({
      port: port,
      path: '/',
    }, function (res) {
      res.should.status(200);
      var lastPort = null;
      res.on('data', function (data) {
        data = JSON.parse(data);
        lastPort = data.socket.port;
        should.exist(lastPort);
      });
      res.on('end', function () {
        agentkeepalive.sockets.should.have.key(name);
        agentkeepalive.sockets[name].should.length(1);
        agentkeepalive.freeSockets.should.have.not.key(name);
        setTimeout(function () {
          agentkeepalive.sockets.should.have.not.key(name);
          // agentkeepalive.freeSockets.should.have.not.key(name);
          agentkeepalive.get({
            port: port,
            path: '/',
          }, function (res) {
            res.should.status(200);
            res.on('data', function (data) {
              data = JSON.parse(data);
              should.exist(data.socket.port);
              data.socket.port.should.not.equal(lastPort);
            });
            res.on('end', function () {
              done();
            });
          });
        }, 2000);
      });
    });
  });

  it('should disable keepalive when keepAlive=false', function (done) {
    var name = 'localhost:' + port + '::';
    var agent = new Agent({
      keepAlive: false
    });
    agent.keepAlive.should.equal(false);
    agent.get({
      port: port,
      path: '/',
    }, function (res) {
      res.should.status(200);
      res.on('data', function () {});
      res.on('end', function () {
        agent.sockets.should.have.key(name);
        agent.freeSockets.should.not.have.key(name);
        setTimeout(function () {
          agent.sockets.should.have.not.key(name);
          agent.freeSockets.should.not.have.key(name);
          done();
        }, 10);
      });
    });
    agent.sockets.should.have.key(name);
    agent.sockets[name].should.length(1);
    agent.freeSockets.should.not.have.key(name);
  });

  it('should not keepalive when client.abort()', function (done) {
    var name = 'localhost:' + port + '::';
    agentkeepalive.sockets.should.have.not.key(name);
    var client = agentkeepalive.get({
      port: port,
      path: '/',
    }, function (res) {
      throw new Error('should not call this.');
    });
    client.on('error', function (err) {
      should.exist(err);
      err.message.should.equal('socket hang up');
      agentkeepalive.sockets.should.not.have.key(name);
      agentkeepalive.freeSockets.should.have.not.key(name);
      done();
    });
    process.nextTick(function () {
      client.abort();
    });
  });

  it('should keep 1 socket', function (done) {
    var name = 'localhost:' + port + '::';
    var agent = new Agent({
      maxSockets: 1,
      maxFreeSockets: 1,
      keepAlive: true,
    });
    var lastPort = null;
    agent.get({
      port: port,
      path: '/',
    }, function (res) {
      agent.sockets[name].should.length(1);
      agent.requests[name].should.length(1);
      res.should.status(200);
      res.on('data', function (data) {
        data = JSON.parse(data);
        lastPort = data.socket.port;
        should.exist(lastPort);
      });
      res.on('end', function () {
        process.nextTick(function () {
          agent.sockets.should.have.key(name);
          agent.sockets[name].should.length(1);
          agent.freeSockets.should.not.have.key(name);
        });
      });
    });

    agent.get({
      port: port,
      path: '/',
    }, function (res) {
      agent.sockets[name].should.length(1);
      agent.requests.should.not.have.key(name);
      res.should.status(200);
      res.on('data', function (data) {
        data = JSON.parse(data);
        data.socket.port.should.equal(lastPort);
      });
      res.on('end', function () {
        setTimeout(function () {
          // this is a bug, need to keepalive 1 socket
          agent.sockets.should.have.not.key(name);
          agent.freeSockets.should.have.not.key(name);
          // agent.sockets.should.have.key(name);
          // agent.freeSockets.should.have.key(name);
          // agent.freeSockets[name].should.length(1);
          done();
        }, 10);
      });
    });
    agent.requests[name].should.length(1);
  });

  it('should request /remote_close 200 status, after 500ms free socket close', function (done) {
    var name = 'localhost:' + port + '::';
    agentkeepalive.sockets.should.not.have.key(name);
    agentkeepalive.get({
      port: port,
      path: '/remote_close'
    }, function (res) {
      res.should.status(200);
      res.on('data', function (data) {
      });
      res.on('end', function () {
        agentkeepalive.sockets.should.have.key(name);
        agentkeepalive.freeSockets.should.not.have.key(name);
        setTimeout(function () {
          agentkeepalive.sockets.should.not.have.key(name);
          agentkeepalive.freeSockets.should.have.key(name);
          agentkeepalive.freeSockets[name].should.length(1);
          setTimeout(function () {
            agentkeepalive.sockets.should.not.have.key(name);
            agentkeepalive.freeSockets.should.not.have.key(name);
            done();
          }, 510);
        }, 10);
      });
    });
    agentkeepalive.sockets.should.have.key(name);
    agentkeepalive.sockets[name].should.length(1);
    agentkeepalive.freeSockets.should.not.have.key(name);
  });

  // it('should maxKeepAliveRequests work with 1 and 10', function (done) {
  //   var name = 'localhost:' + port + '::';
  //   function request(agent, checkCount, callback) {
  //     agent.get({
  //       port: port,
  //       path: '/foo',
  //     }, function (res) {
  //       agent.sockets[name].should.length(1);
  //       res.should.status(200);
  //       res.resume();
  //       res.on('end', function () {
  //         process.nextTick(function () {
  //           agent.createSocketCount.should.equal(checkCount);
  //           callback();
  //         });
  //       });
  //     });
  //   }

  //   done = pedding(2, done);
  //   var agent1 = new Agent({
  //     maxSockets: 1,
  //     maxKeepAliveRequests: 1
  //   });
  //   request(agent1, 1, function () {
  //     request(agent1, 2, done);
  //   });

  //   var agent10 = new Agent({
  //     maxSockets: 1,
  //     maxKeepAliveRequests: 10
  //   });
  //   var requestDone = pedding(agent10.maxKeepAliveRequests, function () {
  //     request(agent10, 2, done);
  //   });
  //   request(agent10, 1, requestDone);
  //   request(agent10, 1, requestDone);
  //   request(agent10, 1, requestDone);
  //   request(agent10, 1, requestDone);
  //   request(agent10, 1, requestDone);
  //   request(agent10, 1, requestDone);
  //   request(agent10, 1, requestDone);
  //   request(agent10, 1, requestDone);
  //   request(agent10, 1, requestDone);
  //   request(agent10, 1, requestDone);
  // });

  it('should fire timeout callback', function (done) {
    var req = agentkeepalive.get({
      port: port,
      path: '/',
    }, function (res) {
      var req = http.get({
        port: port,
        path: '/hang',
      }, function (res) {
        throw new Error('should not call this');
      });
      req.setTimeout(400, function() {
        setTimeout(done, 300);
      });
    });
    // timeout fire many times: change in node@0.10.0+
    // req.setTimeout(500, function() {
    //   throw new Error('Timeout callback for previous request called.');
    // });
  });

});
