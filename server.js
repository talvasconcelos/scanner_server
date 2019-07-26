'use strict'
process.env.NODE_ENV !== 'production' ? require('dotenv').config() : null
require('heroku-self-ping')(process.env.APP_URL)

const polka = require('polka')
const path = require('path')
const app = polka()
const Utils = require('./lib/utils')
const { PORT=3000 } = process.env

let PAIR_CACHE, AI_PAIR_CACHE, TRADER

const INDEX = path.join(__dirname, 'index.html')

app.use((req, res) => res.end(new Date().toTimeString()))
app.listen(PORT, err => {
  if(err) throw err
  console.log(`Listening on ${ PORT }`)
})
const WS = require('./lib/websocket')({server: app.server})


const Scanner = require('./exchanges/binance')
const Hopper = require('./cryptohopper')
const Trader = require('./cmstrader')
const hopper = new Hopper()
const trader = new Trader()
// const Slimbot = require('slimbot');
// const slimbot = new Slimbot(process.env.TELEGRAM_TOKEN)
// slimbot.startPolling()

//Scanner
const scanner = new Scanner()
scanner.start_scanning({time: 900000})
let currencies = ['BTC', 'ETH', 'BNB', 'USDT']

WS.wss.on('connection', (ws) => {
  if(AI_PAIR_CACHE){
    ws.send(JSON.stringify(AI_PAIR_CACHE))
  }
	if(PAIR_CACHE){
    ws.send(JSON.stringify(PAIR_CACHE))
  }
	if(TRADER) {
    ws.send(JSON.stringify(TRADER))
  }
})

function telegramBroadcast(found){
  found.map((cur, i) => {
    let currency //= cur.pair.slice(-3)
    switch (true) {
      case (/(BTC)$/g).test(cur.pair):
        currency = 'BTC'
        break;
      case (/((ETH|XRP))$/g).test(cur.pair):
        currency = 'ETH'
        break;
      case (/(BNB)$/g).test(cur.pair):
        currency = 'BNB'
        break;
      case (/((USD.|TUSD|USD|PAX))$/).test(cur.pair):
        currency = 'USDT'
        break;
      default:
        break;
    }
    let aiScore = Math.round((cur.ai * 100) * 10) / 10
    let _pair = cur.pair.split(currency)[0]
    let urlPair = _pair + '_' + currency
    let msg = `*Binance Scanner(WIP):*
    *Currency:* ${currency}
    *Asset:* ${_pair}
    *Last Close @:* ${cur.close}
    *RSI:* ${cur.rsi}
    *Relative Volume:* ${cur.vol || 1}
    *Rank:* #${i + 1}
    *${_pair}* is showing *${cur.bullish ? 'bullish' : 'bearish'}* action.
    [See it on Binance](https://www.binance.com/tradeDetail.html?symbol=${urlPair})`
    //*AI Prediction:* ${aiScore}% (prob. to move up)

    slimbot.sendMessage('@trexMarketScan', msg, {parse_mode: 'Markdown'})
  })
}

scanner.on('foundPairs', (pairs) => {
  // telegramBroadcast(pairs.slice(10))
  //console.log(pairs)
  WS.broadcastWS(pairs)
  if(Array.isArray(pairs) && pairs.length){
    PAIR_CACHE = pairs
  }
})

scanner.on('aiPairs', (aipairs) => {
  WS.broadcastWS(aipairs)
  if(Array.isArray(aipairs) && aipairs.length){
    AI_PAIR_CACHE = aipairs
  }
  
  hopper.batchPredict(aipairs)
  trader.batchPredict(aipairs).then(res => {
    const msg = {
      to: 'trader',
      timestamp: new Date().getTime(),
      data: res
    }
    WS.broadcastWS(msg)
    TRADER = msg
    console.log(TRADER)
  })
    // .then(() => {
    //   const msg = {
    //     to: 'trader',
    //     timestamp: new Date().getTime(),
    //     data: hopper.preds
    // }
  //   WS.broadcastWS(msg)
  //   TRADER = msg
  //   console.log(TRADER)
  // })
  //console.log(aipairs)
})

