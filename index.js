process.env.NODE_ENV !== 'production' ? require('dotenv').config() : null
const polka = require('polka')
const WebSocket = require('ws')
const Scanner = require('./exchanges/binance')
const Slimbot = require('slimbot');
const slimbot = new Slimbot(process.env.TELEGRAM_TOKEN)
slimbot.startPolling()

const { PORT=3000 } = process.env
const app = polka();

const wss = new WebSocket.Server({
  server: app.server
})

const scanner = new Scanner()
scanner.start_scanning({time: 120000})

wss.broadcast = function broadcast(data) {
  wss.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data, (err) => {
        console.error(err)
      })
    }
  })
}

function telegramBroadcast(found){
  found.map((cur, i) => {
    let currency = cur.pair.slice(-3)
    let aiScore = Math.round((cur.ai * 100) * 100) / 100
    let _pair = cur.pair.split(currency)[0]
    let urlPair = _pair + '_' + currency
    //let msg = '*Binance Scanner(WIP):* \n *Currency: *' + config.general.base + '\n *Asset: *' + _pair + '\n *Last Close @:*' + cur.close + '\n *RSI:* ' + cur.rsi + '\n *Volume:* ' + cur.vol + '\n *Rank:* #' + (i + 1) + '\n *AI Score: *' + aiScore + '\n [See it on Binance](https://www.binance.com/tradeDetail.html?symbol=' + urlPair + ')'
    let msg = `*Binance Scanner(WIP):*
    *Currency:* ${currency}
    *Asset:* ${_pair}
    *Last Close @:* ${cur.close}
    *RSI:* ${cur.rsi}
    *Volume:* ${cur.vol || 1}
    *Rank:* #${i + 1}
    *AI Score:* ${aiScore}%
    [See it on Binance](https://www.binance.com/tradeDetail.html?symbol=${urlPair})`
    // *AI Score:* ${aiScore}

    slimbot.sendMessage('@trexMarketScan', msg, {parse_mode: 'Markdown'})
  })
}

scanner.on('foundPairs', (pairs) => {
  console.log(pairs)
  wss.broadcast(JSON.stringify(pairs))
  telegramBroadcast(pairs)
})

wss.on('connection', function connection() {
  console.log('Client connected!')
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
