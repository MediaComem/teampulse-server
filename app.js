var express = require('express')
var app = express()
var cors = require('cors')
var Twitter = require('twitter');
var graph = require('fbgraph');
var fetch = require('node-fetch');
var dotenv = require('dotenv').config()
var Flickr = require("flickrapi");

var corsOptions = {
  origin: 'http://example.com',
  optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204 
}

/*****************
  INSTAGRAM
******************/

var instaPostsId = []
fetch('https://api.instagram.com/v1/users/self/media/liked?access_token='+process.env.INSTAGRAM_ACCESS_TOKEN)
  .then(function(response) {
    return response.json()
  })
  .then(function(body){
    for (i = 0; i < body.data.length; i++) { 
	    instaPostsId.push({id:body.data[i].id,link:body.data[i].link})
		}
  });

/*****************
  FLICKR
******************/
var flickrOptions = {
  api_key: process.env.FLICKR_API_KEY,
  secret: process.env.FLICKR_SECRET
};

var flickrPicsId = []
Flickr.tokenOnly(flickrOptions, function(error, flickr) {
  flickr.photosets.getPhotos({
	  photoset_id: "72157661572108305",
	  user_id: "135987724@N05",
	  page: 1,
	  per_page: 500
	}, function(err, result) {
		if(err) throw err;
	  for (i = 0; i < result.photoset.photo.length; i++) {
	  	flickr.photos.getInfo({
			  photo_id: result.photoset.photo[i].id,
			}, function(err, res) {
				if(err) throw err;
				// console.log(res.photo)
				var sourceUrl = "https://farm"+res.photo.farm+".staticflickr.com/"+res.photo.server+"/"+res.photo.id+"_"+res.photo.secret+"_z.jpg"
				// console.log(sourceUrl)
			  flickrPicsId.push(sourceUrl)
			});
			flickr.photos.getSizes({
			  photo_id: result.photoset.photo[i].id,
			}, function(err, res) {
				if(err) throw err;
			});
		}
	});
});

/*****************
  FACEBOOK
******************/
graph.setAccessToken(process.env.FACEBOOK_ACCESS_TOKEN);

var fbPostsId = []
var graphObject = graph
  .get("teampulse.ch/feed?limit=5", function(err, res) {
    if(err) throw err;
	  // console.log(res);  // The favorites.
	  for (i = 0; i < res.data.length; i++) { 
	  	var str = res.data[i].id;
			str = str.split("_").pop();
	    fbPostsId.push(str)
		}
  });

/*****************
  TEAMPULSE API
******************/
var teampulseData;
fetch('https://data.teampulse.ch/raam/informations')
  .then(function(response) {
    return response.json()
  })
  .then(function(body){
    teampulseData = body;
  });

/*****************
  ROUTES
******************/

app.get('/teampulse-data',cors(), function (req, res) {
  res.json({ data: teampulseData });
})

app.get('/fbposts',cors(), function (req, res) {
  res.json({ postsId: fbPostsId });
})

app.get('/flickrpics',cors(), function (req, res) {
  res.json({ picsId: flickrPicsId });
})

app.get('/instaposts',cors(), function (req, res) {
  res.json({ instaPosts: instaPostsId });
})

app.get('/', function (req, res) {
  res.send('Teampulse server!')
})

var port = process.env.PORT || 3999;
app.listen(port, function () {
  console.log('Example app listening on port '+port)
})