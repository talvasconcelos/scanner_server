'use strict'
process.env.NODE_ENV !== 'production' ? require('dotenv').config() : null

const polka = require('polka')
const WebSocket = require('ws')
const path = require('path')

const { PORT=3000 } = process.env
const INDEX = path.join(__dirname, 'index.html')


const app = polka()
app.use((req, res) => res.end(new Date().toTimeString()))
app.listen(PORT).then( _ => console.log(`Listening on ${ PORT }`))

let pairState
//Websocket
const wss = new WebSocket.Server({server: app.server})

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
  if(pairState !== 'undefined') {
    ws.send(JSON.stringify(pairState))
  }
  ws.on('pong', heartbeat)
})

const interval = setInterval(function ping() {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate()

    ws.isAlive = true
    ws.ping(noop)
  })
}, 30000)

function noop() {console.log('Keep alive!')}

function heartbeat() {
  this.isAlive = true
}

//Scanner
const Scanner = require('./exchanges/binance')
const Slimbot = require('slimbot');
const slimbot = new Slimbot(process.env.TELEGRAM_TOKEN)
slimbot.startPolling()

const scanner = new Scanner()
scanner.start_scanning({time: 900000})

function telegramBroadcast(found){
  found.map((cur, i) => {
    let currency = cur.pair.slice(-3)
    let aiScore = Math.round((cur.ai * 100) * 10) / 10
    let _pair = cur.pair.split(currency)[0]
    let urlPair = _pair + '_' + currency
    let msg = `*Binance Scanner(WIP):*
    *Currency:* ${currency}
    *Asset:* ${_pair}
    *Last Close @:* ${cur.close}
    *RSI:* ${cur.rsi}
    *Volume:* ${cur.vol || 1}
    *Rank:* #${i + 1}
    *AI Prediction:* ${aiScore}% (prob. to move up)
    [See it on Binance](https://www.binance.com/tradeDetail.html?symbol=${urlPair})`
    // *AI Score:* ${aiScore}

    slimbot.sendMessage('@trexMarketScan', msg, {parse_mode: 'Markdown'})
  })
}

scanner.on('foundPairs', (pairs) => {
  console.log(pairs)
  wss.broadcast(JSON.stringify(pairs))
  telegramBroadcast(pairs)
  pairState = pairs
})
