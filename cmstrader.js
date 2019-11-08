global.fetch = require('node-fetch')

const tf = require('@tensorflow/tfjs')
const encoder = tf.loadLayersModel('http://tvasconcelos.eu/model/cms/uber_arch/encoder/model.json')
const model = tf.loadLayersModel('http://tvasconcelos.eu/model/cms/uber_arch/model/model.json')
// const model = tf.loadLayersModel('http://tvasconcelos.eu/model/cms/conv_model/model/model.json')

tf.setBackend('cpu')

class CMSPredict {
    constructor() {
        this.encoder = null
        this.model = null
        this.preds = []
        encoder
            .then(e => this.encoder = e)
            .catch(err => console.error(err))
        model
            .then(m => this.model = m)
            .catch(err => console.error(err))
        
    }

    async batchPredict(pairs){
        this.preds = []
        return pairs.reduce(async (prevPair, nextPair) => {
            await prevPair
            return this.getPrediction({
                pair: nextPair.pair,
                candles: nextPair.trader
            }).catch(err => console.error(err))
        }, Promise.resolve())
    }

    async getPrediction(opts) {
        if(!this.model || !this.encoder) {return}
        if(!opts.candles) {return}
        // console.log(opts.candles)
        const AE = tf.tensor3d([opts.candles[0]])
        const X = tf.tensor3d([opts.candles[1]])
        const AEX = await this.encoder.predict(AE)
        const AEXX = tf.concat([AEX, X], 2)
        const P = await this.model.predict(AEXX).dataSync()[0]
        AE.dispose()
        X.dispose()
        AEX.dispose()
        AEXX.dispose()
        // console.log(P)
        // const X = tf.tensor3d([opts.candles])
        // const P = this.model.predict(X).dataSync()[0]
        // X.dispose()
        const sigmoid = (x) => (1 / (1 + Math.exp(-x)))
        if (P < 0.75) {
            return
        }
        const side = 'buy'
        console.log(`${opts.pair}: ${side} | Prob: ${P+100}%`)        
        return this.preds.push({pair: opts.pair, prob: P})
    }
}

module.exports = CMSPredict