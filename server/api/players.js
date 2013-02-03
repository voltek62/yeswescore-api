var DB = require("../db.js")
  , express = require("express")
  , app = require("../app.js")
  , Q = require("q");

/**
 * Read All Players
 * 
 * Generic options:
 *  /v1/players/?limit=10              (default=10)
 *  /v1/players/?offset=0              (default=0)
 *  /v1/players/?fields=nickname,name  (default=undefined)
 *  /v1/players/?longitude=40.234      (default=undefined)
 *  /v1/players/?latitude=40.456       (default=undefined)
 *  /v1/players/?distance=20           (default=undefined)
 *
 * Specific options:
 *  /v1/players/?club=:id   (filter with a club)
 */
app.get('/v1/players/', function(req, res){
  var limit = req.query.limit || 10;
  var offset = req.query.offset || 0;
  var club = req.query.club;
  var fields = req.query.fields;
  var longitude = req.query.longitude;
  var latitude = req.query.latitude;
  var distance = req.query.distance;
  var text = req.query.q;

  var query = DB.Model.Player.find()
  if (fields)
    query.select(fields.replace(/,/g, " "))
  if (longitude && latitude && distance)
    query.where('location.currentPos').within.centerSphere({ center: [ parseFloat(longitude), parseFloat(latitude) ], radius: parseFloat(distance) / 6378.137 });
  if (club)
    query.where("club.id", club);
  if (text) {
    text = new RegExp("("+text.searchable().pregQuote()+")");
    query.or([ {_searchableNickname: text}, {_searchableName: text} ]);
  }
  query.where("type", "default");  
  query.skip(offset)
       .limit(limit)
       .exec(function (err, players) {
    if (err)
      return app.defaultError(res)(err);
    res.end(JSON.stringifyModels(players));
  });
});

/**
 * Autocomplete search in players
 * 
 * Generic options:
 *  /v1/players/autocomplete/?limit=5               (default=5)
 *  /v1/players/autocomplete/?fields=nickname,name  (default=nickname,name,type,club)
 *  /v1/players/autocomplete/?sort=nickname         (default=name)
 *  /v1/players/autocomplete/?longitude=40.234      (default=undefined)
 *  /v1/players/autocomplete/?latitude=40.456       (default=undefined)
 *  /v1/players/autocomplete/?distance=20           (default=undefined)
 *
 * Specific options:
 *  /v1/players/autocomplete/?q=Charlotte (searched text)
 *  /v1/players/autocomplete/?owner=:id   (autocomplete centered to an owner)
 */
app.get('/v1/players/autocomplete/', function(req, res){
  var fields = req.query.fields || "nickname,name,type,club";
  var limit = req.query.limit || 5;
  var owner = req.query.owner;
  var sort = req.query.sort || "name";
  var text = req.query.q;
  var longitude = req.query.longitude;
  var latitude = req.query.latitude;
  var distance = req.query.distance;
  
  if (text) {
    // slow
    text = new RegExp("("+text.searchable().pregQuote()+")");
    // searching
    var query = DB.Model.Player
      .find({
        $and: [
          { $or: [ {_searchableNickname: text}, {_searchableName: text} ] },
          { $or: [ {type: "default"}, {type: "owned", owner: owner} ] }
        ]
      });
    if (longitude && latitude && distance)
      query.where('location.currentPos').within.centerSphere({ center: [ parseFloat(longitude), parseFloat(latitude) ], radius: parseFloat(distance) / 6378.137 });
    query.select(fields.replace(/,/g, " "))
      .sort(sort.replace(/,/g, " "))
      .limit(limit)
      .exec(function (err, players) {
        if (err)
          return app.defaultError(res)(err);
        res.end(JSON.stringifyModels(players));
      });
  } else {
    res.end(JSON.stringify([]));
  }
});

/**
 * Read a player
 * 
 * Authentication provide password & token
 * 
 * Generic options:
 *  /v1/players/:id/?fields=nickname,name
 *
 * Specific options:
 */
app.get('/v1/players/:id', function(req, res){
  var fields = req.query.fields;
  
  DB.isAuthenticatedAsync(req.query)
    .then(function (authentifiedPlayer) {
      var query = DB.Model.Player.findById(req.params.id);
      if (fields)
         query.select(fields.replace(/,/g, " "))
      query.exec(function (err, player) {
        if (err)
          return app.defaultError(res)(err);
        if (player === null)
          return app.defaultError(res)("no player found");
        if (authentifiedPlayer)
          res.end(JSON.stringifyModels(player, { unhide: [ "token" ] }));
        else
          res.end(JSON.stringifyModels(player));
      });
    },
    app.defaultError(res, "authentication error"));
});

/**
 * Read games of a player
 * 
 * Generic options:
 *  /v1/players/:id/games/?limit=5     (default=10)
 *  /v1/players/:id/games/?offset=0    (default=0)
 *  /v1/players/:id/games/?sort=nickname (default=-dates.start)
 * 
 * Specific options:
 *  /v1/players/:id/games/?owned=true  (default=false)
 *  /v1/players/:id/games/?status=ongoing   (default=ongoing,finished)
 *  /v1/players/:id/games/?populate=teams.players (default=teams.players)
 * 
 * owned=true   games owned by the player
 * owned=false  games where the player plays
 * NON STANDARD URL
 */
app.get('/v1/players/:id/games/', function(req, res){
  var status = req.query.status || "ongoing,finished";
  var sort = req.query.sort || "-dates.start";
  var limit = req.query.limit || 10;
  var offset = req.query.offset || 0;
  var fields = req.query.fields || "sport,owner,dates.creation,dates.start,dates.end,location.country,location.city,location.currentPos,teams,teams.players.name,teams.players.nickname,teams.players.club,teams.players.rank,options.type,options.subtype,options.status,options.sets,options.score,options.court,options.surface,options.tour";
  var owned = (req.query.owned === "true");
  // populate option
  var populate = "teams.players";
  if (typeof req.query.populate !== "undefined")
    populate = req.query.populate;
  var populatePaths = (typeof populate === "string") ? populate.split(",") : [];
  // process fields
  var fields = app.createPopulateFields(fields, populate);
  DB.Model.Player.findById(req.params.id, function (err, club) {
    if (err)
      return app.defaultError(res)(err);
    if (club === null)
      return app.defaultError(res)("no player found");
    var query;
    if (owned)
      query = DB.Model.Game.find({ owner : req.params.id});
    else
      query = DB.Model.Game.find({"teams.players" : req.params.id});
    query.select(fields.select);
    if (status)
      query.where('status').in(status.split(","));
    query.populate("teams.players", fields["teams.players"])
         .sort(sort.replace(/,/g, " "))
         .skip(offset)
         .limit(limit)
         .exec(function (err, games) {
         if (err)
            return app.defaultError(res)(err);
         res.end(JSON.stringifyModels(games));
       });
    });
});

/**
 * Create a new player
 * 
 * No authentication
 * 
 * Body {
 *   nickname: String, (default="")
 *   name: String,     (default="")
 *   rank: String,     (default="")
 *   email: String,    (default="")
 *   idlicense: String (default="")
 *   club: { id:..., name:... }  (default=null, name: is ignored)
 *   type: String      (enum=default,owned default=default)
 * }
 */
app.post('/v1/players/', express.bodyParser(), function(req, res){
  if (req.body.type &&
      DB.Definition.Player.type.enum.indexOf(req.body.type) === -1)
    return app.defaultError(res)("unknown type");
  // club ? => reading club to get the name
  var deferred = Q.defer();
  var club = req.body.club;
  if (club && club.id) {
    DB.Model.Club.findById(club.id, function (err, club) {
      if (err)
        return deferred.reject(err);
      deferred.resolve(club);
    });
  } else {
    deferred.resolve(null);
  }
  deferred.promise.then(function (club) {
    req.body.location = (req.body.location) ? req.body.location : {};
    // creating a new player
    var inlinedClub = (club) ? { id: club.id, name: club.name } : null;
    var player = new DB.Model.Player({
        nickname: req.body.nickname || "",
        name: req.body.name || "",
        location : { currentPos: req.body.location.currentPos || [] },
        rank: req.body.rank || "",
        email: req.body.email || "",
        idlicense: req.body.idlicense || "",
        club: inlinedClub, // will be undefined !
        type: req.body.type || "default"
    });
    // password
    if (req.body.uncryptedPassword)
      player.uncryptedPassword = req.body.uncryptedPassword;
    return DB.saveAsync(player);
  }).then(function (player) {
    res.end(JSON.stringifyModels(player, { unhide: [ "token" ] }));
  }, app.defaultError(res));
});

/**
 * update a player
 * 
 * You must be authentified (?playerid=...&token=...)
 * 
 * Body {
 *   nickname: String, (default=undefined)
 *   name: String,     (default=undefined)
 *   rank: String,     (default=undefined)
 *   email: String,    (default=undefined)
 *   idlicense: String (default=undefined)
 *   club: { id:..., name:... }  (default=undefined, name: is ignored)
 *   password: String  (default=undefined)
 * }
 */
app.post('/v1/players/:id', express.bodyParser(), function(req, res){
  if (req.params.id !== req.body.id ||
      req.params.id !== req.query.playerid) {
    return app.defaultError(res)("id differs");
  }
  var deferred = Q.defer();
  var club = req.body.club;
  if (club && club.id) {
    DB.Model.Club.findById(club.id, function (err, club) {
      if (err)
        return deferred.reject(err);
      deferred.resolve(club);
    });
  } else {
    deferred.resolve(null);
  }
  deferred.promise.then(function (club) {
    DB.isAuthenticatedAsync(req.query)
      .then(function (authentifiedPlayer) {
        if (!authentifiedPlayer)
          return app.defaultError(res)("player not authenticated");
        // FIXME: use http://mongoosejs.com/docs/api.html#model_Model-findByIdAndUpdate
        DB.Model.Player.findOne({_id:req.params.id})
                      .exec(function (err, player) {
          if (err)
            return app.defaultError(res)(err);
          if (player === null)
            return app.defaultError(res)("no player found");
          // updating player
          var inlinedClub = (club) ? { id: club.id, name: club.name } : null;
          if (inlinedClub) {
            player["club"] = inlinedClub;
          }
          ["nickname", "name", "rank", "idlicense", "email"].forEach(function (o) {
            if (typeof req.body[o] !== "undefined")
              player[o] = req.body[o];
          });
          // position
          if (req.body.location && req.body.location.currentPos)
            player.location = { currentPos : req.body.location.currentPos };
          // password
          if (req.body.uncryptedPassword)
            player.uncryptedPassword = req.body.uncryptedPassword;
          player.dates.update = Date.now();
          // saving player
          DB.saveAsync(player)
            .then(function (player) {
              res.end(JSON.stringifyModels(player, { unhide: [ "token" ] }));
            },
          app.defaultError(res, "update error"));
        });
      },
      app.defaultError(res, "authentication error"));
  }, app.defaultError(res));
});

