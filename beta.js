var Promise = require("bluebird");
var fs = require("fs");
var express = require("express");
var expressSession = require("express-session");
var compression = require('compression')
var http = require('http');
var data = require("./data.js");
var crypto = require('crypto');
var basicAuth = require('basic-auth-connect');
var os = require("os");
var config = JSON.parse(fs.readFileSync("./config.js"));

// start web server
var app = express();

app.use(compression({ threshold: 512}));

// all javascript engine
app.get("/front.js", function(req, res) {
	res.send(
		fs.readFileSync("./js/jquery-1.11.1.min.js", "utf8") +
		fs.readFileSync("./js/jquery.tmpl.min.js", "utf8")	+
		fs.readFileSync("./js/crypto.js", "utf8")
		);
});

// REST API for getting a single data dir
app.get("/data.json", function(req, res) {
	if (fs.existsSync("./App_Data/dir.json")) {
		var dres = JSON.parse(fs.readFileSync("./App_Data/dir.json"));
		res.jsonp(dres);
	} else {
		var cdata = data.listAll(config["mediabucket"], "", function(cdata) {
			var allfiles = cdata.map(function(cm) {
				return ({"Key" : cm["Key"], "Filename" : data.getFilenameFromKey(cm["Key"]) });
			});
			fs.writeFileSync("./App_Data/dir.json", JSON.stringify(allfiles));
			res.jsonp(allfiles);
		});
	}
});

app.get("/file.json", function(req, res) {
	if (req.query["key"] === undefined) {
		res.jsonp({"err" : "no key given"});
		return false;
	}
	var ckey = req.query["key"];
	ckey = encodeURI(ckey);
	var resurl = data.sign_access_key(config["mediabucket"], ckey );
	res.jsonp({"url" : resurl, "signing" : ckey });
});

app.get("/redirect.json", function(req, res) {
	if (req.query["key"] === undefined) {
		res.jsonp({"err" : "no key given"});
		return false;
	}
	var ckey = req.query["key"];
	ckey = ckey.replace(/ /g, '%20');
	var resurl = data.sign_access_key(config["mediabucket"], ckey );
	res.redirect(301, resurl);
});



app.use('/assets', express.static(__dirname + '/assets'));


// single-page app
app.use(function(req, res) {
	res.send(fs.readFileSync("./beta.html", "utf8"));
});


var server = http.createServer(app);
if (process.env.PORT == undefined) {
	process.env.PORT = 1337;
	server.listen(1337,"127.200.0.5");
} else {
	server.listen(process.env.PORT);
}

console.log("Server started on port "+process.env.PORT);
