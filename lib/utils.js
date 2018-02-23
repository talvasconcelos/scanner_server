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
        return Math.round(cur / avgVol)
      }
    })
    return relVol
  },

  fromBellow: (last, previous) => {
    return last > previous
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

  prepAiData: (candle, rsi, rvol, roc) => {
    let openN = utils.normalize(Number(candle.open), Number(candle.low), Number(candle.high), 100000000) || 0
    let closeN = utils.normalize(Number(candle.close), Number(candle.low), Number(candle.high), 100000000) || 0
    let rsiN = utils.normalize(rsi, 0, 100) || 0
		let rvolN = utils.normalize(rvol, 0, 100) || 0
		let rocN = utils.normalize(roc, -100, 100) || 0
    return [openN, closeN, rsiN, rvolN, rocN]
  }
}


module.exports = utils
