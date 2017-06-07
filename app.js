const glob = require("glob")
const path = require("path")
const fs = require('fs');
const { URL, URLSearchParams } = require('url');
const cron = require('node-cron');
const dotenv = require('dotenv').config()
const express = require('express')
const app = express()
const server = require('http').createServer(app);
const port = process.env.PORT || 3999;
server.listen(port, () => console.log(`Teampulse app listening on port ${port}`))
const io = require('socket.io')(server);
const cors = require('cors')
const moment = require('moment-timezone')

const Twitter = require('twitter');
const Flickr = require("flickrapi");
const graph = require('fbgraph');
const fetch = require('node-fetch');
const MongoClient = require('mongodb').MongoClient

const bodyParser = require('body-parser');

const urlencoded = bodyParser.urlencoded({
	extended: true
});

var db

MongoClient.connect(process.env.MONGODB_URI, (err, database) => {
	if (err) return console.error(err)
	db = database
})

const auth = require('http-auth');
const basic = auth.basic({
	realm: "Gestion du favori",
	file: `${__dirname}/users.htpasswd`
});

const authMiddleware = auth.connect(basic);

const corsOptions = {
	origin: 'http://localhost:3000',
	optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204 
}

const dataPath = `${__dirname}/data/`;

const regex = {
	youtube: {
		valid: /http(?:s?):\/\/(?:www\.)?youtu(?:be\.com\/(watch|playlist)\?(v|list)=|\.be\/)([\w\-\_]*)(&(amp;)?‌​[\w\?‌​=]*)?/i,
		getID: /(?:youtube\.com\/\S*(?:(?:\/e(?:mbed))?\/|watch\?(?:\S*?&?v\=))|youtu\.be\/)([a-zA-Z0-9_-]{6,11})/
	},
	facebook: {
		video: /facebook.com\/[a-z]*\/videos/i
	},
	flickr: /\/photos\/([0-9@a-z]*)\/albums\/([0-9]*)/i
}

var socialFetch = {

	init() {
		console.log(`${new Date()} - ### Init ### Social feeds`);
		this.instagram.init();
		this.facebook.posts.init();
	},

	update() {
		console.log(`${new Date()} - ### Check Update ### Social feeds`);
		this.instagram.update();
		this.facebook.posts.update();
	},

	/*****************
		INSTAGRAM
	******************/

	instagram: {
		init() {
			fetch('https://api.instagram.com/v1/users/self/media/recent/?count=5&access_token=' + process.env.INSTAGRAM_ACCESS_TOKEN)
				.then(res => res.json())
				.then(body => {
					return body.data.map(d => {
						return {
							id: d.id,
							url: d.link
						}
					});
				})
				.then(posts => tools.writeJson("instagram", "json", posts))
				.catch(err => console.error(err));
		},
		update() {
			fetch('https://api.instagram.com/v1/users/self/media/recent/?count=5&access_token=' + process.env.INSTAGRAM_ACCESS_TOKEN)
				.then(res => res.json())
				.then(body => body.data)
				.then(posts => {
					var fingerPrintOnline = []
					posts.map(d => {
						fingerPrintOnline.push(
							{
								id: d.id,
								url: d.link
							}
						)
					})

					var savedPosts = tools.readJson("instagram", "json");

					//If the stored instagram posts JSON is different from instragram posts just retrieved -> update
					if (savedPosts.map(function (elem) { return elem.url; }).join("") != fingerPrintOnline.map(function (elem) { return elem.url; }).join("")) {
						socialFetch.instagram.init();
					}
				})
				.catch(err => console.error(err));
		}

	},


	/*****************
  	FACEBOOK
	******************/

	facebook: {
		posts: {
			init() {
				graph.setAccessToken(process.env.FACEBOOK_ACCESS_TOKEN);

				graph.get("/teampulse.ch/feed?limit=5", (err, res) => {
					if (err) return console.error(err);

					var posts = res.data.map(d => {
						return {
							id: d.id.split("_").pop()
						}
					});

					tools.writeJson("facebook", "json", posts);
				});
			},
			update() {
				var savedPosts = tools.readJson("facebook", "json");

				graph.get("/teampulse.ch/feed?limit=5", (err, res) => {
					if (err) return console.error(err);

					var fingerPrintOnline = []
					res.data.map(d => {
						fingerPrintOnline.push(
							{
								id: d.id.split("_").pop()
							}
						)
					})

					// If the last id post on facebook doesn't exist on our json -> update
					if (savedPosts.map(function (elem) { return elem.id; }).join("") != fingerPrintOnline.map(function (elem) { return elem.id; }).join("")) {
						socialFetch.facebook.posts.init();
					}
				});
			}
		},
		video(url) {
			var type = "facebook";

			var favoriSettings =
				{
					date: Date.now(),
					type: type,
					data: {
						video: {
							url: url
						}
					}
				}
			db.collection('favori').save(favoriSettings, (err, result) => {
				if (err) return console.error(err)
				console.log('favori saved to database')
				io.sockets.emit("favori", favoriSettings);
			})

		}

	},

	/*****************
  	FLICKR
	******************/
	flickrOptions: {
		api_key: process.env.FLICKR_API_KEY,
		secret: process.env.FLICKR_SECRET
	},
	flickr(url) {
		var type = "flickr";
		var urlParams = url.match(regex.flickr);

		Flickr.tokenOnly(this.flickrOptions, (error, flickr) => {

			// Convert username to nsid(user_id)
			function usernameVSnsid(urlParam) {
				if (!/@N/.test(urlParam)) {
					flickr.people.findByUsername({
						username: urlParam
					}, (err, res) => {
						if (err) return console.error(err);
						return res.user.nsid;
					});
				} else {
					return urlParam;
				}
			}

			flickr.photosets.getPhotos({
				user_id: usernameVSnsid(urlParams[1]),
				photoset_id: urlParams[2],
				page: 1,
				per_page: 500
			}, (err, res) => {
				if (err) return console.error(err);

				var photos = res.photoset.photo.map(d => {
					return {
						url: "https://farm" + d.farm + ".staticflickr.com/" + d.server + "/" + d.id + "_" + d.secret + "_z.jpg"
					}
				});

				var favoriSettings =
					{
						date: Date.now(),
						type: type,
						data: {
							photos
						}
					}
				db.collection('favori').save(favoriSettings, (err, result) => {
					if (err) return console.error(err)
					io.sockets.emit("favori", favoriSettings);
					console.log('favori saved to database')
				})

			});
		});
	},

	/*****************
  	YOUTUBE
	******************/

	youtube(url) {
		var video = {};
		video.id = regex.youtube.getID.exec(url);

		// Playlist
		if (video.id == null) {
			var type = "youtube_playlist";
			var urlParsed = new URL(url);
			var urlParams = urlParsed.searchParams;

			video.id = urlParams.get('v'); // if specific starting video is set otherwise: null
			video.list = urlParams.get('list');
		}
		else {
			var type = "youtube";
			video.id = video.id[1];
		}

		var favoriSettings =
			{
				date: Date.now(),
				type: type,
				data: {
					video
				}
			}
		io.sockets.emit("favori", favoriSettings);
		db.collection('favori').save(favoriSettings, (err, result) => {
			if (err) return console.log(err)
			console.log('favori saved to database')
		})

	}

}

/*****************
  TEAMPULSE API
******************/

var thirdFetch = {
	init() {
		console.log(`${new Date()} - ### Init ### Teampulse`);
		this.teampulse.base();
		this.teampulse.switch();
	},
	update() {
		console.log(`${new Date()} - ### Start Update ### Teampulse`);
		this.init();
	},
	teampulse: {
		base() {
			fetch('https://data.teampulse.ch/raam/informations?minutes=1')
				// Check status return undefined if issue
				.then(res => res.ok ? res.json() : console.error(`${res.status} ${res.statusText}: ${res.url}`))
				// Use fake data when API is down
				.then(res => {
					return tools.isJSON(res) || res == "" ? res :
						{
							"contestant": "No Data",
							"latitude": 38.0,
							"longitude": -97.0,
							"numberMinutes": 30,
							"avgSpeed": 12.5,
							"avgCadence": 40.0,
							"avgPower": 50.,
							"temperature": 15.42,
							"altitude": 450
						};
				})
				// Replace NaN and null values
				.then(res => Object.assign(...Object.entries(res).map(([k, v]) =>
					v == "NaN" || v == null ? { [k]: '-' } : { [k]: v }
				))
				)
				// Retrieve and add localTime from location
				.then(res => tools.localTime(res).then(resTime => Object.assign(res, resTime)))
				.then(body => tools.writeJson("teampulse", "json", body))
				.catch(err => {
					console.log(err)
					if (!err.response) {
						console.log("response time out！");
					}
				});
		},
		switch() {
			fetch('https://data.teampulse.ch/raam/switch')
				// Check status return undefined if issue
				.then(res => res.ok ? res.json() : console.error(`${res.status} ${res.statusText}: ${res.url}`))
				// Use fake data when API is down
				.then(res => {
					return tools.isJSON(res) || res == "" ? res :
						[{ "contestant": "CYCLIST_002", "latitude": 46.508057, "longitude": 6.627222, "date": 1494333792000 }, { "contestant": "CYCLIST_004", "latitude": 46.508057, "longitude": 6.627222, "date": 1494334069000 }, { "contestant": "CYCLIST_007", "latitude": 46.504723, "longitude": 6.6730556, "date": 1494334548000 }, { "contestant": "CYCLIST_008", "latitude": 46.486946, "longitude": 6.7225, "date": 1494335311000 }, { "contestant": "CYCLIST_005", "latitude": 46.505, "longitude": 6.6719446, "date": 1494335835000 }];
				})
				// Retrieve and add localTime from location
				.then(res => Promise.all(res.map(d => tools.localTime(d, d.date).then(resTime => Object.assign(d, resTime)))))
				.then(body => tools.writeJson("teampulse-switch", "json", body))
				.catch(err => {
					console.log(err)
					if (!err.response) {
						console.log("response time out！");
					}
				});
		}
	}
};

/*****************
  Common tools
******************/

var tools = {
	writeJson(filename, ext, data) {
		fs.writeFile(dataPath + filename + '.' + ext, JSON.stringify(data), err => {
			if (err) return console.error(err);
			io.sockets.emit(filename, data);
			console.log(`${new Date()} - ${filename}.json updated`);
		});
	},
	readJson(filename, ext = filename.split('.')[1]) {
		return JSON.parse(fs.readFileSync(dataPath + filename.split('.')[0] + '.' + ext, 'utf8'));
	},
	// Retrieve localTime
	localTime(d, curTimestamp = Date.now()) {
		var curTimestampSec = curTimestamp / 1000 | 0; // Get timestamp in seconds
		return fetch(`https://maps.googleapis.com/maps/api/timezone/json?location=${d.latitude},${d.longitude}&timestamp=${curTimestampSec}&key=AIzaSyALdzBs07Buy7AoLoXR-29ax3M1D7YRSls`)
			.then(res => res.json())
			.then(res => {
				return {
					dstOffset: res.dstOffset,
					rawOffset: res.rawOffset,
					localTime: moment(curTimestamp).tz(res.timeZoneId).format(),
					timeZoneId: res.timeZoneId
				}
			})
			.catch(err => console.error(err));
	},
	isJSON(str) {
		var a;
		try {
			str = JSON.stringify(str);
			a = JSON.parse(str);
		} catch (e) {
			return false;
		}
		return true;
	}
};

/*****************
  ROUTES
******************/

app.get('/', (req, res) => {
	res.send('Teampulse server!')
})

app.get('/teampulse/data', cors(), (req, res) => {
	res.json(
		tools.readJson("teampulse", "json")
	);
})

app.get('/teampulse/switch', cors(), (req, res) => {
	res.json(
		tools.readJson("teampulse-switch", "json")
	);
})

app.get('/facebook/posts', cors(), (req, res) => {
	res.json(
		tools.readJson("facebook", "json")
	);
})

app.get('/instagram/posts', cors(), (req, res) => {
	res.json(
		tools.readJson("instagram", "json")
	);
})

// Handle favori

app.get('/favori', authMiddleware, urlencoded, (req, res) => {
	var html =
		`<h1>Bonjour ${req.user}!</h1>
		<form action="/favori" method="post">
			<label for="url">
				Entrez, s'il vous plaît, l'URL d'
				<ul>
					<li>Un album Flickr (ex.: https://www.flickr.com/photos/bic2000/albums/72157651246442701)</li>
					<li>Une vidéo Youtube (ex.: https://www.youtube.com/watch?v=NPjto5rJ1EQ ou http://youtu.be/OA7DZE2SFnM)</li>
					<li>Une playlist Youtube (ex.: https://www.youtube.com/playlist?list=PLTU_KAgqpsRfEobesJoxdr3v0l1OxuC9y)</li>
					<li>Une vidéo Facebook (ex.: https://www.facebook.com/RAAMraces/videos/10158176029550093/)</li>
				</ul>
			</label>
			<input type="url" name="url" style="width:100%" placeholder="http://..." />
			<br/><br/>
			<button type="submit">Envoyer</button>
		</form>`;

	res.send(html);
});

app.post('/favori', authMiddleware, urlencoded, (req, res) => {
	var url = req.body.url;
	var html = `<h1>🎉🎉🎉</h1><h1>La section favori a été mise à jour avec :</h1><p><a href="${url}">${url}</a></p>`;

	switch (true) {
		case regex.flickr.test(url):
			socialFetch.flickr(url);
			break;
		case regex.youtube.valid.test(url):
			socialFetch.youtube(url);
			break;
		case regex.facebook.video.test(url):
			socialFetch.facebook.video(url);
			break;
		default:
			html = `<p>L'url indiquée est incorrecte</p><a href="/favori">Veuillez réessayer</a>`
			break;
	}
	res.send(html);
});

app.get('/favori/data', cors(), (req, res) => {
	db.collection('favori').find().sort({ date: -1 }).limit(1).toArray(function (err, results) {
		console.log(results)
		res.json(
			results[0]
		);
	})
})

// Init socialFetch
socialFetch.init();
thirdFetch.init();

// Check update teampulse & social feeds feed every minute

cron.schedule('* * * * *', () => {
	thirdFetch.update();
	socialFetch.update();
});

// Send all current json on connection

io.on('connection', function (client) {
	console.log('Client connected...');

	glob(`${dataPath}/*.json`, function (err, files) {
		files.map(f =>
			client.emit(path.parse(f).name, tools.readJson(path.basename(f)))
		)
	})
});

