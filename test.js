const fs = require('fs')
const API = require('binance')
const Trader = require('./cmstrader')
const Utils = require('./lib/utils')
const cmsData = require('./lib/cmsdata')
const trader = new Trader()
const api = new API.BinanceRest({
    //key: options.auth.key, // Get this from your account on binance.com
    //secret: options.auth.secret, // Same for this
    timeout: 15000, // Optional, defaults to 15000, is the request time out in milliseconds
    recvWindow: 10000, // Optional, defaults to 5000, increase if you're getting timestamp errors
    disableBeautification: false,
    handleDrift: true,
})

const appendToJson = async (pair, candles) => {
    await fs.readFile('./output.json', (err, res) => {
        if(err){
            return console.error(err)
        }
        const data = JSON.parse(res)
        data[pair] = candles
        fs.writeFile('output.json', JSON.stringify(data), (err, result) => {
            if(err){
                return console.error(err)
            } else {
                console.log('Success!')
            }
        })
    })
    return
}

const getPairs = async () => {
    let pairs = await api.ticker24hr()
    // console.log(pairs)
    return pairs
        .filter(v => (/(BTC)$/g).test(v.symbol))
        .filter(v => v.volume >= 150 && v.weightedAvgPrice > 0.00000199)
        .map(e => e.symbol)
}

const getPred = (pair) => {
    return api.klines({
        symbol: pair,
        interval: '1h'
    }).then(res => {
        let aiCandles = {}
        if (res[res.length - 1].closeTime > Date.now()) {
            res.pop()
        }
    
        const aiTrader = cmsData.prepareData(res)
        aiCandles.trader = aiTrader
        aiCandles.pair = pair
        aiCandles.timestamp = Date.now()
    
        return aiCandles
    }).then(res => {
        return trader.batchPredict([res])
    }).catch(console.error)
}

getPairs().then(res => {
    // console.log(res)
    return res.reduce(async (prevPair, nextPair) => {
        await prevPair
        return getPred(nextPair).catch(err => console.error(err))
    }, Promise.resolve())
}).then(() => console.log('Done!'))