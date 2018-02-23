const https = require('https')
const fs =require('fs')

exports.products = () => {
  return new Promise(resolve => {
    https.get('https://api.binance.com/api/v1/exchangeInfo', (resp) => {
      let data = ''

      resp.on('data', d => {
        data += d
      })

      resp.on('end', () => {
        let output = JSON.stringify(JSON.parse(data), null, ' ')
        fs.writeFile( __dirname + '/products.json', output, (err) => {
          if (err) throw err
          //console.log('Products updated!')
          return resolve(output)
        })
      })
    })
  })
}
