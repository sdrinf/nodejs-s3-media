// media processing unit
var async = require("async");
var Promise = require("bluebird");
var data = Promise.promisifyAll(require("./data.js"));
var crypto = require('crypto');
var fs = require('fs');
var tmp = Promise.promisifyAll(require('tmp'));
var child_process = Promise.promisifyAll(require('child_process'));


function isVideo(ext) {
	return (["avi", "mpg", "mpeg", "mp4", "mkv", "wmv", "flv", "mov"].indexOf(ext) > -1);
}

function processSingleVideoFile(task, callback) {
	var keyname = task["Key"];
	var metakey = task["Metakey"];
	var inpath = infd = thmpath = thmfd = vidpath = vidfd = null;
	console.log("processing single video file: "+keyname+" (to be uploaded as "+metakey+" )");
	Promise.map([keyname], function(key) {
		return tmp.fileAsync();
	}).then(function(cdata) {
		inpath = cdata[0][0];
		infd = cdata[0][1];
		console.log("Fetching "+keyname+" as "+inpath);
		return data.getLocalFileAsync("media.data", keyname, infd);
	}).then(function() {
		return tmp.fileAsync();
	}).then(function(cdata) {
		// create thumbnails
		thmpath = cdata[0];
		thmfd = cdata[1];
		fs.closeSync(thmfd);
		fs.closeSync(infd);
		ffcmd = "ffmpeg -i "+inpath+" -ss 00:00:10.00 -f image2 -vframes 1 -y "+thmpath;
		console.log("Exec: "+ffcmd);
		return child_process.execAsync(ffcmd, {"cwd" : "./bin/", maxBuffer: 1024 * 1024 * 500});
	}).then(function(execres) {
		// console.log("thmumbnail writing");
		return data.putLocalFileAsync("media.meta", "thm/"+metakey.substring(0,2)+"/"+metakey, thmpath, {"ContentType" : "image/png"});
	}).then(function() {
		// console.log("temp file get");
		return tmp.fileAsync();
	}).then(function(cdata) {
		// convert video
		vidpath = cdata[0];
		vidfd = cdata[1];
		fs.closeSync(vidfd);
		// ffcmd = "ffmpeg -i "+inpath+" -f mp4 -vcodec libx264 -pix_fmt yuv420p -profile:v baseline -b:v 1200k -vf scale=\"640:trunc(ow/a/2)*2\" -threads 1 -y "+vidpath;
		ffcmd = "HandBrakeCLI -i "+inpath+"  -e x264  -q 20.0 -r 30 --pfr  -a 1 -E copy:aac -B 160 -6 stereo -R Auto -D 0.0 --audio-copy-mask aac,ac3,dtshd,dts,mp3 --audio-fallback ffac3 -f mp4 -4 -X 1280 -Y 720 --loose-anamorphic --modulus 2 -m --x264-preset medium --h264-profile high --h264-level 3.1 -o "+vidpath;
		console.log("Exec: "+ffcmd);
		return child_process.execAsync(ffcmd, {"cwd" : "/usr/bin/", maxBuffer: 1024 * 1024 * 500});
	}).then(function(execres) {
		console.log(vidpath+" conversion complete");
		// upload video
		return data.putLocalFileAsync("media.meta", "video/"+metakey.substring(0,2)+"/"+metakey, vidpath, {"ContentType" : "video/mp4"} );
	}).then(function() {
		console.log(keyname+" mp4 uploaded");
		//  fs.closeSync(infd);
		fs.unlinkSync(thmpath);
		fs.unlinkSync(inpath);
		fs.unlinkSync(vidpath);
		callback();
	}).catch(function(e) {
		console.log("Video conversion error: ",e);
		console.log("skipping...");
		if (fs.existsSync(thmpath))
			fs.unlinkSync(thmpath);
		if (fs.existsSync(inpath))
			fs.unlinkSync(inpath);
		if (fs.existsSync(vidpath))
			fs.unlinkSync(vidpath);
		callback();
	});
}

function process_new_videos(videoHashlist) {
	// level of parallelism: 2

	var q = async.queue(processSingleVideoFile, 1);
	q.drain = function() {
		console.log("All files have been processed.");
	};

	data.listAll("media.data", "", function(res) {
		console.log(res.length+" files in data directory");
		for (var i = 0; i < res.length; i++) {
			var ck = res[i]["Key"];
			var shasum = crypto.createHash('sha1');
			shasum.update(ck);
			var cdigest = shasum.digest('hex');
			if (isVideo(data.getExtensionFromKey(ck))) {
				if (videoHashlist[cdigest] !== undefined)
					continue;
				q.push({"Key" : ck, "Metakey" : cdigest});
			}
		}
	});
}

// fetches the list of all videos in the meta bucket
// then generates resized versions of unprocessed videos
function processVideo() {
	var videoHashlist = [];
	var thmHashlist = [];

	data.list("media.meta", "video/", function(res) {
		for (var i = 0; i < res["Contents"].length; i++) {
			var ck = res["Contents"][i]["Key"];
			var cck = ck.split("/");
			if (cck.length < 3)
				continue;
			if (res["Contents"][i]["Size"] == 0)
				continue;
			videoHashlist[cck[2]] = "1";
		}
		process_new_videos(videoHashlist);
	});

}

process.maxTickDepth = 1000000;
processVideo();
