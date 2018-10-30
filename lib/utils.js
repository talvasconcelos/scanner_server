const fs = require('fs')


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

  prepAiData: (data, rsi, obv) => {
    data = utils.getData(data)
    const returns = utils.calcReturns(data.c, 100)
    const obv_returns = utils.calcReturns(obv)
    const rFactor = data.h
      .map((h, i) => utils.rotationalFactor(h, data.h[i - 1], data.l[i], data.l[i - 1]))
    const nCandle = data.c
      .map((c, i) => {
        return [returns[i], rFactor[i], rsi[i] / 100, obv_returns[i]]
      })
      .map((c, i, arr) => {
        if (i >= 6 - 1) {
          let j = i - 6 + 1
          return arr.slice(j, i + 1)
        }
      })
    console.log(nCandle[nCandle.length - 1])
    return nCandle[nCandle.length - 1]
  }
}


module.exports = utils
