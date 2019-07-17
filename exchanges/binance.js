'use strict'
const fs = require('fs')
const EventEmitter = require('events')
const continuous = require('continuous')
const Utils = require('../lib/utils')
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
    return [...Array(13).fill(0), ...tech.RSI.calculate({
      values: close,
      period: 14
    })]
  }

  aiobv(ohlc){
    let close = ohlc.map(cur => +cur.close)
    let volume = ohlc.map(cur => +cur.volume)
    return tech.OBV.calculate({
      close,
      volume
    })
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

  processData(ohlc) {
    const data = {} 
    data.o = ohlc.map(v => +v.open)
    data.h = ohlc.map(v => +v.high)
    data.c = ohlc.map(v => +v.close)
    data.l = ohlc.map(v => +v.low)
    data.v = ohlc.map(v => +v.volume)
    data.t = ohlc.map(v => +v.trades)

    const normalizeMinMax = (arr) => {
      const min = Math.min(...arr)
      const max = Math.max(...arr)
      return arr.map(v => (v - min) / (max - min))
    }    

    const ret = (data, multiplier = 1) => {
      return data.map((c, i) => Utils.sigmoid(((c - data[i - 1]) / data[i - 1]) * multiplier || 0))
    }

    const UO = (close, high, low, n = 7, m = 14, s = 28) => {

      const getAvgs = (arr, period) => [...Array(period - 1).fill(0), ...tech.SMA.calculate({
        values: arr,
        period
      })]
      const divide = (arr1, arr2) => arr1.map((v, i) => v / arr2[i] || 0)

      const BP = close.map((v, i) => v - Math.min(low[i], close[i - 1]) || 0)
      const TR = close.map((v, i) => Math.max(high[i], close[i - 1]) - Math.min(low[i], close[i - 1]) || 0)

      const [nAvg, mAvg, sAvg] = [n, m, s].map(v => divide(getAvgs(BP, v), getAvgs(TR, v)))

      return BP.map((v, i) => {
        return ((4 * nAvg[i]) + (2 * mAvg[i]) + sAvg[i]) / (4 + 2 + 1)
      })
    }

    const MACD = tech.MACD.calculate({
      values: data.c,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    })

    const HIST = [...Array(25).fill(0), ...normalizeMinMax(MACD.map(v => v.histogram || 0))]
    const MFI = [...Array(15).fill(0), ...tech.MFI.calculate({
      high: data.h,
      low: data.l,
      close: data.c,
      volume: data.v,
      period: 14
    })]
    const RET = ret(data.c, 100)
    const ROT = data.h.map((h, i) => Utils.sigmoid(Utils.rotationalFactor(h, data.h[i - 1], data.l[i], data.l[i - 1])))
    const RSI = [...Array(14).fill(0), ...tech.RSI.calculate({
      values: data.c,
      period: 14
    })]
    const ULTIMATE = UO(data.c, data.h, data.l)

    const STATE = RET.map((v, i) => [RET[i], ROT[i], RSI[i] / 100, MFI[i] / 100, HIST[i], ULTIMATE[i]])
    return STATE.slice(-6)
  }

  getCandles(pair){
    return new Promise(resolve => {
      if(pair === '123456' || pair.includes('BCC') || pair.includes('PAX')){
        return resolve()
      }
      this.client.klines({
        symbol: pair,
        interval: '1h',
        limit: 100
      }).then(_res => {
        if (this.hour) {
          if (_res.length < 99) {
            return _res
          }
          let res = _res
          let aiCandles = {}
          aiCandles.AI = true
          // console.log(pair, Utils.toDate(res[0].closeTime), Utils.toDate(res[res.length -1].closeTime))
          if (res[res.length - 1].closeTime > Date.now()) {
            res.pop()
          }
          const aiData = Utils.prepAIDataTest(res)
          const aiHopper = Utils.prepAiData(res)
          aiCandles.candles = aiData
          //aiCandles.testModel = aiData//Utils.prepAIDataTest(res)
          aiCandles.hopper = aiHopper
          aiCandles.pair = pair
          aiCandles.frontEnd = res.slice(-20)
          aiCandles.timestamp = Date.now()
          this.AI.push(aiCandles)
        }

        return _res
      }).then(res => {
          // if(res.length < 250) {
          //   return resolve()
          // }
          let ema_10 = this.ema(res, 10)
          let ema_30 = this.ema(res, 30)
          let relVol = this.rvol(res)
          let mfi = this.mfi(res)
          let rsi = this.rsi(res)
          let macd = this.macd(res)
          let macdH = macd.map(v => v.histogram)
          let frontEnd = res.slice(-20)
          let bbUp = this.bb(res).map(v => v.upper)
          let cci = this.cci(res, 9)
          
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
          vol = 85
          break;
          case (/(ETH)$/g).test(v.symbol):
          vol = 1000
          break;
          case (/(BNB)$/g).test(v.symbol):
          vol = 1500
          break;
          case (/(USDT)$/g).test(v.symbol):
          vol = 500000
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
      const candles = await this.getCandles(symbol)
      out.push(candles)
    }
        
    if (this.hour) {
      this.emit('aiPairs', this.AI)
    }

    this._pairs = out.filter(val => val)
    if(this.pairs.length > 0){
      console.log('Scan ended!')
      return this.advise()
    }
    console.log('No good trades at the moment!')
    return
  }

  advise(){
    let pair = this.pairs.sort((x, y) => (y.vol - x.vol || x.mfi - y.mfi))
    //console.log(pair)
    this.emit('foundPairs', pair)
    // if (this.hour) {
    //   this.emit('hopper', pair)
    // }
    return
  }
}

module.exports = Scanner
