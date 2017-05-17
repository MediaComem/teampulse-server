var fs = require('fs');
var dotenv = require('dotenv').config()
var express = require('express')
var app = express()
var cors = require('cors')
var Twitter = require('twitter');
var graph = require('fbgraph');
var fetch = require('node-fetch');

var Flickr = require("flickrapi");

var corsOptions = {
	origin: 'https://mediacomem.github.io',
	optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204 
}

var dataPath = "data/";

var socialFetch = {

	init: function () {
		this.instagram();
		this.facebook();
		this.flickr();
	},

	/*****************
		INSTAGRAM
	******************/

	instagram: function () {
		fetch('https://api.instagram.com/v1/users/self/media/liked?access_token=' + process.env.INSTAGRAM_ACCESS_TOKEN)
			.then(function (res) {
				return res.json()
			})
			.then(function (body) {
				return body.data.map(function (d) {
					return {
						id: d.id,
						link: d.link
					}
				});
			})
			.then(function (posts) {
				tools.writeJson("instagram.json", posts);
			})
			.catch(function (err) {
				console.log(err);
			});
	},

	/*****************
  	FLICKR
	******************/
	flickrOptions: {
		api_key: process.env.FLICKR_API_KEY,
		secret: process.env.FLICKR_SECRET
	},
	flickr: function () {
		Flickr.tokenOnly(this.flickrOptions, function (error, flickr) {
			flickr.photosets.getPhotos({
				photoset_id: "72157661572108305",
				user_id: "135987724@N05",
				page: 1,
				per_page: 500
			}, function (err, result) {
				if (err) throw err;

				var photos = result.photoset.photo.map(function (d) {
					return {
						url: "https://farm" + d.farm + ".staticflickr.com/" + d.server + "/" + d.id + "_" + d.secret + "_z.jpg"
					}
				});

				tools.writeJson("flickr.json", photos);
			});
		});
	},

	/*****************
  FACEBOOK
	******************/

	facebook: function () {
		graph.setAccessToken(process.env.FACEBOOK_ACCESS_TOKEN);

		graph.get("teampulse.ch/feed?limit=5", function (err, res) {
			if (err) throw err;

			var posts = res.data.map(function (d) {
				return {
					id: d.id.split("_").pop()
				}
			});

			tools.writeJson("facebook.json", posts);
		});
	}
}

/*****************
  TEAMPULSE API
******************/

var thirdApiFetch = {
	init: function () {
		this.teampulse();
	},
	teampulse: function () {
		var fakedata = {
			"contestant": "CYCLIST_002",
			"latitude": 46.764446,
			"longitude": 6.646111,
			"numberMinutes": 30,
			"avgSpeed": 8.780640602111816,
			"avgCadence": 40.0,
			"avgPower": 50.0002326965332
		}
		tools.writeJson("teampulse.json", fakedata);
		// fetch('https://data.teampulse.ch/raam/informations')
		//   .then(function(response) {
		//     return response.json()
		//   })
		//   .then(function(body){
		//     tools.writeJson("teampulse.json", body);
		//   });
	}
};

/*****************
  Common tools
******************/

var tools = {
	writeJson: function (filename, data) {
		fs.writeFile(dataPath + filename, JSON.stringify(data), function (err) {
			if (err) {
				return console.log(err);
			}
		});
	},
	readJson: function (filename) {
		return JSON.parse(fs.readFileSync(dataPath + filename, 'utf8'));
	}
};

/*****************
  ROUTES
******************/

app.get('/teampulse-data', cors(), function (req, res) {
	res.json(
		tools.readJson("instagram.json")
	);
})

app.get('/fbposts', cors(), function (req, res) {
	res.json(
		tools.readJson("facebook.json")
	);
})

app.get('/flickrpics', cors(), function (req, res) {
	res.json(
		tools.readJson("flickr.json")
	);
})

app.get('/instaposts', cors(), function (req, res) {
	res.json(
		tools.readJson("instagram.json")
	);
})

app.get('/', function (req, res) {
	res.send('Teampulse server!')
})

// Init socialFetch
socialFetch.init();
thirdApiFetch.init();

var port = process.env.PORT || 3999;

app.listen(port, function () {
	console.log('Teampulse app listening on port ' + port)
})