'use strict'
process.env.NODE_ENV !== 'production' ? require('dotenv').config() : null

const polka = require('polka')
const path = require('path')
const app = polka()
const WS = require('./lib/websocket')({server: app.server})

const { PORT=3000 } = process.env
//const INDEX = path.join(__dirname, 'index.html')

//app.use((req, res) => res.end(new Date().toTimeString()))
app.listen(PORT).then( _ => console.log(`Listening on ${ PORT }`))

const Scanner = require('./exchanges/binance')
const Slimbot = require('slimbot');
const slimbot = new Slimbot(process.env.TELEGRAM_TOKEN)
slimbot.startPolling()

//Scanner
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
    Time: ${cur.timestamp}
    [See it on Binance](https://www.binance.com/tradeDetail.html?symbol=${urlPair})`

    slimbot.sendMessage('@trexMarketScan', msg, {parse_mode: 'Markdown'})
  })
}

scanner.on('foundPairs', (pairs) => {
  telegramBroadcast(pairs)
  console.log(pairs)
  WS.broadcastWS(pairs)
})
