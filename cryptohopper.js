global.fetch = require('node-fetch')

const crypto = require('crypto')
const request = require('request')

const tf = require('@tensorflow/tfjs')

//require('@tensorflow/tfjs-node')

tf.setBackend('cpu')

// https://market-scanner.herokuapp.com/

// const json = tf.loadModel('https://market-scanner.herokuapp.com/lib/models/lstm-model.json')
// const bin = tf.loadModel('https://market-scanner.herokuapp.com/lib/models/lstm-model.weights.bin')

const model = tf.loadModel('http://tvasconcelos.eu/model/cms/gru-model.json')

const API_KEY = 'yl4txD45m4VyYO8amLNwTVmuELcnSc3z'
const API_SECRET = 'I1uxDkGstUTRExx1mbWg8FarStUJ8ASdwK8ZCt7q30QX4bCEHBkDZ1ijDwPeMBEw'
const SIGNALLER_ID = 224

class Hopper {
    constructor() {
        this.model = null
        this.api_url = 'https://www.cryptohopper.com'
        this.api_key = API_KEY
        this.api_secret = API_SECRET
        this.signal_id = SIGNALLER_ID
        this.exchange = 'binance'
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
        return pairs.reduce(async (prevPair, nextPair) => {
            await prevPair
            return this.getPrediction({
                pair: nextPair.pair,
                candles: nextPair.candles
            })
        }, Promise.resolve())
    }

    async getPrediction(opts) {
        await model
        if(!this.model) return
        const X = tf.tensor3d([opts.candles])
        const P = await this.model.predict(X).dataSync()
        const action = tf.argMax(P).dataSync()[0]
        if (action === 2 || P[action] < 1) {
            return
        }
        const side = action === 0 ? 'buy' : 'sell'
        console.log(`${opts.pair}: ${side}`)
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
        const path = `/testsignal.php?api_key=${this.api_key}&signal_id=${this.signal_id}&exchange=${this.exchange}&market=${market}&type=${type}`
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