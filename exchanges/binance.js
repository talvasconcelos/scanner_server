'use strict'
const fs = require('fs')
const EventEmitter = require('events')
const continuous = require('continuous')
const Utils = require('../lib/utils')
const tech = require('technicalindicators')
const api = require('binance')
const lstm = require('../lib/lstm')

const Hopper = require('../cryptohopper')
const hopper = new Hopper()

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
    this.AI = []
    this._timer = null
    this._is_scanning = false
    this._allTickers = false
    this._time = false
    this.hour = false
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

  get allTickers() {
    return this._allTickers
  }

  bullish(ohlc, period) {
    let open = ohlc.map(cur => +cur.open).slice(-period)
    let high = ohlc.map(cur => +cur.high).slice(-period)
    let close = ohlc.map(cur => +cur.close).slice(-period)
    let low = ohlc.map(cur => +cur.low).slice(-period)

    return tech.bullish({open, high, close, low})
  }

  ema(ohlc, period){
    let close = ohlc.map(cur => Number(cur.close))
    return tech.EMA.calculate({period, values: close}).reverse()
  }

  mfi(ohlc, period){
    let close = ohlc.map(cur => +cur.close)
    let high = ohlc.map(cur => +cur.high)
    let low = ohlc.map(cur => +cur.low)
    let volume = ohlc.map(cur => +cur.volume)
    return tech.MFI.calculate({high, low, close, volume, period: 14}).reverse()
  }

  rsi(ohlc){
    let close = ohlc.map(cur => Number(cur.close))
    //console.log(tech.RSI.calculate({values: close, period: 14}).reverse())
    return tech.RSI.calculate({values: close, period: 14}).reverse()
  }

  airsi(ohlc){
    let close = ohlc.map(cur => +cur.close)
    return [...Array(14).fill(0), ...tech.RSI.calculate({
      values: close,
      period: 14
    })]
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

  bb(ohlc, period = 14, stdDev = 2){
    let close = ohlc.map(cur => +cur.close)
    return tech.BollingerBands.calculate({values: close, period, stdDev}).reverse()
  }

  cci(ohlc, period = 20){
    let high = ohlc.map(cur => +cur.high)
    let low = ohlc.map(cur => +cur.low)
    let close = ohlc.map(cur => +cur.close)
    return tech.CCI.calculate({high, low, close, period}).reverse()
  }

  rvol(ohlc){
    let volume = ohlc.map(cur => Number(cur.volume))
    let output = Utils.rVol(volume, 20).reverse()
    return output
  }

  getCandles(pair){
    return new Promise(resolve => {
      if(pair === '123456'){
        return resolve()
      }
      this.client.klines({
        symbol: pair,
        interval: '1h',
        limit: 100
      }).then(res => {
          // if(res.length < 250) {
          //   return resolve()
          // }
          let aiCandles = {}
          let ema_10 = this.ema(res, 10)
          let ema_30 = this.ema(res, 30)
          let relVol = this.rvol(res)
          let mfi = this.mfi(res)
          let aiRes = res.slice(-20)
          let rsi = this.rsi(res)
          let macd = this.macd(res)
          let macdH = macd.map(v => v.histogram)
          let frontEnd = res.slice(-20)
          let bbUp = this.bb(res).map(v => v.upper)
          let cci = this.cci(res, 9)

          if(this.hour){
            aiCandles.candles = Utils.prepAiData(aiRes, this.airsi(aiRes))
            aiCandles.pair = pair
            aiCandles.frontEnd = frontEnd
            aiCandles.timestamp = Date.now()
  
            hopper.getPrediction({pair: pair, candles: aiCandles.candles})
            this.AI.push(aiCandles)
          }          
          
          res.reverse()
          
          if(macdH[0] < 0 || !Utils.fromBellow(macdH[0], macdH[1])){
            return resolve()
          }
          
          if(cci[0] < 80 || !Utils.fromBellow(cci[0], cci[1])){
            return resolve()
          }
          if(rsi[0] < 40 || !Utils.fromBellow(rsi[0], rsi[1])){
            return resolve()
          }
          if(res[0].high > bbUp){
            return resolve()
          }
          this._time = Date.now()
          let output = {
            pair,
            close: res[0].close,
            ema: ema_10[0],
            vol: relVol[0],
            mfi: mfi[0],
            rsi: Math.round(rsi[0]),
            frontEnd,
            timestamp: this._time
          }
          output.gap = Math.round((output.close - ema_30[0]) * 1000000) /1000000
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
        self.emit('scanStart')
        return resolve(true)
      })
      this.filterLowVolume()
      setInterval(() => {
        this.filterLowVolume()
      }, 3600000)
      self.client.time().then(res => {
        let serverTime = res.serverTime
        let milli = Utils.delayedStart(15, serverTime)
        console.log('Scanner will start in', Utils.milliToMin(milli))
        setTimeout(() => {
          console.log('Scanner started!', new Date(serverTime))
          resolve(timer.start())
        }, milli)
      })
    })
  }

  async filterLowVolume(){
    let pairs = await this.client.ticker24hr()
    pairs = pairs
      .filter(v => {
        let vol = 0
        switch (true) {
          case (/(BTC)$/g).test(v.symbol):
          vol = 150
          break;
          case (/(ETH)$/g).test(v.symbol):
          vol = 200
          break;
          case (/(BNB)$/g).test(v.symbol):
          vol = 500
          break;
          case (/(USDT)$/g).test(v.symbol):
          vol = 1000000
          break;
          default:
          vol = 100
          break;
        }
        return v.quoteVolume >= vol
      })
      .map(e => e.symbol)
    this._allTickers = pairs
    return pairs
  }

  stop_scanning(){
    this._timer.stop()
    console.log('Scanner stoped!')
    return
  }

  async _scan(){
  	let hour
    await this.client.time().then(res => {
      hour = new Date(res.serverTime)
      hour.getMinutes() < 10 ? this.hour = true : this.hour = false
    	console.log('New scan:', hour)
    })
    let out = []
    this.AI = []
    // console.log(this.allTickers)
    // let pairs = this.allTickers.map(e => e.symbol)//await this.client.exchangeInfo()
    //pairs = pairs.map(e => e.symbol)
    for(let symbol of this.allTickers) {
      if()
      const candles = await this.getCandles(symbol)
      out.push(candles)
    }
    
    if (this.hour) {
      this.emit('aiPairs', this.AI)
    }

    this._pairs = out.filter(val => val)
    if(this.pairs.length > 0){
      return this.advise()
    }
    console.log('No good trades at the moment!')
    return
    // this.client.exchangeInfo()
    // .then(async res => {
    //   let a
    //   let iterator = res.symbols.entries()
    //   while (a = iterator.next().value) {
    //     out.push(this.getCandles(a[1].symbol))
    //   }
    // })
    // .then(() => Promise.all(out))
    // .then(res => {
    //   this._pairs = res.filter(val => val)
    //   if(this.pairs.length)
    //     return this.advise()
    //   console.log('No good trades at the moment!')
    //   //this.emit('foundPairs', 'No good trades at the moment!')
    //   return
    // })
    // .catch(err => {
    //   console.error(err)
    // })
  }

  advise(){
    let pair = this.pairs.sort((x, y) => (y.vol - x.vol || x.mfi - y.mfi))
    //console.log(pair)
    this.emit('foundPairs', pair)
    return
  }
}

module.exports = Scanner
