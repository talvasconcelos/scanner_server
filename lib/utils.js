const fs = require('fs')
const tech = require('technicalindicators')
const d3 = require('d3')

const utils = {
  rVol: (vol, period) => {
    let relVol = vol.map((cur, i, arr) => {
      if(i > period) {
        let lookback = vol.slice(i - period, i)
        let avgVol = lookback.reduce((acc, val, index) => {
          acc += val
          if(index === lookback.length - 1)
            return acc / lookback.length
          return acc
        })
        return Math.round((cur / avgVol) * 100) / 100
      }
    })
    return relVol
  },

  fromBellow: (cur, prev) => {
    return cur > prev
  },

  roundToNearest: (numToRound, numToRoundTo) => {
    numToRoundTo = 1 / (numToRoundTo)
    let nearest = Math.floor(numToRound * numToRoundTo) / numToRoundTo
    return Math.round(nearest * 100000000) / 100000000
  },

  getOrderMinSize: (currency) => {
    if (currency === 'BTC') return 0.002
    else if (currency === 'ETH') return 0.02
    else return 1
  },

  normalize: (val, min, max, round) => {
    let normalized = (val - min) / (max - min)
    return !round ? normalized : Math.round(normalized * round) / round
  },

  milliToMin: (time) => {
    let minutes = Math.floor(time / 60000)
    let seconds = ((time % 60000) / 1000).toFixed(0)
    return (seconds == 60 ? (minutes+1) + ":00" : minutes + ":" + (seconds < 10 ? "0" : "") + seconds)
  },

  delayedStart: (interval, serverTime) => {
    let startTime = new Date(serverTime)
    let minutes = Math.ceil(startTime.getMinutes() / interval) * interval
    startTime.setMinutes(minutes)
    startTime.setSeconds(0)
    let startInMilli = startTime.getTime() - serverTime
    return startInMilli
  },

  getData: (data) => {
    const o = data.map(v => +v.open)
    const h = data.map(v => +v.high)
    const c = data.map(v => +v.close)
    const l = data.map(v => +v.low)
    const v = data.map(v => +v.volume)
    const t = data.map(v => +v.trades)
  
    return {o, h, c, l, v, t}
  },

  rotationalFactor: (high_0, high_1, low_0, low_1) => {
    let highScore, lowScore
    switch (true) {
      case high_0 > high_1:
        highScore = 0.5
        break;
      case high_0 < high_1:
        highScore = -0.5
        break;
      default:
        highScore = 0
    }
    switch (true) {
      case low_0 > low_1:
        lowScore = 0.5
        break;
      case low_0 < low_1:
        lowScore = -0.5
        break;
      default:
        lowScore = 0
    }
    const score = highScore + lowScore
    return score
  },

  sigmoid: (x) => (1 / (1 + Math.exp(-x))),

  calcReturns: (data, multiplier = 1) => {
    return data.map((c, i) => utils.sigmoid(((c - data[i - 1]) / data[i - 1]) * multiplier || 0))
  },

  scaleLinear: (arr, min, max, range = [0, 1], clamp = true) => {
    if (!min && !max) {
      [min, max] = [d3.min(arr), d3.max(arr)]
    }
    const scale = d3.scaleLinear()
      .domain([min, max])
      .nice()
      .range(range)
      .clamp(clamp)
    return arr.map(v => scale(v))
  },

  MA: (values, n, padding = true) => {
    const movingAverage = tech.SMA.calculate({
      values,
      period: n
    })
    return padding ? [...Array(n - 1).fill(0), ...movingAverage] : movingAverage
  },

  mkWindow = (arr, scale = true) => {
    return arr.map((v, i, arr) => {
      let j = C.w - 1
      if(i > j){
        return  scale ? scaleLinear(arr.slice(i - j, i + 1), null, null, [-1, 1]) : arr.slice(i - j, i + 1)
      }
    }).filter(v => v)
  },

  prepAiData: (raw) => {
    const data = utils.getData(raw)

    const macd = tech.MACD.calculate({
      values: data.c,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal : false
    }).map(v => v.histogram)

    const ATR = utils.mkWindow([...Array(12).fill(0), ...tech.ATR.calculate({high: data.h, low: data.l, close: data.c, period: 12})])
    const CL = utils.mkWindow(data.c)
    const HIST = utils.mkWindow([...Array(25).fill(0), ...macd])
    const MA10 = utils.mkWindow(MA(data.c, 10))
    const MA22 = utils.mkWindow(MA(data.c, 22))
    const OBV = utils.mkWindow([0, ...tech.OBV.calculate({close: data.c, volume: data.v})])    
    const RSI = utils.mkWindow([...Array(12).fill(0), ...tech.RSI.calculate({values: data.c, period: 12})].map(v => v / 100), false)

    const X = data.c.map((v, i) => {
      return [ATR[i], CL[i], HIST[i], MA10[i], MA22[i], OBV[i], RSI[i]]
    })
    .map((v, i) => {
      const iter = Array(v.length).fill(0)
      return Array(v[0].length).fill(0)
        .map((x, j) => {
          return iter.map((r, k) => v[k][j])
        })
    })

    // del
    /*const _ROBV = tech.RSI.calculate({
      values: tech.OBV.calculate({
        close: data.c,
        volume: data.v
      }),
      period: 14
    })

    const _MA10 = utils.MA(data.c, 10, 0).map((v, i) => v - data.c[i])
    const _MA22 = utils.MA(data.c, 22, 0).map((v, i) => v - data.c[i])
    const _MA50 = utils.MA(data.c, 50, 0).map((v, i) => v - data.c[i])

    const [min, max] = d3.extent(d3.merge([_MA10, _MA22, _MA50]))

    const MA10 = [...Array(9).fill(0), ...utils.scaleLinear(_MA10, min, max)]
    const MA22 = [...Array(21).fill(0), ...utils.scaleLinear(_MA22, min, max)]
    const MA50 = [...Array(49).fill(0), ...utils.scaleLinear(_MA50, min, max)]

    const ROBV = [...Array(15).fill(0), ..._ROBV.map(v => v / 100)]
    const RSI = [...Array(14).fill(0), ...tech.RSI.calculate({
      values: data.c,
      period: 14
    }).map(v => v / 100)]

    const X = data.c
      .map((_v, i) => [MA10[i], MA22[i], MA50[i], ROBV[i], RSI[i]])
    */
    return X.slice(-12)
  },

  prepHopperData: (data, rsi, obv) => {
    data = utils.getData(data)
    const returns = utils.calcReturns(data.c, 100)
    const obv_returns = utils.calcReturns(obv)
    //console.log(returns, obv_returns)
    const rFactor = data.h
      .map((h, i) => utils.rotationalFactor(h, data.h[i - 1], data.l[i], data.l[i - 1]))
    const nCandle = obv_returns
      .map((c, i) => {
        return [returns[i], rFactor[i], rsi[i] / 100, obv_returns[i]]
      })
    // .map((c, i, arr) => {
    //   let j = i - 5
    //   if (j >= 0) {
    //     return arr.slice(j, i + 1)
    //   }
    // })
    //console.log(nCandle.pop())
    return nCandle.slice(-6)
  }
}


module.exports = utils
