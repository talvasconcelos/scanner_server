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

  toDate: (m) => {
    const date = new Date(m)
    return date.toLocaleTimeString()
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

  scaleLinear2: ({data, min, max, custom_range, mid_domain, clamp = true}) => {
    // arr = arr.filter(v => v)
    if(!min){
      min = d3.min(data)
    }  
    if(!max){
      max = d3.max(data)
    }
    let domain = [min, max]
    if(mid_domain || mid_domain === 0){
      domain = [min, mid_domain, max]
    }
    let range = [0, 1]
    if(custom_range) {
      range = custom_range
    }
    const scale = d3.scaleLinear()
      .domain(domain)
      .range(range)
      .nice()
      .clamp(clamp)
    return data.map(v => scale(v))
  },

  scaleNegPos: (arr) => {
    return utils.scaleLinear2({data: arr, custom_range: [-1, 0, 1], mid_domain: 0})
  }, 

  MA: (values, n, padding = true) => {
    const movingAverage = tech.SMA.calculate({
      values,
      period: n
    })
    return padding ? [...Array(n - 1).fill(0), ...movingAverage] : movingAverage
  },

  mkWindow: (arr, scale = true) => {
    return arr.map((v, i, arr) => {
      let j = 12 - 1
      if(i > j){
        return  scale ? utils.scaleLinear(arr.slice(i - j, i + 1), null, null, [0, 1]) : arr.slice(i - j, i + 1)
      }
      //return Array(12).fill(0)
    })
  },

  prepAiData: (raw, window = 24) => {
    const data = utils.getData(raw)
    const bbPeriod = 20
    const g = utils.guppy(data.c)
    const BB = utils.BBands(data.c, bbPeriod)
    const _macd = [...Array(26 - 1).fill(0), ...tech.MACD.calculate({
      values: data.c,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal : false
    }).map(v => v.histogram || 0)]
    const macd = utils.zscore(_macd, window)
    const squeeze = [...Array(bbPeriod - 1).fill(0), ...BB.map(c => (c.upper - c.lower) / c.middle)]
    const ma22 = utils.EMA(data.c, 22)
    const euclid = data.c.map((c, i) => {
      const x = utils.euc([c], [ma22[i]]) / c
      return x
    })
    const dist = utils.zscore(euclid, window)
    const zClose = utils.zscore(data.c, window)
    
    const volOsc = utils.zscore(data.v, window)

    const ratioOHCL = data.c.map((_, i) => {
      const oc = Math.abs(data.o[i] - data.c[i])
      const hl = data.h[i] - data.l[i]
      return oc / hl || 0
    })

    const X = data.c.map((c, i) => {
      return [g[i][0], g[i][1], squeeze[i], macd[i], zClose[i], ratioOHCL[i], volOsc[i], dist[i]]
    }).map((c, i, arr) => {
      let j = window - 1    
      return (i > j) ? arr.slice(i - j, i + 1) : Array(window).fill(Array(c.length).fill(0))    
    }).slice(bbPeriod + window)

    return X[X.length - 1]
  },

  BBands: (data, period = 20) => tech.BollingerBands.calculate({values: data, period, stdDev: 2}),

  zscore: (x, window=12) => {
    const stats = x.map((c, i) => {
      let j = window
      const arr = i < j ? x.slice(0, i) : x.slice(i - j, i)
      const mean = d3.mean(arr)
      const std = d3.deviation(arr)
      return {mean, std}
    })
    const scores = x.map((c, i) => {
      let s = (c - stats[i].mean) / stats[i].std
      return isFinite(s) ? s : 0
    })
    return utils.scaleNegPos(scores)
  },

  euc: (a, b) => {
    return a
          .map((x, i) => Math.abs( x - b[i] ) ** 2) // square the difference
          .reduce((sum, now) => sum + now) // sum
          ** (1/2)
  },

  guppy: (arr, init = 3, step = 3, cnt = 200) => {
    const Ns = [...utils.range(init, 66, step), cnt]
    const mma = Ns.map((n, i) => utils.EMA(arr, n))
    
    let guppy = []
    for(let i = 0; i < mma[0].length; i++){
      let fastL = (mma[0][i] > mma[1][i] && mma[1][i] > mma[2][i] && mma[2][i] > mma[3][i] && mma[3][i] > mma[4][i] && mma[4][i] > mma[5][i] && mma[5][i] > mma[6][i])
      let fastS = (mma[0][i] < mma[1][i] && mma[1][i] < mma[2][i] && mma[2][i] < mma[3][i] && mma[3][i] < mma[4][i] && mma[4][i] < mma[5][i] && mma[5][i] < mma[6][i])
      let slowL = (mma[7][i] > mma[8][i] && mma[8][i] > mma[9][i] && mma[9][i] > mma[10][i] && mma[10][i] > mma[11][i] && mma[11][i] > mma[12][i] && mma[12][i] > mma[13][i] && mma[13][i] > mma[14][i] && mma[14][i] > mma[15][i] && mma[15][i] > mma[16][i] && mma[16][i] > mma[17][i] && mma[17][i] > mma[18][i] && mma[18][i] > mma[19][i] && mma[19][i] > mma[20][i] && mma[20][i] > mma[21][i] && mma[21][i] > mma[22][i])
      let slowS = (mma[7][i] < mma[8][i] && mma[8][i] < mma[9][i] && mma[9][i] < mma[10][i] && mma[10][i] < mma[11][i] && mma[11][i] < mma[12][i] && mma[12][i] < mma[13][i] && mma[13][i] < mma[14][i] && mma[14][i] < mma[15][i] && mma[15][i] < mma[16][i] && mma[16][i] < mma[17][i] && mma[17][i] < mma[18][i] && mma[18][i] < mma[19][i] && mma[19][i] < mma[20][i] && mma[20][i] < mma[21][i] && mma[21][i] < mma[22][i])
      const gFast = fastL && slowL ? 1 : fastS && slowS ? -1 : 0
      const gSlow = slowL ? 1 : slowS ? -1 : 0
      guppy.push([gFast, gSlow])
    }
    
    return guppy
  },

  EMA: (arr, n = 10) => {
    const k = 2 / (n + 1)
    let emaArr = [arr[0]]
    for (let i = 1; i < arr.length; i++) {
      emaArr.push(arr[i] * k + emaArr[i - 1] * (1 - k))
    }
    return emaArr
  },

  range: function* range(start, end, step = 1) {
      yield start
      if (start === end) return
      yield* range(start + step, end, step)
  },

  prepAIDataTest: (raw) => {
    const data = utils.getData(raw)

    const adx = tech.ADX.calculate({close: data.c, high: data.h, low: data.l, period: 12}).map(v => v.adx || 0)
    
    const macd = tech.MACD.calculate({
      values: data.c,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal : false
    }).map(v => v.histogram || 0)

    const ADX = utils.mkWindow([...Array(23).fill(0), ...adx].map(v => v / 100), false)
    const ATR = utils.mkWindow([...Array(12).fill(0), ...tech.ATR.calculate({high: data.h, low: data.l, close: data.c, period: 12})])
    const CL = utils.mkWindow(data.c)
    const HIST = utils.mkWindow([...Array(25).fill(0), ...macd])
    const MA10 = utils.mkWindow(utils.MA(data.c, 10))
    const MA22 = utils.mkWindow(utils.MA(data.c, 22))
    const MFI = utils.mkWindow([...Array(13).fill(0), ...tech.MFI.calculate({
      high: data.h, 
      low: data.l, 
      close: data.c, 
      period: 12, 
      volume: data.v})].map(v => v / 100), false)
    const OBV = utils.mkWindow([0, ...tech.OBV.calculate({close: data.c, volume: data.v})])    
    const RSI = utils.mkWindow([...Array(12).fill(0), ...tech.RSI.calculate({values: data.c, period: 12})].map(v => v / 100), false)

    const X = data.c.map((v, i) => {
      return [ADX[i], ATR[i], CL[i], HIST[i], MA10[i], MA22[i], OBV[i], RSI[i], MFI[i]]
    }).slice(12)
    .map((v, i) => {
      const iter = Array(v.length).fill(0)
      return Array(v[0].length).fill(0)
        .map((x, j) => {
          return iter.map((r, k) => v[k][j])
        })
    })
    
    return X[X.length - 1]
  }
}


module.exports = utils
