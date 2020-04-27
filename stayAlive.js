var http = require('http'); //importing http

const visitSite = () => {
  console.log('\nvisiting arbisearch-server\n')
  var options = {
    host: 'keep-arbi-alive.herokuapp.com',
    port: 80,
    path: '/'
  };
  http.get(options, function(res) {
      res.on('data', function(chunk) {
          try {
              // optional logging... disable after it's working
              console.log("HEROKU RESPONSE: " + chunk);
          } catch (err) {
              console.log(err.message);
          }
      });
  }).on('error', function(err) {
      console.log("Error: " + err.message);
  });
}

function startKeepAlive() {
  visitSite()
  
  setInterval(function() {
    visitSite()
  }, 20 * 60 * 1000); // load every 20 minutes
}

// startKeepAlive();
exports.startKeepAlive = startKeepAlive