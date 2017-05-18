const fs = require('fs');
const { URL, URLSearchParams } = require('url');
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
	youtube: /http(?:s?):\/\/(?:www\.)?youtu(?:be\.com\/watch\?v=|\.be\/)([\w\-\_]*)(&(amp;)?‌​[\w\?‌​=]*)?/i,
	flickr: /\/photos\/([0-9@a-z]*)\/albums\/([0-9]*)/i
}

var socialFetch = {

	init() {
		this.instagram();
		this.facebook();
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

	facebook() {
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

	/*****************
  	FLICKR
	******************/
	flickrOptions: {
		api_key: process.env.FLICKR_API_KEY,
		secret: process.env.FLICKR_SECRET
	},
	flickr(url) {
		var urlParams = url.match(regex.flickr);

		Flickr.tokenOnly(this.flickrOptions, (error, flickr) => {
			flickr.photosets.getPhotos({
				user_id: urlParams[1],
				photoset_id: urlParams[2],
				page: 1,
				per_page: 500
			}, (err, result) => {
				if (err) return console.log(err);

				var photos = result.photoset.photo.map((d) => {
					return {
						url: "https://farm" + d.farm + ".staticflickr.com/" + d.server + "/" + d.id + "_" + d.secret + "_z.jpg"
					}
				});

				tools.writeJson("favori.json", photos);
			});
		});
	},

	/*****************
  	YOUTUBE
	******************/

	youtube(url) {
		var url = new URL(url);
		var urlParams = url.searchParams;

		var video = {
			v: urlParams.get('v')
		}

		if(urlParams.has('list')){
			video.list = urlParams.get('list')
		}

		tools.writeJson("favori.json", [video]);
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
		`<p>Bonjour ${req.user}!</p>
			<form action="/favori" method="post">
               <label for="url">Entrez, s'il vous plaît, une URL d'un album flickr ou d'une vidéo youtube:</label>
               <input type="url" name="url" placeholder="http://..." />
               <br/>
               <button type="submit">Envoyer</button>
            </form>`;

	res.send(html);
});

app.post('/favori', authMiddleware, urlencoded, (req, res) => {
	var url = req.body.url;
	var html = `🎉🎉🎉 <p>La section favori a été mise à jour avec : ${url} </p>`;

	if(regex.flickr.test(url)){
		socialFetch.flickr(url);
	}
	else if(regex.youtube.test(url)){
		socialFetch.youtube(url);
	}
	else{
		html = `<p>L'url indiquée est incorrecte</p><a href="/favori">Veuillez réessayer</a>`
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