const WebSocket = require('ws')

function WS({server}) {
  const wss = new WebSocket.Server({server})

  wss.broadcast = function broadcast(data) {
    wss.clients.forEach(function each(client) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data, (err) => {
          if(err) console.error(err)
        })
      }
    })
  }

  wss.on('connection', (ws) => {
    console.log('Client connected!')
    ws.on('close', () => console.log('Client disconnected!'))
    ws.isAlive = true
    ws.on('pong', heartbeat)
  })

  const interval = setInterval(function ping() {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) return ws.terminate()

      ws.isAlive = false
      ws.ping(noop)
    })
  }, 30000)

  function noop() {}

  function heartbeat() {
    this.isAlive = true
  }

  return {
    broadcastWS(msg) {
      const message = JSON.stringify(msg)
      wss.broadcast(message)
    }
  }
}

module.exports = WS
