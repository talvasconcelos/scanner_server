global.fetch = require('node-fetch')

const crypto = require('crypto')
const request = require('request')

const tf = require('@tensorflow/tfjs')

//require('@tensorflow/tfjs-node')

tf.setBackend('cpu')

// https://market-scanner.herokuapp.com/

// const json = tf.loadModel('https://market-scanner.herokuapp.com/lib/models/lstm-model.json')
// const bin = tf.loadModel('https://market-scanner.herokuapp.com/lib/models/lstm-model.weights.bin')

const model = tf.loadLayersModel('http://tvasconcelos.eu/model/cms/model/model.json')

const API_KEY = process.env.HOPPER_KEY
const API_SECRET = process.env.HOPPER_SECRET
const SIGNALLER_ID = process.env.SIGNALLER_ID

class Hopper {
    constructor() {
        this.model = null
        this.api_url = 'https://www.cryptohopper.com'
        this.api_key = API_KEY
        this.api_secret = API_SECRET
        this.signal_id = SIGNALLER_ID
        this.exchange = 'binance'
        this.preds = []
        model
            .then(m => this.model = m)
            .then(() => this.model.summary())
            .catch(err => console.error(err))
        
    }

    async batchSignal(pairs){
        return pairs.reduce(async (prevPair, nextPair) => {
            await prevPair
            return this.processSignal({
                pair: nextPair.pair,
                side: 'buy'
            })
        }, Promise.resolve())
    }

    async batchPredict(pairs){
        this.preds = []
        return pairs.reduce(async (prevPair, nextPair) => {
            await prevPair
            return this.getPrediction({
                pair: nextPair.pair,
                candles: nextPair.candles
            }).catch(err => console.error(err))
        }, Promise.resolve())
    }

    async getPrediction(opts) {
        await model
        if(!this.model) {return}
        if(!opts.candles) {return}
        let action = 1
        const X = tf.tensor3d([opts.candles])
        const P = this.model.predict(X).dataSync()
        action = tf.argMax(P).dataSync()[0]
        X.dispose()
        if (action === 1 || P[action] < 0.999) {
            return
        }
        const side = 'buy'
        console.log(`${opts.pair}: ${side} | Prob: ${P[action]}`)
        this.preds.push({pair: opts.pair, prob: P[action]})
        //console.log(P, action, X.dataSync())
        return this.processSignal({pair: opts.pair, side: side})
    }

    sendSignal(opts) {
        const headers = {
            'User-Agent': 'Cryptohopper Signaller/0.0.1',
            'X-Hub-Signature': opts.signature
        }

        const options = {
            url: this.api_url + opts.path,
            method: 'GET',
            headers: headers
        }

        return request(options, (error, response, body) => {
            if (!error && response.statusCode == 200) {
                // Print out the response body
                console.log(body)
            }
        })
    }

    hashSignature(path) {
        const hmac = crypto.createHmac('sha512', this.api_secret)
        const signature = hmac.update(path)
        return signature.digest('hex')
    }

    processSignal(opts) {
        const market = opts.pair
        const type = opts.side
        //const path = '/testsignal.php?api_key=' + this.api_key + '&signal_id=' + this.signal_id + '&exchange=' + this.exchange + '&market=' + market + '&type=' + type
        const path = `/signal.php?api_key=${this.api_key}&signal_id=${this.signal_id}&exchange=${this.exchange}&market=${market}&type=${type}`
        const signature = this.hashSignature(path)
        return this.sendSignal({
            path,
            signature
        })
    }
}

module.exports = Hopper

/*


const api_url = 'https://www.cryptohopper.com';
const api_key = API_KEY;
const api_secret = API_SECRET;
const signal_id = SIGNALLER_ID;
const exchange = 'binance'; //Possible values: poloniex, kraken, bittrex, gdax, binance, kucoin, cryptopia, bitfinex, huobi, 
const market = 'RVNBTC'; // For example BTC_ETH for Poloniex, BTC-ETH for Bittrex, ETHBTC for Binance, ETH-BTC for Coinbase PRO, XETHXXBT for Kraken, ETH/BTC for KuCoin, Cryptopia, Huobi and Bitfinex.   
const type = 'buy'; // Use 'buy' or 'sell'

const api_path = '/signal.php?api_key=' + api_key + '&signal_id=' + signal_id + '&exchange=' + exchange + '&market=' + market + '&type=' + type;
const hmac = crypto.createHmac('sha512', api_secret);
const signature = hmac.update(api_path);

// Set the headers
const headers = {
    'User-Agent': 'Cryptohopper Signaller/0.0.1',
    'X-Hub-Signature': signature.digest('hex')
}

// Configure the request
const options = {
    url: api_url + api_path,
    method: 'GET',
    headers: headers
}

// Start the request
const sendSignal = () => {
    return request(options, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            // Print out the response body
            console.log(body)
        }
    })
}

const signal = (pair, side) => {
    const request_options = {
        url: api_url + api_path,
        method: 'GET',
        headers: headers
    }
}

module.exports = sendSignal
*/