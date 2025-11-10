var http = require( 'http');

http.createServer(function (req, res) {
  res.write("l'm alive");
  res.end();
}).listen(8080) ;
