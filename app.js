const fs = require('fs');
const {URL,URLSearchParams} = require('url');
const cron = require('node-cron');
const dotenv = require('dotenv').config()
const express = require('express')
const app = express()
const cors = require('cors')

const Twitter = require('twitter');
const Flickr = require("flickrapi");
const graph = require('fbgraph');
const fetch = require('node-fetch');

const bodyParser = require('body-parser');

const urlencoded = bodyParser.urlencoded({
	extended: true
});

const auth = require('http-auth');
const basic = auth.basic({
	realm: "Gestion du favori",
	file: __dirname + "/users.htpasswd"
});

const authMiddleware = auth.connect(basic);

const corsOptions = {
	origin: 'http://localhost:3000',
	optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204 
}

const dataPath = __dirname + "/data/";

const regex = {
	youtube: /http(?:s?):\/\/(?:www\.)?youtu(?:be\.com\/(watch|playlist)\?(v|list)=|\.be\/)([\w\-\_]*)(&(amp;)?‌​[\w\?‌​=]*)?/i,
	facebook: {
		video: /facebook.com\/[a-z]*\/videos/i
	},
	flickr: /\/photos\/([0-9@a-z]*)\/albums\/([0-9]*)/i
}

var socialFetch = {

	init() {
		this.instagram();
		this.facebook.posts();
	},

	/*****************
		INSTAGRAM
	******************/

	instagram() {
		fetch('https://api.instagram.com/v1/users/self/media/liked?access_token=' + process.env.INSTAGRAM_ACCESS_TOKEN)
			.then((res) => {
				return res.json()
			})
			.then((body) => {
				return body.data.map((d) => {
					return {
						id: d.id,
						url: d.link
					}
				});
			})
			.then((posts) => {
				tools.writeJson("instagram.json", posts);
			})
			.catch((err) => {
				console.log(err);
			});
	},


	/*****************
  	FACEBOOK
	******************/

	facebook: {
		posts() {
			graph.setAccessToken(process.env.FACEBOOK_ACCESS_TOKEN);

			graph.get("teampulse.ch/feed?limit=5", (err, res) => {
				if (err) return console.log(err);

				var posts = res.data.map((d) => {
					return {
						id: d.id.split("_").pop()
					}
				});

				tools.writeJson("facebook.json", posts);
			});
		},
		video(url) {
			var type = "facebook";
			tools.writeJson("favori.json", {type:type, data:{video:{url:url}}});
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
						if (err) return console.log(err);
						return res.user.nsid;
					});
				}
				else{
					return urlParam;
				}
			}

			flickr.photosets.getPhotos({
				user_id:usernameVSnsid(urlParams[1]),
				photoset_id: urlParams[2],
				page: 1,
				per_page: 500
			}, (err, res) => {
				if (err) return console.log(err);

				var photos = res.photoset.photo.map((d) => {
					return {
						url: "https://farm" + d.farm + ".staticflickr.com/" + d.server + "/" + d.id + "_" + d.secret + "_z.jpg"
					}
				});

				

				tools.writeJson("favori.json", {type:type, data:{photos}});
			});
		});
	},

	/*****************
  	YOUTUBE
	******************/

	youtube(url) {
		var url = new URL(url);
		var urlParams = url.searchParams;

		var video = {};

		// Url can contain both	
		if (urlParams.has('v')) {
			var type = "youtube";
			video.v = urlParams.get('v')
		}
		if (urlParams.has('list')) {
			var type = "youtube_playlist";
			video.list = urlParams.get('list')
		}

		tools.writeJson("favori.json", {type:type, data:{video}});
	}

}

/*****************
  TEAMPULSE API
******************/

var thirdFetch = {
	init() {
		this.teampulse();
	},
	teampulse() {
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
		/*fetch('https://data.teampulse.ch/raam/informations')
			.then(function (response) {
				return response.json()
			})
			.then(function (body) {
				tools.writeJson("teampulse.json", body);
			});
		.catch(function (err) {
			console.log(err);
		});*/
	}
};

/*****************
  Common tools
******************/

var tools = {
	writeJson(filename, data) {
		fs.writeFile(dataPath + filename, JSON.stringify(data), (err) => {
			if (err) return console.log(err);
		});
	},
	readJson(filename) {
		return JSON.parse(fs.readFileSync(dataPath + filename, 'utf8'));
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
		tools.readJson("instagram.json")
	);
})

app.get('/facebook/posts', cors(), (req, res) => {
	res.json(
		tools.readJson("facebook.json")
	);
})

app.get('/instagram/posts', cors(), (req, res) => {
	res.json(
		tools.readJson("instagram.json")
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
					<li>Une vidéo Youtube (ex.: https://www.youtube.com/watch?v=NPjto5rJ1EQ)</li>
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
		case regex.youtube.test(url):
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
	res.json(
		tools.readJson("favori.json")
	);
})

// Init socialFetch
socialFetch.init();
thirdFetch.init();

var port = process.env.PORT || 3999;

app.listen(port, () => {
	console.log('Teampulse app listening on port ' + port)
})

// Update social feeds every 5 minutes

cron.schedule('*/5 * * * *', () => {
	socialFetch.init();
	console.log(new Date() + '- Social feeds updated');
});

// Update teampulse feed every minute

cron.schedule('* * * * *', () => {
	thirdFetch.init();
	console.log(new Date() + '- Teampulse feed updated');
});