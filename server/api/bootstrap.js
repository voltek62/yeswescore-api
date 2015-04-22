var Conf = require("../conf.js"),
    app = require("../app.js"),
    DB = require("../db.js");

/*
* client will call :
* /bootstrap/conf.json?version=xx.xx.xx.xx to get a new dynamic configuration.
*/
app.get('/bootstrap/conf.json', function(req, res){
  var conf;
  var latest = "0.0.0.1";

  switch (req.query.version) {
    default:
      var baseUrl = "http://"+Conf.get("http.host")+":"+Conf.get("http.port")+"/";

      /* On affiche le dernier code saisi dans l'admin */
      conf = [
        { key: 'version.latest', value: latest, metadata: {} },
        { key: 'bootstrap.update_interval', value: 24 * 3600 * 1000, metadata: {} }, // every day
        { key: 'tennis.promo.code', value: 'DECATHLON', metadata: {} },
        { key: 'tennis.promo.img', value: '', metadata: {} },
        { key: 'tennis.promo.width', value: '100', metadata: {} },
        { key: 'tennis.promo.height', value: '100', metadata: {} }
      ];

      break;
  }
  // 
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(conf));
});
