const polka = require('polka')
const WebSocket = require('ws')
const Scanner = require('./exchanges/binance')

const { PORT=3000 } = process.env
const app = polka();

const wss = new WebSocket.Server({
  server: app.server
})

const scanner = new Scanner()
scanner.start_scanning({time: 60000})

wss.broadcast = function broadcast(data) {
  wss.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data)
    }
  })
}

wss.on('connection', function connection() {
  scanner.on('foundPairs', (pairs) => {
    wss.broadcast(JSON.stringify(pairs))
  })
})

app.listen(PORT).then(_ => {
    console.log(`> Running on localhost:${PORT}`)
})

/*
// Paste this on chrome's console for checking WebSocket msg
let ws = new WebSocket('ws://localhost:3000');
ws.onopen = console.log
ws.onmessage = console.log
*/
