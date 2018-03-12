'use strict'
const fs = require('fs')
const EventEmitter = require('events')
const continuous = require('continuous')
const Utils = require('../lib/utils')
const update = require('./update_products')
// const products = fs.existsSync( './products.json') ?
//   require('./products.json') :
//   update.products()
const tech = require('technicalindicators')
const api = require('binance')
const lstm = require('../lib/lstm')

tech.setConfig('precision', 8)

class Scanner extends EventEmitter {
  /**
   * @param options
   * @param options.log {function}
   * @param options.volume Minimun volume on echange
   * @param options.base What base are you trading: BTC, ETH, USDT
   * @param options.client Pass the client
   */

  constructor(options){
    super()
    this._pairs = false
    this._timer = null
    this._is_scanning = false
    this._time = false
    options = options || {}
    this.volume = options.volume
    this.log = options.log || console.log
    this.client = new api.BinanceRest({
      //key: options.auth.key, // Get this from your account on binance.com
      //secret: options.auth.secret, // Same for this
      timeout: 15000, // Optional, defaults to 15000, is the request time out in milliseconds
      recvWindow: 10000, // Optional, defaults to 5000, increase if you're getting timestamp errors
      disableBeautification: false,
      handleDrift: true,
    })
  }

  get pairs(){
    return this._pairs
  }

  ema(ohlc, period){
    let close = ohlc.map(cur => Number(cur.close))
    return tech.EMA.calculate({period, values: close}).reverse()
  }

  rsi(ohlc){
    let close = ohlc.map(cur => Number(cur.close))
    //console.log(tech.RSI.calculate({values: close, period: 14}).reverse())
    return tech.RSI.calculate({values: close, period: 14}).reverse()
  }

  roc(ohlc){
    let close = ohlc.map(cur => Number(cur.close))
    return tech.ROC.calculate({values: close, period: 10}).reverse()
  }

  macd(ohlc){
    let close = ohlc.map(cur => Number(cur.close))
    return tech.MACD.calculate({
      values: close,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    }).reverse()
  }

  rvol(ohlc){
    let volume = ohlc.map(cur => Number(cur.volume))
    let output = Utils.rVol(volume, 20).reverse()
    return output
  }

  getCandles(pair){
    return new Promise(resolve => {
      this.client.klines({
        symbol: pair,
        interval: '15m',
        limit: 30
      }).then(res => {
          let ema_7 = this.ema(res, 7)
          let relVol = this.rvol(res)
          let roc = this.roc(res)
          let rsi = this.rsi(res)
          let macd = this.macd(res)

          //LSTM
          res.reverse()
          let aiPrediction = Number(lstm(Utils.prepAiData(res[0], rsi[0], relVol[0], roc[0])))
          if(res.quoteAssetVolume < this.volume){
            return resolve()
          }
          if(Math.round(aiPrediction) !== 1){
            return resolve()
          }
          // if(macd[0].histogram < 0 && !Utils.fromBellow(macd[0].MACD, macd[1].MACD)){
          //   return resolve()
          // }
          // if(relVol[0] < 2){
          //   return resolve()
          // }
          // if(roc[0] < 0){
          //   return resolve()
          // }
          // if(rsi[0] < 50 && !Utils.fromBellow(rsi[0], rsi[1])){
          //   return resolve()
          // }
          let output = {
            pair,
            close: res[0].close,
            ema: ema_7[0],
            vol: relVol[0],
            roc: roc[0],
            rsi: Math.round(rsi[0]),
            ai: aiPrediction,
            timestamp: this._time
          }
          output.gap = Math.round((output.close - output.ema) * 1000000) /1000000
          resolve(output)
        })
        .catch(err => console.error(err))
      })
  }

  start_scanning(options){
    let self = this
    options = options || {}
    options.time = options.time || 900000
    options.callback = this._scan.bind(this)
    return new Promise(resolve => {
      if (self._is_scanning) {
        return resolve(false)
      }
      let timer = new continuous(options)
      timer.on('stopped', () => {
        this._is_scanning = false
      })
      this._timer = timer
      timer.on('started', () => {
        this._is_scanning = true
        console.log('Scanner started!', new Date(serverTime))
        self.emit('scanStart')
        return resolve(true)
      })
      this.client.time().then(res => {
        let milli = Utils.delayedStart(15, res.serverTime)
        console.log('Scanner will start in', Utils.milliToMin(milli))
        setTimeout(() => {
          resolve(timer.start())
        }, milli)
      })
    })
  }

  stop_scanning(){
    this._timer.stop()
    console.log('Scanner stoped!')
    return
  }

  _scan(){
    this.client.time().then(res => console.log('New scan:', new Date(res.serverTime)))
    this._time = Date.now()
    let out = []
    this.client.exchangeInfo()
    .then(res => {
      let a
      let iterator = res.symbols.entries()
      while (a = iterator.next().value) {
        out.push(this.getCandles(a[1].symbol))
      }
    })
    .then(() => Promise.all(out))
    .then(res => {
      this._pairs = res.filter(val => val)
      if(this.pairs.length)
        return this.advise()
      console.log('No good trades at the moment!')
      //this.emit('foundPairs', 'No good trades at the moment!')
      return
    })
    .catch(err => {
      console.error(err)
    })
  }

  advise(){
    let pair = this.pairs.sort((x, y) => (x.gap - y.gap || y.ai - x.ai))
    //console.log(pair)
    this.emit('foundPairs', pair)
    return
  }
}

module.exports = Scanner
