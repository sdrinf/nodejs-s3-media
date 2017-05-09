// AWS s3 extension library

var fs = require("fs");
var AWS = require('aws-sdk');
var crypto = require('crypto');

AWS.config.loadFromPath("./config.js");
var s3 = new AWS.S3();
var config = JSON.parse(fs.readFileSync("./config.js"));


function listAll(bucket, path, cb) {
	var res = [];
	query = function(qobj, cb) {
		s3.listObjects(qobj, function(err, data) {
			if (err) {
				console.log(err, err.stack); // an error occurred
				return false;
			}
			for (var i = 0; i<data["Contents"].length;i++) {
				res.push(data["Contents"][i]);
			}
			if (data["IsTruncated"] == false) {
				cb(res);
			} else {
				qobj["Marker"] = data["Contents"][data["Contents"].length-1]["Key"];
				query(qobj, cb);
			}
		});
	};
	query( {Bucket: bucket, Prefix : path }, cb);
}

function list(bucket, path, cb) {
	s3.listObjects({Bucket: bucket, Prefix : path }, function(err, data) {
		if (err) {
			console.log(err, err.stack); // an error occurred
			return false;
		}
		cb(data);
	});
}

function get(bucket, key, cb) {
	s3.getObject({Bucket: bucket, Key : key}, function(err, res) {
		if (err) {
			console.log(err, err.stack); // an error occurred
			return false;
		}
		cb(res["Body"]);
	});
}

function getLocalFile(bucket, key, infd, cb) {
	s3.getObject({Bucket: bucket, Key : key}, function(err, res) {
		if (err) {
			console.log(err, err.stack); // an error occurred
			return false;
		}
		fs.writeSync(infd, res["Body"], 0, res["Body"].length, null);
		cb();
	});
}


// saves down an object
function put(bucket, key, data, attrs, cb) {
	if (attrs == null)
		attrs = {};
	attrs["Bucket"] = bucket;
	attrs["Key"] = key;
	attrs["Body"] = data;
	s3.putObject(attrs, function(err, res) {
		if (err) {
			console.log(err, err.stack); // an error occurred
			return false;
		}
		cb(key, res["Body"]);
	});
}

function putLocalFile(bucket, key, filename, attrs, cb) {
	if (attrs == null)
		attrs = {};
	attrs["Bucket"] = bucket;
	attrs["Key"] = key;
	attrs["Body"] = fs.readFileSync(filename);
	s3.putObject(attrs, function(err, res) {
		if (err) {
			console.log(err, err.stack); // an error occurred
			return false;
		}
		cb();
	});
}

function getFilenameFromKey(key) {
	var ckeys = key.split("/").filter(function(cm) { return (cm.trim() != ""); });
	return ckeys[ckeys.length - 1];
}

function getExtensionFromKey(key) {
	var ckeys = key.split(".");
	return ckeys[ckeys.length - 1];
}

function listCurrentDir(bucket, path, cb) {
	return list(bucket, path, function(data) {
		var cpathkeys = path.split("/").filter(function(cm) { return (cm.trim() != ""); });
		var alldirs = data["Contents"].filter(function(cm) {
			if (cm["Key"] == cpathkeys+"/")
				return false;
			var ckeys = cm["Key"].split("/").filter(function(cm) { return (cm.trim() != ""); });
			if (ckeys.length <= cpathkeys.length + 1) {
				console.log(ckeys);
				return true;
			}
			return false;
		}).map(function(cm) {
			return ({"Key" : cm["Key"], "Filename" : getFilenameFromKey(cm["Key"]) });
		});
		cb(alldirs);
	});
}

var hmacSha1 = function (message) {
    return crypto.createHmac('sha1', config["secretAccessKey"])
                  .update(message)
                  .digest('base64');
	};

function sign_access_key(bucket, path) {
	var expires = new Date();
	expires.setMinutes(expires.getMinutes() + 60);
	var epo = Math.floor(expires.getTime()/1000);
	var str = 'GET\n\n\n' + epo + '\n' + '/' + bucket + (path[0] === '/'?'':'/') + path;

	var hashed = hmacSha1(str);

	var urlRet = "https://s3-us-west-1.amazonaws.com/"+bucket+(path[0] === '/'?'':'/') + path +
		'?Expires=' + epo +
		'&AWSAccessKeyId=' + config["accessKeyId"] +
		'&Signature=' + encodeURIComponent(hashed);

	return urlRet;
}


module.exports = { list : list, get : get, put: put, listCurrentDir : listCurrentDir, getFilenameFromKey: getFilenameFromKey, getExtensionFromKey: getExtensionFromKey, sign_access_key: sign_access_key,
	getLocalFile : getLocalFile, putLocalFile : putLocalFile,
	listAll : listAll
};

// script called directly: run tests
if (!module.parent) {
    var cdata = list(config["mediabucket"], "", function(cdata) {
        console.log(cdata);
    });
}
