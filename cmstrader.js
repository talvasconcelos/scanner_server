global.fetch = require('node-fetch')

const tf = require('@tensorflow/tfjs')
const model = tf.loadLayersModel('http://tvasconcelos.eu/model/cms/conv_model/model/model.json')

tf.setBackend('cpu')

class CMSPredict {
    constructor() {
        this.model = null
        this.preds = []
        model
            .then(m => this.model = m)
            // .then(() => this.model.summary())
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
        await model
        if(!this.model) {return}
        if(!opts.candles) {return}
        // console.log(opts.candles)
        const X = tf.tensor3d([opts.candles])
        const P = this.model.predict(X).dataSync()[0]
        X.dispose()
        if (P < 0.99) {
            return
        }
        const side = 'buy'
        console.log(`${opts.pair}: ${side} | Prob: ${P}`)        
        return this.preds.push({pair: opts.pair, prob: P})
    }
}

module.exports = CMSPredict