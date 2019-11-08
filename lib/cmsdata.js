const WINDOW = 12

const utils = {
    EMA: (arr, n = 10) => {
        const k = 2 / (n + 1)
        let emaArr = [arr[0]]
        for (let i = 1; i < arr.length; i++) {
            emaArr.push(arr[i] * k + emaArr[i - 1] * (1 - k))
        }
        return emaArr
    },

    macd: (arr, fast, slow, signal) => {
        const fastMA = utils.EMA(arr, fast)
        const slowMA = utils.EMA(arr, slow)
        const macd = arr.map((c, i) => fastMA[i] - slowMA[i])
        const macdSignal = utils.EMA(macd, signal)
        return utils.zscore(macdSignal)
    },

    range: function* range(start, end, step = 1) {
        yield start
        if (start === end) return
        yield* range(start + step, end, step)
    },

    pctChange: (arr) => {
        return arr.map((c, i) => {
            return Math.tanh(((c - arr[i - 1]) / arr[i - 1]) || 0)
        })
    },

    rVol: (vol, period = 12) => {
        let relVol = vol.map((cur, i, arr) => {
            if (i > period) {
                let lookback = vol.slice(i - period, i)
                let avgVol = lookback.reduce((acc, val, index) => {
                    acc += val
                    if (index === lookback.length - 1)
                        return acc / lookback.length
                    return acc
                })
                return Math.tanh(cur / avgVol) || 0
            }
        })
        return relVol
    },

    normalizeWindow: (arr, window = WINDOW) => {
        // y = (x - min) / (max - min)
        return arr.map((c, i) => {
            let j = window - 1
            if (i > j) {
                const slice = arr.slice(i - j, i + 1)
                const max = Math.max(...slice)
                const min = Math.min(...slice)

                return ((c - min) / (max - min))
            }
            return 0
        })
    },

    rotationalFactor: (high, low) => {
        const score = high.map((h, i) => {
            if (i > 0) {
                const _high = (h > high[i - 1] ? 0.5 : h < high[i - 1] ? -0.5 : 0)
                const _low = (low[i] > low[i - 1] ? 0.5 : low[i] < low[i - 1] ? -0.5 : 0)
                return (_high + _low)
            }
            return 0
        })

        return utils.EMA(score, 6)
    },

    mean: (arr) => {
        return arr.reduce((p, c) => p + c, 0) / arr.length
    },

    ratioOHLC: (open, high, low, close) => {
        return open.map((_, i) => {
            const oc = Math.abs(open[i] - close[i])
            const hl = high[i] - low[i]
            return isNaN(oc / hl) ? 0 : oc / hl
        })
    },

    zscore: (x, window = WINDOW) => {
        const stats = x.map((c, i) => {
            let j = window
            const arr = i < j ? x.slice(0, i) : x.slice(i - j, i)
            const mean = utils.mean(arr)
            const avgSqrDiff = utils.mean(arr.map(c => {
                const diff = c - mean
                const sqrDiff = diff * diff
                return sqrDiff
            }))
            const std = Math.sqrt(avgSqrDiff)

            return {
                mean,
                std
            }
        })
        const scores = x.map((c, i) => {
            let s = Math.tanh((c - stats[i].mean) / stats[i].std)
            return isFinite(s) ? s : 0
        })
        return scores
    },

    mkWindow: (arr) => {
        return arr.map((v, i, arr) => {
            let j = WINDOW - 1
            if (i > j) {
                return arr.slice(i - j, i + 1)
            }
        })
    },

    prepareData: (data) => {
        const close = data.map(v => +v.close)
        const open = data.map(v => +v.open)
        const high = data.map(v => +v.high)
        const low = data.map(v => +v.low)
        const volume = data.map(v => +v.volume)
        const zOpen = utils.zscore(open)
        const zHigh = utils.zscore(high)
        const zLow = utils.zscore(low)
        const zClose = utils.zscore(close)
        const zVol = utils.zscore(volume)
        const ema12 = utils.normalizeWindow(utils.EMA(close, 12))
        const ema22 = utils.normalizeWindow(utils.EMA(close, 22))
        const macd = utils.macd(close, 13, 21, 8)
        const pctClose = utils.pctChange(close)
        const pctVol = utils.pctChange(volume)
        const relVol = utils.rVol(volume)
        const rot = utils.rotationalFactor(high, low)
        const ratioOHLC = utils.ratioOHLC(open, high, low, close)
        
        const AE = data.map((_, i) => [zOpen[i], zHigh[i], zLow[i], zClose[i], zVol[i]]).slice(-WINDOW)
        const X = data.map((_, i) => [ema12[i], ema22[i], macd[i], pctClose[i], pctVol[i], relVol[i], rot[i], ratioOHLC[i]]).slice(-WINDOW)

        return [AE, X]
    }
}

module.exports = utils